import { AppError } from "../../common/http-error.ts";
import { readUuidParam } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";

// ponytail: cảnh báo đã xử lý (impact.isResolved) coi như hết hiệu lực, lọc ngay
// lúc đọc thay vì ghi isRead trong applyImpact. Một chỗ sửa, không lệch giữa
// danh sách và số chưa đọc. Đổi sang lưu trạng thái khi cần giữ lịch sử riêng.
const actionable = {
  OR: [{ impactId: null }, { impact: { isResolved: false } }],
};

export const listNotifications = async (userId: string, unreadOnly: boolean) => {
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...actionable, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, isRead: false, ...actionable } }),
  ]);
  return { notifications, unread };
};

export const markRead = async (userId: string, notificationId: unknown) => {
  const id = readUuidParam(notificationId, "thông báo");
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new AppError(404, "Không tìm thấy thông báo");
};

export const markAllRead = (userId: string) =>
  prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
