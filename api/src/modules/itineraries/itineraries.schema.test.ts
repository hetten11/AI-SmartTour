import assert from "node:assert/strict";
import test from "node:test";
import { planSchema, updateItemSchema } from "./itineraries.schema.ts";

// Chạy: node --test src/modules/itineraries/itineraries.schema.test.ts
const item = (startTime: unknown) => ({
  dayNumber: 1,
  title: "Ăn sáng",
  startTime,
  estimatedCost: 60000,
});

test("giờ AI trả về không parse được thì thành null, không làm hỏng lịch trình", () => {
  const plan = planSchema.parse({ items: [item("08:00"), item("Buổi sáng"), item("25:99")] });
  assert.deepEqual(
    plan.items.map((row) => row.startTime),
    [null, null, null],
  );
});

test("ISO hợp lệ giữ nguyên Date", () => {
  const plan = planSchema.parse({ items: [item("2026-10-16T08:00:00.000Z")] });
  assert.equal(plan.items[0]?.startTime?.toISOString(), "2026-10-16T08:00:00.000Z");
});

test("thiếu startTime hoặc null đều ra null", () => {
  const plan = planSchema.parse({ items: [item(undefined), item(null)] });
  assert.deepEqual(
    plan.items.map((row) => row.startTime),
    [null, null],
  );
});

test("update item: bỏ trống thì không đụng tới startTime", () => {
  assert.equal(updateItemSchema.parse({ title: "Đổi tên" }).startTime, undefined);
  assert.equal(updateItemSchema.parse({ startTime: null }).startTime, null);
  assert.equal(
    updateItemSchema.parse({ startTime: "08:00" }).startTime,
    null,
  );
});
