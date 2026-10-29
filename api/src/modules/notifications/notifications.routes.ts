import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as notifications from "./notifications.service.ts";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const unreadOnly = req.query.unread === "1";
  res.json(await notifications.listNotifications(res.locals.user.id, unreadOnly));
});

notificationsRouter.post("/read-all", async (_req, res) => {
  await notifications.markAllRead(res.locals.user.id);
  res.status(204).end();
});

notificationsRouter.post("/:id/read", async (req, res) => {
  await notifications.markRead(res.locals.user.id, req.params.id);
  res.status(204).end();
});
