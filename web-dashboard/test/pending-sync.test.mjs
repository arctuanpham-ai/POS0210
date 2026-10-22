import test from "node:test";
import assert from "node:assert/strict";
import { isPendingSync, PENDING_SYNC_BEFORE } from "../pending-sync.js";
const real = PENDING_SYNC_BEFORE + 3_600_000, dev = Date.UTC(2026, 9, 22, 14, 21);
test("chờ khi snapshot hiện tại còn của máy dev hoặc chưa có", () => {
  assert.equal(isPendingSync({}), true);
  assert.equal(isPendingSync({ lastUpdatedAt: dev }), true);
});
test("vẫn chờ khi tổng hợp ngày/tháng còn dấu thời gian của máy dev dù snapshot hiện tại đã mới", () => {
  assert.equal(isPendingSync({ lastUpdatedAt: real }, { a: { updatedAt: dev } }, {}), true);
  assert.equal(isPendingSync({ lastUpdatedAt: real }, {}, { m: { updatedAt: dev } }), true);
});
test("hết chờ khi mọi tài liệu đã được máy thật ghi lại; bỏ qua tài liệu rỗng", () => {
  assert.equal(isPendingSync({ lastUpdatedAt: real }, { a: { updatedAt: real }, b: null }, { m: { updatedAt: real } }), false);
});
