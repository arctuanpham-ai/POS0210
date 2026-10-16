import test from "node:test";
import assert from "node:assert/strict";
import { buildAiPack, scopeRange, csv } from "../ai-export.js";

const now = new Date(2026, 9, 16, 23, 0).getTime();
test("phạm vi: hôm nay, tháng này, từ lần chốt, toàn bộ", () => {
  assert.equal(scopeRange("today", { now }).from, new Date(2026, 9, 16).getTime());
  assert.equal(scopeRange("month", { now }).from, new Date(2026, 9, 1).getTime());
  assert.equal(scopeRange("sinceClose", { now, lastClosedMonth: "2026-09" }).from, new Date(2026, 9, 1).getTime());
  assert.match(scopeRange("sinceClose", { now }).label, /chưa chốt/);
  assert.equal(scopeRange("all", { now, openingMonth: "2026-09" }).from, new Date(2026, 8, 1).getTime());
});
test("csv thoát dấu phẩy và để trống ô thiếu", () => {
  assert.equal(csv(["a", "b"], [["x,y", null]]), 'a,b\n"x,y",');
});
test("gói có prompt, bảng tháng, ngày, món, bill, phiếu", () => {
  const text = buildAiPack({
    now, scope: scopeRange("month", { now }), lastClose: null,
    months: [{ monthKey: "2026-10", revenue: 1000, paidBills: 10, purchases: 100, otherOperating: 50, investment: 0 }],
    daily: [{ dateKey: "2026-10-16", revenue: 1000, paidBills: 10, averageBill: 100, hourlyBills: [0, 0, 0, 0, 0, 0, 0, 2] }],
    items: [{ name: "Cà phê muối", qty: 5, revenue: 150 }],
    bills: [{ billNo: "B1", openedAt: now - 3600000, closedAt: now - 1800000, tableName: "Bàn 1", subtotal: 120, total: 100, method: "CASH", flow: "prepaid", refund: null }],
    receipts: [{ at: now, code: "PC1", kind: "MATERIAL", payer: "Hương", fund: "PERSONAL", review: "APPROVED", reimb: "PENDING", total: 100, content: "Sữa" }],
  });
  assert.match(text, /HƯỚNG DẪN CHO AI/);
  assert.match(text, /2026-10,1000,10,100,100,0.100,50,0,850,chưa/);
  assert.match(text, /2026-10-16,T6,1000,10,100,7h:2/);
  assert.match(text, /Cà phê muối,5,150,1.000/);
  assert.match(text, /B1,.*,30,Bàn 1,120,100,20,CASH,prepaid,/);
  assert.match(text, /PC1,MATERIAL,Hương,PERSONAL,APPROVED,PENDING,100,Sữa/);
  assert.match(text, /chưa chốt tháng nào/);
});
