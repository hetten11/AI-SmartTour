import dns from "node:dns";
import { crawlDaNangPlaces, crawlDaNangWebEvents } from "../src/modules/sync/crawler.service.ts";
import { ensureDefaultDailyEventSource } from "../src/modules/sync/sync.cron.ts";
import { prisma } from "../src/config/prisma.ts";

dns.setDefaultResultOrder("ipv4first");

const main = async () => {
  console.log("🚀 Đang bắt đầu cào dữ liệu Địa điểm, Ẩm thực F&B và Sự kiện tại Đà Nẵng...");
  const placeResult = await crawlDaNangPlaces({ limit: 80, includeOsm: true });
  console.log(
    `✅ Đã cào xong địa điểm: ${placeResult.created} thêm mới, ${placeResult.updated} cập nhật (OSM: ${placeResult.osmCount}, Chuẩn hoá: ${placeResult.curatedCount})`,
  );

  await ensureDefaultDailyEventSource();
  const events = await crawlDaNangWebEvents();
  console.log(`✅ Đã kiểm tra nguồn sự kiện Web Đà Nẵng (0h00 mỗi ngày): ${events.length} sự kiện sẵn sàng.`);
};

main()
  .catch((err) => {
    console.error("❌ Lỗi khi cào dữ liệu:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

