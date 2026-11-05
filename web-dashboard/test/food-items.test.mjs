import test from "node:test";
import assert from "node:assert/strict";
import { appItems } from "../food-items.js";

const row = (app, code, day, items, extra = {}) => ({ app, code, saleDay: day, items, problems: [], ...extra });
const rows = [
  row("GRAB", "GF-1", "2026-11-01", [{ name: "Cơm gà chiên mắm", qty: 2, price: 55000 }, { name: "Trà chanh", qty: 1, price: 25000 }]),
  row("GRAB", "GF-2", "2026-11-02", [{ name: "cơm gà  chiên mắm", qty: 1, price: 55000 }]),
  row("SHOPEE", "SP-1", "2026-11-02", [{ name: "Cơm gà chiên mắm", qty: 3, price: 50000 }]),
  row("GRAB", "GF-3", "2026-11-02", [{ name: "Bít tết", qty: 1, price: 95000 }], { problems: ["Đơn huỷ: khách đổi ý"] }),
  row("GRAB", "GF-4", "2026-11-03", []),
  row("GRAB", "GF-5", "2026-12-01", [{ name: "Bít tết", qty: 1, price: 95000 }]),
];

test("gộp chung các app: cộng cùng món dù khác hoa thường/khoảng trắng, bỏ đơn huỷ, đếm đơn thiếu tên món", () => {
  const r = appItems(rows, "2026-11-01", "2026-11-30");
  assert.equal(r.orders, 3); assert.equal(r.noItems, 1);
  const com = r.items.find((i) => i.key === "cơm gà chiên mắm");
  assert.equal(com.qty, 6); assert.equal(com.orders, 3); assert.equal(com.revenue, 2 * 55000 + 55000 + 3 * 50000);
  assert.equal(r.items[0].name, "Cơm gà chiên mắm");
  assert.ok(!r.items.some((i) => i.name === "Bít tết"));
});

test("tách riêng từng app: byApp theo app, lọc bằng tham số app", () => {
  const all = appItems(rows, "2026-11-01", "2026-11-30");
  const com = all.items[0];
  assert.deepEqual(com.byApp.GRAB, { orders: 2, qty: 3, revenue: 165000 });
  assert.deepEqual(com.byApp.SHOPEE, { orders: 1, qty: 3, revenue: 150000 });
  const grab = appItems(rows, "2026-11-01", "2026-11-30", "GRAB");
  assert.equal(grab.orders, 2); assert.equal(grab.qty, 4); assert.equal(grab.items[0].qty, 3);
  assert.equal(appItems(rows, "2026-11-01", "2026-11-30", "SHOPEE").orders, 1);
});

test("không có dữ liệu thì trả về rỗng, không lỗi", () => {
  const r = appItems(null, "2026-11-01", "2026-11-30");
  assert.deepEqual([r.orders, r.qty, r.items.length, r.noItems], [0, 0, 0, 0]);
});
