import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as profiles from "./profiles.service.ts";

export const profilesRouter = Router();

profilesRouter.use(requireAuth);

profilesRouter.get("/", async (_req, res) => {
  const profile = await profiles.getProfile(res.locals.user.id);
  res.json({ profile });
});

profilesRouter.put("/", async (req, res) => {
  const profile = await profiles.saveProfile(res.locals.user.id, req.body);
  res.json({ profile });
});
