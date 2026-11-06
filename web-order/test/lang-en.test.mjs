import test from "node:test";
import assert from "node:assert/strict";
import { itemEn, catEn, enLine, countEn, STATUS_EN } from "../public/lang-en.js";
import { STATUS_TEXT } from "../public/order-core.js";

const MENU = ["Cafe muối","hạt hướng dương 50","hạt hướng dương 25","Nước ép cam","Nước ép dưa hấu","Nước ép táo","Mọc thêm","Bún gà 50","Bún gà 40","Bún gà đùi","Bún gà mọc","Bún gà đặc biệt 70","Sữa chua dầm cacao","Sữa chua dầm dưa hấu","cafe kem cheese","Bún không nhân","Bánh đa không nhân","Bánh mì thêm","Khoai tây chiên","Bít tết","Espresso","Trà chanh nha đam","Trứng chần","Bánh mì trứng","Sữa tươi","0210 Mơ brew","Hạt dưa","Bánh mì bơ sữa","Gà rán thêm theo cơm","Bánh đa gà 50","Bánh đa gà 40","Bánh đa gà đặc biệt","Sinh tố bơ","Sinh tố xoài","Trà đá","Cacao (kem cheese)","Trứng ốp la","Cold brew cam","Cold brew nguyên bản","Cold brew chanh","Americano","matcha latte","Cơm gà chiên mắm","Pate thêm","beefsteak đb","Cafe đen nóng","Cơm bò sốt tiêu","Đen đá","Cafe sữa","Bạc xỉu","Đùi gà","Cánh gà","Ấm trà mộc","Trà túi lọc","Bánh mì trứng + cafe sữa","Dưa hấu Đẹp","Cafe Ngon","Cam Đẹp","Cafe Đẹp","Trà Ngon","Bánh mì trứng + trà chanh"];

test("mọi món hiện có đều có dòng tiếng Anh", () => {
  for (const n of MENU) assert.ok(itemEn(n), `thiếu: ${n}`);
});
test("dịch đúng vài món tiêu biểu", () => {
  assert.equal(itemEn("Bánh mì trứng + cafe sữa"), "Egg baguette + Milk coffee");
  assert.equal(itemEn("Bún gà đặc biệt 70"), "Chicken noodle soup (special, 70)");
  assert.equal(itemEn("Dưa hấu Đẹp"), "Watermelon Đẹp");
  assert.equal(itemEn("Cafe muối"), "Salted coffee");
});
test("món lạ không bị đoán", () => {
  assert.equal(itemEn("Món bí ẩn xyz"), "");
  assert.equal(itemEn(""), "");
  assert.equal(itemEn("Bánh mì trứng + xyz"), "");
});
test("nhóm menu và trang", () => {
  for (const c of ["cơm trưa","Nước ép","Đồ ăn vặt","Cà phê","Ăn sáng","Trà","Sinh tố","Khác","Nổi bật","Món lẻ","Combo","Bán chạy"]) assert.ok(catEn(c), c);
  assert.equal(catEn("???"), "");
});
test("enLine escape và rỗng", () => {
  assert.equal(enLine(""), "");
  assert.match(enLine("<b>"), /&lt;b&gt;/);
  assert.equal(countEn(1), "1 item"); assert.equal(countEn(3), "3 items");
});
test("đủ trạng thái đơn", () => {
  for (const k of Object.keys(STATUS_TEXT)) assert.ok(STATUS_EN[k], k);
});
