import test from "node:test";
import assert from "node:assert/strict";
import { MATERIALS, costLevel, draftRecipeFor, matchMaterial, materialCosts, recipeCost, sliderSpec, unitFactor, materialById } from "../cost-recipe.js";

const NOW = new Date(2026, 9, 15, 12).getTime();
const day = 86400000;

test("danh mục: id không trùng, mỗi công thức nháp chỉ dùng vật tư có trong danh mục", () => {
  assert.equal(new Set(MATERIALS.map((m) => m.id)).size, MATERIALS.length);
  for (const name of ["Đen đá", "Bít tết", "Cơm gà chiên mắm", "0210 Mơ brew", "Bún/bánh đa không nhân"]) {
    const r = draftRecipeFor(name);
    assert.ok(r.length > 0, name);
    for (const l of r) assert.ok(materialById.has(l.materialId), l.materialId);
  }
  assert.deepEqual(draftRecipeFor("hạt dưa"), []);
});

test("khớp dòng phiếu với vật tư: tên chuẩn, tên gọi khác dài nhất thắng", () => {
  assert.equal(matchMaterial({ materialName: "Sữa đặc Ông Thọ" }).id, "sua_dac");
  assert.equal(matchMaterial({ materialName: "sua tuoi khong duong TH" }).id, "sua_tuoi");
  assert.equal(matchMaterial({ materialName: "Cà phê cold brew Đà Lạt" }).id, "cf_coldbrew");
  assert.equal(matchMaterial({ materialName: "Gà ta lọc xương" }).id, "ga_ta_loc");
  assert.equal(matchMaterial({ materialName: "Hàng lạ" }), null);
  assert.equal(matchMaterial({ materialName: "x", materialId: "gao" }).id, "gao");
});

test("quy đổi đơn vị", () => {
  const sua = materialById.get("sua_dac");
  assert.equal(unitFactor(sua, "hộp"), 380);
  assert.equal(unitFactor(sua, "kg"), 1000);
  assert.equal(unitFactor(sua, "gam"), 1);
  assert.equal(unitFactor(materialById.get("sua_tuoi"), "lít"), 1000);
  assert.equal(unitFactor(sua, "bó"), null);
});

test("giá vốn: bình quân 30 ngày, bỏ phiếu tổng/huỷ, rơi về lần gần nhất, ghi nhận dòng không quy đổi", () => {
  const receipts = [
    { id: "a", purchaseDate: NOW - 2 * day, items: [{ materialName: "Sữa đặc", qty: 2, unit: "hộp", amount: 56000 }] },
    { id: "b", purchaseDate: NOW - 10 * day, items: [{ materialName: "Sữa đặc", qty: 1, unit: "kg", amount: 80000 }] },
    { id: "c", purchaseDate: NOW - 60 * day, items: [{ materialName: "Thịt bò", qty: 1, unit: "kg", amount: 250000 }] },
    { id: "d", purchaseDate: NOW - 1 * day, status: "DELETED", items: [{ materialName: "Sữa đặc", qty: 1, unit: "hộp", amount: 999999 }] },
    { id: "e", purchaseDate: NOW - 1 * day, detailLevel: "SUMMARY", items: [{ kind: "SUMMARY_LINE", materialName: "Tổng hợp · Sữa", qty: 1, unit: "lần", amount: 500000 }] },
    { id: "f", purchaseDate: NOW - 1 * day, items: [{ materialName: "Gạo", qty: 1, unit: "bao", amount: 300000 }] },
  ];
  const { costs, unconvertible } = materialCosts(receipts, { now: NOW });
  assert.ok(Math.abs(costs.sua_dac.unitCost - 136000 / 1760) < 1e-9); // (56.000 + 80.000) / (760g + 1000g)
  assert.equal(costs.sua_dac.source, "bình quân 30 ngày");
  assert.equal(costs.thit_bo.unitCost, 250);
  assert.equal(costs.thit_bo.source, "lần mua gần nhất");
  assert.equal(unconvertible.length, 1);
  assert.equal(unconvertible[0].materialId, "gao");
});

test("giá vốn món, thiếu giá và % trên giá bán", () => {
  const costs = { cf_phin: { unitCost: 300 }, sua_dac: { unitCost: 74 } };
  const r = recipeCost([{ materialId: "cf_phin", qty: 20 }, { materialId: "sua_dac", qty: 30 }], costs, 30000);
  assert.equal(r.total, 8220);
  assert.ok(Math.abs(r.percent - 8220 / 30000) < 1e-9);
  assert.equal(r.complete, true);
  const m = recipeCost([{ materialId: "cf_phin", qty: 20 }, { materialId: "duong", qty: 10 }, { materialId: "x", qty: 0 }], costs, 0);
  assert.deepEqual(m.missing, ["Đường cát"]);
  assert.equal(m.percent, null);
  assert.equal(m.complete, false);
  assert.equal(m.rows.length, 2);
});

test("ngưỡng màu và thanh kéo", () => {
  assert.equal(costLevel(0.25, false), "ok");
  assert.equal(costLevel(0.35, false), "warn");
  assert.equal(costLevel(0.45, false), "bad");
  assert.equal(costLevel(0.45, true), "warn");
  assert.equal(costLevel(null, true), "unknown");
  assert.deepEqual(sliderSpec("g", 20), { min: 0, max: 100, step: 1 });
  assert.deepEqual(sliderSpec("g", 400), { min: 0, max: 1200, step: 5 });
  assert.deepEqual(sliderSpec("quả", 2), { min: 0, max: 6, step: 0.5 });
});
