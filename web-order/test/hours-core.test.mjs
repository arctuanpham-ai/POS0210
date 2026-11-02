import test from "node:test";
import assert from "node:assert/strict";
import { openStatus, parseHours, vnMinuteOfDay } from "../public/hours-core.js";

// Mốc giờ Việt Nam -> epoch ms (UTC+7), để test không phụ thuộc múi giờ máy chạy.
const vn = (h, m = 0) => Date.UTC(2026, 10, 2, h - 7, m);

test("đọc nhiều kiểu viết giờ", () => {
  assert.deepEqual(parseHours("6:30 - 18:00"), [{ start: 390, end: 1080 }]);
  assert.deepEqual(parseHours("6h30 - 18h"), [{ start: 390, end: 1080 }]);
  assert.deepEqual(parseHours("06:30–18:00"), [{ start: 390, end: 1080 }]);
  assert.deepEqual(parseHours("6 giờ 30 đến 18 giờ"), [{ start: 390, end: 1080 }]);
  assert.deepEqual(parseHours("6:30-11:00, 14:00-18:00"), [{ start: 390, end: 660 }, { start: 840, end: 1080 }]);
  assert.equal(parseHours("Mở cả ngày 24/7"), "always");
});

test("không đoán bừa khi chuỗi không rõ", () => {
  assert.equal(parseHours(""), null);
  assert.equal(parseHours(undefined), null);
  assert.equal(parseHours("T2 - T6 6:30 - 18:00"), null);
  assert.equal(parseHours("Thứ 2 - 6: 6:30-18:00"), null);
  assert.equal(parseHours("6 - 18"), null);
  assert.equal(parseHours("25:00 - 18:00"), null);
  assert.deepEqual(openStatus("liên hệ quán", vn(10)), { known: false });
});

test("phút trong ngày theo giờ Việt Nam", () => {
  assert.equal(vnMinuteOfDay(vn(0, 0)), 0);
  assert.equal(vnMinuteOfDay(vn(6, 30)), 390);
  assert.equal(vnMinuteOfDay(vn(23, 59)), 1439);
});

test("đang mở, sắp đóng, đã đóng (6:30 - 18:00)", () => {
  const h = "6:30 - 18:00";
  assert.deepEqual(openStatus(h, vn(11, 3)), { known: true, open: true, soon: false, label: "Đang mở cửa", detail: "đến 18:00" });
  assert.equal(openStatus(h, vn(6, 30)).open, true);
  assert.equal(openStatus(h, vn(6, 29)).open, false);
  const soon = openStatus(h, vn(17, 40));
  assert.equal(soon.label, "Sắp đóng cửa");
  assert.equal(soon.detail, "còn 20 phút, đóng lúc 18:00");
  assert.equal(soon.open, true);
  assert.equal(openStatus(h, vn(18, 0)).open, false);
});

test("đã đóng: báo giờ mở lại hôm nay hoặc ngày mai", () => {
  const h = "6:30 - 18:00";
  assert.equal(openStatus(h, vn(5, 0)).detail, "mở lại lúc 6:30");
  assert.equal(openStatus(h, vn(20, 0)).detail, "mở lại lúc 6:30 ngày mai");
  assert.equal(openStatus(h, vn(20, 0)).label, "Đã đóng cửa");
});

test("hai ca trong ngày", () => {
  const h = "6:30-11:00, 14:00-18:00";
  assert.equal(openStatus(h, vn(12, 0)).open, false);
  assert.equal(openStatus(h, vn(12, 0)).detail, "mở lại lúc 14:00");
  assert.equal(openStatus(h, vn(15, 0)).open, true);
});

test("quán mở qua nửa đêm", () => {
  const h = "17:00 - 02:00";
  assert.equal(openStatus(h, vn(23, 0)).open, true);
  assert.equal(openStatus(h, vn(1, 0)).open, true);
  assert.equal(openStatus(h, vn(3, 0)).open, false);
  assert.equal(openStatus(h, vn(3, 0)).detail, "mở lại lúc 17:00");
});

test("mở cả ngày", () => {
  assert.equal(openStatus("24/7", vn(3)).open, true);
});
