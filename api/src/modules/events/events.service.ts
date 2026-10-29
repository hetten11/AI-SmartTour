import { AppError } from "../../common/http-error.ts";
import { readIntQuery, readTextQuery } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";

const pageSize = 20;

export const listEvents = async (query: Record<string, unknown>) => {
  const q = readTextQuery(query.q);
  const from = readTextQuery(query.from, 10);
  const to = readTextQuery(query.to, 10);
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

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { startAt: "asc" },
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.event.count({ where }),
  ]);

  return { events, total, page, pageSize };
};

export const getEvent = async (id: string) => {
  const event = await prisma.event.findUnique({ where: { id }, include: { source: true } });
  if (!event) throw new AppError(404, "Không tìm thấy sự kiện");
  return event;
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

// Sự kiện đang diễn ra trong khoảng ngày của chuyến đi.
export const listEventsInRange = (start: Date, end: Date, take = 20) =>
  prisma.event.findMany({
    where: { isActive: true, startAt: { gte: start, lte: end } },
    orderBy: { startAt: "asc" },
    take,
  });
