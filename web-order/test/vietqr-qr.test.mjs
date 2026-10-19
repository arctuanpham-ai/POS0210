import test from "node:test";
import assert from "node:assert/strict";
import { crc16, resolveBin, vietQrPayload } from "../public/vietqr.js";
import { vietQrPayload as dashboardPayload } from "../../web-dashboard/reimburse.js";
import { qrMatrix, qrSvg } from "../public/qr.js";

test("CRC16/CCITT-FALSE đúng vector chuẩn", () => {
  assert.equal(crc16("123456789"), 0x29b1);
});

const parseTlv = (s) => { const out = {}; let i = 0; while (i < s.length) { const id = s.slice(i, i + 2); const len = Number(s.slice(i + 2, i + 4)); out[id] = s.slice(i + 4, i + 4 + len); i += 4 + len; } return out; };

test("payload VietQR: đúng số tiền, nội dung, BIN, CRC", () => {
  const p = vietQrPayload({ bank: "Techcombank", account: "19031234567890", holder: "Nguyen Van A", amount: 95000, info: "DMK7P2QX" });
  assert.match(p, /^000201010212/);
  const f = parseTlv(p);
  assert.equal(f["54"], "95000");
  assert.equal(f["53"], "704");
  assert.equal(f["58"], "VN");
  assert.equal(parseTlv(f["62"])["08"], "DMK7P2QX");
  const acct = parseTlv(parseTlv(f["38"])["01"]);
  assert.equal(acct["00"], "970407");
  assert.equal(acct["01"], "19031234567890");
  const body = p.slice(0, -4);
  assert.equal(p.slice(-4), crc16(body).toString(16).toUpperCase().padStart(4, "0"));
});

test("trùng khớp với bản VietQR đang dùng trong web dashboard", () => {
  for (const input of [
    { bank: "Techcombank", account: "19031234567890", holder: "Nguyễn Văn A", amount: 95000, info: "DMK7P2QX" },
    { bank: "970422", account: "0123456789", holder: "QUAN 0210", amount: 1500000, info: "DM ABCD23" },
    { bank: "VCB", account: "MS00P1234567", holder: "", amount: 30000, info: "DM2222AA" },
  ]) assert.equal(vietQrPayload(input), dashboardPayload(input));
});

test("VietQR báo lỗi rõ khi thiếu thông tin", () => {
  assert.throws(() => vietQrPayload({ bank: "NganHangLa", account: "1", holder: "A", amount: 1000, info: "x" }), /ngân hàng/);
  assert.throws(() => vietQrPayload({ bank: "MB", account: "", holder: "A", amount: 1000, info: "x" }), /tài khoản/);
  assert.throws(() => vietQrPayload({ bank: "MB", account: "1", holder: "A", amount: 0, info: "x" }), /tiền/);
  assert.throws(() => vietQrPayload({ bank: "MB", account: "1", holder: "A", amount: 10.5, info: "x" }), /tiền/);
  assert.equal(resolveBin("tcb"), "970407");
});

test("ma trận QR: kích thước và 3 ô định vị", () => {
  const m = qrMatrix("A");
  assert.equal(m.length, 21); // version 1
  for (const [r, c] of [[0, 0], [0, 14], [14, 0]]) { assert.equal(m[r][c], true); assert.equal(m[r + 6][c + 6], true); assert.equal(m[r + 1][c + 1], false); assert.equal(m[r + 3][c + 3], true); }
  const long = qrMatrix(vietQrPayload({ bank: "Techcombank", account: "19031234567890", holder: "Nguyen Van A", amount: 95000, info: "DMK7P2QX" }), "M");
  assert.ok(long.length >= 41 && long.length <= 61);
});

test("SVG QR hợp lệ", () => {
  const svg = qrSvg("https://pos0210-order.web.app/");
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<path d="M/);
});
