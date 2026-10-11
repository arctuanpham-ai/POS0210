import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMaterial, materialMatches, filterMaterialOptions } from "../material-search.js";

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
