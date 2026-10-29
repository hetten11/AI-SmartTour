import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as trips from "./trips.service.ts";

export const tripsRouter = Router();

tripsRouter.use(requireAuth);

tripsRouter.get("/", async (_req, res) => {
  res.json({ trips: await trips.listTrips(res.locals.user.id) });
});

tripsRouter.post("/", async (req, res) => {
  res.status(201).json({ trip: await trips.createTrip(res.locals.user.id, req.body) });
});

tripsRouter.get("/:id", async (req, res) => {
  res.json({ trip: await trips.getTrip(res.locals.user.id, req.params.id) });
});

tripsRouter.patch("/:id", async (req, res) => {
  res.json({ trip: await trips.updateTrip(res.locals.user.id, req.params.id, req.body) });
});

tripsRouter.delete("/:id", async (req, res) => {
  await trips.deleteTrip(res.locals.user.id, req.params.id);
  res.status(204).end();
});
