import test from "node:test";
import assert from "node:assert/strict";
import { hourRows, hourlyTotals, topItems } from "../charts-view.js";

const H = (pairs) => { const a = Array(24).fill(0); for (const [h, n] of pairs) a[h] = n; return a; };

test("cộng giờ qua các ngày, bỏ ngày POS cũ chưa có hourlyBills", () => {
  const docs = { a: { hourlyBills: H([[7, 3], [12, 1]]) }, b: { hourlyBills: H([[7, 2], [9, 4]]) }, c: { revenue: 5 } };
  const r = hourlyTotals(docs, ["a", "b", "c", "d"]);
  assert.equal(r.days, 2);
  assert.equal(r.total[7], 5);
  assert.equal(hourlyTotals({ c: { revenue: 1 } }, ["c"]), null);
});

test("chỉ hiện từ giờ sớm nhất tới muộn nhất, đánh dấu giờ cao điểm", () => {
  const rows = hourRows(H([[7, 5], [9, 4], [12, 1]]));
  assert.deepEqual(rows.map((r) => r.hour), [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(rows.filter((r) => r.peak).map((r) => r.hour), [7]);
  assert.deepEqual(hourRows(Array(24).fill(0)), []);
});

test("món bán nhiều theo số phần, đồng hạng theo doanh thu", () => {
  const rows = topItems([{ name: "A", qty: 5, revenue: 10 }, { name: "B", qty: 9, revenue: 1 }, { name: "C", qty: 5, revenue: 20 }, { name: "D", qty: 0, revenue: 99 }], 2);
  assert.deepEqual(rows.map((r) => r.name), ["B", "C"]);
});
