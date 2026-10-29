import { env } from "../config/env.ts";
import { AppError } from "./http-error.ts";

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  thoughtSignature?: string;
};

export type ChatMessagePayload = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
};

export type ChatTool = {
  type: "function";
  function: { name: string; description: string; parameters?: Record<string, unknown> };
};

type GeminiPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  embedding?: { values?: number[] };
};

// Gemini API gốc (không qua lớp tương thích OpenAI), khoá gửi ở header
// x-goog-api-key.
const post = async <T>(path: string, body: unknown): Promise<T> => {
  if (!env.geminiApiKey) throw new AppError(503, "Chưa cấu hình GEMINI_API_KEY");

  const response = await fetch(`${env.geminiBaseUrl}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.geminiApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new AppError(502, `Lỗi gọi Gemini (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw === "" ? "null" : raw);
  } catch {
    return null;
  }
};

const asArgs = (raw: string): Record<string, unknown> => {
  const parsed = parseJson(raw);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
};

// Kết quả tool phải nằm trong object, nên bọc lại nếu tool trả mảng hoặc chuỗi.
const asFunctionResponse = (content: string | null): Record<string, unknown> => ({
  result: parseJson(content ?? "") ?? content ?? "",
});

// Gemini không có khái niệm tool_call_id: nó ghép functionResponse với
// functionCall theo tên trong lượt model ngay trước đó. Vì vậy phải nhớ tên
// theo id khi dịch từ dạng message của mình sang contents của Gemini.
const toContents = (messages: ChatMessagePayload[]) => {
  const system: string[] = [];
  const contents: GeminiContent[] = [];
  const callNames = new Map<string, string>();

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content) system.push(message.content);
      continue;
    }

    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content ?? "" }] });
      continue;
    }

    if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls ?? []) {
        callNames.set(call.id, call.function.name);
        parts.push({
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
          functionCall: { name: call.function.name, args: asArgs(call.function.arguments) },
        });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    const name = message.tool_call_id ? callNames.get(message.tool_call_id) : undefined;
    if (!name) continue;
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: asFunctionResponse(message.content) } }],
    });
  }

  return { system, contents };
};

const toTools = (tools: ChatTool[] | undefined) =>
  tools && tools.length > 0
    ? [
        {
          // Gemini từ chối schema object rỗng, nên tool không tham số thì bỏ hẳn.
          functionDeclarations: tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
          })),
        },
      ]
    : undefined;

export const chat = async (
  messages: ChatMessagePayload[],
  tools?: ChatTool[],
  options: { json?: boolean } = {},
): Promise<ChatMessagePayload> => {
  const { system, contents } = toContents(messages);
  const functionDeclarations = toTools(tools);

  const payload = await post<GeminiResponse>(`models/${env.geminiModel}:generateContent`, {
    ...(system.length > 0 ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
    contents,
    ...(functionDeclarations ? { tools: functionDeclarations } : {}),
    generationConfig: {
      temperature: 0.3,
      // Bắt Gemini trả JSON thuần, tránh phải bóc code fence.
      ...(options.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  const toolCalls: ChatToolCall[] = parts
    .filter((part) => part.functionCall?.name)
    .map((part, index) => ({
      id: `call_${index}_${part.functionCall?.name ?? "tool"}`,
      type: "function",
      function: {
        name: part.functionCall?.name ?? "",
        arguments: JSON.stringify(part.functionCall?.args ?? {}),
      },
      ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
    }));

  if (toolCalls.length === 0 && text === "") {
    const reason = payload.promptFeedback?.blockReason ?? candidate?.finishReason;
    throw new AppError(502, `Gemini không trả về nội dung${reason ? ` (${reason})` : ""}`);
  }

  return {
    role: "assistant",
    content: text === "" ? null : text,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
};

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export const embed = async (
  text: string,
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT",
): Promise<number[]> => {
  const payload = await post<GeminiResponse>(`models/${env.geminiEmbeddingModel}:embedContent`, {
    content: { parts: [{ text: text.slice(0, 8000) }] },
    taskType,
    outputDimensionality: env.embeddingDim,
  });

  const values = payload.embedding?.values;
  if (!values || values.length === 0) {
    throw new AppError(502, "Gemini không trả về vector embedding");
  }
  if (values.length !== env.embeddingDim) {
    throw new AppError(
      502,
      `Embedding ${values.length} chiều không khớp cột vector(${env.embeddingDim})`,
    );
  }
  return values;
};

export const toVectorLiteral = (embedding: number[]): string => `[${embedding.join(",")}]`;
