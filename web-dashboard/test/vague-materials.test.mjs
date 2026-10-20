import test from "node:test";
import assert from "node:assert/strict";
import { vagueMaterials, unitClass, hasQuantityInName, approvedKeys } from "../vague-materials.js";

test("phân loại đơn vị", () => {
  assert.equal(unitClass("kg"), ""); assert.equal(unitClass("g"), ""); assert.equal(unitClass("lít"), ""); assert.equal(unitClass("ml"), "");
  assert.equal(unitClass("túi"), "packaged"); assert.equal(unitClass("Gói"), "packaged"); assert.equal(unitClass("hộp"), "packaged");
  assert.equal(unitClass("quả"), ""); assert.equal(unitClass("cái"), "");
  assert.equal(unitClass("xyz"), "unknown"); assert.equal(unitClass(""), "unknown");
});
test("định lượng ghi trong tên", () => {
  assert.ok(hasQuantityInName("Bột chiên giòn 500g")); assert.ok(hasQuantityInName("Sữa 1,5 lít")); assert.ok(hasQuantityInName("Nước 330ml"));
  assert.ok(!hasQuantityInName("Khoai tây chiên")); assert.ok(!hasQuantityInName("Ly 500 cái"));
});
test("gom theo mã, bỏ dòng đã có định lượng và dòng không phải mua hàng", () => {
  const rc = [
    { id: "a", purchaseDate: 2, items: [{ materialName: "Bột chiên", materialCode: "C1", unit: "túi", qty: 2, unitPrice: 50000 }, { materialName: "Gạo", materialCode: "C2", unit: "kg", qty: 5, unitPrice: 20000 }] },
    { id: "b", purchaseDate: 5, items: [{ materialName: "Bột chiên", materialCode: "C1", unit: "gói", qty: 1, unitPrice: 30000 }, { materialName: "Sữa 1 lít", materialCode: "C3", unit: "hộp", qty: 3, unitPrice: 1 }, { materialName: "Tiền điện", unit: "lần", kind: "OTHER_EXPENSE", qty: 1, unitPrice: 9 }] },
  ];
  const { rows, hintedCount } = vagueMaterials(rc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "C1"); assert.equal(rows[0].receiptCount, 2); assert.equal(rows[0].amount, 130000);
  assert.deepEqual(rows[0].unitList, [{ unit: "túi", qty: 2 }, { unit: "gói", qty: 1 }]);
  assert.equal(rows[0].lastReceiptId, "b"); assert.equal(hintedCount, 1);
});

test("đã duyệt bỏ qua thì không vào diện mơ hồ nữa, kể cả lần nhập sau (theo mã hoặc theo tên)", () => {
  const rc = [{ id: "a", purchaseDate: 1, items: [{ materialName: "Rau húng", materialCode: "R1", unit: "bó", qty: 1, unitPrice: 5000 }, { materialName: "Sốt gà", materialCode: "G1", unit: "gói", qty: 2, unitPrice: 10000 }] },
    { id: "b", purchaseDate: 9, items: [{ materialName: "rau hung", materialCode: "R-KHAC", unit: "bó", qty: 3, unitPrice: 5000 }] }];
  const ok = approvedKeys([{ kind: "UNIT_OK", code: "R1", name: "Rau húng" }, { kind: "GROUP", name: "x" }]);
  const { rows, approvedCount } = vagueMaterials(rc, ok);
  assert.deepEqual(rows.map((x) => x.code), ["G1"]);
  assert.equal(approvedCount >= 1, true);
});
