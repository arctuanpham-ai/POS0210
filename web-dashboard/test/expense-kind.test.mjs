import test from "node:test";
import assert from "node:assert/strict";
import { detectKind, splitByKind } from "../expense-kind.js";

test("nhận diện loại chi theo tên", () => {
  assert.equal(detectKind("Mái bạt sân trước"), "ADDITIONAL_INVESTMENT");
  assert.equal(detectKind("Thi công vách gỗ"), "ADDITIONAL_INVESTMENT");
  assert.equal(detectKind("Máy xay sinh tố"), "ADDITIONAL_INVESTMENT");
  assert.equal(detectKind("Sửa máy pha cà phê"), "MAINTENANCE");
  assert.equal(detectKind("Công thợ điện"), "MAINTENANCE");
  assert.equal(detectKind("Tiền điện tháng 9"), "OTHER_EXPENSE");
  assert.equal(detectKind("Đổi bình ga"), "OTHER_EXPENSE");
  assert.equal(detectKind("Sữa đặc Ông Thọ"), "MATERIAL");
  assert.equal(detectKind("Bàn chải cọ ly"), "MATERIAL");
  assert.equal(detectKind("Cà phê hạt"), "MATERIAL");
  assert.equal(detectKind(""), "MATERIAL");
  assert.equal(detectKind("Tủ đông", () => true), "MATERIAL", "tên đã có trong danh mục vật tư thì là mua hàng");
});
test("tách phiếu nhiều loại thành từng nhóm, giữ thứ tự", () => {
  const parts = splitByKind([{ id: 1, kind: "MATERIAL" }, { id: 2, kind: "ADDITIONAL_INVESTMENT" }, { id: 3 }, { id: 4, kind: "MAINTENANCE" }]);
  assert.deepEqual(parts.map((p) => [p.kind, p.lines.map((l) => l.id)]), [["MATERIAL", [1, 3]], ["ADDITIONAL_INVESTMENT", [2]], ["MAINTENANCE", [4]]]);
});
