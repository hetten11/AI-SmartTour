import { Router } from "express";
import { requireRole } from "../../common/authz.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { reindexAll } from "../knowledge/knowledge.service.ts";
import { runSource } from "../sync/sync.service.ts";
import * as admin from "./admin.service.ts";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/stats", async (_req, res) => {
  res.json(await admin.stats());
});

adminRouter.get("/users", async (req, res) => {
  res.json(await admin.listUsers(req.query as Record<string, unknown>));
});

adminRouter.patch("/users/:id", async (req, res) => {
  res.json({ user: await admin.updateUser(req.params.id, req.body) });
});

adminRouter.post("/places", async (req, res) => {
  res.status(201).json({ place: await admin.createPlace(req.body) });
});

adminRouter.patch("/places/:id", async (req, res) => {
  res.json({ place: await admin.updatePlace(req.params.id, req.body) });
});

adminRouter.delete("/places/:id", async (req, res) => {
  await admin.deletePlace(req.params.id);
  res.status(204).end();
});

adminRouter.post("/events", async (req, res) => {
  res.status(201).json({ event: await admin.createEvent(req.body) });
});

adminRouter.patch("/events/:id", async (req, res) => {
  res.json({ event: await admin.updateEvent(req.params.id, req.body) });
});

adminRouter.delete("/events/:id", async (req, res) => {
  await admin.deleteEvent(req.params.id);
  res.status(204).end();
});

adminRouter.get("/sources", async (_req, res) => {
  res.json({ sources: await admin.listSources() });
});

adminRouter.post("/sources", async (req, res) => {
  res.status(201).json({ source: await admin.createSource(req.body) });
});

adminRouter.patch("/sources/:id", async (req, res) => {
  res.json({ source: await admin.updateSource(req.params.id, req.body) });
});

adminRouter.delete("/sources/:id", async (req, res) => {
  await admin.deleteSource(req.params.id);
  res.status(204).end();
});

adminRouter.post("/sources/:id/run", async (req, res) => {
  res.json({ run: await runSource(String(req.params.id)) });
});

adminRouter.post("/knowledge/reindex", async (_req, res) => {
  res.json(await reindexAll());
});
