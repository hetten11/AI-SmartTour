import { Router } from "express";
import { readTextQuery } from "../../common/validate.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as assistant from "./assistant.service.ts";

export const assistantRouter = Router();

assistantRouter.use(requireAuth);

assistantRouter.get("/sessions", async (req, res) => {
  const tripId = readTextQuery(req.query.tripId);
  res.json({ sessions: await assistant.listSessions(res.locals.user.id, tripId) });
});

assistantRouter.post("/sessions", async (req, res) => {
  res.status(201).json({ session: await assistant.createSession(res.locals.user.id, req.body) });
});

assistantRouter.patch("/sessions/:id", async (req, res) => {
  res.json({ session: await assistant.updateSession(res.locals.user.id, req.params.id, req.body) });
});

assistantRouter.delete("/sessions/:id", async (req, res) => {
  await assistant.deleteSession(res.locals.user.id, req.params.id);
  res.status(204).end();
});

assistantRouter.get("/sessions/:id/messages", async (req, res) => {
  res.json({ messages: await assistant.listMessages(res.locals.user.id, req.params.id) });
});

assistantRouter.post("/sessions/:id/messages", async (req, res) => {
  res.status(201).json(await assistant.sendMessage(res.locals.user.id, req.params.id, req.body));
});
