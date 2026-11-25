import { AppError } from "../../common/http-error.ts";
import { chat } from "../../common/llm.ts";
import { parseInput, readUuidParam } from "../../common/validate.ts";
import { getWeatherRange } from "../../common/weather.ts";
import { prisma } from "../../config/prisma.ts";
import { listEventsInRange } from "../events/events.service.ts";
import { inferDaNangDistrict } from "../sync/crawler.service.ts";
import {
  addItemSchema,
  generateSchema,
  itemSchema,
  moveItemSchema,
  planSchema,
  updateItemSchema,
  whatIfSchema,
} from "./itineraries.schema.ts";
import type { PlanInput } from "./itineraries.schema.ts";

const promptSystem =
  "Bạn là chuyên gia lập kế hoạch du lịch Đà Nẵng. Chỉ trả lời bằng JSON hợp lệ, không thêm bất kỳ văn bản giải thích nào ngoài JSON.";

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
    Math.min(
      30,
      Math.round((trip.endDate.getTime() - trip.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    ),
  );

const tripRangeEnd = (trip: { endDate: Date }) =>
  new Date(`${trip.endDate.toISOString().slice(0, 10)}T23:59:59.999Z`);

const makeSlotDate = (tripStart: Date, dayNumber: number, hourVn: number, minuteVn = 0): Date => {
  const base = new Date(tripStart.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000);
  base.setUTCHours(hourVn - 7, minuteVn, 0, 0);
  return base;
};

// Tự động ước tính chi phí hợp lý (VNĐ) cho từng địa điểm / hoạt động theo số khách
const estimateDefaultCost = (
  item: {
    title: string;
    itemType?: string;
    estimatedCost?: number | null;
    place?: {
      category?: string;
      priceLevel?: number | null;
      estimatedCostVnd?: number | null;
    } | null;
    event?: {
      isFree?: boolean | null;
      priceMin?: unknown;
    } | null;
  },
  partySize = 1,
): number => {
  if (typeof item.estimatedCost === "number" && item.estimatedCost > 0) {
    return Math.round(item.estimatedCost);
  }

  const guests = Math.max(1, partySize);
  const titleLower = item.title.toLowerCase();

  if (item.event) {
    if (item.event.isFree) return 0;
    const min = Number(item.event.priceMin ?? 0);
    if (min > 0) return Math.round(min * guests);
  }

  if (item.place) {
    if (typeof item.place.estimatedCostVnd === "number" && item.place.estimatedCostVnd >= 0) {
      return Math.round(item.place.estimatedCostVnd * guests);
    }
    const level = item.place.priceLevel ?? 1;
    if (level === 0) {
      // Biển, chùa miễn phí vé nhưng tính phí gửi xe / nước uống nhẹ
      if (item.place.category === "beach" || item.place.category === "temple") return 0;
    }
    const byLevel: Record<number, number> = {
      0: 0,
      1: 65000,
      2: 160000,
      3: 450000,
      4: 850000,
    };
    return Math.round((byLevel[level] ?? 100000) * guests);
  }

  if (titleLower.includes("bà nà") || titleLower.includes("cầu vàng")) return 900000 * guests;
  if (titleLower.includes("núi thần tài")) return 450000 * guests;
  if (titleLower.includes("mikazuki")) return 350000 * guests;
  if (titleLower.includes("hải sản")) return 250000 * guests;
  if (titleLower.includes("cà phê") || titleLower.includes("cafe") || titleLower.includes("chè")) {
    return 55000 * guests;
  }
  if (
    item.itemType === "restaurant" ||
    titleLower.includes("ăn trưa") ||
    titleLower.includes("ăn tối") ||
    titleLower.includes("nhà hàng") ||
    titleLower.includes("bếp cuốn") ||
    titleLower.includes("mì quảng") ||
    titleLower.includes("bánh tráng")
  ) {
    return 140000 * guests;
  }
  if (titleLower.includes("bãi biển") || titleLower.includes("chùa linh ứng") || titleLower.includes("cầu rồng")) {
    return 0;
  }
  if (item.itemType === "transport") return 80000;
  if (item.itemType === "rest") return 0;

  return 70000 * guests;
};

// Giữ lại các placeId/eventId có thật trong DB và lấy thông tin chi phí chuẩn
const keepKnownIds = async (items: PlanInput["items"], partySize = 1) => {
  const placeIds = [...new Set(items.map((item) => item.placeId).filter((id): id is string => !!id))];
  const eventIds = [...new Set(items.map((item) => item.eventId).filter((id): id is string => !!id))];

  const [places, events] = await Promise.all([
    placeIds.length > 0
      ? prisma.place.findMany({
          where: { id: { in: placeIds } },
          select: { id: true, category: true, priceLevel: true, estimatedCostVnd: true },
        })
      : [],
    eventIds.length > 0
      ? prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, isFree: true, priceMin: true },
        })
      : [],
  ]);

  const placeMap = new Map(places.map((p) => [p.id, p]));
  const eventMap = new Map(events.map((e) => [e.id, e]));

  return items.map((item) => {
    const validPlace = item.placeId ? placeMap.get(item.placeId) ?? null : null;
    const validEvent = item.eventId ? eventMap.get(item.eventId) ?? null : null;
    const estimatedCost = estimateDefaultCost(
      {
        title: item.title,
        itemType: item.itemType,
        estimatedCost: item.estimatedCost,
        place: validPlace,
        event: validEvent,
      },
      partySize,
    );
    return {
      ...item,
      placeId: validPlace ? validPlace.id : null,
      eventId: validEvent ? validEvent.id : null,
      estimatedCost,
    };
  });
};

// Loại bỏ hoạt động trùng tên trong cùng một ngày
const dropDuplicates = <T extends { dayNumber: number; title: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.dayNumber}:${item.title.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const costOf = (items: { estimatedCost?: unknown }[]) =>
  items.reduce((sum, item) => sum + Number(item.estimatedCost ?? 0), 0);

// Tính tổng chi phí dự kiến cho từng ngày du lịch
export const dailyCostsOf = (items: { dayNumber: number; estimatedCost?: unknown }[]) => {
  const map = new Map<number, number>();
  for (const item of items) {
    map.set(item.dayNumber, (map.get(item.dayNumber) ?? 0) + Number(item.estimatedCost ?? 0));
  }
  return Object.fromEntries(map.entries());
};

const rowsOf = (items: PlanInput["items"]) => {
  const sorted = [...items].sort((a, b) => {
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
    const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return tA - tB;
  });

  const perDay = new Map<number, number>();
  return sorted.map((item) => {
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
      endTime: item.endTime ?? null,
      estimatedCost: item.estimatedCost ?? 0,
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

// Lấy danh sách địa điểm & sự kiện phục vụ AI lập lịch trình, ưu tiên Đối tác F&B (isSponsored)
const candidateContext = async (
  userId: string,
  trip: { startDate: Date; endDate: Date },
  options?: { categories?: string[]; preferredPlaceIds?: string[] },
) => {
  const categoryFilter =
    options?.categories && options.categories.length > 0 ? options.categories : undefined;

  const [profile, places, preferredPlaces, events] = await Promise.all([
    prisma.travelerProfile.findFirst({ where: { userId } }),
    prisma.place.findMany({
      where: {
        isActive: true,
        ...(categoryFilter
          ? {
              OR: [
                { category: { in: categoryFilter } },
                { category: { in: ["restaurant", "cafe"] }, isSponsored: true },
              ],
            }
          : {}),
      },
      orderBy: [
        { isSponsored: "desc" },
        { sponsorPriority: "desc" },
        { avgRating: "desc" },
      ],
      take: 80,
    }),
    options?.preferredPlaceIds && options.preferredPlaceIds.length > 0
      ? prisma.place.findMany({
          where: { id: { in: options.preferredPlaceIds }, isActive: true },
        })
      : Promise.resolve([]),
    listEventsInRange(trip.startDate, tripRangeEnd(trip), 25),
  ]);

  // Gộp preferredPlaces lên đầu để không bao giờ bị thiếu
  const mergedPlacesMap = new Map<string, (typeof places)[number]>();
  for (const p of preferredPlaces) mergedPlacesMap.set(p.id, p);
  for (const p of places) {
    if (!mergedPlacesMap.has(p.id)) mergedPlacesMap.set(p.id, p);
  }

  // Nếu người dùng lọc category quá hẹp dẫn tới ít hơn 15 địa điểm thì lấy bù thêm địa điểm chung
  if (mergedPlacesMap.size < 20) {
    const extra = await prisma.place.findMany({
      where: { isActive: true },
      orderBy: [{ isSponsored: "desc" }, { avgRating: "desc" }],
      take: 40,
    });
    for (const p of extra) {
      if (!mergedPlacesMap.has(p.id)) mergedPlacesMap.set(p.id, p);
    }
  }

  return { profile, places: [...mergedPlacesMap.values()], preferredPlaces, events };
};

// RÀNG BUỘC LOGIC AI: Đảm bảo MỖI NGÀY từ ngày 1 đến ngày `days` đều có ÍT NHẤT 3 địa điểm/hoạt động,
// phân bổ khung giờ hợp lý (Sáng 08:30, Trưa 12:00, Chiều 15:00, Tối 19:00) và gán chi phí đầy đủ.
const ensureMinItemsPerDay = (
  rawItems: PlanInput["items"],
  days: number,
  tripStart: Date,
  places: Array<{
    id: string;
    name: string;
    category: string;
    district: string | null;
    priceLevel: number | null;
    estimatedCostVnd: number | null;
    isSponsored: boolean;
  }>,
  preferredPlaces: Array<{
    id: string;
    name: string;
    category: string;
    district: string | null;
    priceLevel: number | null;
    estimatedCostVnd: number | null;
    isSponsored: boolean;
  }>,
  partySize: number,
): PlanInput["items"] => {
  const result: PlanInput["items"] = [...rawItems];
  const usedPlaceIds = new Set<string>(
    result.map((item) => item.placeId).filter((id): id is string => !!id),
  );

  // Đảm bảo tất cả địa điểm người dùng đã tích chọn trong Checklist (Option 1) đều có mặt trong lịch trình
  let targetDayForPreferred = 1;
  for (const pref of preferredPlaces) {
    if (!usedPlaceIds.has(pref.id)) {
      const isFood = pref.category === "restaurant" || pref.category === "cafe";
      result.push({
        dayNumber: targetDayForPreferred,
        title: isFood ? `Thưởng thức tại ${pref.name}` : `Tham quan ${pref.name}`,
        itemType: pref.category === "restaurant" ? "restaurant" : "place",
        placeId: pref.id,
        eventId: null,
        startTime: makeSlotDate(tripStart, targetDayForPreferred, isFood ? 12 : 9, 0),
        endTime: makeSlotDate(tripStart, targetDayForPreferred, isFood ? 13 : 11, 30),
        estimatedCost: estimateDefaultCost({ title: pref.name, place: pref }, partySize),
        notes: pref.isSponsored
          ? "Địa điểm ưa thích bạn đã chọn (Đối tác F&B đề xuất)"
          : "Địa điểm nằm trong danh sách yêu thích bạn đã chọn",
      });
      usedPlaceIds.add(pref.id);
      targetDayForPreferred = (targetDayForPreferred % days) + 1;
    }
  }

  const attractions = places.filter((p) => !["restaurant", "cafe"].includes(p.category));
  const dining = places.filter((p) => p.category === "restaurant" || p.category === "cafe");
  const allPool = places.length > 0 ? places : [];

  let attrCursor = 0;
  let diningCursor = 0;

  const pickNextPlace = (preferFood: boolean) => {
    const primary = preferFood ? dining : attractions;
    const secondary = preferFood ? attractions : dining;

    // Ưu tiên địa điểm chưa dùng trong toàn chuyến đi
    for (const p of primary) {
      if (!usedPlaceIds.has(p.id)) {
        usedPlaceIds.add(p.id);
        return p;
      }
    }
    for (const p of secondary) {
      if (!usedPlaceIds.has(p.id)) {
        usedPlaceIds.add(p.id);
        return p;
      }
    }
    // Nếu chuyến đi dài (ví dụ 10 ngày) và đã dùng hết vòng 1, xoay vòng hợp lý
    if (preferFood && dining.length > 0) {
      const p = dining[diningCursor % dining.length]!;
      diningCursor += 1;
      return p;
    }
    if (attractions.length > 0) {
      const p = attractions[attrCursor % attractions.length]!;
      attrCursor += 1;
      return p;
    }
    return allPool[0] ?? null;
  };

  const slotTemplates = [
    { startHour: 8, endHour: 11, preferFood: false, prefix: "Khám phá buổi sáng:" },
    { startHour: 12, endHour: 13, preferFood: true, prefix: "Thưởng thức ẩm thực trưa:" },
    { startHour: 15, endHour: 17, preferFood: false, prefix: "Tham quan & Trải nghiệm chiều:" },
    { startHour: 19, endHour: 21, preferFood: true, prefix: "Ẩm thực & Dạo phố tối:" },
  ];

  for (let day = 1; day <= days; day += 1) {
    const dayItems = result.filter((item) => item.dayNumber === day);
    const usedTitlesInDay = new Set(dayItems.map((i) => i.title.trim().toLowerCase()));

    let slotIdx = dayItems.length;
    // Bắt buộc mỗi ngày phải có tối thiểu 3 hoạt động (và khuyến nghị 4 hoạt động Sáng-Trưa-Chiều-Tối)
    const minRequired = 4;
    while (result.filter((item) => item.dayNumber === day).length < minRequired && slotIdx < 6) {
      const template = slotTemplates[slotIdx % slotTemplates.length]!;
      const place = pickNextPlace(template.preferFood);
      slotIdx += 1;

      if (!place) break;

      const candidateTitle = `${template.prefix} ${place.name}`;
      if (usedTitlesInDay.has(candidateTitle.toLowerCase())) continue;
      usedTitlesInDay.add(candidateTitle.toLowerCase());

      result.push({
        dayNumber: day,
        title: candidateTitle,
        itemType: place.category === "restaurant" || place.category === "cafe" ? "restaurant" : "place",
        placeId: place.id,
        eventId: null,
        startTime: makeSlotDate(tripStart, day, template.startHour, 0),
        endTime: makeSlotDate(tripStart, day, template.endHour, 30),
        estimatedCost: estimateDefaultCost({ title: candidateTitle, place }, partySize),
        notes: place.isSponsored
          ? `⭐ Đối tác F&B Đề xuất tại ${place.district ?? "Đà Nẵng"}`
          : `Khu vực ${place.district ?? "Đà Nẵng"}`,
      });
    }

    // Chuẩn hoá & chống trùng giờ tuyệt đối cho toàn bộ các hoạt động trong cùng một ngày:
    // Nếu có bất kỳ hoạt động nào bị trùng khung giờ (ví dụ 2 quán ăn cùng rơi vào 12:00 - 13:30
    // hoặc 2 điểm tham quan cùng rơi vào 09:00 - 11:30), tự động phân bổ các hoạt động trong ngày
    // vào dãy khung giờ nối tiếp nhau từ Sáng -> Trưa -> Chiều -> Tối -> Đêm mà không bao giờ đè lên nhau!
    const finalDayItems = result.filter((item) => item.dayNumber === day);
    const nonOverlappingSlots = [
      { startH: 8, startM: 30, endH: 11, endM: 0 }, // #1: Buổi sáng (08:30 - 11:00)
      { startH: 11, startM: 30, endH: 13, endM: 30 }, // #2: Buổi trưa (11:30 - 13:30)
      { startH: 14, startM: 30, endH: 17, endM: 30 }, // #3: Buổi chiều (14:30 - 17:30)
      { startH: 18, startM: 30, endH: 20, endM: 30 }, // #4: Buổi tối (18:30 - 20:30)
      { startH: 20, startM: 45, endH: 22, endM: 30 }, // #5: Dạo đêm (20:45 - 22:30)
      { startH: 22, startM: 30, endH: 23, endM: 45 }, // #6: Hoạt động khuya (22:30 - 23:45)
    ];

    // Sắp xếp ưu tiên theo giờ gợi ý ban đầu để điểm tham quan buổi sáng vẫn đứng trước bữa trưa / bữa tối
    finalDayItems.sort((a, b) => {
      const aMs = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bMs = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aMs - bMs;
    });

    // Kiểm tra xem trong ngày có item nào thiếu giờ hoặc bị trùng/chồng lấn giờ với item trước đó không
    let hasMissingOrOverlap = false;
    for (let idx = 0; idx < finalDayItems.length; idx += 1) {
      const cur = finalDayItems[idx]!;
      if (!cur.startTime || !cur.endTime) {
        hasMissingOrOverlap = true;
        break;
      }
      if (idx > 0) {
        const prev = finalDayItems[idx - 1]!;
        const prevEnd = prev.endTime ? new Date(prev.endTime).getTime() : 0;
        const curStart = new Date(cur.startTime).getTime();
        if (curStart < prevEnd) {
          hasMissingOrOverlap = true;
          break;
        }
      }
    }

    if (hasMissingOrOverlap) {
      finalDayItems.forEach((item, idx) => {
        const slot =
          nonOverlappingSlots[idx] ??
          nonOverlappingSlots[nonOverlappingSlots.length - 1]!;
        item.startTime = makeSlotDate(tripStart, day, slot.startH, slot.startM);
        item.endTime = makeSlotDate(tripStart, day, slot.endH, slot.endM);
      });
    }
  }

  return result;
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
  const days = tripDays(trip);
  const partySize = Math.max(1, trip.adults + trip.children + trip.companions.length);
  const { places } = await candidateContext(userId, trip);

  const known = dropDuplicates(await keepKnownIds(plan.items, partySize));
  const completeItems = ensureMinItemsPerDay(
    known,
    days,
    trip.startDate,
    places,
    [],
    partySize,
  );

  return prisma.itinerary.create({
    data: {
      tripId: trip.id,
      chatSessionId,
      title: plan.title ?? `Lịch trình ${trip.title ?? "Đà Nẵng"} (${days} ngày)`,
      status: "draft",
      version: await nextVersion(trip.id),
      reason: plan.reason ?? null,
      generatedBy,
      totalEstimatedCost: costOf(completeItems),
      items: { create: rowsOf(completeItems) },
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
      select: {
        id: true,
        name: true,
        category: true,
        district: true,
        address: true,
        latitude: true,
        longitude: true,
        isSponsored: true,
        sponsorTier: true,
        estimatedCostVnd: true,
      },
    }),
    prisma.event.findMany({
      where: {
        id: { in: itinerary.items.map((item) => item.eventId).filter((id): id is string => !!id) },
      },
      select: {
        id: true,
        title: true,
        venue: true,
        startAt: true,
        endAt: true,
        latitude: true,
        longitude: true,
      },
    }),
  ]);
  const dailyCosts = dailyCostsOf(itinerary.items);
  return { itinerary, places, events, dailyCosts };
};

// Sắp xếp lại orderIndex an toàn cho một ngày trong transaction để tránh đụng unique constraint
const resequenceDayTx = async (
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  itineraryId: string,
  dayNumber: number,
  orderedIds?: string[],
) => {
  const items = await tx.itineraryItem.findMany({
    where: { itineraryId, dayNumber },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  });

  const sorted = orderedIds
    ? orderedIds
        .map((id) => items.find((row) => row.id === id))
        .filter((row): row is (typeof items)[number] => !!row)
    : items;

  // Bước 1: dịch tạm orderIndex + 1000 để tránh trùng khóa (itineraryId, dayNumber, orderIndex)
  for (let i = 0; i < sorted.length; i += 1) {
    await tx.itineraryItem.update({
      where: { id: sorted[i]!.id },
      data: { orderIndex: 1000 + i },
    });
  }
  // Bước 2: gán lại 0..n-1 chuẩn xác
  for (let i = 0; i < sorted.length; i += 1) {
    await tx.itineraryItem.update({
      where: { id: sorted[i]!.id },
      data: { orderIndex: i },
    });
  }
};

const syncTotalCost = async (itineraryId: string) => {
  const items = await prisma.itineraryItem.findMany({ where: { itineraryId } });
  const total = costOf(items);
  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { totalEstimatedCost: total },
  });
  return total;
};

export const updateItem = async (
  userId: string,
  itineraryId: unknown,
  itemId: unknown,
  body: unknown,
) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: itinerary.tripId } });
  const id = readUuidParam(itemId, "hoạt động");
  const item = itinerary.items.find((row) => row.id === id);
  if (!item) throw new AppError(404, "Không tìm thấy hoạt động trong lịch trình này");

  const input = parseInput(updateItemSchema, body);
  const targetDay = input.dayNumber ?? item.dayNumber;
  const targetOrder = input.orderIndex ?? item.orderIndex;

  let nextStart = input.startTime;
  let nextEnd = input.endTime;
  if (nextStart instanceof Date) {
    const hm = getVnHourMinute(nextStart);
    nextStart = makeSlotDate(trip.startDate, targetDay, hm.hour, hm.minute);
  }
  if (nextEnd instanceof Date) {
    const hm = getVnHourMinute(nextEnd);
    nextEnd = makeSlotDate(trip.startDate, targetDay, hm.hour, hm.minute);
  }

  await prisma.$transaction(async (tx) => {
    await tx.itineraryItem.update({
      where: { id },
      data: {
        dayNumber: targetDay,
        orderIndex: 9999,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
        ...(input.placeId !== undefined ? { placeId: input.placeId ?? null } : {}),
        ...(input.eventId !== undefined ? { eventId: input.eventId ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(nextStart !== undefined ? { startTime: nextStart ?? null } : {}),
        ...(nextEnd !== undefined ? { endTime: nextEnd ?? null } : {}),
        ...(input.estimatedCost !== undefined ? { estimatedCost: input.estimatedCost ?? 0 } : {}),
      },
    });

    if (nextStart !== undefined && input.orderIndex === undefined) {
      // Nếu người dùng đổi giờ bắt đầu, tự động xếp lại theo thứ tự thời gian trong ngày
      const allDayRows = await tx.itineraryItem.findMany({
        where: { itineraryId: itinerary.id, dayNumber: targetDay },
      });
      const chronologicalIds = [...allDayRows]
        .sort((a, b) => {
          const tA = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
          const tB = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
          if (tA !== tB) return tA - tB;
          return a.orderIndex - b.orderIndex;
        })
        .map((r) => r.id);
      await resequenceDayTx(tx, itinerary.id, targetDay, chronologicalIds);
    } else {
      const dayItems = await tx.itineraryItem.findMany({
        where: { itineraryId: itinerary.id, dayNumber: targetDay, id: { not: id } },
        orderBy: { orderIndex: "asc" },
      });
      const clampedIndex = Math.max(0, Math.min(targetOrder, dayItems.length));
      const orderedIds = dayItems.map((r) => r.id);
      orderedIds.splice(clampedIndex, 0, id);
      await resequenceDayTx(tx, itinerary.id, targetDay, orderedIds);
    }

    if (targetDay !== item.dayNumber) {
      await resequenceDayTx(tx, itinerary.id, item.dayNumber);
    }
  });

  await syncTotalCost(itinerary.id);
  return prisma.itineraryItem.findUniqueOrThrow({ where: { id } });
};

// Xoá 1 hoạt động khỏi lịch trình và tự động cập nhật lại thứ tự + tổng chi phí
export const deleteItem = async (userId: string, itineraryId: unknown, itemId: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const id = readUuidParam(itemId, "hoạt động");
  const item = itinerary.items.find((row) => row.id === id);
  if (!item) throw new AppError(404, "Không tìm thấy hoạt động trong lịch trình này");

  await prisma.$transaction(async (tx) => {
    await tx.itineraryItem.delete({ where: { id } });
    await resequenceDayTx(tx, itinerary.id, item.dayNumber);
  });

  await syncTotalCost(itinerary.id);
};

// Đổi thứ tự hoạt động lên/xuống trong ngày
export const moveItem = async (
  userId: string,
  itineraryId: unknown,
  itemId: unknown,
  body: unknown,
) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const id = readUuidParam(itemId, "hoạt động");
  const { direction } = parseInput(moveItemSchema, body);

  const dayItems = itinerary.items
    .filter((row) => row.dayNumber === itinerary.items.find((i) => i.id === id)?.dayNumber)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const currentIdx = dayItems.findIndex((row) => row.id === id);
  if (currentIdx === -1) throw new AppError(404, "Không tìm thấy hoạt động");

  const swapIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1;
  if (swapIdx < 0 || swapIdx >= dayItems.length) {
    return itinerary;
  }

  const orderedIds = dayItems.map((r) => r.id);
  const [moved] = orderedIds.splice(currentIdx, 1);
  orderedIds.splice(swapIdx, 0, moved!);

  const dayNumber = dayItems[currentIdx]!.dayNumber;
  await prisma.$transaction(async (tx) => {
    await resequenceDayTx(tx, itinerary.id, dayNumber, orderedIds);
  });

  return itineraryOf(userId, itinerary.id);
};

// Tự động tính lại chi phí bằng AI / định mức thông minh cho toàn bộ hoạt động trong lịch trình
export const estimateItineraryCosts = async (userId: string, itineraryId: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: itinerary.tripId },
    include: { companions: true },
  });
  const partySize = Math.max(1, trip.adults + trip.children + trip.companions.length);

  const [places, events] = await Promise.all([
    prisma.place.findMany({
      where: {
        id: { in: itinerary.items.map((i) => i.placeId).filter((id): id is string => !!id) },
      },
    }),
    prisma.event.findMany({
      where: {
        id: { in: itinerary.items.map((i) => i.eventId).filter((id): id is string => !!id) },
      },
    }),
  ]);
  const placeMap = new Map(places.map((p) => [p.id, p]));
  const eventMap = new Map(events.map((e) => [e.id, e]));

  for (const item of itinerary.items) {
    const place = item.placeId ? placeMap.get(item.placeId) ?? null : null;
    const event = item.eventId ? eventMap.get(item.eventId) ?? null : null;
    const currentCost = Number(item.estimatedCost ?? 0);
    const recalculated = estimateDefaultCost(
      {
        title: item.title,
        itemType: item.itemType,
        estimatedCost: currentCost > 0 ? currentCost : null,
        place,
        event,
      },
      partySize,
    );

    if (recalculated !== currentCost) {
      await prisma.itineraryItem.update({
        where: { id: item.id },
        data: { estimatedCost: recalculated },
      });
    }
  }

  await syncTotalCost(itinerary.id);
  return getItinerary(userId, itinerary.id);
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
    endTime?: Date | null;
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
    endTime: item.endTime ?? null,
    estimatedCost: item.estimatedCost === null ? null : Number(item.estimatedCost),
    notes: item.notes,
  }));

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
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: itinerary.tripId },
    include: { companions: true },
  });
  const partySize = Math.max(1, trip.adults + trip.children + trip.companions.length);

  if (impact.itineraryItem) {
    const { places, events } = await candidateContext(userId, trip);

    try {
      const answer = await askJson(
        [
          `Sự kiện "${impact.eventVersion.event?.title ?? removed}" ${changeLabel}, hoạt động "${removed}" ngày ${impact.itineraryItem.dayNumber} không còn dùng được.`,
          "Chọn MỘT hoạt động thay thế cùng ngày, chỉ dùng id trong danh sách dưới đây.",
          `Địa điểm: ${JSON.stringify(places.slice(0, 30).map((place) => ({ id: place.id, name: place.name, category: place.category, district: place.district, estimatedCostVnd: place.estimatedCostVnd })))}`,
          `Sự kiện khác: ${JSON.stringify(events.map((event) => ({ id: event.id, title: event.title, startAt: event.startAt })))}`,
          'Trả về DUY NHẤT JSON dạng {"title": string, "itemType": "place|restaurant|activity|event|transport|rest", "placeId": string|null, "eventId": string|null, "startTime": string|null, "estimatedCost": number|null, "notes": string|null}.',
        ].join("\n"),
      );
      const parsed = itemSchema.safeParse({
        dayNumber: impact.itineraryItem.dayNumber,
        ...(typeof answer === "object" && answer !== null ? answer : {}),
      });
      if (parsed.success) replacement = parsed.data;
    } catch {
      // Fallback sang địa điểm thay thế tự động
    }
  }

  const known = replacement
    ? dropDuplicates(await keepKnownIds([...kept, replacement], partySize))
    : await keepKnownIds(kept, partySize);
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

// Tự động nhận diện loại địa điểm, tìm trong DB hoặc Geocode tọa độ (OpenStreetMap Nominatim)
// khi khách chỉ nhập tên địa điểm hoặc địa chỉ bất kỳ tại Đà Nẵng
const resolveOrGeocodeCustomPlace = async (
  rawInput: string,
  customAddress?: string | null,
): Promise<{
  id: string;
  name: string;
  category: string;
  itemType: "place" | "restaurant" | "activity";
  district: string;
  address: string;
} | null> => {
  const cleanTitle = rawInput.trim();
  if (cleanTitle.length < 2) return null;

  const toItemType = (cat: string): "place" | "restaurant" | "activity" => {
    if (cat === "restaurant" || cat === "cafe") return "restaurant";
    if (cat === "activity") return "activity";
    return "place";
  };

  // 1. Tìm thử trong bảng places theo cả Tên lẫn Địa chỉ
  const existing = await prisma.place.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: cleanTitle, mode: "insensitive" } },
        { name: { contains: cleanTitle, mode: "insensitive" } },
        { address: { contains: cleanTitle, mode: "insensitive" } },
      ],
    },
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      category: existing.category,
      itemType: toItemType(existing.category),
      district: existing.district ?? "Đà Nẵng",
      address: existing.address ?? `${existing.district ?? "Đà Nẵng"}`,
    };
  }

  // 2. Gọi OpenStreetMap Nominatim Geocoding API giới hạn trong khu vực Đà Nẵng
  let lat = 16.0611 + (Math.random() - 0.5) * 0.015;
  let lon = 108.2275 + (Math.random() - 0.5) * 0.015;
  let address = customAddress?.trim() ? `${customAddress.trim()}, Đà Nẵng` : `${cleanTitle}, Đà Nẵng`;

  try {
    const searchQuery = customAddress?.trim()
      ? `${cleanTitle}, ${customAddress.trim()}, Đà Nẵng, Việt Nam`
      : `${cleanTitle}, Đà Nẵng, Việt Nam`;
    const queryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      searchQuery,
    )}&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(queryUrl, {
      headers: {
        "User-Agent": "SmartTourAI-DaNang-Capstone/1.2",
        "Accept-Language": "vi",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const results = (await res.json()) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
      }>;
      const hit = results[0];
      if (hit?.lat && hit?.lon) {
        const parsedLat = Number(hit.lat);
        const parsedLon = Number(hit.lon);
        if (parsedLat >= 15.8 && parsedLat <= 16.25 && parsedLon >= 107.9 && parsedLon <= 108.4) {
          lat = Number(parsedLat.toFixed(6));
          lon = Number(parsedLon.toFixed(6));
          if (!customAddress?.trim() && hit.display_name) {
            address = hit.display_name.split(",").slice(0, 3).join(",").trim();
          }
        }
      }
    }
  } catch {
    // Fallback an toàn về tọa độ trung tâm Đà Nẵng nếu mạng chặn Nominatim
  }

  const district = inferDaNangDistrict(lat, lon, address);
  const lower = cleanTitle.toLowerCase();
  const category =
    lower.includes("cà phê") || lower.includes("cafe") || lower.includes("coffee") || lower.includes("chè") || lower.includes("trà")
      ? "cafe"
      : lower.includes("quán") ||
          lower.includes("nhà hàng") ||
          lower.includes("ăn") ||
          lower.includes("hải sản") ||
          lower.includes("bê thui") ||
          lower.includes("mì quảng") ||
          lower.includes("bánh") ||
          lower.includes("bún") ||
          lower.includes("lẩu") ||
          lower.includes("nướng")
        ? "restaurant"
        : lower.includes("biển") || lower.includes("bãi")
          ? "beach"
          : lower.includes("chợ")
            ? "market"
            : lower.includes("chùa") || lower.includes("đền") || lower.includes("nhà thờ")
              ? "temple"
              : lower.includes("bảo tàng")
                ? "museum"
                : "attraction";

  const created = await prisma.place.create({
    data: {
      name: cleanTitle,
      category,
      district,
      address,
      description: `Địa điểm tại ${address} (${district}, Đà Nẵng).`,
      latitude: lat,
      longitude: lon,
      priceLevel: category === "restaurant" ? 2 : 1,
      estimatedCostVnd:
        category === "restaurant"
          ? 150000
          : category === "cafe"
            ? 55000
            : category === "beach" || category === "temple"
              ? 0
              : 60000,
      avgRating: 4.6,
      tags: ["tự thêm", district.toLowerCase()],
      isActive: true,
    },
  });

  return {
    id: created.id,
    name: created.name,
    category,
    itemType: toItemType(category),
    district,
    address,
  };
};

// Lấy giờ (0..23) và phút theo múi giờ Việt Nam (UTC+7) từ một đối tượng Date
const getVnHourMinute = (date: Date): { hour: number; minute: number } => {
  const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    hour: vnTime.getUTCHours(),
    minute: vnTime.getUTCMinutes(),
  };
};

// AI / Thuật toán tự động phân bổ khung giờ phù hợp nhất trong ngày theo đặc thù địa điểm
const resolveSmartTimeSlot = async (
  tripStart: Date,
  dayNumber: number,
  input: {
    startTime?: Date | null;
    endTime?: Date | null;
    eventId?: string | null;
    category?: string;
    itemType?: string;
    title: string;
  },
  existingDayItems: Array<{ startTime: Date | null; endTime: Date | null }>,
): Promise<{ startTime: Date; endTime: Date }> => {
  // 1. Nếu có giờ chỉ định sẵn
  if (input.startTime) {
    const { hour, minute } = getVnHourMinute(input.startTime);
    const start = makeSlotDate(tripStart, dayNumber, hour, minute);
    if (input.endTime) {
      const endHM = getVnHourMinute(input.endTime);
      const end = makeSlotDate(tripStart, dayNumber, endHM.hour, endHM.minute);
      if (end.getTime() > start.getTime()) {
        return { startTime: start, endTime: end };
      }
    }
    return {
      startTime: start,
      endTime: makeSlotDate(tripStart, dayNumber, Math.min(22, hour + 2), minute),
    };
  }

  // 2. Nếu là Sự kiện (eventId): lấy đúng khung giờ bắt đầu & kết thúc thật của sự kiện đó!
  if (input.eventId) {
    const ev = await prisma.event.findUnique({
      where: { id: input.eventId },
      select: { startAt: true, endAt: true },
    });
    if (ev) {
      const startHM = getVnHourMinute(ev.startAt);
      const clampedStartHour = Math.max(7, Math.min(22, startHM.hour));
      const start = makeSlotDate(tripStart, dayNumber, clampedStartHour, startHM.minute);

      if (ev.endAt) {
        const endHM = getVnHourMinute(ev.endAt);
        const durationHours = (ev.endAt.getTime() - ev.startAt.getTime()) / (60 * 60 * 1000);
        if (durationHours > 0 && durationHours <= 4 && endHM.hour >= clampedStartHour) {
          return {
            startTime: start,
            endTime: makeSlotDate(tripStart, dayNumber, Math.min(23, endHM.hour), endHM.minute),
          };
        }
      }
      return {
        startTime: start,
        endTime: makeSlotDate(tripStart, dayNumber, Math.min(23, clampedStartHour + 2), startHM.minute),
      };
    }
  }

  // 3. Tự động chọn khung giờ thông minh theo tính chất địa điểm (ăn sáng/cà phê, ăn trưa, tắm biển chiều, ăn tối/chợ đêm)
  const usedHours = new Set<number>();
  for (const item of existingDayItems) {
    if (item.startTime) {
      usedHours.add(getVnHourMinute(item.startTime).hour);
    }
  }

  const lower = input.title.toLowerCase();
  const cat = input.category ?? input.itemType ?? "place";

  let preferredHours: number[];
  if (lower.includes("chợ đêm") || lower.includes("du thuyền") || lower.includes("cầu rồng") || lower.includes("hải sản")) {
    preferredHours = [19, 18, 20, 17, 12];
  } else if (cat === "cafe" || lower.includes("cà phê") || lower.includes("cafe") || lower.includes("ăn sáng") || lower.includes("bún") || lower.includes("mì quảng")) {
    preferredHours = [8, 9, 15, 16, 10, 14];
  } else if (cat === "restaurant" || lower.includes("quán") || lower.includes("nhà hàng") || lower.includes("bê thui") || lower.includes("bánh tráng")) {
    preferredHours = [12, 11, 18, 19, 13, 17];
  } else if (cat === "beach" || lower.includes("biển")) {
    preferredHours = [16, 17, 7, 8, 15];
  } else {
    preferredHours = [9, 10, 14, 15, 16, 8, 19];
  }

  const chosenHour = preferredHours.find((h) => !usedHours.has(h)) ?? preferredHours[0] ?? 15;
  const startMinute = usedHours.has(chosenHour) ? 30 : 0;
  const duration = cat === "cafe" ? 1 : 2;
  const start = makeSlotDate(tripStart, dayNumber, chosenHour, startMinute);
  const end = makeSlotDate(tripStart, dayNumber, Math.min(22, chosenHour + duration), startMinute);
  return { startTime: start, endTime: end };
};

export const addItem = async (userId: string, itineraryId: unknown, body: unknown) => {
  const itinerary = await itineraryOf(userId, itineraryId);
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: itinerary.tripId },
    include: { companions: true },
  });
  const partySize = Math.max(1, trip.adults + trip.children + trip.companions.length);
  const input = parseInput(addItemSchema, body);

  // Tự động nhận diện và Geocode địa điểm từ tên hoặc địa chỉ người dùng nhập
  let resolvedPlaceId = input.placeId ?? null;
  let resolvedCategory: string | undefined;
  let resolvedItemType = input.itemType;
  let autoNote = input.notes ?? null;

  if (!resolvedPlaceId && !input.eventId) {
    const resolved = await resolveOrGeocodeCustomPlace(input.title, input.customAddress);
    if (resolved) {
      resolvedPlaceId = resolved.id;
      resolvedCategory = resolved.category;
      resolvedItemType = resolved.itemType;
      if (!autoNote) {
        autoNote = `📍 ${resolved.address} · AI tự động xếp khung giờ phù hợp`;
      }
    }
  }

  const [known] = await keepKnownIds(
    [
      {
        ...input,
        itemType: resolvedItemType,
        placeId: resolvedPlaceId,
        eventId: input.eventId ?? null,
        notes: autoNote,
      },
    ],
    partySize,
  );
  if (!known) throw new AppError(400, "Dữ liệu hoạt động không hợp lệ");

  const existingDayItems = itinerary.items.filter((i) => i.dayNumber === known.dayNumber);
  const { startTime, endTime } = await resolveSmartTimeSlot(
    trip.startDate,
    known.dayNumber,
    {
      startTime: known.startTime,
      endTime: known.endTime,
      eventId: known.eventId,
      category: resolvedCategory,
      itemType: known.itemType,
      title: known.title,
    },
    existingDayItems,
  );

  // Mặc định sửa trực tiếp (inPlace = true) và tự động sắp xếp lại thứ tự trong ngày theo đúng giờ bắt đầu (startTime ASC)
  if (input.inPlace !== false) {
    await prisma.$transaction(async (tx) => {
      await tx.itineraryItem.create({
        data: {
          itineraryId: itinerary.id,
          dayNumber: known.dayNumber,
          orderIndex: 9999,
          itemType: known.itemType,
          placeId: known.placeId ?? null,
          eventId: known.eventId ?? null,
          title: known.title,
          startTime,
          endTime,
          estimatedCost: known.estimatedCost ?? 0,
          notes: known.notes ?? null,
        },
      });

      // Sắp xếp lại toàn bộ hoạt động trong ngày đó theo thứ tự thời gian (Sáng -> Trưa -> Chiều -> Tối)
      const dayRows = await tx.itineraryItem.findMany({
        where: { itineraryId: itinerary.id, dayNumber: known.dayNumber },
      });
      const chronologicalIds = [...dayRows]
        .sort((a, b) => {
          const tA = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
          const tB = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
          if (tA !== tB) return tA - tB;
          return a.orderIndex - b.orderIndex;
        })
        .map((r) => r.id);

      await resequenceDayTx(tx, itinerary.id, known.dayNumber, chronologicalIds);
    });

    await syncTotalCost(itinerary.id);
    return itineraryOf(userId, itinerary.id);
  }

  return newVersionFrom(
    itinerary,
    [...itemsOf(itinerary), { ...known, startTime, endTime }],
    input.notes
      ? `Thêm "${input.title}": ${input.notes}`
      : `Thêm "${input.title}" vào ngày ${input.dayNumber}`,
  );
};

export const generateItinerary = async (userId: string, tripId: unknown, body: unknown) => {
  const trip = await tripOf(userId, tripId);
  const input = parseInput(generateSchema, body ?? {});
  const days = tripDays(trip);
  const partySize = Math.max(1, trip.adults + trip.children + trip.companions.length);

  const [{ profile, places, preferredPlaces, events }, weather] = await Promise.all([
    candidateContext(userId, trip, {
      categories: input.categories,
      preferredPlaceIds: input.preferredPlaceIds,
    }),
    weatherLines(trip.startDate, days),
  ]);

  const modeDescription =
    input.mode === "checklist"
      ? [
          "PHƯƠNG THỨC 1 (TÙY CHỌN THEO DANH MỤC / CHECKLIST):",
          input.categories && input.categories.length > 0
            ? `- Các danh mục người dùng đã tích chọn ưu tiên: ${input.categories.join(", ")}.`
            : "",
          preferredPlaces.length > 0
            ? `- BẮT BUỘC đưa toàn bộ các địa điểm người dùng đã tích chọn sau vào lịch trình: ${preferredPlaces.map((p) => `${p.name} (id: ${p.id})`).join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          "PHƯƠNG THỨC 2 (GỢI Ý TỰ ĐỘNG TỪ AI):",
          "- Tự động đề xuất toàn bộ lịch trình tối ưu dựa trên vị trí địa lý gần nhau theo từng ngày, dự báo thời tiết và xu hướng nổi bật tại Đà Nẵng.",
          input.userLatitude && input.userLongitude
            ? `- Vị trí GPS hiện tại của khách hàng: (${input.userLatitude}, ${input.userLongitude}). Ngày đầu tiên ưu tiên các địa điểm thuận tiện di chuyển từ vị trí này.`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

  const prompt = [
    `Lập lịch trình ${days} ngày tại Đà Nẵng cho chuyến đi từ ${trip.startDate.toISOString().slice(0, 10)} đến ${trip.endDate.toISOString().slice(0, 10)}.`,
    `Số khách: ${trip.adults} người lớn, ${trip.children} trẻ em, ${trip.companions.length} người đồng hành (Tổng cộng ${partySize} người).`,
    modeDescription,
    profile
      ? `Sở thích: ${profile.interests.join(", ") || "đa dạng"}. Không muốn: ${profile.dislikes.join(", ") || "không"}. Phong cách: ${profile.travelStyle ?? "linh hoạt"}. Ngân sách: ${profile.budgetMin ?? "?"}-${profile.budgetMax ?? "?"} ${profile.currency ?? "VND"}.`
      : "",
    input.notes ? `Yêu cầu bổ sung của khách: ${input.notes}` : "",
    weather.lines.length > 0
      ? `Dự báo thời tiết:\n${weather.lines.join("\n")}\nNgày mưa ưu tiên hoạt động trong nhà (bảo tàng, chợ, cà phê, công viên nước trong nhà).`
      : "",
    "RÀNG BUỘC LOGIC BẮT BUỘC:",
    `1. Phải lập lịch trình đầy đủ cho TẤT CẢ ${days} ngày (từ dayNumber = 1 đến dayNumber = ${days}).`,
    "2. MỖI NGÀY BẮT BUỘC PHẢI CÓ ÍT NHẤT 3 ĐẾN 4 ĐỊA ĐIỂM/HOẠT ĐỘNG (Sáng 08:30, Trưa 12:00 ăn trưa, Chiều 15:00 tham quan/cà phê, Tối 19:00 ăn tối/dạo phố/sự kiện). Tuyệt đối không để ngày nào chỉ có 1 hoặc 2 địa điểm.",
    `3. Tự động dự toán và gán chi phí "estimatedCost" (bằng số tiền VNĐ cho cả đoàn ${partySize} người) phù hợp cho từng hoạt động dựa trên trường estimatedCostVnd của địa điểm.`,
    "4. Khi đề xuất quán ăn (restaurant) hoặc cà phê (cafe), ƯU TIÊN chọn các địa điểm có isSponsored = true (Đối tác F&B đề xuất).",
    `Địa điểm hệ thống: ${JSON.stringify(
      places.slice(0, 22).map((place) => ({
        id: place.id,
        name: place.name,
        district: place.district,
        category: place.category,
        estimatedCostVnd: place.estimatedCostVnd,
        isSponsored: place.isSponsored,
      })),
    )}`,
    events.length > 0
      ? `Sự kiện trong chuyến đi: ${JSON.stringify(
          events.slice(0, 8).map((event) => ({
            id: event.id,
            title: event.title,
            venue: event.venue,
            startAt: event.startAt,
            endAt: event.endAt,
            priceMin: event.priceMin,
          })),
        )}`
      : "",
    'Trả về DUY NHẤT JSON hợp lệ dạng {"title": string, "reason": string, "items": [{"dayNumber": number, "title": string, "itemType": "place|restaurant|activity|event|transport|rest", "placeId": string|null, "eventId": string|null, "startTime": string|null, "endTime": string|null, "estimatedCost": number, "notes": string|null}]}.',
  ]
    .filter(Boolean)
    .join("\n");

  let aiItems: PlanInput["items"] = [];
  let aiTitle =
    input.mode === "checklist"
      ? `Lịch trình Đà Nẵng ${days} ngày (Theo danh mục chọn lọc)`
      : `Lịch trình Đà Nẵng ${days} ngày (Đề xuất thông minh AI)`;
  let aiReason =
    input.mode === "checklist"
      ? `Tạo theo danh mục & địa điểm ưa thích (${days} ngày, tối thiểu 4 điểm/ngày, tự động tính chi phí)`
      : `Gợi ý tự động từ AI theo thời tiết, vị trí & xu hướng (${days} ngày, đầy đủ Sáng-Trưa-Chiều-Tối)`;

  try {
    const parsed = await askJson(prompt);
    const plan = planSchema.safeParse(parsed);
    if (plan.success) {
      aiItems = plan.data.items;
      if (plan.data.title) aiTitle = plan.data.title;
      if (plan.data.reason) aiReason = plan.data.reason;
    }
  } catch (err) {
    console.warn("[itineraries] AI timeout/error, dùng bộ lập lịch trình chuẩn hoá:", err);
  }

  // Hậu kiểm & lấp đầy đảm bảo 100% mỗi ngày đều có >= 3-4 địa điểm + chi phí đầy đủ
  const known = dropDuplicates(await keepKnownIds(aiItems, partySize));
  const completeItems = ensureMinItemsPerDay(
    known,
    days,
    trip.startDate,
    places,
    preferredPlaces,
    partySize,
  );

  const reason =
    weather.rainyDays.length > 0
      ? `${aiReason}. Ngày mưa (${weather.rainyDays.join(", ")}) đã ưu tiên hoạt động trong nhà.`
      : aiReason;

  return prisma.itinerary.create({
    data: {
      tripId: trip.id,
      chatSessionId: input.chatSessionId ?? null,
      title: aiTitle,
      status: "draft",
      version: await nextVersion(trip.id),
      reason,
      generatedBy: "ai",
      totalEstimatedCost: costOf(completeItems),
      items: { create: rowsOf(completeItems) },
    },
    include: { items: { orderBy: [{ dayNumber: "asc" }, { orderIndex: "asc" }] } },
  });
};

export const whatIf = async (userId: string, tripId: unknown, body: unknown) => {
  const trip = await tripOf(userId, tripId);
  const input = parseInput(whatIfSchema, body);
  const source = await itineraryOf(userId, input.itineraryId);
  if (source.tripId !== trip.id) throw new AppError(404, "Không tìm thấy lịch trình");

  const days = tripDays(trip);
  const partySize = Math.max(1, trip.adults + trip.children + trip.companions.length);
  const { places, events } = await candidateContext(userId, trip);
  const weather = await weatherLines(trip.startDate, days);

  const prompt = [
    `Lịch trình hiện tại (JSON): ${JSON.stringify(itemsOf(source))}`,
    `Kịch bản người dùng muốn xử lý: ${input.scenario}`,
    weather.lines.length > 0 ? `Dự báo thời tiết:\n${weather.lines.join("\n")}` : "",
    `Đảm bảo mỗi ngày (từ ngày 1 đến ngày ${days}) vẫn có ít nhất 3-4 hoạt động và đầy đủ estimatedCost (VNĐ).`,
    "Khi đổi sang quán ăn/cà phê, ưu tiên các địa điểm có isSponsored = true.",
    `Địa điểm: ${JSON.stringify(
      places.slice(0, 22).map((place) => ({
        id: place.id,
        name: place.name,
        district: place.district,
        category: place.category,
        estimatedCostVnd: place.estimatedCostVnd,
        isSponsored: place.isSponsored,
      })),
    )}`,
    `Sự kiện: ${JSON.stringify(events.slice(0, 8).map((event) => ({ id: event.id, title: event.title, venue: event.venue, startAt: event.startAt })))}`,
    'Trả về DUY NHẤT JSON dạng {"title": string, "reason": string, "items": [{"dayNumber": number, "title": string, "itemType": "place|restaurant|activity|event|transport|rest", "placeId": string|null, "eventId": string|null, "startTime": string|null, "endTime": string|null, "estimatedCost": number|null, "notes": string|null}]}.',
  ]
    .filter(Boolean)
    .join("\n");

  let aiItems: PlanInput["items"] = [];
  let aiReason = `Kịch bản: ${input.scenario}`;
  try {
    const parsed = await askJson(prompt);
    const plan = planSchema.safeParse(parsed);
    if (plan.success) {
      aiItems = plan.data.items;
      if (plan.data.reason) aiReason = plan.data.reason;
    }
  } catch (err) {
    console.warn("[whatIf] AI timeout/error, dùng bộ điều chỉnh chuẩn hoá:", err);
    // Giữ một nửa hoạt động đầu của mỗi ngày và lấp hoạt động mới phù hợp kịch bản
    aiItems = itemsOf(source).filter((_, idx) => idx % 2 === 0);
  }

  const known = dropDuplicates(await keepKnownIds(aiItems, partySize));
  const completeItems = ensureMinItemsPerDay(known, days, trip.startDate, places, [], partySize);

  const created = await newVersionFrom(
    { ...source, chatSessionId: input.chatSessionId ?? source.chatSessionId },
    completeItems,
    aiReason,
  );

  const diff = await diffItineraries(userId, source.id, created.id);
  return { itinerary: created, diff };
};
