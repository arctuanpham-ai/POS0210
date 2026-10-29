import test from "node:test";
import assert from "node:assert/strict";
import { materialAlerts, purchaseEvents, dataSpanDays, readiness } from "../material-alerts.js";

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 29, 12);
const rec = (id, daysAgo, items, extra = {}) => ({ id, code: `PC-${id}`, status: "ACTIVE", purchaseDate: NOW - daysAgo * DAY, enteredByName: "Trang", items, ...extra });
const butter = (qty) => ({ materialName: "bơ lạt", unit: "kg", qty, unitPrice: 155000, amount: qty * 155000, materialGroup: "Trứng, sữa, bơ", expenseGroup: "Trứng, sữa, bơ" });

test("sự kiện mua: chỉ phiếu chi tiết còn hiệu lực", () => {
  const ev = purchaseEvents([rec("a", 3, [butter(2)]), rec("b", 2, [butter(2)], { status: "DELETED" }), rec("c", 1, [butter(2)], { items: [], total: 5 })]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].qty, 2000);
});

test("cảnh báo mua trùng: cùng vật tư cùng lượng trong 5 ngày", () => {
  const al = materialAlerts({ receipts: [rec("a", 15, [butter(2)]), rec("b", 13, [butter(2)])], now: NOW });
  assert.equal(al.filter((x) => x.kind === "DUP").length, 1);
  const far = materialAlerts({ receipts: [rec("a", 20, [butter(2)]), rec("b", 10, [butter(2)])], now: NOW });
  assert.equal(far.filter((x) => x.kind === "DUP").length, 0);
  const diffQty = materialAlerts({ receipts: [rec("a", 15, [butter(2)]), rec("b", 13, [butter(3)])], now: NOW });
  assert.equal(diffQty.filter((x) => x.kind === "DUP").length, 0);
});

test("cảnh báo quá định mức cần vừa lệch nhiều vừa thừa tiền", () => {
  const receipts = [rec("a", 20, [butter(10)])];
  const id = purchaseEvents(receipts)[0].materialId;
  const hi = materialAlerts({ receipts, usagePerDay: { [id]: 100 }, now: NOW }); // định mức 30 ngày = 3 kg, mua 10 kg
  assert.ok(hi.some((x) => x.kind === "OVER" && x.amount > 1000000));
  const ok = materialAlerts({ receipts, usagePerDay: { [id]: 300 }, now: NOW }); // 9 kg
  assert.equal(ok.filter((x) => x.kind === "OVER").length, 0);
  const small = materialAlerts({ receipts: [rec("a", 20, [butter(1)])], usagePerDay: { [id]: 10 }, now: NOW });
  assert.equal(small.filter((x) => x.kind === "OVER").length, 0); // thừa dưới 150.000đ
});

test("nhịp mua: mua dồn sớm bất thường", () => {
  const receipts = [rec("a", 28, [butter(2)]), rec("b", 21, [butter(2)]), rec("c", 14, [butter(2)]), rec("d", 7, [butter(2)]), rec("e", 6, [butter(2)])];
  const al = materialAlerts({ receipts, now: NOW });
  assert.ok(al.some((x) => x.kind === "RHYTHM"));
});

test("đủ 30 ngày dữ liệu", () => {
  const ev = purchaseEvents([rec("a", 12, [butter(2)])]);
  assert.deepEqual(readiness(dataSpanDays(ev, NOW)), { ready: false, span: 12, daysLeft: 18 });
  assert.equal(readiness(31).ready, true);
  assert.equal(dataSpanDays([], NOW), 0);
});
