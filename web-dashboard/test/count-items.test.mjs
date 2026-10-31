import test from "node:test";
import assert from "node:assert/strict";
import { addCountItem, addableMaterials, countUnitFor, dismissCountItem, firstPurchaseTimes, normalizeCountConfig, removeCountItem, suggestCountItems } from "../count-items.js";
import { MATERIALS, materialById } from "../cost-recipe.js";
import { COUNT_ITEMS, countToBase } from "../stock-count.js";

const day = 86400000;

test("chưa có cấu hình thì dùng danh sách mặc định", () => {
  const cfg = normalizeCountConfig(undefined);
  assert.deepEqual(cfg.items.map((x) => x.id), COUNT_ITEMS.map((x) => x.id));
  assert.equal(cfg.custom, false);
});

test("đơn vị đếm mặc định luôn quy đổi được", () => {
  for (const m of MATERIALS.filter((x) => x.kind === "NL" && !x.stub)) assert.notEqual(countToBase(m.id, countUnitFor(m), 1), null, m.id);
  assert.equal(countUnitFor(materialById.get("sua_dac")), "g");
  assert.equal(countUnitFor(materialById.get("cf_phin")), "kg");
});

test("thêm, bỏ, bỏ qua gợi ý", () => {
  let cfg = normalizeCountConfig({ items: [{ id: "cf_phin", unit: "kg" }], dismissed: [] });
  cfg = addCountItem(cfg, "tra_moc");
  assert.deepEqual(cfg.items.map((x) => x.id), ["cf_phin", "tra_moc"]);
  assert.equal(addCountItem(cfg, "khong_co"), null);
  assert.equal(addCountItem(cfg, "tra_moc").items.length, 2, "thêm trùng không nhân đôi");
  cfg = removeCountItem(cfg, "cf_phin");
  assert.deepEqual(cfg.items.map((x) => x.id), ["tra_moc"]);
  assert.deepEqual(cfg.dismissed, ["cf_phin"]);
  assert.deepEqual(addCountItem(cfg, "cf_phin").dismissed, [], "thêm lại thì không còn bị bỏ qua");
  assert.deepEqual(dismissCountItem(cfg, "gao").dismissed.sort(), ["cf_phin", "gao"]);
});

test("lần nhập mua đầu tiên bỏ phiếu huỷ và phiếu tổng", () => {
  const first = firstPurchaseTimes([
    { id: "a", purchaseDate: 5 * day, items: [{ materialName: "Thịt bò", qty: 2, unit: "kg", amount: 500000 }] },
    { id: "b", purchaseDate: 2 * day, items: [{ materialName: "Thịt bò", qty: 1, unit: "kg", amount: 250000 }] },
    { id: "c", purchaseDate: 1 * day, status: "DELETED", items: [{ materialName: "Thịt bò", qty: 1, unit: "kg", amount: 1 }] },
  ]);
  assert.equal(first.thit_bo, 2 * day);
});

test("gợi ý theo giá trị dùng mỗi ngày, chỉ vật tư đã nhập mua trước thời điểm đếm", () => {
  const cfg = normalizeCountConfig({ items: [{ id: "cf_phin", unit: "kg" }], dismissed: ["gao"] });
  const usagePerDay = { thit_bo: 2000, bo_lat: 300, tra_moc: 50, cf_phin: 3000, gao: 5000, rau_thom: 4000, khoai_tay: 100 };
  const costs = { thit_bo: { unitCost: 260 }, bo_lat: { unitCost: 150 }, tra_moc: { unitCost: 200 }, cf_phin: { unitCost: 250 }, gao: { unitCost: 20 }, rau_thom: { unitCost: 50 }, khoai_tay: { unitCost: 90 } };
  const firstBuy = { thit_bo: 10 * day, bo_lat: 30 * day, tra_moc: 10 * day, cf_phin: 1, gao: 1, rau_thom: 1, khoai_tay: 5 * day };
  const r = suggestCountItems({ usagePerDay, costs, firstBuy, countAt: 20 * day, cfg });
  const ids = r.suggestions.map((s) => s.id);
  assert.equal(ids[0], "thit_bo", "lớn nhất xếp đầu");
  assert.ok(!ids.includes("cf_phin"), "đã có trong danh sách");
  assert.ok(!ids.includes("gao"), "đã bỏ qua");
  assert.ok(!ids.includes("rau_thom"), "rau tươi không gợi ý");
  assert.ok(!ids.includes("bo_lat"), "bơ lạt mới nhập mua SAU thời điểm đếm");
  assert.deepEqual(r.skipped.notBoughtYet, ["Bơ lạt"]);
  assert.ok(ids.includes("khoai_tay"), "khoai tây đông lạnh để lâu thì được gợi ý");
  // Đếm muộn hơn thì bơ lạt đã được nhập mua: được gợi ý.
  const later = suggestCountItems({ usagePerDay, costs, firstBuy, countAt: 40 * day, cfg });
  assert.ok(later.suggestions.some((s) => s.id === "bo_lat"));
});

test("không có giá thì không gợi ý, thêm tay chỉ hiện vật tư chưa có trong danh sách", () => {
  const cfg = normalizeCountConfig({ items: [{ id: "cf_phin", unit: "kg" }], dismissed: [] });
  const r = suggestCountItems({ usagePerDay: { thit_bo: 1000 }, costs: {}, firstBuy: { thit_bo: 1 }, countAt: 5, cfg });
  assert.equal(r.suggestions.length, 0);
  assert.deepEqual(r.skipped.noPrice, ["Thịt bò"]);
  const add = addableMaterials(cfg, MATERIALS);
  assert.ok(add.every((m) => m.id !== "cf_phin"));
  assert.ok(add.some((m) => m.id === "thit_bo"));
});

test("đồ mua gần mỗi ngày không được gợi ý", () => {
  const cfg = normalizeCountConfig({ items: [], dismissed: [] });
  const r = suggestCountItems({ usagePerDay: { banh_mi: 8, thit_bo: 2000 }, costs: { banh_mi: { unitCost: 3000 }, thit_bo: { unitCost: 260 } }, firstBuy: { banh_mi: 1, thit_bo: 1 }, buyDays: { banh_mi: 25, thit_bo: 6 }, countAt: 5, cfg });
  assert.deepEqual(r.suggestions.map((s) => s.id), ["thit_bo"]);
  assert.deepEqual(r.skipped.daily, ["Bánh mì"]);
});

import { isMilkRaw } from "../count-items.js";
test("đồ sữa đếm bằng g / ml kể cả cấu hình cũ ghi hộp", () => {
  assert.equal(countUnitFor(materialById.get("sua_dac")), "g");
  assert.equal(countUnitFor(materialById.get("sua_tuoi")), "ml");
  assert.equal(countUnitFor(materialById.get("kem_beo")), "ml");
  assert.equal(countUnitFor(materialById.get("cf_phin")), "kg");
  assert.equal(isMilkRaw(materialById.get("trung")), false);
  const cfg = normalizeCountConfig({ items: [{ id: "sua_dac", unit: "hộp" }, { id: "cf_phin", unit: "kg" }], dismissed: [] });
  assert.deepEqual(cfg.items, [{ id: "sua_dac", unit: "g" }, { id: "cf_phin", unit: "kg" }]);
  assert.equal(addCountItem({ items: [], dismissed: [] }, "sua_tuoi", "hộp").items[0].unit, "ml");
});

import { searchCountMaterials as searchMaterials } from "../count-items.js";
test("tìm vật tư theo tên không phân biệt dấu, hoa thường, có cả tên gọi khác", () => {
  const names = (q) => searchMaterials(q, MATERIALS).map((m) => m.name);
  assert.ok(names("sua dac").includes("Sữa đặc"));
  assert.ok(names("SỮA").length >= 2);
  assert.ok(!names("ong tho").includes("Rau thơm, hành lá, giá"), "khớp đầu từ, không khớp giữa từ");
  assert.ok(names("ong tho").includes("Sữa đặc"), "tên gọi khác");
  assert.equal(names("sua")[0].toLowerCase().startsWith("sữa"), true, "tên bắt đầu bằng từ khoá xếp trước");
  assert.deepEqual(names("   "), []);
  assert.deepEqual(names("zzzzqq"), []);
});
