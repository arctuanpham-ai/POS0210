import test from "node:test";
import assert from "node:assert/strict";
import { reconcileRevenue } from "../revenue-check.js";

const range = { from: 0, to: 10_000 };
const bill = (id, total, closedAt, extra = {}) => ({ id, billNo: id, total, openedAt: 100, closedAt, status: "PAID", ...extra });
test("lệch do bill đóng sau lúc POS ghi snapshot thì giải thích được hết", () => {
  const r = reconcileRevenue({
    snapshot: { revenue: 100, paidBills: 2, updatedAt: 1000 },
    bills: [bill("a", 50, 500), bill("b", 50, 600), bill("c", 5, 1500), bill("d", 7, 1600)],
    payments: ["a", "b", "c", "d"].map((id) => ({ billId: id, amount: { a: 50, b: 50, c: 5, d: 7 }[id], dataScope: "LIVE" })),
    range,
  });
  assert.equal(r.diff, 12); assert.equal(r.diffBills, 2);
  assert.equal(r.explained, 12); assert.equal(r.unexplained, 0); assert.equal(r.unexplainedBills, 0);
});
test("bill TEST không tính, thiếu thanh toán và lệch tiền bị cảnh báo", () => {
  const r = reconcileRevenue({
    snapshot: { revenue: 50, paidBills: 1, updatedAt: 9000 },
    bills: [bill("a", 50, 500), bill("t", 30, 500), bill("m", 20, 500), bill("x", 40, 500)],
    payments: [{ billId: "a", amount: 50, dataScope: "LIVE" }, { billId: "t", amount: 30, dataScope: "TEST" }, { billId: "x", amount: 35, dataScope: "LIVE" }],
    range,
  });
  assert.equal(r.cloudRevenue, 110); assert.equal(r.unexplained, 60);
  const reasons = r.suspects.map((s) => `${s.billNo}:${s.kind}`).sort();
  assert.deepEqual(reasons, ["m:warn", "t:excluded", "x:warn"]);
});
test("bill hoàn toàn bộ không tính", () => {
  const r = reconcileRevenue({ snapshot: { revenue: 0, paidBills: 0, updatedAt: 1 }, bills: [bill("r", 40, 500, { status: "REFUNDED" })], payments: [], range });
  assert.equal(r.cloudRevenue, 0); assert.equal(r.diff, 0);
});
