import "dotenv/config";
import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { startSyncCron } from "./modules/sync/sync.cron.ts";

createApp().listen(env.port, () => {
  console.log(`api listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// ponytail: cron chạy trong tiến trình api. Tách thành worker riêng khi cần
// chạy nhiều instance hoặc job dài.
startSyncCron().catch((error: unknown) => {
  console.error("[sync] không đăng ký được lịch đồng bộ:", error);
});
