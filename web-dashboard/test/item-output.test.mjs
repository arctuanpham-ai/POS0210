import test from "node:test";
import assert from "node:assert/strict";
import { outputRows, comboCount, materialConsumption, formatBaseQty } from "../item-output.js";

const docs = {
  d1: { items: [
    { name: "Nước ép cam", qty: 6, revenue: 210000 },
    { name: "COMBO · Cam Đẹp [1×Nước ép cam + 1×Cơm bò sốt tiêu]", qty: 4, revenue: 356000 },
    { name: "Cơm bò sốt tiêu", qty: 2, revenue: 118000 },
  ] },
  d2: { items: [{ name: "nước ép cam", qty: 1, revenue: 35000 }, { name: "COMBO · Trà Ngon [1×Trà chanh nha đam + 1×Cơm gà chiên mắm]", qty: 5, revenue: 345000 }] },
};

test("combo được tách thành món lẻ, bán lẻ và trong combo tách cột", () => {
  const rows = outputRows(docs, ["d1", "d2"]);
  const cam = rows.find((r) => r.name === "Nước ép cam");
  assert.deepEqual([cam.retail, cam.inCombo, cam.total, cam.revenue], [7, 4, 11, 245000]);
  const com = rows.find((r) => r.name === "Cơm bò sốt tiêu");
  assert.deepEqual([com.retail, com.inCombo, com.total], [2, 4, 6]);
  assert.equal(rows.find((r) => r.name === "Cơm gà chiên mắm").total, 5);
  assert.ok(!rows.some((r) => r.name.startsWith("COMBO")));
  assert.equal(rows[0].name, "Nước ép cam"); // xếp theo tổng làm giảm dần
});

test("ngày không có dữ liệu bị bỏ qua, đếm combo", () => {
  assert.deepEqual(outputRows(docs, ["x"]), []);
  assert.equal(comboCount(docs, ["d1", "d2"]), 9);
});

test("nguyên liệu tiêu hao nhân theo tổng làm và theo công thức hiện hành", () => {
  const rows = outputRows(docs, ["d1"]);
  const recipes = { "nước ép cam": { saved: true, lines: [{ materialId: "cam", qty: 200 }] }, "cơm bò sốt tiêu": { saved: false, lines: [{ materialId: "bo", qty: 100 }] } };
  const r = materialConsumption(rows, (n) => recipes[n.toLowerCase()]);
  assert.equal(r.usage.cam, 200 * 10);
  assert.equal(r.usage.bo, 100 * 6);
  assert.deepEqual(r.drafts, ["Cơm bò sốt tiêu"]);
  // công thức đổi → số đổi
  recipes["nước ép cam"].lines[0].qty = 150;
  assert.equal(materialConsumption(rows, (n) => recipes[n.toLowerCase()]).usage.cam, 1500);
});

test("món không công thức được liệt kê riêng", () => {
  const r = materialConsumption(outputRows(docs, ["d1"]), () => ({ lines: [], saved: false }));
  assert.equal(r.noRecipe.length, 2);
  assert.deepEqual(r.usage, {});
});

test("định dạng số lượng", () => {
  assert.equal(formatBaseQty(2500, "g"), "2,5 kg");
  assert.equal(formatBaseQty(1500, "ml"), "1,5 lít");
  assert.equal(formatBaseQty(12, "quả"), "12 quả");
});
