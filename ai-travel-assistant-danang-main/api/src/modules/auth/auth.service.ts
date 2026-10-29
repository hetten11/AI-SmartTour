import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from "../../common/crypto.ts";
import { dicebearAvatarUrl } from "../../common/avatar.ts";
import { AppError } from "../../common/http-error.ts";
import { env } from "../../config/env.ts";
import { prisma } from "../../config/prisma.ts";
import type { User } from "../../generated/prisma/client.ts";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalidCredentials = "Email hoặc mật khẩu không đúng";
const lastSeenWriteIntervalMs = 5 * 60 * 1000;

export type ClientInfo = { userAgent?: string | undefined; ip?: string | undefined };

export type PublicUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string;
  role: string;
  createdAt: Date;
};

export const publicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl,
  role: user.role,
  createdAt: user.createdAt,
});

const asObject = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

const readEmail = (value: unknown): string => {
  if (typeof value !== "string") throw new AppError(400, "Email không hợp lệ");
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !emailPattern.test(email)) throw new AppError(400, "Email không hợp lệ");
  return email;
};

const readNewPassword = (value: unknown): string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new AppError(400, "Mật khẩu phải từ 8 đến 128 ký tự");
  }
  return value;
};

const readFullName = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 150) {
    throw new AppError(400, "Họ tên tối đa 150 ký tự");
  }
  return value.trim();
};

// ponytail: đếm trong bộ nhớ, mất khi restart và sai khi chạy nhiều instance.
// Thay bằng Redis khi chạy nhiều bản sao.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const maxLoginAttempts = 10;
const loginWindowMs = 15 * 60 * 1000;

const assertLoginRate = (key: string) => {
  const now = Date.now();
  if (loginAttempts.size > 1000) {
    for (const [storedKey, attempt] of loginAttempts) {
      if (attempt.resetAt <= now) loginAttempts.delete(storedKey);
    }
  }
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return;
  }
  attempt.count += 1;
  if (attempt.count > maxLoginAttempts) throw new AppError(429, "Quá nhiều lần thử, vui lòng đợi");
};

const accessTtlMs = env.accessTtlMinutes * 60 * 1000;
const refreshTtlMs = env.sessionTtlDays * 24 * 60 * 60 * 1000;

// ponytail: refresh token không xoay vòng, mỗi phiên có đúng một refresh token
// sống tới hạn. Hai tab refresh cùng lúc thì tab sau ghi đè access token của
// tab trước, tab trước tự refresh lại ở request kế tiếp. Cần phát hiện token bị
// đánh cắp thì mới phải thêm xoay vòng và lịch sử token.
const createSession = async (userId: string, userAgent: string | undefined) => {
  await prisma.session.deleteMany({ where: { refreshExpiresAt: { lt: new Date() } } });
  const token = newSessionToken();
  const refreshToken = newSessionToken();
  const now = Date.now();
  const expiresAt = new Date(now + accessTtlMs);
  const refreshExpiresAt = new Date(now + refreshTtlMs);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      refreshTokenHash: hashSessionToken(refreshToken),
      userAgent: userAgent?.slice(0, 255) ?? null,
      expiresAt,
      refreshExpiresAt,
    },
  });
  return { token, refreshToken, expiresAt, refreshExpiresAt };
};

export const register = async (body: unknown, client: ClientInfo) => {
  const input = asObject(body);
  const email = readEmail(input.email);
  const fullName = readFullName(input.fullName);
  const passwordHash = await hashPassword(readNewPassword(input.password));

  let user: User;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, fullName, avatarUrl: dicebearAvatarUrl(email) },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AppError(409, "Email đã tồn tại");
    throw error;
  }

  const session = await createSession(user.id, client.userAgent);
  return { user: publicUser(user), ...session };
};

export const login = async (body: unknown, client: ClientInfo) => {
  const input = asObject(body);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const attemptKey = `${client.ip ?? "-"}:${email}`;
  assertLoginRate(attemptKey);

  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(401, invalidCredentials);
  }
  if (!user.isActive) throw new AppError(403, "Tài khoản đã bị khóa");

  loginAttempts.delete(attemptKey);
  const session = await createSession(user.id, client.userAgent);
  return { user: publicUser(user), ...session };
};

// Đổi refresh token lấy access token mới. Refresh token giữ nguyên nên gọi
// nhiều lần liên tiếp vẫn an toàn.
export const refresh = async (refreshToken: string | undefined) => {
  if (!refreshToken) throw new AppError(401, "Chưa đăng nhập");

  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashSessionToken(refreshToken) },
    include: { user: true },
  });
  if (!session || session.refreshExpiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "Phiên đã hết hạn, vui lòng đăng nhập lại");
  }
  if (session.user.deletedAt) throw new AppError(401, "Chưa đăng nhập");
  if (!session.user.isActive) throw new AppError(403, "Tài khoản đã bị khóa");

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + accessTtlMs);
  await prisma.session.update({
    where: { id: session.id },
    data: { tokenHash: hashSessionToken(token), expiresAt, lastSeenAt: new Date() },
  });
  return { user: publicUser(session.user), token, expiresAt };
};

export const authenticate = async (token: string | undefined) => {
  if (!token) throw new AppError(401, "Chưa đăng nhập");

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "Phiên đã hết hạn, vui lòng đăng nhập lại");
  }
  if (session.user.deletedAt) throw new AppError(401, "Chưa đăng nhập");
  if (!session.user.isActive) throw new AppError(403, "Tài khoản đã bị khóa");

  // ponytail: chỉ ghi last_seen_at khi cũ hơn 5 phút, tránh một UPDATE mỗi request.
  if (Date.now() - session.lastSeenAt.getTime() > lastSeenWriteIntervalMs) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session;
};

// Xoá theo cả hai cookie: access token có thể đã hết hạn và bị thay bằng token
// mới, refresh token mới là thứ luôn còn hiệu lực.
export const logout = async (token: string | undefined, refreshToken: string | undefined) => {
  if (refreshToken) {
    await prisma.session.deleteMany({
      where: { refreshTokenHash: hashSessionToken(refreshToken) },
    });
  }
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
};

export const listSessions = async (userId: string, token: string | undefined) => {
  const sessions = await prisma.session.findMany({
    where: { userId, refreshExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const currentHash = token ? hashSessionToken(token) : null;

  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    // Hạn của phiên (refresh token), không phải hạn access token 15 phút.
    expiresAt: session.refreshExpiresAt,
    isCurrent: session.tokenHash === currentHash,
  }));
};

export const revokeSession = async (userId: string, sessionId: unknown) => {
  if (typeof sessionId !== "string" || !uuidPattern.test(sessionId)) {
    throw new AppError(404, "Không tìm thấy phiên");
  }
  const result = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  if (result.count === 0) throw new AppError(404, "Không tìm thấy phiên");
};
