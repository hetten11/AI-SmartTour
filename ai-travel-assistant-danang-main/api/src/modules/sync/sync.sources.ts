import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../common/http-error.ts";
import type { DataSource } from "../../generated/prisma/client.ts";

export type NormalizedEvent = {
  externalId: string;
  title: string;
  description: string | null;
  venue: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean | null;
  priceMin: number | null;
  priceMax: number | null;
  ticketUrl: string | null;
  tags: string[];
};

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asDate = (value: unknown): string | null => {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// Dữ liệu nguồn ngoài không tin được: bỏ bản ghi thiếu id/tiêu đề/ngày.
const normalize = (raw: unknown): NormalizedEvent | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const externalId = asString(item.externalId) ?? asString(item.id);
  const title = asString(item.title);
  const startAt = asDate(item.startAt);
  if (!externalId || !title || !startAt) return null;

  return {
    externalId,
    title,
    description: asString(item.description),
    venue: asString(item.venue),
    address: asString(item.address),
    latitude: asNumber(item.latitude),
    longitude: asNumber(item.longitude),
    startAt,
    endAt: asDate(item.endAt),
    isFree: typeof item.isFree === "boolean" ? item.isFree : null,
    priceMin: asNumber(item.priceMin),
    priceMax: asNumber(item.priceMax),
    ticketUrl: asString(item.ticketUrl),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string") : [],
  };
};

const readJsonSource = async (url: string): Promise<unknown> => {
  // Nguồn demo đọc file trong prisma/data (thư mục này được mount vào container).
  const filePath = path.resolve(process.cwd(), url);
  return JSON.parse(await readFile(filePath, "utf8"));
};

const readHttpSource = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) throw new AppError(502, `Nguồn dữ liệu trả lỗi ${response.status}`);
  return response.json();
};

export const fetchSourceEvents = async (source: DataSource): Promise<NormalizedEvent[]> => {
  const payload =
    source.sourceType === "file" ? await readJsonSource(source.url) : await readHttpSource(source.url);
  const items = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && Array.isArray((payload as { events?: unknown }).events)
      ? ((payload as { events: unknown[] }).events)
      : [];

  return items.map(normalize).filter((event): event is NormalizedEvent => event !== null);
};
