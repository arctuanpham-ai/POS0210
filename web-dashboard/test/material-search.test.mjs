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

import { searchMaterials, tokenMatches } from "../material-search.js";
test("tìm vật tư theo từ gõ: không dấu, thứ tự từ tuỳ ý, ưu tiên khớp đầu tên", () => {
  const items = [{ name: "Khoai tây chiên đông lạnh", dynamic: true }, { name: "Hành tây", dynamic: true }, { name: "Đường phèn", dynamic: true }, { name: "Đường vàng ( đường nâu )", dynamic: false }, { name: "Cà phê Arabica", dynamic: false }];
  assert.deepEqual(searchMaterials(items, "khoai").map((m) => m.name), ["Khoai tây chiên đông lạnh"]);
  assert.deepEqual(searchMaterials(items, "duong").map((m) => m.name), ["Đường phèn", "Đường vàng ( đường nâu )"]);
  assert.deepEqual(searchMaterials(items, "lanh khoai").map((m) => m.name), ["Khoai tây chiên đông lạnh"]);
  assert.deepEqual(searchMaterials(items, "ca phe").map((m) => m.name), ["Cà phê Arabica"]);
  assert.ok(tokenMatches("Hành tây", "TAY"));
  assert.equal(searchMaterials(items, "").length, 5);
});
test("gõ sai thứ tự chữ cái thì nới sang khớp chữ rời", () => {
  const items = [{ name: "Khoai tây", dynamic: false }, { name: "Gạo", dynamic: false }];
  assert.deepEqual(searchMaterials(items, "kohai").map((m) => m.name), ["Khoai tây"]);
  assert.deepEqual(searchMaterials(items, "zzz"), []);
});
