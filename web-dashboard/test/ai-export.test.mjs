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

test("gói AI có đủ các kênh online và app food, món theo kênh", () => {
  const scope = scopeRange("month", { now });
  const blank = () => ({ revenue: 0, count: 0 });
  const text = buildAiPack({
    now, scope,
    channelMonths: [{ monthKey: "2026-10", store: 1000, online: 200, grab: 300, shopee: 400, xanhngon: 0, total: 1900, onlineCount: 1, appCount: 3, unpaid: 0, review: 50 }],
    channelDays: [{ day: "2026-10-16", storeAvailable: true, STORE: { revenue: 1000, count: 4 }, ONLINE: { revenue: 200, count: 1 }, GRAB: { revenue: 300, count: 2 }, SHOPEE: { revenue: 400, count: 1 }, XANHNGON: blank(), total: 1900 }],
    channelItems: [{ name: "Bún gà 50", qty: 5, by: { STORE: 3, ONLINE: 0, GRAB: 1, SHOPEE: 1, XANHNGON: 0 } }],
    channelOrders: [{ at: now, channel: "SHOPEE", code: "05116-1", value: 100000, received: 77832, deduct: 22168, payoutDay: "", status: "CHUA_VE", items: "Bún gà Tô lớn x1" }],
  });
  assert.match(text, /2c\. Doanh thu mọi kênh theo tháng/);
  assert.match(text, /2026-10,1000,200,300,400,0,1900,1,3,0,50/);
  assert.match(text, /3b\. Theo ngày theo kênh/);
  assert.match(text, /4b\. Món bán theo kênh/);
  assert.match(text, /Bún gà 50,3,0,1,1,0,2,5/);
  assert.match(text, /5b\. Đơn online và app food/);
  assert.match(text, /SHOPEE,05116-1,100000,77832,22168,,CHUA_VE/);
  assert.match(text, /Kênh bán/);
});
test("bill hoàn đánh dấu DA_HOAN, tóm tắt tách bill hiệu lực và dòng hoàn, online tính trong POS", () => {
  const b = (billNo, total, refund = null) => ({ billNo, openedAt: now - 3600000, closedAt: now - 1800000, tableName: "Bàn 1", subtotal: total, total, method: "TRANSFER", flow: "prepaid", refund });
  const text = buildAiPack({
    now, scope: scopeRange("month", { now }), lastClose: null,
    bills: [b("A1", 100), b("ON-X1", 80), b("ON-X1", 80, { amount: 80, status: "DONE" })],
  });
  assert.match(text, /180đ · 2 bill còn hiệu lực \(đã loại 1 bill hoàn toàn bộ, tổng 80đ; bảng bill mục 5 có 3 dòng = 2 \+ 1\)/);
  assert.match(text, /đơn online ghi vào POS: 1 bill, 80đ/);
  assert.match(text, /A1,.*,HIEU_LUC,,/);
  assert.match(text, /ON-X1,.*,DA_HOAN,80,/);
  assert.match(text, /POS ĐÃ GỒM đơn online/);
});
test("bản đối soát lưu nháp không bị gọi là chốt sổ", () => {
  const text = buildAiPack({
    now, scope: scopeRange("month", { now }), lastClose: null,
    draftClose: { monthKey: "2026-10", savedAt: now - 86400000, distributable: 500 },
    closings: [{ monthKey: "2026-10", revenue: 1, savedAt: now - 86400000, closed: false }],
  });
  assert.match(text, /chưa chốt tháng nào/);
  assert.match(text, /LƯU NHÁP \(chưa phải chốt sổ/);
  assert.match(text, /2026-10,1,.*,NHAP/);
});
