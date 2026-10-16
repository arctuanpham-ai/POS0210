import test from "node:test";
import assert from "node:assert/strict";
import { tomorrowSales, prepList, profitRanking } from "../plan-profit.js";

const now = new Date(2026, 9, 17, 22); // thứ Bảy → mai Chủ nhật
const doc = (n) => ({ revenue: 1, items: [{ itemId: "a", name: "Cà phê muối", qty: n, revenue: n * 30000 }] });
test("dự báo ngày mai dùng cùng thứ nếu đủ dữ liệu", () => {
  const r = tomorrowSales({ "2026-10-11": doc(20), "2026-10-04": doc(30), "2026-10-16": doc(100) }, now);
  assert.equal(r.date, "2026-10-18"); assert.match(r.basis, /cùng thứ/);
  assert.equal(Object.values(r.sales)[0], 25);
});
test("không đủ cùng thứ thì lấy 7 ngày gần nhất", () => {
  const r = tomorrowSales({ "2026-10-16": doc(10), "2026-10-15": doc(20) }, now);
  assert.match(r.basis, /gần nhất/); assert.equal(Object.values(r.sales)[0], 15);
});
test("danh sách nguyên liệu nhân định mức và dự phòng", () => {
  const list = prepList({ "ca phe muoi": 10 }, () => [{ materialId: "cf_phin", qty: 25 }], 0.1);
  assert.equal(list.length, 1); assert.equal(Math.round(list[0].qty), 275); assert.equal(list[0].label, "275 g");
});
test("xếp hạng lãi gộp: món lãi cao lên đầu, món thiếu giá vốn xuống cuối", () => {
  const costs = { cf_phin: { unitCost: 400 } };
  const rows = profitRanking(
    [{ itemId: "a", name: "Cà phê", qty: 10, revenue: 300000 }, { itemId: "b", name: "Bít tết", qty: 2, revenue: 170000 }, { itemId: "c", name: "Lạ", qty: 5, revenue: 50000 }],
    [{ id: "a", name: "Cà phê", price: 30000 }, { id: "b", name: "Bít tết", price: 85000 }],
    (name) => (name === "Cà phê" ? [{ materialId: "cf_phin", qty: 25 }] : name === "Bít tết" ? [{ materialId: "cf_phin", qty: 150 }] : []),
    costs,
  );
  assert.deepEqual(rows.map((r) => r.name), ["Cà phê", "Bít tết", "Lạ"]);
  assert.equal(rows[0].gross, 200000); assert.equal(rows[1].gross, 50000); assert.equal(rows[2].gross, null);
});
