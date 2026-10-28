import test from "node:test";
import assert from "node:assert/strict";
import { parseGrabRows, matchGrab } from "../grab-report.js";

// Tiêu đề và dòng lấy đúng từ báo cáo thật (đơn GF-824, 25/10/2026), rút gọn các cột không dùng.
const header = ["Danh mục", "Trạng thái", "Mã đơn hàng ngắn ", "Ngày chuyển khoản", "Số tiền", "Chiết khấu giao hàng", "Chiết khấu từ các kênh bán hàng", "Chiết khấu đơn hàng", "Chiết khấu cho GrabFood / GrabMart ", "VAT Amount", "PIT Amount", "Tổng cộng", "Lý do hủy", "Lý do hoàn tiền"];
const row = (code, over = {}) => { const base = { "Danh mục": "Payment ", "Trạng thái": "Transferred", "Mã đơn hàng ngắn ": code, "Ngày chuyển khoản": "26 Oct 2026 7:33 AM", "Số tiền": 50000, "Chiết khấu giao hàng": 0, "Chiết khấu từ các kênh bán hàng": -9817, "Chiết khấu đơn hàng": 0, "Chiết khấu cho GrabFood / GrabMart ": 0, "VAT Amount": -1500, "PIT Amount": -750, "Tổng cộng": 37933, ...over }; return header.map((h) => base[h] ?? null); };

test("đọc dòng thật GF-824", () => {
  const [r] = parseGrabRows([header, row("GF-824")]);
  assert.deepEqual({ ...r, problems: r.problems.length }, { code: "GF-824", orderValue: 50000, commission: 9817, vat: 1500, pit: 750, received: 37933, other: 0, paidAt: "26 Oct 2026 7:33 AM", createdAt: "", payoutRef: "", shopPromo: 0, status: "Transferred", problems: 0 });
});
test("khoản trừ khác tự tính, đơn huỷ/chưa chuyển bị gắn cờ", () => {
  const rows = parseGrabRows([header, row("A1", { "Tổng cộng": 37000 }), row("A2", { "Trạng thái": "Pending" }), row("A3", { "Lý do hủy": "Khách huỷ" }), row("A4", { "Tổng cộng": 49000 })]);
  assert.equal(rows[0].other, 933); assert.equal(rows[0].problems.length, 0);
  assert.match(rows[1].problems[0], /Pending/);
  assert.match(rows[2].problems[0], /huỷ/);
  assert.match(rows[3].problems[0], /lớn hơn giá trị đơn/);
});
test("thiếu cột bắt buộc thì không đọc", () => {
  assert.deepEqual(parseGrabRows([["Cột lạ"], ["x"]]), []);
  assert.deepEqual(parseGrabRows([]), []);
});
test("khớp với đơn đang chờ", () => {
  const parsed = parseGrabRows([header, row("gf-824"), row("GF-900"), row("GF-777", { "Lý do hoàn tiền": "Sai món" }), row("GF-111")]);
  const pending = [{ billId: "b1", app: "GRAB", code: "GF-824", amount: 59000 }, { billId: "b2", app: "GRAB", code: "GF-777", amount: 50000 }, { billId: "b3", app: "GRAB", code: "GF-555", amount: 40000 }, { billId: "b4", app: "SHOPEE", code: "GF-900", amount: 1 }];
  const m = matchGrab(parsed, pending, ["GF-111"]);
  assert.equal(m.ready.length, 1); assert.equal(m.ready[0].order.billId, "b1"); assert.match(m.ready[0].diffNote, /59000/);
  assert.equal(m.review.length, 1); assert.equal(m.review[0].order.billId, "b2");
  assert.deepEqual(m.notInPos.map((x) => x.code), ["GF-900"]); // đơn Shopee cùng mã không được dùng để khớp Grab
  assert.deepEqual(m.notInFile.map((o) => o.code), ["GF-555"]);
  assert.deepEqual(m.alreadyDone.map((x) => x.code), ["GF-111"]);
});
