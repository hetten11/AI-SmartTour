import { schedule, validate } from "node-cron";
import { prisma } from "../../config/prisma.ts";
import { runSource } from "./sync.service.ts";

const tasks: ReturnType<typeof schedule>[] = [];

// ponytail: cron chạy trong tiến trình api, không khoá phân tán. Chạy nhiều
// instance thì mỗi instance đồng bộ một lần; đổi sang khoá DB hoặc queue khi cần.
export const startSyncCron = async () => {
  const sources = await prisma.dataSource.findMany({ where: { isActive: true } });

  for (const source of sources) {
    if (!validate(source.cronExpression)) {
      console.warn(`[sync] bỏ qua nguồn ${source.name}: cron không hợp lệ`);
      continue;
    }
    tasks.push(
      schedule(source.cronExpression, () => {
        void runSource(source.id).catch((error: unknown) => {
          console.error(`[sync] ${source.name} lỗi:`, error);
        });
      }),
    );
  }

  console.log(`[sync] đã đăng ký ${tasks.length} lịch đồng bộ`);
};

export const stopSyncCron = () => {
  for (const task of tasks) task.stop();
  tasks.length = 0;
};
