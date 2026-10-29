import { AppError } from "../../common/http-error.ts";
import { chat } from "../../common/llm.ts";
import { parseInput, readUuidParam } from "../../common/validate.ts";
import { getWeatherRange } from "../../common/weather.ts";
import { prisma } from "../../config/prisma.ts";
import { listEventsInRange } from "../events/events.service.ts";
import {
  addItemSchema,
  generateSchema,
  itemSchema,
  planSchema,
  updateItemSchema,
  whatIfSchema,
} from "./itineraries.schema.ts";
import type { PlanInput } from "./itineraries.schema.ts";

const promptSystem =
  "Bạn là hướng dẫn viên du lịch Đà Nẵng. Chỉ trả lời bằng JSON hợp lệ, không thêm chữ nào khác.";

const tripOf = async (userId: string, tripId: unknown) => {
  const id = readUuidParam(tripId, "chuyến đi");
  const trip = await prisma.trip.findFirst({
    where: { id, userId },
    include: { companions: true },
  });
  if (!trip) throw new AppError(404, "Không tìm thấy chuyến đi");
  return trip;
};

const itineraryOf = async (userId: string, itineraryId: unknown) => {
  const id = readUuidParam(itineraryId, "lịch trình");
  const itinerary = await prisma.itinerary.findFirst({
    where: { id, trip: { userId } },
    include: { items: { orderBy: [{ dayNumber: "asc" }, { orderIndex: "asc" }] } },
  });
  if (!itinerary) throw new AppError(404, "Không tìm thấy lịch trình");
  return itinerary;
};

const tripDays = (trip: { startDate: Date; endDate: Date }) =>
  Math.max(
    1,
    Math.round((trip.endDate.getTime() - trip.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );

const tripRangeEnd = (trip: { endDate: Date }) =>
  new Date(`${trip.endDate.toISOString().slice(0, 10)}T23:59:59.999Z`);

// Bỏ id không tồn tại để AI không ghi được địa điểm bịa vào DB.
const keepKnownIds = async (items: PlanInput["items"]) => {
  const placeIds = [...new Set(items.map((item) => item.placeId).filter((id): id is string => !!id))];
  const eventIds = [...new Set(items.map((item) => item.eventId).filter((id): id is string => !!id))];

  const [places, events] = await Promise.all([
    placeIds.length > 0
      ? prisma.place.findMany({ where: { id: { in: placeIds } }, select: { id: true } })
      : [],
    eventIds.length > 0
      ? prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true } })
      : [],
  ]);

  const knownPlaces = new Set(places.map((place) => place.id));
  const knownEvents = new Set(events.map((event) => event.id));

  return items.map((item) => ({
    ...item,
    placeId: item.placeId && knownPlaces.has(item.placeId) ? item.placeId : null,
    eventId: item.eventId && knownEvents.has(item.eventId) ? item.eventId : null,
  }));
};

// AI hay lặp cùng một hoạt động trong ngày; giữ bản đầu tiên.
const dropDuplicates = <T extends { dayNumber: number; title: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.dayNumber}:${item.title.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const costOf = (items: { estimatedCost?: unknown }[]) =>
  items.reduce((sum, item) => sum + Number(item.estimatedCost ?? 0), 0);

const rowsOf = (items: PlanInput["items"]) => {
  const perDay = new Map<number, number>();
  return items.map((item) => {
    const orderIndex = perDay.get(item.dayNumber) ?? 0;
    perDay.set(item.dayNumber, orderIndex + 1);
    return {
      dayNumber: item.dayNumber,
      orderIndex,
      itemType: item.itemType,
      placeId: item.placeId ?? null,
      eventId: item.eventId ?? null,
      title: item.title,
      startTime: item.startTime ?? null,
      estimatedCost: item.estimatedCost ?? null,
      notes: item.notes ?? null,
    };
  });
};

const nextVersion = async (tripId: string) => {
  const latest = await prisma.itinerary.aggregate({
    where: { tripId },
    _max: { version: true },
  });
  return (latest._max.version ?? 0) + 1;
};

const askJson = async (prompt: string): Promise<unknown> => {
  const message = await chat(
    [
      { role: "system", content: promptSystem },
      { role: "user", content: prompt },
    ],
    undefined,
    { json: true },
  );

  try {
    return JSON.parse(
      (message.content ?? "").replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim(),
    );
  } catch {
    throw new AppError(502, "AI trả về dữ liệu không hợp lệ, thử lại");
  }
};

const candidateContext = async (userId: string, trip: { startDate: Date; endDate: Date }) => {
  const [profile, places, events] = await Promise.all([
    prisma.travelerProfile.findFirst({ where: { userId } }),
    prisma.place.findMany({ where: { isActive: true }, orderBy: { avgRating: "desc" }, take: 15 }),
    listEventsInRange(trip.startDate, tripRangeEnd(trip)),
  ]);
  return { profile, places, events };
};

const weatherLines = async (start: Date, days: number) => {
  const range = await getWeatherRange().catch(() => []);
  if (range.length === 0) return { lines: [] as string[], rainyDays: [] as string[] };

  const byDate = new Map(range.map((day) => [day.date, day]));
  const lines: string[] = [];
  const rainyDays: string[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const day = byDate.get(date);
    if (!day) continue;
    lines.push(
      `Ngày ${index + 1} (${date}): ${day.description}, ${day.minTemp}-${day.maxTemp}°C, mưa ${day.rainMm}mm`,
    );
    if (day.isRainy) rainyDays.push(`ngày ${index + 1}`);
  }

  return { lines, rainyDays };
};

export const savePlan = async (
  userId: string,
  tripId: string,
  plan: PlanInput,
  generatedBy: "ai" | "user",
  chatSessionId: string | null = null,
) => {
  const trip = await tripOf(userId, tripId);
  const items = dropDuplicates(await keepKnownIds(plan.items));

  return prisma.itinerary.create({
    data: {
      tripId: trip.id,
      chatSessionId,
      title: plan.title ?? `Lịch trình ${trip.title ?? "Đà Nẵng"}`,
      status: "draft",
      version: await nextVersion(trip.id),
      reason: plan.reason ?? null,
      generatedBy,
      totalEstimatedCost: costOf(items),
      items: { create: rowsOf(items) },
    },
    include: { items: { orderBy: [{ dayNumber: "asc" }, { orderIndex: "asc" }] } },
  });
};

export const listItineraries = async (userId: string, tripId: unknown) => {
  const trip = await tripOf(userId, tripId);
  return prisma.itinerary.findMany({
    where: { tripId: trip.id },
    orderBy: { version: "desc" },
    include: { _count: { select: { items: true } } },
  });
};

export const getItinerary = async (userId: string, itineraryId: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const [places, events] = await Promise.all([
    prisma.place.findMany({
      where: {
        id: { in: itinerary.items.map((item) => item.placeId).filter((id): id is string => !!id) },
      },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    }),
    prisma.event.findMany({
      where: {
        id: { in: itinerary.items.map((item) => item.eventId).filter((id): id is string => !!id) },
      },
      select: { id: true, title: true, venue: true, startAt: true },
    }),
  ]);
  return { itinerary, places, events };
};

export const updateItem = async (
  userId: string,
  itineraryId: unknown,
  itemId: unknown,
  body: unknown,
) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const id = readUuidParam(itemId, "hoạt động");
  const item = itinerary.items.find((row) => row.id === id);
  if (!item) throw new AppError(404, "Không tìm thấy hoạt động trong lịch trình này");

  const input = parseInput(updateItemSchema, body);
  const updated = await prisma.itineraryItem.update({
    where: { id },
    data: {
      ...(input.dayNumber !== undefined ? { dayNumber: input.dayNumber } : {}),
      ...(input.orderIndex !== undefined ? { orderIndex: input.orderIndex } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime ?? null } : {}),
    },
  });

  const items = await prisma.itineraryItem.findMany({ where: { itineraryId: itinerary.id } });
  await prisma.itinerary.update({
    where: { id: itinerary.id },
    data: { totalEstimatedCost: costOf(items) },
  });
  return updated;
};

export const listImpacts = async (userId: string, tripId: unknown) => {
  const trip = await tripOf(userId, tripId);
  return prisma.impactDetection.findMany({
    where: { itinerary: { tripId: trip.id } },
    include: {
      itineraryItem: { select: { id: true, title: true, dayNumber: true } },
      eventVersion: { include: { event: { select: { title: true } } } },
    },
    orderBy: { detectedAt: "desc" },
    take: 50,
  });
};

// Tạo phiên bản mới từ một lịch trình có sẵn, dùng chung cho what-if, thêm hoạt
// động và áp dụng cảnh báo.
const newVersionFrom = async (
  source: {
    id: string;
    tripId: string;
    version: number;
    title: string | null;
    chatSessionId?: string | null;
  },
  items: PlanInput["items"],
  reason: string,
) =>
  prisma.itinerary.create({
    data: {
      tripId: source.tripId,
      parentItineraryId: source.id,
      chatSessionId: source.chatSessionId ?? null,
      title: source.title,
      status: "draft",
      version: await nextVersion(source.tripId),
      reason,
      generatedBy: "ai",
      totalEstimatedCost: costOf(items),
      items: { create: rowsOf(items) },
    },
    include: { items: { orderBy: [{ dayNumber: "asc" }, { orderIndex: "asc" }] } },
  });

const itemsOf = (source: {
  items: {
    dayNumber: number;
    itemType: PlanInput["items"][number]["itemType"];
    placeId: string | null;
    eventId: string | null;
    title: string;
    startTime: Date | null;
    estimatedCost: unknown;
    notes: string | null;
  }[];
}): PlanInput["items"] =>
  source.items.map((item) => ({
    dayNumber: item.dayNumber,
    title: item.title,
    itemType: item.itemType,
    placeId: item.placeId,
    eventId: item.eventId,
    startTime: item.startTime,
    estimatedCost: item.estimatedCost === null ? null : Number(item.estimatedCost),
    notes: item.notes,
  }));

// Áp dụng cảnh báo: nhờ AI thay hoạt động bị ảnh hưởng bằng hoạt động khác cùng
// ngày; AI lỗi thì bỏ hoạt động đó như trước.
export const applyImpact = async (userId: string, itineraryId: unknown, impactId: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const id = readUuidParam(impactId, "cảnh báo");
  const impact = await prisma.impactDetection.findFirst({
    where: { id, itineraryId: itinerary.id },
    include: {
      itineraryItem: { select: { id: true, title: true, dayNumber: true, itemType: true } },
      eventVersion: {
        select: { changeType: true, event: { select: { title: true } } },
      },
    },
  });
  if (!impact) throw new AppError(404, "Không tìm thấy cảnh báo cho lịch trình này");

  const removed = impact.itineraryItem?.title ?? "hoạt động bị ảnh hưởng";
  const changeLabel = impact.eventVersion.changeType === "cancelled" ? "bị huỷ" : "thay đổi";
  const kept = itemsOf(itinerary).filter(
    (_, index) => itinerary.items[index]?.id !== impact.itineraryItemId,
  );

  let replacement: PlanInput["items"][number] | null = null;
  if (impact.itineraryItem) {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: itinerary.tripId } });
    const { places, events } = await candidateContext(userId, trip);

    try {
      const answer = await askJson(
        [
          `Sự kiện "${impact.eventVersion.event?.title ?? removed}" ${changeLabel}, hoạt động "${removed}" ngày ${impact.itineraryItem.dayNumber} không còn dùng được.`,
          "Chọn MỘT hoạt động thay thế cùng ngày, chỉ dùng id trong danh sách dưới đây.",
          `Địa điểm: ${JSON.stringify(places.map((place) => ({ id: place.id, name: place.name, category: place.category, district: place.district })))}`,
          `Sự kiện khác: ${JSON.stringify(events.map((event) => ({ id: event.id, title: event.title, startAt: event.startAt })))}`,
          'Trả về DUY NHẤT JSON dạng {"title": string, "itemType": "place|restaurant|activity|event|transport|rest", "placeId": string|null, "eventId": string|null, "startTime": string|null, "notes": string|null}.',
        ].join("\n"),
      );
      const parsed = itemSchema.safeParse({
        dayNumber: impact.itineraryItem.dayNumber,
        ...(typeof answer === "object" && answer !== null ? answer : {}),
      });
      if (parsed.success) replacement = parsed.data;
    } catch {
      // giữ nguyên hành vi cũ: chỉ bỏ hoạt động bị ảnh hưởng
    }
  }

  const known = replacement ? dropDuplicates(await keepKnownIds([...kept, replacement])) : kept;
  const reason = replacement
    ? `Đổi "${removed}" sang "${replacement.title}" vì sự kiện ${changeLabel}`
    : `Đã bỏ "${removed}" do sự kiện ${changeLabel}`;

  const created = await newVersionFrom(itinerary, known, reason);
  await prisma.impactDetection.update({ where: { id: impact.id }, data: { isResolved: true } });
  return created;
};

export const diffItineraries = async (userId: string, itineraryId: unknown, otherId: unknown) => {
  const left = await itineraryOf(userId, itineraryId);
  const right = await itineraryOf(userId, otherId);

  const keyOf = (item: { dayNumber: number; title: string }) =>
    `${item.dayNumber}:${item.title.trim().toLowerCase()}`;
  const rightKeys = new Map(right.items.map((item) => [keyOf(item), item]));

  const added = right.items.filter((item) => !left.items.some((row) => keyOf(row) === keyOf(item)));
  const removed = left.items.filter((item) => !rightKeys.has(keyOf(item)));

  return {
    from: { id: left.id, version: left.version, reason: left.reason },
    to: { id: right.id, version: right.version, reason: right.reason },
    added,
    removed,
    costDelta: Number(right.totalEstimatedCost ?? 0) - Number(left.totalEstimatedCost ?? 0),
  };
};

// Mỗi chuyến chỉ một bản đang dùng.
export const activateItinerary = async (userId: string, itineraryId: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  await prisma.$transaction([
    prisma.itinerary.updateMany({
      where: { tripId: itinerary.tripId, id: { not: itinerary.id }, status: "active" },
      data: { status: "draft" },
    }),
    prisma.itinerary.update({ where: { id: itinerary.id }, data: { status: "active" } }),
  ]);
  return prisma.itinerary.findUniqueOrThrow({
    where: { id: itinerary.id },
    include: { items: { orderBy: [{ dayNumber: "asc" }, { orderIndex: "asc" }] } },
  });
};

export const deleteItinerary = async (userId: string, itineraryId: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  if (itinerary.status === "active") {
    throw new AppError(409, "Không xoá được bản đang dùng, hãy đặt bản khác làm bản chính trước");
  }
  await prisma.itinerary.delete({ where: { id: itinerary.id } });
};

export const addItem = async (userId: string, itineraryId: unknown, body: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const input = parseInput(addItemSchema, body);
  const [known] = await keepKnownIds([
    { ...input, placeId: input.placeId ?? null, eventId: input.eventId ?? null },
  ]);
  if (!known) throw new AppError(400, "Dữ liệu hoạt động không hợp lệ");

  return newVersionFrom(
    itinerary,
    [...itemsOf(itinerary), known],
    input.notes
      ? `Thêm "${input.title}": ${input.notes}`
      : `Thêm "${input.title}" vào ngày ${input.dayNumber}`,
  );
};

export const generateItinerary = async (userId: string, tripId: unknown, body: unknown) => {
  const trip = await tripOf(userId, tripId);
  const input = parseInput(generateSchema, body ?? {});
  const days = tripDays(trip);
  const [{ profile, places, events }, weather] = await Promise.all([
    candidateContext(userId, trip),
    weatherLines(trip.startDate, days),
  ]);

  const prompt = [
    `Lập lịch trình ${days} ngày tại Đà Nẵng cho chuyến đi từ ${trip.startDate.toISOString().slice(0, 10)} đến ${trip.endDate.toISOString().slice(0, 10)}.`,
    `Số người: ${trip.adults} người lớn, ${trip.children} trẻ em, ${trip.companions.length} người đồng hành.`,
    trip.companions.length > 0
      ? `Người đồng hành: ${trip.companions
          .map((companion) => `${companion.name ?? "không tên"}${companion.age ? ` (${companion.age} tuổi)` : ""}`)
          .join(", ")}.`
      : "",
    profile
      ? `Sở thích: ${profile.interests.join(", ") || "không nêu"}. Không muốn: ${profile.dislikes.join(", ") || "không nêu"}. Phong cách: ${profile.travelStyle ?? "không nêu"}. Ngân sách: ${profile.budgetMin ?? "?"}-${profile.budgetMax ?? "?"} ${profile.currency ?? "VND"}.`
      : "Chưa có hồ sơ du khách.",
    input.notes ? `Yêu cầu thêm: ${input.notes}` : "",
    weather.lines.length > 0
      ? `Dự báo thời tiết:\n${weather.lines.join("\n")}\nNgày mưa thì ưu tiên hoạt động trong nhà (bảo tàng, chợ, workshop, quán cà phê).`
      : "",
    events.length > 0
      ? "Phải chèn các sự kiện đang diễn ra trong khoảng ngày của chuyến đi, ít nhất một sự kiện mỗi ngày có sự kiện."
      : "",
    "Chỉ được dùng địa điểm và sự kiện trong danh sách dưới đây, không bịa thêm.",
    `Địa điểm: ${JSON.stringify(places.map((place) => ({ id: place.id, name: place.name, district: place.district, category: place.category, tags: place.tags })))}`,
    `Sự kiện: ${JSON.stringify(events.map((event) => ({ id: event.id, title: event.title, venue: event.venue, startAt: event.startAt })))}`,
    'Trả về DUY NHẤT JSON dạng {"title": string, "reason": string, "items": [{"dayNumber": number, "title": string, "itemType": "place|restaurant|activity|event|transport|rest", "placeId": string|null, "eventId": string|null, "startTime": string|null, "estimatedCost": number|null, "notes": string|null}]}.',
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = await askJson(prompt);
  const plan = planSchema.safeParse(parsed);
  if (!plan.success) throw new AppError(502, "AI trả về dữ liệu không hợp lệ, thử lại");

  const reason = weather.rainyDays.length > 0
    ? `${plan.data.reason ?? "Lịch trình mới"}. Ngày mưa (${weather.rainyDays.join(", ")}) đã xếp hoạt động trong nhà.`
    : plan.data.reason;

  return savePlan(userId, trip.id, { ...plan.data, reason }, "ai", input.chatSessionId ?? null);
};

// What-if: sinh phiên bản mới theo kịch bản, không tự áp dụng.
export const whatIf = async (userId: string, tripId: unknown, body: unknown) => {
  const trip = await tripOf(userId, tripId);
  const input = parseInput(whatIfSchema, body);
  const source = await itineraryOf(userId, input.itineraryId);
  if (source.tripId !== trip.id) throw new AppError(404, "Không tìm thấy lịch trình");

  const { places, events } = await candidateContext(userId, trip);
  const weather = await weatherLines(trip.startDate, tripDays(trip));

  const prompt = [
    `Lịch trình hiện tại (JSON): ${JSON.stringify(itemsOf(source))}`,
    `Kịch bản người dùng muốn xử lý: ${input.scenario}`,
    weather.lines.length > 0 ? `Dự báo thời tiết:\n${weather.lines.join("\n")}` : "",
    "Giữ nguyên các hoạt động không bị kịch bản ảnh hưởng, chỉ đổi những chỗ cần đổi.",
    "Chỉ được dùng địa điểm và sự kiện trong danh sách dưới đây, không bịa thêm.",
    `Địa điểm: ${JSON.stringify(places.map((place) => ({ id: place.id, name: place.name, district: place.district, category: place.category, tags: place.tags })))}`,
    `Sự kiện: ${JSON.stringify(events.map((event) => ({ id: event.id, title: event.title, venue: event.venue, startAt: event.startAt })))}`,
    'Trả về DUY NHẤT JSON dạng {"title": string, "reason": string, "items": [{"dayNumber": number, "title": string, "itemType": "place|restaurant|activity|event|transport|rest", "placeId": string|null, "eventId": string|null, "startTime": string|null, "estimatedCost": number|null, "notes": string|null}]}.',
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = await askJson(prompt);
  const plan = planSchema.safeParse(parsed);
  if (!plan.success) throw new AppError(502, "AI trả về dữ liệu không hợp lệ, thử lại");

  const known = dropDuplicates(await keepKnownIds(plan.data.items));
  const created = await newVersionFrom(
    { ...source, chatSessionId: input.chatSessionId ?? source.chatSessionId },
    known,
    plan.data.reason ?? `Kịch bản: ${input.scenario}`,
  );

  const diff = await diffItineraries(userId, source.id, created.id);
  return { itinerary: created, diff };
};
