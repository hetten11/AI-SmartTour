import { z } from "zod";
import { AppError } from "../../common/http-error.ts";
import { chat } from "../../common/llm.ts";
import type { ChatMessagePayload } from "../../common/llm.ts";
import { parseInput, parseUuid, readUuidParam } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";
import { runTool, systemPrompt, tools } from "./assistant.tools.ts";

const sessionSchema = z.object({
  tripId: z.string().regex(parseUuid, "tripId không hợp lệ").nullish(),
  title: z.string().trim().max(150).nullish(),
});

const messageSchema = z.object({
  content: z.string().trim().min(1, "Nội dung không được để trống").max(2000),
});

// ponytail: tối đa 8 vòng gọi tool cho một câu hỏi, tránh vòng lặp vô hạn đốt
// token. Tăng khi cần tool chain dài.
const maxSteps = 8;
const historySize = 10;
const titleLength = 60;

const assertTrip = async (userId: string, tripId: string) => {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId }, select: { id: true } });
  if (!trip) throw new AppError(404, "Không tìm thấy chuyến đi");
};

const sessionOf = async (userId: string, sessionId: unknown) => {
  const id = readUuidParam(sessionId, "phiên chat");
  const session = await prisma.chatSession.findFirst({ where: { id, userId } });
  if (!session) throw new AppError(404, "Không tìm thấy phiên chat");
  return session;
};

export const listSessions = (userId: string, tripId?: string) =>
  prisma.chatSession.findMany({
    where: { userId, ...(tripId ? { tripId } : {}) },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });

export const createSession = async (userId: string, body: unknown) => {
  const input = parseInput(sessionSchema, body ?? {});
  if (input.tripId) await assertTrip(userId, input.tripId);

  return prisma.chatSession.create({
    data: { userId, tripId: input.tripId ?? null, title: input.title ?? null },
  });
};

export const updateSession = async (userId: string, sessionId: unknown, body: unknown) => {
  const session = await sessionOf(userId, sessionId);
  const input = parseInput(sessionSchema.partial(), body);
  if (input.tripId) await assertTrip(userId, input.tripId);

  return prisma.chatSession.update({
    where: { id: session.id },
    data: {
      ...(input.title !== undefined ? { title: input.title ?? null } : {}),
      ...(input.tripId !== undefined ? { tripId: input.tripId ?? null } : {}),
    },
  });
};

export const deleteSession = async (userId: string, sessionId: unknown) => {
  const session = await sessionOf(userId, sessionId);
  await prisma.chatSession.delete({ where: { id: session.id } });
};

export const listMessages = async (userId: string, sessionId: unknown) => {
  const session = await sessionOf(userId, sessionId);
  return prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
};

export const sendMessage = async (userId: string, sessionId: unknown, body: unknown) => {
  const session = await sessionOf(userId, sessionId);
  const input = parseInput(messageSchema, body);

  const previous = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: historySize,
  });

  const messages: ChatMessagePayload[] = [
    { role: "system", content: systemPrompt },
    ...previous.reverse().map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
    })),
    { role: "user", content: input.content },
  ];

  await prisma.chatMessage.create({
    data: { userId, sessionId: session.id, role: "user", content: input.content },
  });

  let reply = "";
  const usedTools: string[] = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const message = await chat(messages, tools);

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        usedTools.push(call.function.name);
        const result = await runTool(call.function.name, call.function.arguments, {
          userId,
          tripId: session.tripId,
          chatSessionId: session.id,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
      continue;
    }

    reply = message.content ?? "";
    break;
  }

  // Hết maxSteps vòng tool mà model chưa nói gì: đánh dấu bị cắt để web cảnh báo,
  // rồi gọi thêm một lượt không kèm tool cho chắc có câu trả lời.
  const truncated = reply.trim() === "";

  if (truncated) {
    reply = (await chat(messages)).content ?? "";
  }

  if (reply.trim() === "") {
    reply = "Tôi chưa lấy được câu trả lời, bạn thử hỏi lại ngắn hơn nhé.";
  }

  const saved = await prisma.chatMessage.create({
    data: {
      userId,
      sessionId: session.id,
      role: "assistant",
      content: reply,
      toolCalls: usedTools,
    },
  });

  // Phiên chưa có tiêu đề thì lấy tin nhắn đầu tiên làm tiêu đề.
  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      lastMessageAt: new Date(),
      ...(session.title ? {} : { title: input.content.slice(0, titleLength) }),
    },
  });

  return { message: saved, usedTools, truncated };
};
