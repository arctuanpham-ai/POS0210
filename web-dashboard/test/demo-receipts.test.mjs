import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_COLLECTION, DEFAULT_DAILY_SALES, averageDailySales, buildDemoReceipts, dailyMaterialUsage, expandComboName } from "../demo-receipts.js";
import { materialCosts, usageVsPurchase, recipeCost, draftRecipeFor } from "../cost-recipe.js";
import { reviewItems, isSummaryReceipt } from "../expense-rules.js";

const NOW = new Date(2026, 9, 16, 10).getTime();
const demo = buildDemoReceipts({ now: NOW, batch: "b1", uid: "u" });

test("mọi phiếu demo đều được đánh dấu, nằm trong collection riêng, id có tiền tố demo", () => {
  assert.equal(DEMO_COLLECTION, "demoExpenseReceipts");
  assert.ok(demo.length > 50);
  for (const r of demo) {
    assert.equal(r.demo, true);
    assert.equal(r.demoBatch, "b1");
    assert.equal(r.source, "DEMO");
    assert.match(r.id, /^demo-b1-/);
    assert.match(r.note, /^DEMO/);
  }
});

test("phiếu hợp lệ: tổng = tổng dòng, dòng = SL × đơn giá, không ở tương lai, không lộ trường nội bộ", () => {
  for (const r of demo) {
    assert.ok(r.purchaseDate <= NOW + 12 * 3600000);
    assert.equal(r.total, r.items.reduce((s, i) => s + i.amount, 0));
    for (const i of r.items) { assert.equal(Math.round(i.qty * i.unitPrice), i.amount); assert.ok(!("_g" in i)); assert.ok(i.qty > 0); }
  }
  assert.equal(demo.filter(isSummaryReceipt).length, 3);
});

test("có đủ 5 lỗi cố ý và màn rà soát bắt được", () => {
  const notes = demo.flatMap((r) => r.items).filter((i) => i.note?.startsWith("DEMO lỗi cố ý")).map((i) => i.note);
  assert.equal(notes.length, 5);
  const statuses = new Set(reviewItems(demo, []).map((r) => r.status));
  assert.ok(statuses.has("mismatch"));
  assert.ok(statuses.has("ambiguous"));
  assert.ok(statuses.has("unmatched"));
  assert.equal(materialCosts(demo, { now: NOW }).unconvertible.length, 1);
});

test("từ phiếu demo tính được giá vật tư và % cost món", () => {
  const { costs } = materialCosts(demo, { now: NOW });
  const r = recipeCost(draftRecipeFor("Cafe sữa"), costs, 30000);
  assert.equal(r.complete, true);
  assert.ok(r.percent > 0.1 && r.percent < 0.5, String(r.percent));
  assert.ok(costs.thit_bo.lastUnitCost > 260); // thịt bò tăng giá 10 ngày cuối
});

test("nhập so với định mức: hao hụt đồ tươi hiện ra, cùng định mức thì gần 1", () => {
  const usage = dailyMaterialUsage(DEFAULT_DAILY_SALES);
  const from = new Date(2026, 9, 2).getTime(), to = new Date(2026, 9, 16).getTime();
  const rows = usageVsPurchase({ receipts: demo, usagePerDay: usage, from, to });
  const by = Object.fromEntries(rows.map((r) => [r.materialId, r]));
  assert.ok(by.rau_thom.ratio > 1.1, String(by.rau_thom.ratio));
  assert.ok(by.ga_ta_loc.ratio > 0.9 && by.ga_ta_loc.ratio < 1.3, String(by.ga_ta_loc.ratio));
});

test("bán trung bình từ snapshot ngày, tách món trong combo", () => {
  assert.deepEqual(expandComboName("COMBO · Sáng [1×Bạc xỉu + 2×Bánh mì thêm]", 3), [["Bạc xỉu", 3], ["Bánh mì thêm", 6]]);
  assert.deepEqual(expandComboName("Đen đá", 2), [["Đen đá", 2]]);
  const docs = { a: { revenue: 100, items: [{ name: "Đen đá", qty: 10 }] }, b: { revenue: 100, items: [{ name: "Đen đá", qty: 20 }, { name: "COMBO · X [1×Đen đá]", qty: 2 }] }, c: { revenue: 0, items: [] } };
  assert.deepEqual(averageDailySales(docs, ["a", "b", "c", "d"]), { "den da": 16 });
});
