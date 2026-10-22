import test from "node:test";
import assert from "node:assert/strict";
import { buildProfile, profileHeadline } from "../customer-profile.js";

const o = (code, status, at, total, items = [], phone = "0912345678", name = "An") => ({ id: code, code, status, createdAt: at, total, items, phone, name });
const l = (name, qty) => ({ name, qty, price: 20000, note: "" });

test("chỉ tính đơn đã thu tiền của đúng số, loại đơn đang xem và đơn thử", () => {
  const list = [
    o("A1", "done", 1000, 50000, [l("Cà phê sữa", 2)]),
    o("A2", "paid", 3000, 30000, [l("Cà phê sữa", 1), l("Bánh mì", 1)]),
    o("A3", "rejected", 4000, 99000, [l("Trà", 1)]),
    o("B1", "done", 2000, 70000, [], "0999999999"),
    o("CUR", "new", 6000, 40000),
    o("T1", "done", 7000, 10000, [], "0912345678", "KIEM THU TU DONG"),
  ];
  const p = buildProfile("0912345678", list, { note: "ít đá", updatedBy: "Lan" }, "CUR");
  assert.equal(p.orderCount, 2);
  assert.equal(p.totalSpend, 80000);
  assert.equal(p.lastAt, 3000);
  assert.deepEqual(p.history.map((h) => h.code), ["A2", "A1"]);
  assert.deepEqual(p.favorites[0], ["Cà phê sữa", 3]);
  assert.equal(p.note, "ít đá");
  assert.match(profileHeadline(p, (v) => `${v}đ`), /Khách quen · 2 lần mua · tổng 80000đ/);
});

test("khách mới", () => {
  const p = buildProfile("0912345678", [], null);
  assert.equal(p.orderCount, 0);
  assert.match(profileHeadline(p, String), /^Khách mới/);
});
