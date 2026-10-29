import cors from "cors";
import express from "express";
import { errorHandler, notFound } from "./common/http-error.ts";
import { getCurrentWeather, getWeather, getWeatherRange } from "./common/weather.ts";
import { env } from "./config/env.ts";
import { adminRouter } from "./modules/admin/admin.routes.ts";
import { assistantRouter } from "./modules/assistant/assistant.routes.ts";
import { requireAuth } from "./modules/auth/auth.middleware.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { eventsRouter } from "./modules/events/events.routes.ts";
import { itinerariesRouter } from "./modules/itineraries/itineraries.routes.ts";
import { knowledgeRouter } from "./modules/knowledge/knowledge.routes.ts";
import { notificationsRouter } from "./modules/notifications/notifications.routes.ts";
import { placesRouter } from "./modules/places/places.routes.ts";
import { profilesRouter } from "./modules/profiles/profiles.routes.ts";
import { syncRouter } from "./modules/sync/sync.routes.ts";
import { tripsRouter } from "./modules/trips/trips.routes.ts";

export const createApp = () => {
  const app = express();

  // credentials true để trình duyệt gửi cookie phiên. origin "*" không dùng
  // được cùng credentials, nên khi chưa cấu hình CORS_ORIGIN thì phản chiếu
  // origin của request. Đặt CORS_ORIGIN cụ thể khi triển khai.
  app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin, credentials: true }));
  // 5mb để đủ chỗ cho file JSON sự kiện gửi kèm khi thêm nguồn.
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Dự báo 7 ngày tới cho Đà Nẵng; ?date=YYYY-MM-DD để lấy một ngày.
  app.get("/api/weather", requireAuth, async (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(
      date
        ? { day: await getWeather(date) }
        : { days: await getWeatherRange(), current: await getCurrentWeather() },
    );
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/profile", profilesRouter);
  app.use("/api/trips", tripsRouter);
  app.use("/api/places", placesRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/chat", assistantRouter);
  app.use("/api/sync-runs", syncRouter);
  // Router này khai báo đường dẫn đầy đủ (/trips/:tripId/itineraries, /itineraries/...).
  app.use("/api", itinerariesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
