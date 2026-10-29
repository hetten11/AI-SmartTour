import { Router } from "express";
import type { Request } from "express";
import {
  clearSessionCookies,
  readRefreshToken,
  readSessionToken,
  requireAuth,
  setAccessCookie,
  setSessionCookies,
} from "./auth.middleware.ts";
import * as auth from "./auth.service.ts";

export const authRouter = Router();

const clientOf = (req: Request): auth.ClientInfo => {
  const userAgent = req.headers["user-agent"];
  return { userAgent: typeof userAgent === "string" ? userAgent : undefined, ip: req.ip };
};

authRouter.post("/register", async (req, res) => {
  const result = await auth.register(req.body, clientOf(req));
  setSessionCookies(res, result);
  res.status(201).json({ user: result.user });
});

authRouter.post("/login", async (req, res) => {
  const result = await auth.login(req.body, clientOf(req));
  setSessionCookies(res, result);
  res.json({ user: result.user });
});

// Không cần access token: refresh token trong cookie là thứ xác thực. Chỉ đổi
// cookie access, refresh token giữ nguyên nên không set lại.
authRouter.post("/refresh", async (req, res) => {
  const result = await auth.refresh(readRefreshToken(req.headers.cookie));
  setAccessCookie(res, result.token, result.expiresAt);
  res.json({ user: result.user });
});

authRouter.post("/logout", async (req, res) => {
  await auth.logout(
    readSessionToken(req.headers.cookie),
    readRefreshToken(req.headers.cookie),
  );
  clearSessionCookies(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (_req, res) => {
  res.json({ user: res.locals.user });
});

authRouter.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await auth.listSessions(
    res.locals.user.id,
    readSessionToken(req.headers.cookie),
  );
  res.json({ sessions });
});

authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  await auth.revokeSession(res.locals.user.id, req.params.id);
  res.status(204).end();
});
