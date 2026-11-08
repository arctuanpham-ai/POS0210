import test from "node:test";
import assert from "node:assert/strict";
import { enumerateDays, revenueByDay, unifiedBills, dayOfMs } from "../all-channels.js";

const days = ["2026-11-04", "2026-11-05"];
const at = (d, h) => Date.parse(`${d}T${String(h).padStart(2, "0")}:00:00+07:00`);
const storeDocs = { "2026-11-04": { revenue: 1000, paidBills: 10 }, "2026-11-05": null };
const online = [
  { id: "a", code: "A1", name: "An", status: "done", mode: "delivery", total: 200, paidAt: at("2026-11-04", 9), doneAt: at("2026-11-04", 10) },
  { id: "b", code: "B1", name: "Bình", status: "done", mode: "pickup", total: 100, paidAt: at("2026-11-05", 9) },
  { id: "p", code: "P1", name: "Phúc", status: "paid", mode: "pickup", total: 777, paidAt: at("2026-11-05", 9) },
  { id: "c", code: "C1", status: "cancelled", mode: "pickup", total: 999, createdAt: at("2026-11-05", 9) },
  { id: "d", code: "D1", status: "rejected", mode: "pickup", total: 999, createdAt: at("2026-11-05", 9) },
];
const ledger = [
  { app: "GRAB", code: "G1", saleDay: "2026-11-04", orderValue: 300, received: 200, status: "OK", payoutDay: "2026-11-05", saleAt: at("2026-11-04", 12) },
  { app: "GRAB", code: "G2", saleDay: "2026-11-05", orderValue: 50, received: 0, status: "REVIEW", problems: ["Đơn huỷ"], saleAt: at("2026-11-05", 12) },
  { app: "SHOPEE", code: "S1", saleDay: "2026-11-05", orderValue: 70, received: 50, status: "OK", payoutDay: "", saleAt: at("2026-11-05", 13) },
  { app: "GRAB", code: "OLD", saleDay: "2026-10-01", orderValue: 5000, status: "OK" },
];

test("enumerateDays", () => { assert.deepEqual(enumerateDays("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]); assert.deepEqual(enumerateDays("x", "y"), []); });
test("dayOfMs theo giờ Việt Nam", () => assert.equal(dayOfMs(Date.parse("2026-11-04T18:00:00Z")), "2026-11-05"));
test("gộp doanh thu mọi kênh, không tính đơn chưa trả / huỷ / cần xem lại", () => {
  const r = revenueByDay({ days, storeDocs, onlineOrders: online, ledgerRows: ledger });
  assert.equal(r.totals.STORE.revenue, 1000);
  assert.equal(r.totals.ONLINE.revenue, 300);
  assert.equal(r.totals.GRAB.revenue, 200);
  assert.equal(r.totals.SHOPEE.revenue, 50);
  assert.deepEqual(r.unpaid, { count: 1, value: 50 });
  assert.equal(r.total, 1550);
  assert.equal(r.count, 10 + 2 + 1 + 1);
  assert.deepEqual(r.storeMissing, ["2026-11-05"]);
  assert.deepEqual(r.review, { count: 1, value: 50 });
});
test("đơn đã nhận tiền nhưng chưa Hoàn thành chưa tính doanh thu; tính theo ngày bấm Hoàn thành", () => {
  const r = revenueByDay({ days, storeDocs, onlineOrders: [{ id: "x", status: "done", total: 50, paidAt: at("2026-11-04", 23), doneAt: at("2026-11-05", 1) }, { id: "y", status: "delivering", total: 60, paidAt: at("2026-11-04", 9) }], ledgerRows: [], channels: ["ONLINE"] });
  assert.equal(r.totals.ONLINE.revenue, 50);
});
test("lọc kênh và hình thức online", () => {
  assert.equal(revenueByDay({ days, storeDocs, onlineOrders: online, ledgerRows: ledger, channels: ["GRAB", "SHOPEE"] }).total, 250);
  const o = revenueByDay({ days, storeDocs, onlineOrders: online, ledgerRows: ledger, channels: ["ONLINE"], onlineMode: "delivery" });
  assert.equal(o.total, 200);
  assert.deepEqual(o.storeMissing, []);
});
test("danh sách bill gộp: sắp mới nhất trước, lọc kênh, tìm mã", () => {
  const storeBills = [{ id: "b1", tableName: "Bàn 1", billNo: 7, closedAt: at("2026-11-05", 11), total: 90, method: "CASH", flow: "prepaid" }];
  const all = unifiedBills({ days, storeBills, storeDay: "2026-11-05", onlineOrders: online, ledgerRows: ledger });
  assert.deepEqual(all.rows.map((x) => x.id), ["SHOPEE_S1", "GRAB_G2", "STORE_b1", "ONLINE_b", "GRAB_G1", "ONLINE_a"]);
  assert.equal(all.total, 50 + 90 + 100 + 200 + 200);
  assert.equal(all.byChannel.GRAB.count, 1);
  assert.equal(unifiedBills({ days, onlineOrders: online, ledgerRows: ledger, channel: "ONLINE" }).rows.length, 2);
  assert.equal(unifiedBills({ days, ledgerRows: ledger, q: "g1" }).rows.length, 1);
  assert.equal(unifiedBills({ days, storeBills, storeDay: "2026-11-09" }).rows.length, 0);
});

test("lọc theo tình trạng tiền về chỉ giữ đơn app food", () => {
  const w = unifiedBills({ days, onlineOrders: online, ledgerRows: ledger, status: "WAIT" });
  assert.deepEqual(w.rows.map((x) => x.id), ["SHOPEE_S1"]);
  assert.deepEqual(unifiedBills({ days, ledgerRows: ledger, status: "REVIEW" }).rows.map((x) => x.id), ["GRAB_G2"]);
  const x = unifiedBills({ days, ledgerRows: [{ app: "XANHNGON", code: "X1", saleDay: "2026-11-05", orderValue: 40, received: 30, status: "OK" }], channel: "XANHNGON" });
  assert.equal(x.total, 30);
});
