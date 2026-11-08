import { schedule, validate } from "node-cron";
import { prisma } from "../../config/prisma.ts";
import { crawlDaNangPlaces } from "./crawler.service.ts";
import { runSource } from "./sync.service.ts";

const tasks: ReturnType<typeof schedule>[] = [];

const DEFAULT_WEB_SOURCE_URL = "https://danangfantastiCity.com/events-crawler";

// Đảm bảo luôn có nguồn cào sự kiện Web Đà Nẵng chạy tự động vào 0h00 mỗi ngày (0 0 * * *)
export const ensureDefaultDailyEventSource = async () => {
  const existing = await prisma.dataSource.findFirst({
    where: {
      OR: [
        { url: DEFAULT_WEB_SOURCE_URL },
        { sourceType: "danang_web" },
      ],
    },
  });

  if (!existing) {
    const created = await prisma.dataSource.create({
      data: {
        name: "Cổng Sự kiện Du lịch Đà Nẵng (Tự động 0h00)",
        url: DEFAULT_WEB_SOURCE_URL,
        sourceType: "danang_web",
        cronExpression: "0 0 * * *",
        isActive: true,
      },
    });
    // Chạy đồng bộ khởi tạo lần đầu nếu chưa có dữ liệu từ nguồn này
    void runSource(created.id).catch((err: unknown) => {
      console.warn("[sync] khởi tạo nguồn sự kiện Đà Nẵng:", err);
    });
  } else if (existing.cronExpression !== "0 0 * * *") {
    await prisma.dataSource.update({
      where: { id: existing.id },
      data: { cronExpression: "0 0 * * *" },
    });
  }
};

export const startSyncCron = async () => {
  stopSyncCron();

  await ensureDefaultDailyEventSource().catch((err: unknown) => {
    console.warn("[sync] không thể kiểm tra nguồn mặc định:", err);
  });

  // Khởi tạo dữ liệu địa điểm & đối tác F&B mẫu nếu hệ thống chưa cào lần nào
  void crawlDaNangPlaces({ includeOsm: false }).catch(() => {});

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
