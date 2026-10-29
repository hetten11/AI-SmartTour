import type { ZodType } from "zod";
import { AppError } from "./http-error.ts";

// Đọc body bằng zod, trả lỗi tiếng Việt lấy từ message của issue đầu tiên.
export const parseInput = <T>(schema: ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new AppError(400, issue?.message ?? "Dữ liệu không hợp lệ");
};

export const parseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const readUuidParam = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !parseUuid.test(value)) {
    throw new AppError(404, `Không tìm thấy ${field}`);
  }
  return value;
};

export const readIntQuery = (value: unknown, fallback: number, max: number): number => {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

export const readTextQuery = (value: unknown, maxLength = 200): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length === 0 ? undefined : text.slice(0, maxLength);
};
