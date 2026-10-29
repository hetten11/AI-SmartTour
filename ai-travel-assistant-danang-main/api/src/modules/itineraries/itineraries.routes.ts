import { Router } from "express";
import { AppError } from "../../common/http-error.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import * as itineraries from "./itineraries.service.ts";

export const itinerariesRouter = Router();

itinerariesRouter.use(requireAuth);

itinerariesRouter.get("/trips/:tripId/itineraries", async (req, res) => {
  res.json({ itineraries: await itineraries.listItineraries(res.locals.user.id, req.params.tripId) });
});

itinerariesRouter.post("/trips/:tripId/itineraries", async (req, res) => {
  const itinerary = await itineraries.generateItinerary(
    res.locals.user.id,
    req.params.tripId,
    req.body,
  );
  res.status(201).json({ itinerary });
});

itinerariesRouter.post("/trips/:tripId/itineraries/what-if", async (req, res) => {
  const result = await itineraries.whatIf(res.locals.user.id, req.params.tripId, req.body);
  res.status(201).json(result);
});

itinerariesRouter.get("/trips/:tripId/impacts", async (req, res) => {
  res.json({ impacts: await itineraries.listImpacts(res.locals.user.id, req.params.tripId) });
});

itinerariesRouter.get("/itineraries/:id", async (req, res) => {
  res.json(await itineraries.getItinerary(res.locals.user.id, req.params.id));
});

itinerariesRouter.get("/itineraries/:id/diff", async (req, res) => {
  const other = req.query.with;
  if (typeof other !== "string") throw new AppError(400, "Thiếu tham số with");
  res.json({ diff: await itineraries.diffItineraries(res.locals.user.id, req.params.id, other) });
});

itinerariesRouter.post("/itineraries/:id/activate", async (req, res) => {
  const itinerary = await itineraries.activateItinerary(res.locals.user.id, req.params.id);
  res.json({ itinerary });
});

itinerariesRouter.delete("/itineraries/:id", async (req, res) => {
  await itineraries.deleteItinerary(res.locals.user.id, req.params.id);
  res.status(204).end();
});

itinerariesRouter.post("/itineraries/:id/items", async (req, res) => {
  const itinerary = await itineraries.addItem(res.locals.user.id, req.params.id, req.body);
  res.status(201).json({ itinerary });
});

itinerariesRouter.patch("/itineraries/:id/items/:itemId", async (req, res) => {
  const item = await itineraries.updateItem(
    res.locals.user.id,
    req.params.id,
    req.params.itemId,
    req.body,
  );
  res.json({ item });
});

itinerariesRouter.post("/itineraries/:id/apply-impact/:impactId", async (req, res) => {
  const itinerary = await itineraries.applyImpact(
    res.locals.user.id,
    req.params.id,
    req.params.impactId,
  );
  res.status(201).json({ itinerary });
});
