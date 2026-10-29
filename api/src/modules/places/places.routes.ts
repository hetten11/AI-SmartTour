import { Router } from "express";
import { AppError } from "../../common/http-error.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as places from "./places.service.ts";

export const placesRouter = Router();

placesRouter.use(requireAuth);

placesRouter.get("/", async (req, res) => {
  res.json(await places.listPlaces(req.query as Record<string, unknown>));
});

placesRouter.get("/districts", async (_req, res) => {
  res.json({ districts: await places.listDistricts() });
});

placesRouter.get("/:id", async (req, res) => {
  const place = await places.getPlace(String(req.params.id));
  if (!place) throw new AppError(404, "Không tìm thấy địa điểm");
  res.json({ place });
});
