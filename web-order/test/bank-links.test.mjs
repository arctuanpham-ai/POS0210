import test from "node:test";
import assert from "node:assert/strict";
import { BANK_APPS, bankDeeplink, receivingBankCode } from "../public/bank-links.js";

test("mã ngân hàng nhận tiền từ tên hoặc BIN", () => {
  assert.equal(receivingBankCode("MB Bank"), "mb");
  assert.equal(receivingBankCode("Vietcombank"), "vcb");
  assert.equal(receivingBankCode("970415"), "icb");
  assert.equal(receivingBankCode("Ngân hàng lạ"), "");
});

test("deeplink đủ tham số theo đặc tả VietQR", () => {
  const url = bankDeeplink("icb", { account: "0123 456789", bank: "MB", amount: 128000, content: "DMABC234", holder: "NGUYEN VAN A", returnUrl: "https://datmon0210.web.app/" });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://dl.vietqr.io/pay");
  assert.equal(u.searchParams.get("app"), "icb");
  assert.equal(u.searchParams.get("ba"), "0123456789@mb");
  assert.equal(u.searchParams.get("am"), "128000");
  assert.equal(u.searchParams.get("tn"), "DMABC234");
  assert.equal(u.searchParams.get("bn"), "NGUYEN VAN A");
  assert.equal(u.searchParams.get("url"), "https://datmon0210.web.app/");
});

test("thiếu dữ liệu hoặc ngân hàng lạ -> không tạo liên kết", () => {
  assert.equal(bankDeeplink("mb", { account: "123456", bank: "Ngân hàng lạ", amount: 1000, content: "X" }), "");
  assert.equal(bankDeeplink("mb", { account: "123456", bank: "MB", amount: 0, content: "X" }), "");
  assert.equal(bankDeeplink("mb", { account: "12", bank: "MB", amount: 1000, content: "X" }), "");
});

test("danh sách app: id duy nhất, 5 app tự điền", () => {
  assert.equal(new Set(BANK_APPS.map((a) => a.id)).size, BANK_APPS.length);
  assert.deepEqual(BANK_APPS.filter((a) => a.autofill).map((a) => a.id).sort(), ["acb", "bidv", "icb", "mb", "ocb"]);
});
