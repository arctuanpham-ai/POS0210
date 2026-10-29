import test from "node:test";
import assert from "node:assert/strict";
import { buildLineBills, itemBillStats, appDeductionRates, channelEconomics, costTrend, channelOf } from "../item-lines.js";

const T = (h) => new Date(2026, 9, 29, h, 5).getTime();
const bill = (id, session, total, method = "CASH") => ({ id, sessionId: session, openedAt: T(8), total, subtotal: total, method });
const batch = (id, session, h, status = "SENT") => ({ id, sessionId: session, createdAt: T(h), status });
const it = (batchId, name, qty, unitPrice) => ({ id: `${batchId}-${name}`, batchId, itemName: name, qty, unitPrice });

const bills = [bill("b1", "s1", 84000), bill("b2", "s2", 59000), bill("b3", "s3", 89000, "GRAB"), bill("b4", "s4", 30000), bill("b5", "s5", 50000), bill("b6", "s6", 59000), bill("b7", "s6", 59000), bill("b8", "s8", 59000), bill("b9", "s9", 59000)];
const batches = [batch("x1", "s1", 12), batch("x2", "s2", 12), batch("x3", "s3", 19), batch("x4", "s4", 8), batch("x5", "s5", 9), batch("x6", "s6", 12), batch("x8", "s8", 12), batch("x8c", "s8", 13, "CANCELLED"), batch("x9", "s9", 13)];
const items = [
  it("x1", "Cơm gà chiên mắm", 1, 59000), it("x1", "Cafe sữa", 1, 25000),
  it("x2", "Cơm gà chiên mắm", 1, 59000),
  it("x3", "Cơm gà chiên mắm", 1, 59000), it("x3", "Cafe sữa", 1, 30000),
  it("x4", "Cafe sữa", 1, 30000),
  it("x5", "COMBO · Trà Ngon [1×Trà chanh nha đam + 1×Cơm gà chiên mắm]", 1, 50000),
  it("x6", "Cơm gà chiên mắm", 1, 59000),
  it("x8", "Cơm gà chiên mắm", 1, 59000), it("x8c", "Bít tết", 5, 99000),
  it("x9", "Cơm gà chiên mắm", 2, 59000), it("x9", "Cơm gà chiên mắm", -1, 59000),
];

test("gộp dòng món: bỏ batch huỷ, tách combo, cộng điều chỉnh, bỏ phiên tách nhiều bill", () => {
  const r = buildLineBills({ bills, batches, items });
  assert.equal(r.skippedSplit, 2); // s6 có 2 bill
  assert.equal(r.billsTotal, 9);
  const b8 = r.bills.find((b) => b.id === "b8");
  assert.equal(b8.lines.length, 1); // Bít tết thuộc batch huỷ
  const b9 = r.bills.find((b) => b.id === "b9");
  assert.equal(b9.lines[0].retail, 1); // 2 − 1
  const b5 = r.bills.find((b) => b.id === "b5");
  assert.deepEqual(b5.lines.map((l) => [l.name, l.inCombo]).sort(), [["Cơm gà chiên mắm", 1], ["Trà chanh nha đam", 1]]);
  assert.equal(channelOf("GRAB"), "GRAB");
  assert.equal(channelOf("CASH"), "STORE");
});

test("thống kê một món: gọi kèm, giờ bán, kênh, bill trung bình", () => {
  const lb = buildLineBills({ bills, batches, items }).bills;
  const s = itemBillStats(lb, "cơm gà chiên mắm", { minPairs: 1 });
  assert.equal(s.bills, 6); // b1 b2 b3 b5 b8 b9
  assert.equal(s.totalBills, 7); // + b4 chỉ có cafe sữa
  const cafe = s.pairs.find((p) => p.name === "Cafe sữa");
  assert.equal(cafe.together, 2);
  assert.ok(Math.abs(cafe.support - 2 / 6) < 1e-9);
  // Cafe sữa có trong 3/7 bill → lift = (2/6)/(3/7)
  assert.ok(Math.abs(cafe.lift - (2 / 6) / (3 / 7)) < 1e-9);
  assert.equal(s.alone, 3); // b2 b8 b9
  assert.equal(s.hours[12], 3); // b1, b2, b8
  assert.equal(s.hours[9], 1); // b5 (trong combo)
  assert.equal(s.hours[13], 1);
  assert.equal(s.hours[19], 1);
  assert.equal(s.channels.GRAB.bills, 1);
  assert.equal(s.channels.STORE.bills, 5);
  assert.equal(s.avgBillWithout, 30000);
  const strict = itemBillStats(lb, "cơm gà chiên mắm"); // minPairs mặc định 3: chưa đủ để kết luận gọi kèm
  assert.equal(strict.pairs.length, 0);
});

test("tỷ lệ app giữ lại: phí + khuyến mãi tính chi phí, thuế giữ hộ tách riêng, bỏ đơn cờ REVIEW", () => {
  const row = (app, v, fee, tax, status = "OK") => ({ app, status, orderValue: v, commission: fee, other: 0, vat: tax, pit: 0, received: v - fee - tax, saleDay: "2026-10-20", payoutDay: "2026-10-22" });
  const rows = [...Array.from({ length: 10 }, () => row("GRAB", 100000, 20000, 4000)), { ...row("GRAB", 100000, 0, 0), payoutDay: "", received: 0 }, row("GRAB", 100000, 99999, 0, "REVIEW"), row("SHOPEE", 100000, 25000, 0)];
  const r = appDeductionRates(rows);
  assert.equal(r.GRAB.orders, 10);
  assert.ok(Math.abs(r.GRAB.feeRate - 0.2) < 1e-9);
  assert.ok(Math.abs(r.GRAB.taxRate - 0.04) < 1e-9);
  assert.equal(r.GRAB.ok, true);
  assert.equal(r.SHOPEE.ok, false);
  const e = channelEconomics({ price: 59000, cost: 20000, rates: r });
  assert.equal(e[0].margin, 39000);
  assert.ok(Math.abs(e[1].margin - (59000 * 0.8 - 20000)) < 1e-6);
  assert.equal(e[1].appPriceToMatch, 74000); // 59.000 / 0,8 = 73.750 → làm tròn lên nghìn
  assert.equal(e[2].ok, false);
});

test("không có đơn app nào thì không bịa tỷ lệ", () => {
  const e = channelEconomics({ price: 30000, cost: 5000, rates: {} });
  assert.equal(e[1].ok, false);
  assert.equal(e[1].margin, undefined);
});

test("xu hướng giá vốn: chỉ dùng phiếu đã có tại mỗi mốc, mốc thiếu giá là null", () => {
  const NOW = Date.UTC(2026, 9, 29, 12);
  const D = 86400000;
  const receipts = [
    { id: "a", purchaseDate: NOW - 20 * D, items: [{ materialName: "Cà phê phin", qty: 1, unit: "kg", amount: 300000 }] },
    { id: "b", purchaseDate: NOW - 3 * D, items: [{ materialName: "Cà phê phin", qty: 1, unit: "kg", amount: 360000 }] },
  ];
  const t = costTrend({ receipts, lines: [{ materialId: "cf_phin", qty: 20 }], price: 25000, now: NOW, weeks: 8 });
  assert.equal(t.points.length, 8);
  assert.equal(t.points[0].total, null); // 49 ngày trước: chưa có phiếu nào
  assert.equal(t.points[7].total, 6600); // (300.000+360.000)/2000g × 20g
  const mid = t.points.find((p) => p.total === 6000);
  assert.ok(mid); // trước phiếu thứ hai chỉ có giá 300đ/g
  assert.equal(t.usable, true);
  assert.equal(t.change.from, 6000);
  assert.equal(t.change.to, 6600);
  assert.ok(Math.abs(t.change.pct - 0.1) < 1e-9);
  assert.equal(t.drivers[0].delta, 600);
  const none = costTrend({ receipts: [], lines: [{ materialId: "cf_phin", qty: 20 }], price: 25000, now: NOW });
  assert.equal(none.usable, false);
});
