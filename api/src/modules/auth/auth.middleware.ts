import type { RequestHandler, Response } from "express";
import { env } from "../../config/env.ts";
import { authenticate, publicUser } from "./auth.service.ts";

export const sessionCookieName = "sid";
export const refreshCookieName = "rid";

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.cookieSecure,
  path: "/",
} as const;

// Refresh token chỉ dùng ở /api/auth nên giới hạn path cho đỡ lộ.
const refreshCookieOptions = { ...baseCookieOptions, path: "/api/auth" } as const;

const readCookie = (cookieHeader: string | undefined, name: string): string | undefined => {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1));
  }
  return undefined;
};

export const readSessionToken = (cookieHeader: string | undefined): string | undefined =>
  readCookie(cookieHeader, sessionCookieName);

export const readRefreshToken = (cookieHeader: string | undefined): string | undefined =>
  readCookie(cookieHeader, refreshCookieName);

export type SessionTokens = {
  token: string;
  expiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export const setAccessCookie = (res: Response, token: string, expiresAt: Date) => {
  res.cookie(sessionCookieName, token, {
    ...baseCookieOptions,
    expires: expiresAt,
  });
};

export const setSessionCookies = (res: Response, tokens: SessionTokens) => {
  setAccessCookie(res, tokens.token, tokens.expiresAt);
  res.cookie(refreshCookieName, tokens.refreshToken, {
    ...refreshCookieOptions,
    expires: tokens.refreshExpiresAt,
  });
};

export const clearSessionCookies = (res: Response) => {
  res.clearCookie(sessionCookieName, baseCookieOptions);
  res.clearCookie(refreshCookieName, refreshCookieOptions);
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  const session = await authenticate(readSessionToken(req.headers.cookie));
  res.locals.user = publicUser(session.user);
  res.locals.sessionId = session.id;
  next();
};
