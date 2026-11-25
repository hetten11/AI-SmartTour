import { z } from "zod";
import { parseUuid } from "../../common/validate.ts";

// Hỗ trợ cả chuỗi ISO 8601 lẫn giờ dạng "08:00", "14:30"
const flexibleTime = z
  .string()
  .nullish()
  .transform((value) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const [h, m] = trimmed.split(":").map(Number);
      const d = new Date(Date.UTC(2026, 0, 1, (h ?? 8) - 7, m ?? 0, 0));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  });

export const itemSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(30),
  title: z.string().trim().min(1).max(255),
  itemType: z
    .enum(["place", "restaurant", "activity", "event", "transport", "rest"])
    .default("activity"),
  placeId: z.string().regex(parseUuid).nullish(),
  eventId: z.string().regex(parseUuid).nullish(),
  startTime: flexibleTime,
  endTime: flexibleTime,
  estimatedCost: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export const planSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  reason: z.string().trim().max(1000).nullish(),
  items: z.array(itemSchema).min(1).max(250),
});

export const updateItemSchema = z
  .object({
    dayNumber: z.coerce.number().int().min(1).max(30),
    orderIndex: z.coerce.number().int().min(0).max(100),
    title: z.string().trim().min(1).max(255),
    itemType: z.enum(["place", "restaurant", "activity", "event", "transport", "rest"]),
    placeId: z.string().regex(parseUuid).nullish(),
    eventId: z.string().regex(parseUuid).nullish(),
    startTime: flexibleTime,
    endTime: flexibleTime,
    estimatedCost: z.coerce.number().min(0).max(1_000_000_000).nullish(),
    notes: z.string().trim().max(1000).nullish(),
  })
  .partial();

export const moveItemSchema = z.object({
  direction: z.enum(["up", "down"]),
});

// Hỗ trợ 2 chế độ tạo lịch trình:
// - "auto" (Option 2): Gợi ý tự động từ AI dựa trên vị trí, thời gian, thời tiết và xu hướng
// - "checklist" (Option 1): Tùy chọn theo danh mục (categories) và địa điểm ưa thích (preferredPlaceIds)
export const generateSchema = z.object({
  mode: z.enum(["auto", "checklist"]).default("auto"),
  categories: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  preferredPlaceIds: z.array(z.string().regex(parseUuid)).max(50).optional(),
  userLatitude: z.coerce.number().min(-90).max(90).nullish(),
  userLongitude: z.coerce.number().min(-180).max(180).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  chatSessionId: z.string().regex(parseUuid).nullish(),
});

export const whatIfSchema = z.object({
  itineraryId: z.string().regex(parseUuid, "itineraryId không hợp lệ"),
  scenario: z.string().trim().min(3, "Kịch bản quá ngắn").max(500),
  chatSessionId: z.string().regex(parseUuid).nullish(),
});

export const addItemSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(30),
  title: z.string().trim().min(1, "Tên hoạt động không được để trống").max(255),
  itemType: z
    .enum(["place", "restaurant", "activity", "event", "transport", "rest"])
    .default("activity"),
  placeId: z.string().regex(parseUuid).nullish(),
  eventId: z.string().regex(parseUuid).nullish(),
  customAddress: z.string().trim().max(255).nullish(),
  startTime: flexibleTime,
  endTime: flexibleTime,
  estimatedCost: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  inPlace: z.boolean().default(true),
});

export type PlanInput = z.infer<typeof planSchema>;
