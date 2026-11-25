import { schedule, validate } from "node-cron";
import { prisma } from "../../config/prisma.ts";
import { reindexAll } from "../knowledge/knowledge.service.ts";
import { crawlDaNangPlaces } from "./crawler.service.ts";
import { runSource } from "./sync.service.ts";

const tasks: ReturnType<typeof schedule>[] = [];

const DEFAULT_WEB_SOURCE_URL = "https://danangfantastiCity.com/events-crawler";

// Đảm bảo luôn có nguồn cào sự kiện Web Đà Nẵng chạy tự động vào 0h00 mỗi ngày (0 0 * * *)
export const ensureDefaultDailyEventSource = async () => {
  let source = await prisma.dataSource.findFirst({
    where: {
      OR: [
        { url: DEFAULT_WEB_SOURCE_URL },
        { sourceType: "danang_web" },
      ],
    },
  });

  if (!source) {
    source = await prisma.dataSource.create({
      data: {
        name: "Cổng Sự kiện Du lịch Đà Nẵng (Tự động 0h00)",
        url: DEFAULT_WEB_SOURCE_URL,
        sourceType: "danang_web",
        cronExpression: "0 0 * * *",
        isActive: true,
      },
    });
  } else if (source.cronExpression !== "0 0 * * *") {
    source = await prisma.dataSource.update({
      where: { id: source.id },
      data: { cronExpression: "0 0 * * *" },
    });
  }

  await runSource(source.id).catch((err: unknown) => {
    console.warn("[sync] đồng bộ nguồn sự kiện Đà Nẵng:", err);
  });
};

export const startSyncCron = async () => {
  stopSyncCron();

  await ensureDefaultDailyEventSource().catch((err: unknown) => {
    console.warn("[sync] không thể kiểm tra nguồn mặc định:", err);
  });

  // Khởi tạo & cập nhật dữ liệu địa điểm ngay khi bật server
  void crawlDaNangPlaces({ includeOsm: false })
    .then((res) => {
      if (res.created > 0 || res.updated > 0) {
        return reindexAll();
      }
      return null;
    })
    .catch(() => {});

  // Tự động cào địa điểm Đà Nẵng (bao gồm OpenStreetMap Overpass API + Danh mục chuẩn)
  // vào khung giờ cố định 00:00 mỗi ngày ("0 0 * * *") hoàn toàn tự động dưới nền.
  tasks.push(
    schedule("0 0 * * *", () => {
      console.log('[sync] ⏰ Bắt đầu tự động cào Địa điểm Đà Nẵng & OpenStreetMap (0 0 * * *)');
      void crawlDaNangPlaces({ limit: 60, includeOsm: true })
        .then((res) => {
          console.log(
            `[sync] ✅ Đã cào tự động ${res.totalProcessed} địa điểm (Thêm mới: ${res.created}, Cập nhật: ${res.updated})`,
          );
          if (res.created > 0 || res.updated > 0) {
            return reindexAll();
          }
          return null;
        })
        .catch((error: unknown) => {
          console.error("[sync] Lỗi tự động cào địa điểm 0h00:", error);
        });
    }),
  );

  const sources = await prisma.dataSource.findMany({ where: { isActive: true } });

  for (const source of sources) {
    if (!validate(source.cronExpression)) {
      console.warn(`[sync] bỏ qua nguồn ${source.name}: cron không hợp lệ`);
      continue;
    }
    tasks.push(
      schedule(source.cronExpression, () => {
        console.log(`[sync] ⏰ Bắt đầu tự động cào nguồn "${source.name}" (${source.cronExpression})`);
        void runSource(source.id).catch((error: unknown) => {
          console.error(`[sync] ${source.name} lỗi:`, error);
        });
      }),
    );
  }

  console.log(`[sync] đã đăng ký ${tasks.length} lịch đồng bộ tự động (bao gồm lịch 0h00 mỗi ngày)`);
};

export const stopSyncCron = () => {
  for (const task of tasks) task.stop();
  tasks.length = 0;
};
