import test from "node:test";
import assert from "node:assert/strict";
import { itemsByChannel, rankItems, TAKEAWAY } from "../all-items.js";

const days = ["2026-11-04", "2026-11-05"];
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:00:00+07:00`);
const storeDocs = { "2026-11-04": { paidBills: 3, items: [{ name: "Cơm gà chiên mắm", qty: 4, revenue: 236000 }, { name: "Bạc xỉu", qty: 2, revenue: 60000 }] }, "2026-11-05": null };
const online = [
  { id: "a", status: "done", mode: "pickup", paidAt: at("2026-11-05", 9), items: [{ name: "Bạc xỉu", qty: 1, price: 30000 }, { name: "cơm gà  chiên mắm", qty: 2, price: 59000 }] },
  { id: "b", status: "cancelled", paidAt: at("2026-11-05", 9), items: [{ name: "Bạc xỉu", qty: 9 }] },
  { id: "c", status: "paid", mode: "delivery", paidAt: at("2026-11-04", 9), items: [{ name: "COMBO A [1 × Bạc xỉu + 1 × Trà đào]", qty: 2 }] },
];
const ledger = [
  { app: "GRAB", code: "G1", saleDay: "2026-11-04", status: "OK", items: [{ name: "Cơm gà chiên mắm", qty: 1 }] },
  { app: "GRAB", code: "G2", saleDay: "2026-11-05", status: "REVIEW", items: [{ name: "Cơm gà chiên mắm", qty: 50 }] },
  { app: "SHOPEE", code: "S1", saleDay: "2026-11-05", status: "OK", items: [{ name: "Bạc xỉu", qty: 3 }] },
  { app: "SHOPEE", code: "S2", saleDay: "2026-11-05", status: "OK" },
  { app: "GRAB", code: "OLD", saleDay: "2026-10-01", status: "OK", items: [{ name: "Bạc xỉu", qty: 99 }] },
];
test("gộp món theo kênh, bỏ đơn huỷ/xem lại/ngoài kỳ, tách combo, chuẩn hoá tên", () => {
  const r = itemsByChannel({ days, storeDocs, onlineOrders: online, ledgerRows: ledger });
  const com = r.items.get("cơm gà chiên mắm"), bac = r.items.get("bạc xỉu");
  assert.deepEqual([com.qty.STORE, com.qty.ONLINE, com.qty.GRAB, com.qty.SHOPEE], [4, 2, 1, 0]);
  assert.deepEqual([bac.qty.STORE, bac.qty.ONLINE, bac.qty.GRAB, bac.qty.SHOPEE], [2, 3, 0, 3]); // 1 lẻ + 2 trong combo
  assert.equal(r.items.get("trà đào").qty.ONLINE, 2);
  assert.deepEqual([r.orders.STORE, r.orders.ONLINE, r.orders.GRAB, r.orders.SHOPEE], [3, 2, 1, 1]);
  assert.equal(r.noItems.SHOPEE, 1);
});
test("xếp hạng tại quán và mang đi", () => {
  const r = itemsByChannel({ days, storeDocs, onlineOrders: online, ledgerRows: ledger });
  const store = rankItems(r.items, ["STORE"]);
  assert.deepEqual(store.rows.map((x) => [x.name, x.qty]), [["Cơm gà chiên mắm", 4], ["Bạc xỉu", 2]]);
  const take = rankItems(r.items, TAKEAWAY);
  assert.equal(take.rows[0].name, "Bạc xỉu"); assert.equal(take.rows[0].qty, 6);
  assert.equal(rankItems(r.items, null, 1).rows.length, 1);
});
