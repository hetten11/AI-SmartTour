import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import { listSyncRuns } from "./sync.service.ts";

export const syncRouter = Router();

syncRouter.use(requireAuth);

syncRouter.get("/", async (req, res) => {
  res.json({ runs: await listSyncRuns(req.query as Record<string, unknown>) });
});
