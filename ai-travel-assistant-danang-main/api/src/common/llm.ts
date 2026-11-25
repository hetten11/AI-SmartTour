import { randomUUID } from "node:crypto";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
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

const FALLBACK_CHAT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

// Bộ nhớ tạm ngắn hạn (60 giây): nếu GEMINI_API_KEY bị lỗi xác thực (400/401/403)
// hoặc không kết nối được, bỏ qua ngay trong 60s tiếp theo để Chatbot và Lịch trình
// phản hồi tức thì (< 300ms) bằng dữ liệu PostgreSQL mà không bắt người dùng chờ timeout.
let geminiUnavailableUntil = 0;

// Gemini API gốc (không qua lớp tương thích OpenAI), khoá gửi ở header
// x-goog-api-key. Có gắn AbortSignal.timeout(8000) và tự động fallback model
// nếu tên model cấu hình trong .env không tồn tại (404).
const post = async <T>(path: string, body: unknown, retries = 0): Promise<T> => {
  if (!env.geminiApiKey) throw new AppError(503, "Chưa cấu hình GEMINI_API_KEY");
  // Khóa Gemini API hợp lệ của Google AI Studio luôn bắt đầu bằng "AIza".
  // Nếu cấu hình key không đúng định dạng (ví dụ bắt đầu bằng "AQ..."), ngắt ngay trong 0ms
  // để chuyển thẳng sang bộ trả lời thông minh từ PostgreSQL mà không bị treo chờ mạng.
  if (!env.geminiApiKey.startsWith("AIza")) {
    throw new AppError(503, "GEMINI_API_KEY chưa đúng định dạng chuẩn Google AI Studio (AIza...)");
  }
  if (Date.now() < geminiUnavailableUntil) {
    throw new AppError(503, "Gemini API đang tạm ngắt nhanh (circuit breaker)");
  }

  const isChatCall = path.endsWith(":generateContent");
  const candidatePaths = isChatCall
    ? [
        path,
        ...FALLBACK_CHAT_MODELS.map((m) => `models/${m}:generateContent`).filter((p) => p !== path),
      ]
    : [path];

  let lastError: AppError | null = null;

  for (const currentPath of candidatePaths) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${env.geminiBaseUrl}/${currentPath}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.geminiApiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8_000),
        });
      } catch (err) {
        geminiUnavailableUntil = Date.now() + 30_000;
        throw new AppError(
          504,
          `Kết nối Gemini quá thời gian chờ (Timeout 8s): ${(err as Error).message}`,
        );
      }

      if (response.ok) {
        geminiUnavailableUntil = 0;
        return (await response.json()) as T;
      }

      if ((response.status === 503 || response.status === 429) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      const detail = (await response.text()).slice(0, 300);
      lastError = new AppError(502, `Lỗi gọi Gemini (${response.status}): ${detail}`);

      // Nếu sai API Key (401/403 hoặc 400 API_KEY_INVALID), ngắt ngay lập tức trong 60s, không thử model khác
      if (
        response.status === 401 ||
        response.status === 403 ||
        (response.status === 400 && detail.includes("API_KEY_INVALID"))
      ) {
        geminiUnavailableUntil = Date.now() + 60_000;
        throw lastError;
      }

      // Chỉ thử sang model dự phòng khi gặp 404 (sai tên model)
      if (isChatCall && response.status === 404) {
        break;
      }

      // Nếu hết quota (429) hoặc 503, tạm ngắt 30s để các request sau phản hồi tức thì
      if (response.status === 429 || response.status === 503) {
        geminiUnavailableUntil = Date.now() + 30_000;
      }
      throw lastError;
    }
  }

  throw lastError ?? new AppError(502, "Lỗi gọi Gemini: quá số lần thử lại");
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
    const fnPart: GeminiPart = {
      functionResponse: { name, response: asFunctionResponse(message.content) },
    };
    const lastContent = contents[contents.length - 1];
    if (
      lastContent &&
      lastContent.role === "user" &&
      lastContent.parts.every((part) => part.functionResponse !== undefined)
    ) {
      lastContent.parts.push(fnPart);
    } else {
      contents.push({
        role: "user",
        parts: [fnPart],
      });
    }
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
      id: `call_${index}_${randomUUID().slice(0, 8)}_${part.functionCall?.name ?? "tool"}`,
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
