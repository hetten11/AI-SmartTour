import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validate as isValidCron } from "node-cron";
import { z } from "zod";
import { AppError } from "../../common/http-error.ts";
import { parseInput, readIntQuery, readTextQuery, readUuidParam } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { notifyImpact } from "../sync/sync.service.ts";

const pageSize = 20;
const uploadDir = "prisma/data/uploads";

export const userPatchSchema = z
  .object({
    isActive: z.boolean(),
    role: z.enum(["traveler", "admin"]),
  })
  .partial();

export const sourceSchema = z.object({
  name: z.string().trim().min(1, "Tên nguồn không được để trống").max(150),
  sourceType: z.enum(["file", "api"]),
  url: z.string().trim().max(2000).optional(),
  // Nội dung file JSON do trình duyệt đọc và gửi lên, không dùng multipart.
  content: z.string().min(2, "File rỗng").max(5_000_000).optional(),
  cronExpression: z.string().trim().min(1, "Cron không được để trống").max(50),
  isActive: z.boolean(),
});

export const sourcePatchSchema = sourceSchema.partial();

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Thiếu ${label}`)
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), `${label} không hợp lệ`);

const latitude = z.number().min(-90, "Vĩ độ ngoài khoảng -90..90").max(90, "Vĩ độ ngoài khoảng -90..90");
const longitude = z
  .number()
  .min(-180, "Kinh độ ngoài khoảng -180..180")
  .max(180, "Kinh độ ngoài khoảng -180..180");

export const placeSchema = z.object({
  name: z.string().trim().min(1, "Tên địa điểm không được để trống").max(200),
  category: z.string().trim().min(1, "Loại địa điểm không được để trống").max(50),
  description: z.string().trim().max(5000).nullish(),
  address: z.string().trim().max(255).nullish(),
  district: z.string().trim().max(100).nullish(),
  latitude: latitude.nullish(),
  longitude: longitude.nullish(),
  priceLevel: z.number().int().min(0, "Mức giá 0..4").max(4, "Mức giá 0..4").nullish(),
  avgRating: z.number().min(0, "Đánh giá 0..5").max(5, "Đánh giá 0..5").nullish(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20, "Tối đa 20 thẻ").optional(),
  isActive: z.boolean().optional(),
});

export const placePatchSchema = placeSchema.partial();

// Sự kiện do admin nhập tay: không có sourceId/externalId, nhưng vẫn ghi
// EventVersion và phát thông báo như đồng bộ từ nguồn.
export const eventSchema = z.object({
  title: z.string().trim().min(1, "Tên sự kiện không được để trống").max(255),
  description: z.string().trim().max(5000).nullish(),
  venue: z.string().trim().max(255).nullish(),
  address: z.string().trim().max(255).nullish(),
  latitude: latitude.nullish(),
  longitude: longitude.nullish(),
  startAt: dateField("thời gian bắt đầu"),
  endAt: dateField("thời gian kết thúc").nullish(),
  isFree: z.boolean().nullish(),
  priceMin: z.number().min(0).max(1_000_000_000).nullish(),
  priceMax: z.number().min(0).max(1_000_000_000).nullish(),
  ticketUrl: z.string().trim().max(2000).nullish(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20, "Tối đa 20 thẻ").optional(),
  isActive: z.boolean().optional(),
});

export const eventPatchSchema = eventSchema.partial();

// Cron sai thì job không bao giờ chạy, mà trước đây vẫn lưu được im lặng.
const assertCron = (expression: string) => {
  if (!isValidCron(expression)) {
    throw new AppError(400, "Cron không hợp lệ, ví dụ hợp lệ: 0 6 * * *");
  }
};

const countEvents = (parsed: unknown): number => {
  if (Array.isArray(parsed)) return parsed.length;
  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { events?: unknown }).events)) {
    return ((parsed as { events: unknown[] }).events).length;
  }
  return -1;
};

const assertEventFile = (content: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError(400, "File không phải JSON hợp lệ");
  }
  const count = countEvents(parsed);
  if (count === -1) {
    throw new AppError(400, "File phải là mảng sự kiện hoặc object có trường events");
  }
  if (count === 0) throw new AppError(400, "File không có sự kiện nào");
};

// ponytail: ghi vào prisma/data/uploads, thư mục này được mount trong compose
// dev nên file sống qua restart. Đổi sang S3 hoặc lưu nội dung trong DB khi
// chạy nhiều instance.
const saveUpload = async (content: string): Promise<string> => {
  assertEventFile(content);
  const fileName = `events-${randomUUID().slice(0, 8)}.json`;
  const directory = path.resolve(process.cwd(), uploadDir);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), content, "utf8");
  return `${uploadDir}/${fileName}`;
};

export const listUsers = async (query: Record<string, unknown>) => {
  const page = readIntQuery(query.page, 0, 500);
  const q = readTextQuery(query.q);
  const where = q ? { email: { contains: q, mode: "insensitive" as const } } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { trips: true, sessions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pageSize };
};

export const updateUser = async (userId: unknown, body: unknown) => {
  const id = readUuidParam(userId, "người dùng");
  const input = parseInput(userPatchSchema, body);
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new AppError(404, "Không tìm thấy người dùng");

  return prisma.user.update({
    where: { id },
    data: {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
    },
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });
};

export const listSources = () =>
  prisma.dataSource.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { events: true, syncRuns: true } } },
  });

export const createSource = async (body: unknown) => {
  const input = parseInput(sourceSchema, body);
  assertCron(input.cronExpression);

  let url = input.url ?? null;
  if (input.sourceType === "file") {
    if (input.content) url = await saveUpload(input.content);
    if (!url) throw new AppError(400, "Nguồn loại file cần file JSON");
  } else if (!url) {
    throw new AppError(400, "Nguồn loại api cần URL");
  }

  return prisma.dataSource.create({
    data: {
      name: input.name,
      sourceType: input.sourceType,
      url,
      cronExpression: input.cronExpression,
      isActive: input.isActive,
    },
  });
};

export const updateSource = async (sourceId: unknown, body: unknown) => {
  const id = readUuidParam(sourceId, "nguồn dữ liệu");
  const input = parseInput(sourcePatchSchema, body);
  if (input.cronExpression) assertCron(input.cronExpression);

  const source = await prisma.dataSource.findUnique({
    where: { id },
    select: { id: true, url: true },
  });
  if (!source) throw new AppError(404, "Không tìm thấy nguồn dữ liệu");

  // Có file mới: ghi đè nếu file cũ nằm trong thư mục upload, còn không thì tạo
  // file mới và đổi url sang file đó.
  let url = input.url;
  if (input.content) {
    if (source.url.startsWith(`${uploadDir}/`)) {
      assertEventFile(input.content);
      await writeFile(path.resolve(process.cwd(), source.url), input.content, "utf8");
    } else {
      url = await saveUpload(input.content);
    }
  }

  return prisma.dataSource.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.cronExpression !== undefined ? { cronExpression: input.cronExpression } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(url !== undefined && url !== source.url ? { url } : {}),
    },
  });
};

export const deleteSource = async (sourceId: unknown) => {
  const id = readUuidParam(sourceId, "nguồn dữ liệu");
  const source = await prisma.dataSource.findUnique({
    where: { id },
    select: { _count: { select: { syncRuns: true } } },
  });
  if (!source) throw new AppError(404, "Không tìm thấy nguồn dữ liệu");
  await prisma.dataSource.delete({ where: { id } });
};

// ------------------------------------------------------- địa điểm / sự kiện
// Admin nhập tay thay cho việc dựng file JSON. Đọc danh sách dùng route công khai
// /api/places và /api/events; chỉ thêm và sửa ở đây.

export const createPlace = async (body: unknown) => {
  const input = parseInput(placeSchema, body);
  return prisma.place.create({
    data: { ...input, tags: input.tags ?? [], isActive: input.isActive ?? true },
  });
};

export const updatePlace = async (placeId: unknown, body: unknown) => {
  const id = readUuidParam(placeId, "địa điểm");
  const input = parseInput(placePatchSchema, body);
  const place = await prisma.place.findUnique({ where: { id }, select: { id: true } });
  if (!place) throw new AppError(404, "Không tìm thấy địa điểm");

  return prisma.place.update({ where: { id }, data: input });
};

// knowledge_chunks cascade, itinerary_items chuyển place_id về null: xoá cứng được.
export const deletePlace = async (placeId: unknown) => {
  const id = readUuidParam(placeId, "địa điểm");
  const place = await prisma.place.findUnique({ where: { id }, select: { id: true } });
  if (!place) throw new AppError(404, "Không tìm thấy địa điểm");

  await prisma.place.delete({ where: { id } });
};

const timeOf = (value: unknown) =>
  value === null || value === undefined ? Number.NaN : new Date(value as string).getTime();

// So giá trị đọc từ DB (Decimal dạng "16.0544000") với giá trị người dùng gửi.
const sameValue = (before: unknown, after: unknown): boolean => {
  if (before instanceof Date || after instanceof Date) return timeOf(before) === timeOf(after);
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before ?? []) === JSON.stringify(after ?? []);
  }
  if (before === null || before === undefined || after === null || after === undefined) {
    return (before ?? null) === (after ?? null);
  }
  const left = Number(before);
  const right = Number(after);
  if (!Number.isNaN(left) && !Number.isNaN(right)) return left === right;
  return String(before) === String(after);
};

const recordVersion = async (
  eventId: string,
  row: Record<string, unknown>,
  changeType: "created" | "updated",
  changedFields: string[],
  versionNumber: number,
) => {
  await prisma.eventVersion.create({
    data: {
      eventId,
      versionNumber,
      changeType,
      snapshot: row as unknown as Prisma.InputJsonValue,
      changedFields,
    },
  });
  await notifyImpact(eventId);
};

export const createEvent = async (body: unknown) => {
  const input = parseInput(eventSchema, body);
  const created = await prisma.event.create({
    data: { ...input, tags: input.tags ?? [], isActive: input.isActive ?? true, currentVersion: 1 },
  });
  await recordVersion(created.id, created, "created", [], 1);
  return created;
};

export const updateEvent = async (eventId: unknown, body: unknown) => {
  const id = readUuidParam(eventId, "sự kiện");
  const input = parseInput(eventPatchSchema, body);
  const before = await prisma.event.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Không tìm thấy sự kiện");

  const changedFields = Object.keys(input).filter(
    (field) => !sameValue((before as Record<string, unknown>)[field], (input as Record<string, unknown>)[field]),
  );
  // Không đổi gì thì giữ nguyên phiên bản, tránh rác lịch sử.
  if (changedFields.length === 0) return before;

  const versionNumber = before.currentVersion + 1;
  const updated = await prisma.event.update({
    where: { id },
    data: { ...input, currentVersion: versionNumber },
  });
  await recordVersion(id, updated, "updated", changedFields, versionNumber);
  return updated;
};

// EventVersion chặn xoá (onDelete: NoAction) nên phải dọn cảnh báo, impact và
// phiên bản trước. Đây là dữ liệu dẫn xuất, không phải lịch sử người dùng nhập.
export const deleteEvent = async (eventId: unknown) => {
  const id = readUuidParam(eventId, "sự kiện");
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) throw new AppError(404, "Không tìm thấy sự kiện");

  await prisma.$transaction(async (tx) => {
    const versions = await tx.eventVersion.findMany({ where: { eventId: id }, select: { id: true } });
    const versionIds = versions.map((version) => version.id);

    if (versionIds.length > 0) {
      const impacts = await tx.impactDetection.findMany({
        where: { eventVersionId: { in: versionIds } },
        select: { id: true },
      });
      const impactIds = impacts.map((impact) => impact.id);
      if (impactIds.length > 0) {
        await tx.notification.deleteMany({ where: { impactId: { in: impactIds } } });
        await tx.impactDetection.deleteMany({ where: { id: { in: impactIds } } });
      }
      await tx.eventVersion.deleteMany({ where: { eventId: id } });
    }

    await tx.event.delete({ where: { id } });
  });
};

export const stats = async () => {
  const [users, places, events, knowledgeChunks, runningRuns, notifications] = await Promise.all([
    prisma.user.count(),
    prisma.place.count({ where: { isActive: true } }),
    prisma.event.count({ where: { isActive: true } }),
    prisma.knowledgeChunk.count(),
    prisma.syncRun.count({ where: { status: "running" } }),
    prisma.notification.count({ where: { isRead: false } }),
  ]);

  return { users, places, events, knowledgeChunks, runningRuns, unreadNotifications: notifications };
};
