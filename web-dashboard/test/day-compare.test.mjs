import test from "node:test";
import assert from "node:assert/strict";
import { dayMetrics, compareRows, weekTotals, compareKeys, weekdayOf } from "../day-compare.js";

const mk = (bills, revenue, items) => ({ paidBills: bills, revenue, items });
const docs = {
  "2026-10-11": mk(20, 1000000, [{ name: "A", qty: 30, revenue: 1 }]),
  "2026-10-17": mk(18, 900000, [{ name: "A", qty: 10, revenue: 1 }, { name: "COMBO · X [1×A + 1×B]", qty: 5, revenue: 1 }]),
  "2026-10-18": mk(24, 1200000, [{ name: "A", qty: 40, revenue: 1 }]),
};

test("chỉ số ngày: bill TB và số món đã tách combo; thiếu snapshot là null", () => {
  assert.deepEqual(dayMetrics(docs, "2026-10-17"), { bills: 18, revenue: 900000, avgBill: 50000, items: 20 });
  assert.equal(dayMetrics(docs, "2026-10-16"), null);
});

test("so với hôm trước và cùng thứ tuần trước", () => {
  const rows = compareRows(docs, "2026-10-18", 7);
  assert.equal(rows.length, 7);
  const last = rows[6];
  assert.equal(last.dateKey, "2026-10-18"); assert.equal(last.today, true); assert.equal(last.weekday, "CN");
  assert.equal(last.vsPrev.bills.diff, 6);
  assert.ok(Math.abs(last.vsPrev.bills.pct - 6 / 18) < 1e-9);
  assert.notEqual(last.vsWeek, null); // 18/10 - 7 ngày = 11/10 có số liệu
});

test("ngày thiếu số liệu thì không so", () => {
  const rows = compareRows(docs, "2026-10-18", 7);
  assert.equal(rows[0].vsPrev, null);
});

test("cùng thứ tuần trước có số liệu", () => {
  const r = compareRows(docs, "2026-10-18", 7)[6];
  assert.equal(weekdayOf("2026-10-11"), "CN");
  assert.equal(r.vsWeek.bills.base, 20);
  assert.equal(r.vsWeek.bills.diff, 4);
});

test("tổng 7 ngày so với 7 ngày trước, trung bình theo ngày có số liệu", () => {
  const w = weekTotals(docs, "2026-10-18");
  assert.equal(w.cur.days, 2); assert.equal(w.cur.bills, 42); assert.equal(w.cur.billsPerDay, 21);
  assert.equal(w.prev.days, 1); assert.equal(w.prev.bills, 20);
  assert.equal(w.same, false);
  assert.ok(Math.abs(w.pct.bills - 0.05) < 1e-9); // lệch số ngày: so theo TB mỗi ngày
});

test("khoảng đọc 14 ngày", () => {
  const k = compareKeys("2026-10-18");
  assert.equal(k.length, 14); assert.equal(k[0], "2026-10-05"); assert.equal(k[13], "2026-10-18");
});
