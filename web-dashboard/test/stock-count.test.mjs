import test from "node:test";
import assert from "node:assert/strict";
import { COUNT_ITEMS, buildDemoCounts, countToBase, varianceBetween } from "../stock-count.js";
import { buildDemoReceipts, dailyMaterialUsage, DEFAULT_DAILY_SALES } from "../demo-receipts.js";

const day = 86400000;

test("đơn vị đếm quy đổi về đơn vị định lượng", () => {
  assert.equal(countToBase("sua_dac", "hộp", 5), 1900);
  assert.equal(countToBase("cf_phin", "kg", 1.5), 1500);
  assert.equal(countToBase("dau_an", "lít", 2), 2000);
  assert.equal(countToBase("sua_dac", "bó", 1), null);
  assert.equal(countToBase("sua_dac", "hộp", -1), null);
  for (const { id, unit } of COUNT_ITEMS) assert.notEqual(countToBase(id, unit, 1), null, id);
});

test("hao hụt giữa hai lần đếm = tồn đầu + nhập − tồn cuối − định mức", () => {
  const prev = { countedAt: 1000, items: { sua_dac: 1900, thit_bo: 500 } };
  const next = { countedAt: 1000 + 7 * day, items: { sua_dac: 760, thit_bo: 300, cf_phin: 100 } };
  const receipts = [
    { id: "r", purchaseDate: 1000 + day, items: [{ materialName: "Sữa đặc", qty: 10, unit: "hộp", amount: 280000 }, { materialName: "Thịt bò", qty: 2, unit: "kg", amount: 520000 }] },
    { id: "old", purchaseDate: 999, items: [{ materialName: "Sữa đặc", qty: 99, unit: "hộp", amount: 1 }] },
  ];
  const rows = varianceBetween({ prev, next, receipts, expectedUsage: () => ({ sua_dac: 4560, thit_bo: 2000 }), costs: { thit_bo: { unitCost: 260 } } });
  const by = Object.fromEntries(rows.map((r) => [r.materialId, r]));
  assert.equal(by.sua_dac.actual, 1900 + 3800 - 760);
  assert.equal(by.sua_dac.diff, 4940 - 4560);
  assert.equal(by.thit_bo.actual, 500 + 2000 - 300);
  assert.equal(by.thit_bo.diffValue, 200 * 260);
  assert.equal(by.sua_dac.diffValue, null);
  assert.equal(by.cf_phin, undefined); // chỉ có ở lần đếm sau
});

test("lần đếm demo khớp phiếu demo: hao hụt thịt bò hiện ra, sữa đặc gần định mức", () => {
  const NOW = new Date(2026, 9, 16, 23).getTime();
  const receipts = buildDemoReceipts({ now: NOW });
  const usage = dailyMaterialUsage(DEFAULT_DAILY_SALES);
  const counts = buildDemoCounts({ receipts, usagePerDay: usage, waste: { thit_bo: 1.15 }, now: NOW });
  assert.ok(counts.length >= 4);
  assert.ok(counts.every((c) => c.demo === true));
  const [a, b] = counts.slice(-2);
  const rows = varianceBetween({ prev: a, next: b, receipts, expectedUsage: (f, t) => Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, v * Math.round((t - f) / day)])) });
  const by = Object.fromEntries(rows.map((r) => [r.materialId, r]));
  assert.ok(by.thit_bo.diffPct > 0.08 && by.thit_bo.diffPct < 0.25, String(by.thit_bo.diffPct));
  assert.ok(Math.abs(by.sua_dac.diffPct) < 0.1, String(by.sua_dac.diffPct));
});

import { stockValue } from "../stock-count.js";
test("giá trị tồn kho = lượng × giá vốn, vật tư chưa có giá được báo riêng", () => {
  const r = stockValue({ items: { thit_bo: 2000, sua_dac: 1900, pate: 500, cf_phin: 0 } }, { thit_bo: { unitCost: 260 }, sua_dac: { unitCost: 74 } });
  assert.equal(r.total, 2000 * 260 + 1900 * 74);
  assert.deepEqual(r.unpriced, ["Pate"]);
  assert.equal(r.rows[0].materialId, "thit_bo");
});
test("đồ sữa mặc định đếm bằng g / ml", () => {
  const by = Object.fromEntries(COUNT_ITEMS.map((x) => [x.id, x.unit]));
  assert.deepEqual([by.sua_dac, by.kem_beo, by.sua_tuoi], ["g", "ml", "ml"]);
});

test("giá ước tính nhập tay dùng khi chưa có giá phiếu chi, giá phiếu chi vẫn ưu tiên", () => {
  const r = stockValue({ items: { pate: 500, thit_bo: 1000 }, manualCosts: { pate: 200, thit_bo: 1 } }, { thit_bo: { unitCost: 260 } });
  const by = Object.fromEntries(r.rows.map((x) => [x.materialId, x]));
  assert.equal(by.pate.value, 100000);
  assert.equal(by.pate.estimated, true);
  assert.equal(by.thit_bo.value, 260000);
  assert.equal(by.thit_bo.estimated, false);
  assert.equal(r.estimated, 1);
  assert.deepEqual(r.unpriced, []);
});

import { makeValuation, countValuation, compareStock } from "../stock-count.js";
test("valuation lưu giá tại thời điểm đếm và so sánh hai kỳ", async () => {
  const costsOld = { cf_phin: { unitCost: 0.2 } }, costsNew = { cf_phin: { unitCost: 0.4 }, sua_dac: { unitCost: 0.05 } };
  const a = { countedAt: 1, items: { cf_phin: 1000 } };
  a.valuation = makeValuation(a, costsOld);
  const b = { countedAt: 2, items: { cf_phin: 3000, sua_dac: 2000 } };
  assert.equal(countValuation(a, costsNew).total, 200); // giữ giá cũ
  assert.equal(countValuation(b, costsNew).total, 1300);
  const c = compareStock(a, b, costsNew);
  assert.equal(c.totalA, 200); assert.equal(c.totalB, 1300); assert.equal(c.dTotal, 1100);
  const phin = c.rows.find((r) => r.materialId === "cf_phin");
  assert.equal(phin.dQty, 2000); assert.equal(phin.dVal, 1000);
  const sua = c.rows.find((r) => r.materialId === "sua_dac");
  assert.equal(sua.qtyA, null); assert.equal(sua.valB, 100);
});
