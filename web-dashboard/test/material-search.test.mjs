import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMaterial, materialMatches, filterMaterialOptions, filterMaterialRecords } from "../material-search.js";

test("không phân biệt dấu và chữ hoa", () => {
  assert.equal(normalizeMaterial("ĐÙI GÀ"), "dui ga");
  assert.equal(materialMatches("Cà phê", "CA PHE"), true);
});
test("tìm ký tự không cần đúng thứ tự", () => {
  assert.equal(materialMatches("Gà nguyên con", "ag"), true);
  assert.equal(materialMatches("Trà chanh", "hcart"), true);
  assert.equal(materialMatches("Gà", "aaa"), false);
});
test("ưu tiên khớp cụm và không trả kết quả sai", () => {
  const options = filterMaterialOptions(["Bánh đa gà", "Gà nguyên con", "Gà"], "ga");
  assert.deepEqual(options, ["Gà", "Gà nguyên con", "Bánh đa gà"]);
  assert.deepEqual(filterMaterialOptions(["Bún", "Gà"], "xyz"), []);
});

test("gợi ý vật tư giữ nguyên mã đã cấp khi tìm theo tên hoặc mã", () => {
  const records = [
    { materialName: "Gà nguyên con", materialCode: "THIT-001", expenseGroup: "Thịt, gia cầm", unit: "kg" },
    { materialName: "Cà phê hạt", materialCode: "CAPHE-001", expenseGroup: "Cà phê", unit: "kg" },
  ];
  assert.deepEqual(filterMaterialRecords(records, "thit001").map((x) => x.materialName), ["Gà nguyên con"]);
  assert.deepEqual(filterMaterialRecords(records, "ga ng").map((x) => x.materialCode), ["THIT-001"]);
});
