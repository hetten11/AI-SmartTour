import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as events from "./events.service.ts";

export const eventsRouter = Router();

eventsRouter.use(requireAuth);

eventsRouter.get("/", async (req, res) => {
  res.json(await events.listEvents(req.query as Record<string, unknown>));
});

eventsRouter.get("/:id", async (req, res) => {
  res.json({ event: await events.getEvent(String(req.params.id)) });
});

eventsRouter.get("/:id/versions", async (req, res) => {
  res.json({ versions: await events.listEventVersions(String(req.params.id)) });
});
