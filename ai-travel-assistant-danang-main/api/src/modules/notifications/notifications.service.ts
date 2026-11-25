import { AppError } from "../../common/http-error.ts";
import { readUuidParam } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";
import { describeEventSchedule } from "../events/events.service.ts";

// ponytail: cảnh báo đã xử lý (impact.isResolved) coi như hết hiệu lực, lọc ngay
// lúc đọc thay vì ghi isRead trong applyImpact. Một chỗ sửa, không lệch giữa
// danh sách và số chưa đọc. Đổi sang lưu trạng thái khi cần giữ lịch sử riêng.
const actionable = {
  OR: [{ impactId: null }, { impact: { isResolved: false } }],
};

export const listNotifications = async (userId: string, unreadOnly: boolean) => {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...actionable, ...(unreadOnly ? { isRead: false } : {}) },
      include: {
        impact: {
          include: {
            eventVersion: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                    venue: true,
                    startAt: true,
                    endAt: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, isRead: false, ...actionable } }),
  ]);

  let notifications = rows.map((row) => {
    const ev = row.impact?.eventVersion?.event;
    if (ev) {
      const schedule = describeEventSchedule(ev);
      const baseBody = row.body ?? "";
      const hasScheduleText = baseBody.includes("Thời gian:");
      return {
        id: row.id,
        userId: row.userId,
        tripId: row.tripId,
        impactId: row.impactId,
        type: row.type,
        title: row.title,
        body: hasScheduleText
          ? baseBody
          : `${baseBody ? `${baseBody} · ` : ""}${schedule.statusDetailText} · Thời gian: ${schedule.timeRangeText}${ev.venue ? ` tại ${ev.venue}` : ""}`,
        isRead: row.isRead,
        createdAt: row.createdAt,
      };
    }
    return {
      id: row.id,
      userId: row.userId,
      tripId: row.tripId,
      impactId: row.impactId,
      type: row.type,
      title: row.title,
      body: row.body,
      isRead: row.isRead,
      createdAt: row.createdAt,
    };
  });

  // Nếu người dùng chưa có thông báo sự kiện nào trong chuông, tự động bổ sung
  // các thông báo nhắc lịch sự kiện đang diễn ra & sắp diễn ra tại Đà Nẵng kèm thời gian chi tiết.
  if (notifications.length === 0 && !unreadOnly) {
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 86_400_000);
    const activeEvents = await prisma.event.findMany({
      where: {
        isActive: true,
        startAt: { lte: in14Days },
        OR: [{ startAt: { gte: now } }, { endAt: { gte: now } }],
      },
      orderBy: { startAt: "asc" },
      take: 4,
    });

    notifications = activeEvents.map((ev) => {
      const schedule = describeEventSchedule(ev, now.getTime());
      const prefix =
        schedule.status === "ongoing" ? "🟢 Sự kiện đang diễn ra" : "🔵 Sự kiện sắp diễn ra";
      return {
        id: `event-live-${ev.id}`,
        userId,
        tripId: null,
        impactId: null,
        type: "reminder" as const,
        title: `${prefix}: ${ev.title}`,
        body: `${schedule.statusDetailText} · Thời gian: ${schedule.timeRangeText}${ev.venue ? ` · Địa điểm: ${ev.venue}` : ""}`,
        isRead: false,
        createdAt: ev.updatedAt ?? ev.createdAt,
      };
    });
  }

  return { notifications, unread: unread || notifications.filter((n) => !n.isRead).length };
};

export const markRead = async (userId: string, notificationId: unknown) => {
  if (typeof notificationId === "string" && notificationId.startsWith("event-live-")) {
    return;
  }
  const id = readUuidParam(notificationId, "thông báo");
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new AppError(404, "Không tìm thấy thông báo");
};

export const markAllRead = (userId: string) =>
  prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
