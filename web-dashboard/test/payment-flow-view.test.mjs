import test from "node:test";
import assert from "node:assert/strict";
import { currentFlow, flowLabel, historyRows, summarizeRefunds } from "../payment-flow-view.js";

test("thiếu dữ liệu hoặc giá trị lạ coi là Trả sau", () => {
  assert.equal(currentFlow(undefined), "postpaid");
  assert.equal(currentFlow({ current: "xyz" }), "postpaid");
  assert.equal(currentFlow({ current: "prepaid" }), "prepaid");
  assert.equal(flowLabel("prepaid"), "Trả trước");
  assert.equal(flowLabel("postpaid"), "Trả sau");
});

test("lịch sử đổi: mới nhất trước, bỏ dòng hỏng", () => {
  const rows = historyRows({ history: [{ at: 100, by: "A", from: "postpaid", to: "prepaid" }, null, { at: "x" }, { at: 300, by: "B", from: "prepaid", to: "postpaid" }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].at, 300);
  assert.equal(rows[0].to, "postpaid");
  assert.deepEqual(historyRows(undefined), []);
});

test("hoàn tiền: lọc theo mốc, bỏ TEST, tổng theo phương thức", () => {
  const s = summarizeRefunds([
    { id: "1", createdAt: 1000, amount: 50000, method: "CASH", reason: "khách đổi ý", dataScope: "LIVE" },
    { id: "2", createdAt: 2000, amount: 30000, method: "TRANSFER", reason: "sai món" },
    { id: "3", createdAt: 3000, amount: 99000, method: "CASH", reason: "test", dataScope: "TEST" },
    { id: "4", createdAt: 10, amount: 7000, method: "CASH", reason: "cũ" },
  ], 500);
  assert.equal(s.count, 2);
  assert.equal(s.cash, 50000);
  assert.equal(s.transfer, 30000);
  assert.equal(s.total, 80000);
  assert.equal(s.rows[0].id, "2");
});
