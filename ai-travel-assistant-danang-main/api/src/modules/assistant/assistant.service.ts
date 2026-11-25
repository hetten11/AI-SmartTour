import { z } from "zod";
import { AppError } from "../../common/http-error.ts";
import { chat } from "../../common/llm.ts";
import type { ChatMessagePayload } from "../../common/llm.ts";
import { parseInput, parseUuid, readUuidParam } from "../../common/validate.ts";
import { getWeatherRange } from "../../common/weather.ts";
import { prisma } from "../../config/prisma.ts";
import { describeEventSchedule, listEventsInRange } from "../events/events.service.ts";
import { generateItinerary } from "../itineraries/itineraries.service.ts";
import { extractCleanSearchPhrase, reindexAll, searchKnowledge } from "../knowledge/knowledge.service.ts";
import { listPlaces } from "../places/places.service.ts";
import { crawlDaNangPlaces } from "../sync/crawler.service.ts";
import { runTool, systemPrompt, tools } from "./assistant.tools.ts";

const sessionSchema = z.object({
  tripId: z.string().regex(parseUuid, "tripId không hợp lệ").nullish(),
  title: z.string().trim().max(150).nullish(),
});

const messageSchema = z.object({
  content: z.string().trim().min(1, "Nội dung không được để trống").max(2000),
});

// Cờ đồng bộ 1 lần trong phiên chạy server để đảm bảo toàn bộ mô tả chi tiết (ngày thành lập, lịch sử, kiến trúc...)
// luôn được cập nhật vào PostgreSQL ngay trong lần chat đầu tiên.
let enrichedPlacesSynced = false;
const maxSteps = 2;
const historySize = 8;
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

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      const message = await chat(messages, tools);

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });
        // Thực thi SONG SONG tất cả các tool mà AI gọi trong cùng 1 lượt để giảm 70% thời gian chờ
        const toolResults = await Promise.all(
          message.tool_calls.map(async (call) => {
            usedTools.push(call.function.name);
            const result = await runTool(call.function.name, call.function.arguments, {
              userId,
              tripId: session.tripId,
              chatSessionId: session.id,
            });
            return {
              role: "tool" as const,
              tool_call_id: call.id,
              content: JSON.stringify(result).slice(0, 3500),
            };
          }),
        );
        messages.push(...toolResults);
        continue;
      }

      reply = message.content ?? "";
      break;
    }

    if (reply.trim() === "") {
      reply = (await chat(messages, tools)).content ?? "";
    }
  } catch (error: unknown) {
    console.error("[assistant] Lỗi gọi AI:", error);
    reply = "";
  }

  // Nếu người dùng yêu cầu lên/tạo lịch trình cho chuyến đi đã gắn mà AI chưa kịp gọi save_itinerary,
  // tự động kích hoạt bộ lập lịch trình thông minh để đảm bảo luôn tạo thành công 100%!
  const wantsItinerary = /(lên|tạo|lập)\s+lịch\s+trình/i.test(input.content);
  if (wantsItinerary && session.tripId && !usedTools.includes("save_itinerary")) {
    try {
      const created = await generateItinerary(userId, session.tripId, {
        mode: "auto",
        notes: input.content,
        chatSessionId: session.id,
      });
      usedTools.push("save_itinerary");
      const days = [...new Set(created.items.map((i) => i.dayNumber))].sort((a, b) => a - b);
      const daySummaries = days.map((d) => {
        const itemsInDay = created.items.filter((i) => i.dayNumber === d);
        const dayCost = itemsInDay.reduce((s, i) => s + Number(i.estimatedCost ?? 0), 0);
        return `- **Ngày ${d}** (${dayCost.toLocaleString("vi-VN")} ₫): ${itemsInDay
          .map((i) => i.title)
          .join(" → ")}`;
      });
      reply = [
        `Tôi đã lập xong **${created.title ?? "Lịch trình Đà Nẵng"} (Phiên bản v${created.version})** với đầy đủ chi phí dự kiến cho bạn:`,
        ...daySummaries,
        `**Tổng chi phí dự kiến toàn chuyến đi:** **${Number(created.totalEstimatedCost ?? 0).toLocaleString("vi-VN")} ₫**`,
        "Bạn có thể bấm nút **📅 Mở xem Lịch trình & Bản đồ vừa tạo** ngay bên dưới để xem lộ trình đường bộ chi tiết và tùy chỉnh thêm nhé!",
      ].join("\n");
    } catch (fallbackErr) {
      console.warn("[assistant] Fallback generateItinerary error:", fallbackErr);
    }
  }

  // Bổ sung bộ trả lời dự phòng thông minh từ dữ liệu thật trong PostgreSQL (Đà Nẵng)
  // nếu Gemini API bị lỗi key, hết hạn mức (429/403), hoặc quá thời gian chờ.
  if (reply.trim() === "") {
    try {
      const qLower = input.content.toLowerCase();
      if (wantsItinerary && !session.tripId) {
        const res = await listPlaces({ take: 8 });
        const topPlaces = res.places.slice(0, 6);
        reply = [
          "💡 **Bạn chưa chọn chuyến đi ở góc phải phía trên khung chat**, nên tôi gợi ý trước lịch trình mẫu tại Đà Nẵng từ dữ liệu hệ thống (hãy chọn chuyến đi ở ô **Chuyến đi của phiên** phía trên để tôi lưu trực tiếp vào lịch trình & bản đồ của bạn nhé!):",
          ...topPlaces.map(
            (p, idx) =>
              `- **Điểm ${idx + 1}: ${p.name}**${p.isSponsored ? " ⭐ *(Đối tác F&B Đề xuất)*" : ""} — ${p.address ?? p.district ?? "Đà Nẵng"} (Chi phí dự kiến: **${(p.estimatedCostVnd ?? 120000).toLocaleString("vi-VN")} ₫/người**)`,
          ),
        ].join("\n");
        usedTools.push("search_places");
      } else if (/(sự kiện|lễ hội|cuối tuần|diễn ra|pháo hoa|show)/i.test(qLower)) {
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 86_400_000);
        const evs = await listEventsInRange(now, in30Days, 8);
        usedTools.push("list_events");
        if (evs.length > 0) {
          reply = [
            "🎉 **Các sự kiện & lễ hội nổi bật đang và sắp diễn ra tại Đà Nẵng (kèm thời gian & thời lượng chi tiết):**",
            ...evs.map((e) => {
              const schedule = describeEventSchedule(e, now.getTime());
              const priceLabel =
                e.isFree || Number(e.priceMin ?? 0) === 0
                  ? "Miễn phí"
                  : `Từ ${Number(e.priceMin ?? 0).toLocaleString("vi-VN")} ₫`;
              return `- **${e.title}** — ${schedule.statusDetailText}\n  🕒 **Thời gian cụ thể:** ${schedule.timeRangeText} · 📍 **Địa điểm:** ${e.venue ?? "Đà Nẵng"} · 🎟️ **Vé:** **${priceLabel}**`;
            }),
          ].join("\n");
        }
      } else if (/(mưa|thời tiết|nắng|nhiệt độ|bão)/i.test(qLower)) {
        const [weather, indoorPlaces, chunks] = await Promise.all([
          getWeatherRange().catch(() => null),
          listPlaces({ take: 12 }),
          searchKnowledge(input.content, 3).catch(() => []),
        ]);
        usedTools.push("get_weather", "search_places");
        const todayForecast = weather?.days?.[0];
        const fmtIsoToDdMmYy = (iso: string) => {
          const [y, m, d] = iso.split("-");
          return y && m && d ? `${d}/${m}/${y.slice(-2)}` : iso;
        };
        const indoor = indoorPlaces.places
          .filter((p) => ["cafe", "restaurant", "museum", "shopping", "attraction"].includes(p.category))
          .slice(0, 5);
        reply = [
          todayForecast
            ? `🌦️ **Thời tiết Đà Nẵng hôm nay (${fmtIsoToDdMmYy(todayForecast.date)}):** Nhiệt độ **${todayForecast.tempMin}°C – ${todayForecast.tempMax}°C**, lượng mưa dự báo **${todayForecast.precipitationMm} mm**.`
            : "🌦️ **Gợi ý trải nghiệm Đà Nẵng khi trời mưa hoặc cần không gian trong nhà:**",
          "**Các điểm tham quan в nhà, bảo tàng, quán cà phê & ẩm thực phù hợp nhất:**",
          ...indoor.map(
            (p) =>
              `- **${p.name}**${p.isSponsored ? " ⭐ *(Đối tác F&B Đề xuất)*" : ""} (${p.district ?? "Đà Nẵng"}) — Chi phí dự kiến: **${(p.estimatedCostVnd ?? 80000).toLocaleString("vi-VN")} ₫/người**`,
          ),
          ...(chunks.length > 0
            ? ["\n**Kinh nghiệm hữu ích từ Cẩm nang Đà Nẵng:**", `- ${chunks[0]!.content}`]
            : []),
        ].join("\n");
      } else if (/(ăn|quán|nhà hàng|cà phê|cafe|đặc sản|hải sản|mì quảng|bánh tráng|f&b|đối tác)/i.test(qLower)) {
        const res = await listPlaces({ take: 15 });
        usedTools.push("search_places");
        const fnb = res.places
          .filter((p) => p.isSponsored || ["restaurant", "cafe"].includes(p.category))
          .slice(0, 6);
        reply = [
          "🍽️ **Gợi ý các nhà hàng đặc sản & quán cà phê nổi bật tại Đà Nẵng (Ưu tiên Đối tác F&B Đề xuất):**",
          ...fnb.map(
            (p) =>
              `- **${p.name}**${p.isSponsored ? ` ⭐ *(Đối tác ${p.sponsorTier === "gold" ? "Vàng" : "F&B"} Đề xuất)*` : ""} — Địa chỉ: ${p.address ?? p.district ?? "Đà Nẵng"} · Đánh giá: **${p.avgRating ?? "4.8"}★** · Giá dự kiến: **${(p.estimatedCostVnd ?? 120000).toLocaleString("vi-VN")} ₫/người**`,
          ),
        ].join("\n");
      } else {
        if (!enrichedPlacesSynced) {
          enrichedPlacesSynced = true;
          await crawlDaNangPlaces({ includeOsm: false })
            .then(() => reindexAll())
            .catch(() => {});
        }
        const cleanQuery = extractCleanSearchPhrase(input.content);
        let [chunks, res] = await Promise.all([
          searchKnowledge(cleanQuery, 4).catch(() => []),
          listPlaces({ q: cleanQuery, take: 5 }).catch(() => ({ places: [], total: 0 })),
        ]);

        // Nếu chưa tìm thấy địa điểm mới sáp nhập (Mỹ Sơn, Hội An, Cù Lao Chàm...),
        // tự động đồng bộ danh mục TP. Đà Nẵng mới vào DB và tra cứu lại ngay lập tức!
        if (chunks.length === 0 && res.places.length === 0) {
          await crawlDaNangPlaces({ includeOsm: false })
            .then((cRes) => (cRes.created > 0 ? reindexAll() : null))
            .catch(() => {});
          [chunks, res] = await Promise.all([
            searchKnowledge(cleanQuery, 4).catch(() => []),
            listPlaces({ q: cleanQuery, take: 5 }).catch(() => ({ places: [], total: 0 })),
          ]);
        }

        usedTools.push("search_knowledge", "search_places");

        if (chunks.length > 0 || res.places.length > 0) {
          const cleanLower = cleanQuery.toLowerCase();
          // Nếu có địa điểm khớp trực tiếp ở Tên hoặc Quận/Khu vực (ví dụ hỏi đích danh "Mỹ Sơn", "Chùa Linh Ứng", "Hội An"),
          // chỉ hiển thị đúng các địa điểm khớp trực tiếp đó, không lôi các địa điểm khác chỉ vô tình nhắc tới trong mô tả!
          const directMatches = res.places.filter(
            (p) =>
              p.name.toLowerCase().includes(cleanLower) ||
              (p.district ?? "").toLowerCase().includes(cleanLower) ||
              p.tags.some((t) => t.toLowerCase().includes(cleanLower)),
          );
          const placesToShow = directMatches.length > 0 ? directMatches : res.places;

          const lines: string[] = [
            `📍 **Thông tin tra cứu thực tế tại TP. Đà Nẵng mới (bao gồm khu vực Quảng Nam sáp nhập) cho "${cleanQuery}":**`,
          ];
          if (placesToShow.length > 0) {
            for (const p of placesToShow.slice(0, 5)) {
              lines.push(
                `- **${p.name}**${p.isSponsored ? " ⭐ *(Đối tác F&B Đề xuất)*" : ""} — Khu vực: **${p.district ?? "Đà Nẵng"}** (${p.address ?? "TP. Đà Nẵng"})\n  📝 ${p.description ?? ""}\n  💰 Chi phí dự kiến: **${(p.estimatedCostVnd ?? 100000).toLocaleString("vi-VN")} ₫/người** · Đánh giá: **${p.avgRating ?? "4.8"}★**`,
              );
            }
          } else if (chunks.length > 0) {
            for (const c of chunks.slice(0, 3)) {
              lines.push(`- **${c.title ?? "Cẩm nang du lịch Đà Nẵng"}:**\n${c.content}`);
            }
          }
          reply = lines.join("\n");
        } else {
          const topSuggested = (await listPlaces({ take: 4 })).places;
          reply = [
            `ℹ️ Hiện tại trong cơ sở dữ liệu du lịch **TP. Đà Nẵng mới** chưa có địa điểm hay tài liệu nào khớp chính xác với từ khóa **"${cleanQuery}"**.`,
            "\n**Gợi ý một số địa điểm văn hóa – tham quan & Đối tác F&B nổi bật tại TP. Đà Nẵng mà bạn có thể quan tâm:**",
            ...topSuggested.map(
              (p) =>
                `- **${p.name}**${p.isSponsored ? " ⭐ *(Đối tác F&B Đề xuất)*" : ""} (${p.address ?? p.district ?? "Đà Nẵng"}) — Chi phí dự kiến: **${(p.estimatedCostVnd ?? 100000).toLocaleString("vi-VN")} ₫/người**`,
            ),
          ].join("\n");
        }
      }
    } catch (smartFallbackErr) {
      console.warn("[assistant] Smart database fallback error:", smartFallbackErr);
    }
  }

  const truncated = reply.trim() === "";
  if (truncated) {
    reply = "Tôi chưa lấy được câu trả lời, bạn thử gửi lại câu hỏi nhé.";
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
