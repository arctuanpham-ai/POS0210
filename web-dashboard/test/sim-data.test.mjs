import test from "node:test";
import assert from "node:assert/strict";
import { buildSimulation } from "../sim-data.js";
import { buildMonthlyReport, lastMonthKeys } from "../monthly-report.js";
import { reviewItems, summarizeReview, isSummaryReceipt, validateSummaryReceipt } from "../expense-rules.js";

const NOW = new Date(2026, 9, 14, 12).getTime();

test("xác định: cùng seed cho cùng dữ liệu", () => {
  assert.deepEqual(buildSimulation({ now: NOW }), buildSimulation({ now: NOW }));
  assert.notDeepEqual(buildSimulation({ now: NOW, seed: 1 }).receipts, buildSimulation({ now: NOW, seed: 2 }).receipts);
});

test("phiếu không nằm ở tương lai, tổng phiếu khớp tổng dòng, phiếu tổng đúng khuôn Android", () => {
  const { receipts } = buildSimulation({ now: NOW });
  for (const r of receipts.filter((x) => x.status === "ACTIVE")) {
    assert.ok(r.purchaseDate <= NOW);
    assert.equal(r.items.reduce((s, i) => s + i.amount, 0), r.total);
    for (const i of r.items) assert.equal(i.qty * i.unitPrice, i.amount);
    if (isSummaryReceipt(r)) for (const i of r.items) { assert.equal(i.qty, 1); assert.equal(i.unit, "lần"); }
  }
});

test("báo cáo trên dữ liệu mô phỏng: thiếu 1 tháng doanh thu → null, phiếu huỷ không tính, tỷ lệ hợp lý", () => {
  const sim = buildSimulation({ now: NOW });
  const keys = lastMonthKeys(6, NOW);
  const rep = buildMonthlyReport({ receipts: sim.receipts, monthlyDocs: sim.monthlyDocs, monthKeys: keys, currentMonthKey: keys[5] });
  assert.equal(rep.length, 6);
  assert.equal(rep[2].revenue, null);
  assert.equal(rep[2].ratio, null);
  assert.ok(rep[0].summaryAmount > 0 && rep[0].itemizedAmount === 0);
  assert.ok(rep[4].itemizedAmount > 0 && rep[4].summaryAmount === 0);
  for (const r of rep.filter((x) => x.ratio !== null)) assert.ok(r.ratio > 0.1 && r.ratio < 0.7, `${r.monthKey} ${r.ratio}`);
  const total = rep.reduce((s, r) => s + r.purchases, 0);
  assert.equal(total, sim.receipts.filter((r) => r.status === "ACTIVE").reduce((s, r) => s + r.total, 0));
});

test("rà soát bắt được dòng sai nhóm và tên mơ hồ/không khớp", () => {
  const rows = reviewItems(buildSimulation({ now: NOW }).receipts, []);
  const s = summarizeReview(rows);
  assert.ok(rows.some((r) => r.status === "mismatch"));
  assert.ok(rows.some((r) => r.status === "ambiguous" || r.status === "unmatched"));
  assert.ok(s.okRate > 0.5 && s.okRate < 1);
});
