import test from "node:test";
import assert from "node:assert/strict";
import { reconcileRevenue, reconcileDays } from "../revenue-check.js";

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

test("gợi ý bill nghi vấn: bill đóng sát lúc POS ghi, tổ hợp cộng đúng số tiền lệch", () => {
  const r = reconcileRevenue({
    snapshot: { revenue: 100, paidBills: 2, updatedAt: 5_000_000 },
    bills: [bill("a", 50, 500), bill("b", 50, 600), bill("c", 5, 4_990_000), bill("d", 7, 4_995_000), bill("e", 9, 4_996_000)],
    payments: ["a", "b", "c", "d", "e"].map((id) => ({ billId: id, amount: { a: 50, b: 50, c: 5, d: 7, e: 9 }[id], dataScope: "LIVE" })),
    range: { from: 0, to: 9_000_000 },
  });
  assert.equal(r.unexplained, 21); assert.equal(r.unexplainedBills, 3);
  assert.deepEqual(r.leads.combos, [["e", "d", "c"]]);
  assert.deepEqual(r.leads.bills.map((b) => b.billNo), ["e", "d", "c"]);
  assert.ok(r.leads.bills.every((b) => b.match));
});
test("không có phần lệch thì không có gợi ý", () => {
  const r = reconcileRevenue({ snapshot: { revenue: 50, paidBills: 1, updatedAt: 9000 }, bills: [bill("a", 50, 500)], payments: [{ billId: "a", amount: 50, dataScope: "LIVE" }], range });
  assert.equal(r.leads, null);
});

test("đối chiếu từng ngày và từng giờ: chỉ ngày/giờ lệch, kèm bill mở trong giờ đó", () => {
  const at = (day, h, m = 0) => new Date(2026, 9, day, h, m).getTime();
  const mkb = (id, total, day, h) => ({ id, billNo: id, total, openedAt: at(day, h), closedAt: at(day, h, 30), status: "PAID" });
  const hours = (m) => Array.from({ length: 24 }, (_, h) => m[h] || 0);
  const bills = [mkb("a", 10, 17, 9), mkb("b", 20, 17, 10), mkb("c", 6, 18, 9), mkb("d", 6, 18, 9), mkb("e", 30, 18, 14)];
  const payments = bills.map((b) => ({ billId: b.id, amount: b.total, dataScope: "LIVE" }));
  const dailyDocs = {
    "2026-10-17": { paidBills: 2, revenue: 30, hourlyBills: hours({ 9: 1, 10: 1 }) },
    "2026-10-18": { paidBills: 2, revenue: 36, hourlyBills: hours({ 9: 0, 14: 1, 15: 1 }), updatedAt: 5 },
  };
  const r = reconcileDays({ dailyDocs, bills, payments, range: { from: at(1, 0), to: at(31, 0) } });
  assert.equal(r.days.length, 1);
  const d = r.days[0];
  assert.equal(d.dateKey, "2026-10-18"); assert.equal(d.diffBills, 1); assert.equal(d.diffRevenue, 6);
  assert.deepEqual(d.hours.map((h) => [h.hour, h.pos, h.cloud]), [[9, 0, 2], [15, 1, 0]]);
  assert.deepEqual(d.hours[0].bills.map((b) => b.billNo), ["c", "d"]);
});
test("ngày chưa có snapshot ngày không bị tính là lệch", () => {
  const b = { id: "x", billNo: "x", total: 5, openedAt: new Date(2026, 9, 3, 8).getTime(), closedAt: new Date(2026, 9, 3, 9).getTime(), status: "PAID" };
  const r = reconcileDays({ dailyDocs: {}, bills: [b], payments: [{ billId: "x", amount: 5, dataScope: "LIVE" }], range: { from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 10, 1).getTime() } });
  assert.deepEqual(r.days, []); assert.deepEqual(r.missingDays, ["2026-10-03"]);
});
