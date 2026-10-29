import { AppError } from "../../common/http-error.ts";
import { prisma } from "../../config/prisma.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { fetchSourceEvents } from "./sync.sources.ts";
import type { NormalizedEvent } from "./sync.sources.ts";

const eventFields = (event: NormalizedEvent) => ({
  title: event.title,
  description: event.description,
  venue: event.venue,
  address: event.address,
  latitude: event.latitude,
  longitude: event.longitude,
  startAt: new Date(event.startAt),
  endAt: event.endAt ? new Date(event.endAt) : null,
  isFree: event.isFree,
  priceMin: event.priceMin,
  priceMax: event.priceMax,
  ticketUrl: event.ticketUrl,
  tags: event.tags,
  isActive: true,
});

const snapshot = (event: NormalizedEvent) => event as unknown as Prisma.InputJsonValue;

// So sánh giá trị đọc từ DB (Decimal, Date) với giá trị đã chuẩn hoá từ nguồn.
const sameValue = (before: unknown, after: unknown): boolean => {
  if (before instanceof Date || after instanceof Date) {
    const left = before === null || before === undefined ? Number.NaN : new Date(before as string).getTime();
    const right = after === null || after === undefined ? Number.NaN : new Date(after as string).getTime();
    return left === right;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before ?? []) === JSON.stringify(after ?? []);
  }
  return String(before ?? "") === String(after ?? "");
};

const changesBetween = (current: Record<string, unknown>, event: NormalizedEvent): string[] => {
  const next = eventFields(event) as Record<string, unknown>;
  return Object.keys(next).filter((field) => !sameValue(current[field], next[field]));
};

// ponytail: severity đo bằng số ngày tới lúc bắt đầu item, đủ để xếp hạng thông
// báo. Thay bằng mô hình ảnh hưởng thật khi cần.
const severityOf = (item: { startTime: Date | null }, now: number): number => {
  if (!item.startTime) return 1;
  const days = (item.startTime.getTime() - now) / (24 * 60 * 60 * 1000);
  if (days <= 2) return 3;
  if (days <= 7) return 2;
  return 1;
};

// Admin sửa sự kiện bằng tay cũng cần phát cảnh báo giống đồng bộ từ nguồn.
export const notifyImpact = async (eventId: string) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, currentVersion: true },
  });
  if (!event) return 0;

  const version = await prisma.eventVersion.findFirst({
    where: { eventId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, changeType: true },
  });
  if (!version) return 0;

  const items = await prisma.itineraryItem.findMany({
    where: { eventId },
    include: {
      itinerary: {
        select: {
          id: true,
          tripId: true,
          trip: { select: { userId: true, title: true } },
        },
      },
    },
  });

  const now = Date.now();
  let created = 0;

  for (const item of items) {
    const severity = severityOf(item, now);
    const description = `Sự kiện "${event.title}" đã ${version.changeType === "created" ? "được thêm" : "thay đổi"}`;
    const impact = await prisma.impactDetection.create({
      data: {
        eventVersionId: version.id,
        itineraryId: item.itinerary.id,
        itineraryItemId: item.id,
        severity,
        description,
      },
    });
    await prisma.notification.create({
      data: {
        userId: item.itinerary.trip.userId,
        tripId: item.itinerary.tripId,
        impactId: impact.id,
        type: "event_change",
        title: description,
        body: `Lịch trình "${item.itinerary.trip.title ?? "chưa đặt tên"}" cần xem lại ngày ${item.dayNumber}.`,
      },
    });
    created += 1;
  }

  return created;
};

const applyEvent = async (sourceId: string, event: NormalizedEvent) => {
  const existing = await prisma.event.findFirst({
    where: { sourceId, externalId: event.externalId },
  });

  if (!existing) {
    const created = await prisma.event.create({
      data: { ...eventFields(event), sourceId, externalId: event.externalId, currentVersion: 1 },
    });
    await prisma.eventVersion.create({
      data: {
        eventId: created.id,
        versionNumber: 1,
        changeType: "created",
        snapshot: snapshot(event),
        changedFields: [],
      },
    });
    await notifyImpact(created.id);
    return "created" as const;
  }

  const changedFields = changesBetween(existing as unknown as Record<string, unknown>, event);
  if (changedFields.length === 0) return "unchanged" as const;

  const versionNumber = existing.currentVersion + 1;
  await prisma.event.update({
    where: { id: existing.id },
    data: { ...eventFields(event), currentVersion: versionNumber },
  });
  await prisma.eventVersion.create({
    data: {
      eventId: existing.id,
      versionNumber,
      changeType: "updated",
      snapshot: snapshot(event),
      changedFields,
    },
  });
  await notifyImpact(existing.id);
  return "updated" as const;
};

export const runSource = async (sourceId: string) => {
  const source = await prisma.dataSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new AppError(404, "Không tìm thấy nguồn dữ liệu");

  const run = await prisma.syncRun.create({ data: { sourceId, status: "running" } });
  const counts = { fetched: 0, created: 0, updated: 0, deleted: 0 };

  try {
    const events = await fetchSourceEvents(source);
    counts.fetched = events.length;

    // Nguồn trả về rỗng thường là lỗi định dạng, không phải bị xoá hết. Chặn ở
    // đây để không huỷ oan toàn bộ sự kiện đang có.
    if (events.length === 0) {
      const active = await prisma.event.count({ where: { sourceId: source.id, isActive: true } });
      if (active > 0) {
        throw new AppError(
          502,
          "Nguồn trả về 0 sự kiện, dừng đồng bộ để tránh huỷ sự kiện đang có",
        );
      }
    }

    for (const event of events) {
      const result = await applyEvent(source.id, event);
      if (result === "created") counts.created += 1;
      if (result === "updated") counts.updated += 1;
    }

    const seen = events.map((event) => event.externalId);
    const gone = await prisma.event.findMany({
      where: {
        sourceId: source.id,
        isActive: true,
        ...(seen.length > 0 ? { externalId: { notIn: seen } } : {}),
      },
      select: { id: true, title: true, currentVersion: true },
    });

    for (const event of gone) {
      const versionNumber = event.currentVersion + 1;
      await prisma.event.update({
        where: { id: event.id },
        data: { isActive: false, currentVersion: versionNumber },
      });
      await prisma.eventVersion.create({
        data: {
          eventId: event.id,
          versionNumber,
          changeType: "cancelled",
          snapshot: { title: event.title, removedFromSource: true } as Prisma.InputJsonValue,
          changedFields: ["isActive"],
        },
      });
      await notifyImpact(event.id);
      counts.deleted += 1;
    }

    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastSyncedAt: new Date() },
    });

    return prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        itemsFetched: counts.fetched,
        itemsCreated: counts.created,
        itemsUpdated: counts.updated,
        itemsDeleted: counts.deleted,
      },
    });
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: String((error as Error).message).slice(0, 500),
        itemsFetched: counts.fetched,
        itemsCreated: counts.created,
        itemsUpdated: counts.updated,
        itemsDeleted: counts.deleted,
      },
    });
    throw error;
  }
};

export const listSyncRuns = async (query: Record<string, unknown>) => {
  const sourceId = typeof query.sourceId === "string" ? query.sourceId : undefined;
  const take = Math.min(Number(query.take ?? 20) || 20, 100);
  const runs = await prisma.syncRun.findMany({
    where: sourceId ? { sourceId } : {},
    include: { source: { select: { name: true, url: true } } },
    orderBy: { startedAt: "desc" },
    take,
  });
  return runs;
};
