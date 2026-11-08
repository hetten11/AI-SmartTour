import { AppError } from "../../common/http-error.ts";
import { readIntQuery, readTextQuery } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";

const pageSize = 20;

export type EventTimeStatus = "ongoing" | "upcoming" | "ended";

// Tính trạng thái thời gian thực tế của sự kiện để sắp xếp ưu tiên:
// 1. "ongoing" (Đang diễn ra): ưu tiên cao nhất (lên đầu)
// 2. "upcoming" (Sắp diễn ra): ưu tiên thứ 2 (sắp xếp gần nhất trước)
// 3. "ended" (Đã kết thúc): tự động đẩy xuống dưới cùng hoặc ẩn đi
export const getEventTimeStatus = (
  event: { startAt: Date; endAt: Date | null },
  nowMs = Date.now(),
): EventTimeStatus => {
  const startMs = new Date(event.startAt).getTime();
  // Nếu không có endAt, mặc định sự kiện kéo dài 4 tiếng kể từ lúc bắt đầu
  const effectiveEndMs = event.endAt
    ? new Date(event.endAt).getTime()
    : startMs + 4 * 60 * 60 * 1000;

  if (nowMs >= startMs && nowMs <= effectiveEndMs) {
    return "ongoing";
  }
  if (startMs > nowMs) {
    return "upcoming";
  }
  return "ended";
};

const statusRank: Record<EventTimeStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  ended: 2,
};

export const listEvents = async (query: Record<string, unknown>) => {
  const q = readTextQuery(query.q);
  const from = readTextQuery(query.from, 10);
  const to = readTextQuery(query.to, 10);
  const hideEnded = query.hideEnded === "true" || query.hideEnded === true;
  const page = readIntQuery(query.page, 0, 500);

  const where = {
    isActive: true,
    ...(from || to
      ? {
          startAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { venue: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const allMatching = await prisma.event.findMany({
    where,
    orderBy: { startAt: "asc" },
  });

  const nowMs = Date.now();
  const enriched = allMatching
    .map((event) => ({
      ...event,
      timeStatus: getEventTimeStatus(event, nowMs),
    }))
    .filter((event) => (hideEnded ? event.timeStatus !== "ended" : true))
    .sort((a, b) => {
      const rankDiff = statusRank[a.timeStatus] - statusRank[b.timeStatus];
      if (rankDiff !== 0) return rankDiff;
      // Nếu cùng đang diễn ra hoặc sắp diễn ra: sự kiện nào bắt đầu sớm hơn xếp trên
      if (a.timeStatus !== "ended") {
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      }
      // Nếu cùng đã kết thúc: sự kiện mới kết thúc gần đây xếp trên, cũ hơn trôi xuống đáy
      return new Date(b.startAt).getTime() - new Date(a.startAt).getTime();
    });

  const total = enriched.length;
  const events = enriched.slice(page * pageSize, (page + 1) * pageSize);

  return { events, total, page, pageSize };
};

export const getEvent = async (id: string) => {
  const event = await prisma.event.findUnique({ where: { id }, include: { source: true } });
  if (!event) throw new AppError(404, "Không tìm thấy sự kiện");
  return {
    ...event,
    timeStatus: getEventTimeStatus(event),
  };
};

export const listEventVersions = async (id: string) => {
  await getEvent(id);
  const versions = await prisma.eventVersion.findMany({
    where: { eventId: id },
    orderBy: { versionNumber: "desc" },
    take: 50,
  });
  return versions;
};

// Sự kiện đang diễn ra hoặc sắp diễn ra trong khoảng ngày của chuyến đi
export const listEventsInRange = async (start: Date, end: Date, take = 25) => {
  const rows = await prisma.event.findMany({
    where: {
      isActive: true,
      OR: [
        { startAt: { gte: start, lte: end } },
        {
          startAt: { lte: end },
          endAt: { gte: start },
        },
      ],
    },
    orderBy: { startAt: "asc" },
    take,
  });

  const nowMs = Date.now();
  return rows
    .map((event) => ({ ...event, timeStatus: getEventTimeStatus(event, nowMs) }))
    .sort((a, b) => statusRank[a.timeStatus] - statusRank[b.timeStatus]);
};
