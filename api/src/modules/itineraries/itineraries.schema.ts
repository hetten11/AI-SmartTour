import { z } from "zod";
import { parseUuid } from "../../common/validate.ts";

// AI hay trả giờ dạng "08:00", "Buổi sáng" hoặc chuỗi rác. Prisma chỉ nhận Date
// hợp lệ nên chuỗi không parse được quy về null thay vì làm hỏng cả lịch trình.
const startTime = z
  .string()
  .nullish()
  .transform((value) => {
    if (!value) return null;
    const date = new Date(value);
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
  startTime,
  estimatedCost: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export const planSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  reason: z.string().trim().max(1000).nullish(),
  items: z.array(itemSchema).min(1).max(60),
});

export const updateItemSchema = z
  .object({
    dayNumber: z.coerce.number().int().min(1).max(30),
    orderIndex: z.coerce.number().int().min(0).max(100),
    title: z.string().trim().min(1).max(255),
    itemType: z.enum(["place", "restaurant", "activity", "event", "transport", "rest"]),
    startTime,
    notes: z.string().trim().max(1000).nullish(),
  })
  .partial();

export const generateSchema = z.object({
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
  startTime,
  estimatedCost: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export type PlanInput = z.infer<typeof planSchema>;
