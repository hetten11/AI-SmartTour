import assert from "node:assert/strict";
import test from "node:test";
import { partyLabel } from "./display.ts";

// Chạy: node src/lib/display.test.ts
test("người đồng hành được tính vào tổng số người", () => {
  assert.equal(partyLabel({ adults: 1, children: 0, companions: [] }), "1 người (1 người lớn)");
  assert.equal(
    partyLabel({ adults: 1, children: 0, companions: [{}, {}] }),
    "3 người (1 người lớn, 2 người đồng hành)",
  );
  assert.equal(
    partyLabel({ adults: 2, children: 1, companions: [{}] }),
    "4 người (2 người lớn, 1 trẻ em, 1 người đồng hành)",
  );
});
