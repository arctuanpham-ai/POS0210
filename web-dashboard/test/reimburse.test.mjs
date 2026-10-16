import test from "node:test";
import assert from "node:assert/strict";
import { asciiUpper, batchCode, changedAfterPaid, crc16, duplicateSuspects, needsReminder, payerQueues, receiptCode, reimbursementStatus, resolveBin, shortName, transferNote, validateBatchSelection, vietQrPayload } from "../reimburse.js";

const at = (d, h = 9) => new Date(2026, 9, d, h).getTime();

test("mã phiếu và tên viết tắt dễ đọc", () => {
  assert.equal(shortName("Phạm Thị Hương"), "HUONG");
  assert.equal(shortName(""), "KHAC");
  assert.equal(receiptCode({ id: "abc-7f3", purchaseDate: at(16), enteredByName: "Phạm Thị Hương" }), "PC1610-HUONG-7F3");
  assert.equal(receiptCode({ code: "GIU-NGUYEN" }), "GIU-NGUYEN");
  assert.equal(asciiUpper("Đá viên, 2 bao!"), "DA VIEN 2 BAO");
});

test("trạng thái hoàn ứng: phiếu cũ chưa rõ nguồn tiền không bị sót", () => {
  assert.equal(reimbursementStatus({ fundSource: "PERSONAL" }), "PENDING");
  assert.equal(reimbursementStatus({ fundSource: "PERSONAL", reimbursement: { status: "PAID" } }), "PAID");
  assert.equal(reimbursementStatus({ fundSource: "SHOP_CASH" }), "NONE");
  assert.equal(reimbursementStatus({}), "UNKNOWN");
  assert.equal(reimbursementStatus({ status: "DELETED", fundSource: "PERSONAL" }), "NONE");
});

test("nghi trùng: cùng người, cùng tiền, cách ≤ 1 ngày", () => {
  const r = [
    { id: "a", enteredByName: "Hương", total: 350000, purchaseDate: at(15) },
    { id: "b", enteredByName: "huong", total: 350000, purchaseDate: at(16, 8) },
    { id: "c", enteredByName: "Hương", total: 350000, purchaseDate: at(19) },
    { id: "d", enteredByName: "Tuấn", total: 350000, purchaseDate: at(15) },
    { id: "e", enteredByName: "Hương", total: 350000, purchaseDate: at(15), status: "DELETED" },
  ];
  const d = duplicateSuspects(r);
  assert.deepEqual([...d.keys()].sort(), ["a", "b"]);
});

test("hàng chờ theo người mua và tổng đã duyệt", () => {
  const q = payerQueues([
    { id: "1", enteredByName: "Hương", fundSource: "PERSONAL", total: 100, reimbursement: { status: "APPROVED" } },
    { id: "2", enteredByName: "Hương", fundSource: "PERSONAL", total: 50 },
    { id: "3", enteredByName: "Tuấn", fundSource: "SHOP_CASH", total: 999 },
    { id: "4", enteredByName: "Lan", total: 70 },
  ]);
  const h = q.find((x) => x.payer === "Hương");
  assert.equal(h.approvedTotal, 100);
  assert.equal(h.pendingTotal, 50);
  assert.equal(q.find((x) => x.payer === "Lan").UNKNOWN.length, 1);
  assert.equal(q.find((x) => x.payer === "Tuấn"), undefined);
});

test("mã đợt hoàn không trùng trong ngày, nội dung CK ngắn không dấu", () => {
  assert.equal(batchCode("Hương", at(16), []), "HU1610-HUONG");
  assert.equal(batchCode("Hương", at(16), ["HU1610-HUONG", "HU1610-HUONG-2"]), "HU1610-HUONG-3");
  assert.equal(transferNote("HU1610-HUONG", 3), "HU1610 HUONG 3 PHIEU");
});

test("một phiếu chỉ vào một đợt: chặn phiếu đã hoàn, đã huỷ, bị sửa tiền", () => {
  const sel = [{ id: "a", total: 100 }, { id: "b", total: 50 }, { id: "c", total: 30 }, { id: "d", total: 10 }];
  const fresh = [
    { id: "a", total: 100, fundSource: "PERSONAL", reimbursement: { status: "APPROVED" } },
    { id: "b", total: 50, fundSource: "PERSONAL", reimbursement: { status: "PAID" } },
    { id: "c", total: 35, fundSource: "PERSONAL", reimbursement: { status: "APPROVED" } },
    { id: "d", total: 10, status: "DELETED" },
  ];
  const v = validateBatchSelection(sel, fresh);
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 3);
  assert.ok(validateBatchSelection([sel[0]], fresh).ok);
});

test("sửa tiền sau khi hoàn và nhắc xác nhận", () => {
  assert.equal(changedAfterPaid({ total: 120, reimbursement: { paidAmount: 100 } }), 20);
  assert.equal(changedAfterPaid({ total: 120, reimbursement: {} }), 0);
  assert.equal(needsReminder({ status: "PAID", paidAt: 0 }, 2 * 86400000), true);
  assert.equal(needsReminder({ status: "PAID", paidAt: 0 }, 3600000), false);
  assert.equal(needsReminder({ status: "CONFIRMED", paidAt: 0 }, 9e12), false);
});

test("VietQR đúng chuẩn EMVCo (CRC16 và chuỗi mẫu tính độc lập)", () => {
  assert.equal(crc16("123456789"), 0x29b1);
  assert.equal(resolveBin("Vietcombank"), "970436");
  assert.equal(resolveBin("970422"), "970422");
  assert.equal(resolveBin("Ngân hàng lạ"), null);
  const p = vietQrPayload({ bank: "Vietcombank", account: "0123456789", holder: "Phạm Thị Hương", amount: 350000, info: "HU1610 HUONG 3 PHIEU" });
  assert.equal(p, "00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA530370454063500005802VN5914PHAM THI HUONG6009HAI PHONG62240820HU1610 HUONG 3 PHIEU63041321");
  assert.throws(() => vietQrPayload({ bank: "X", account: "1", amount: 1, info: "" }), /Chưa hỗ trợ/);
  assert.throws(() => vietQrPayload({ bank: "MB", account: "", amount: 1, info: "" }), /Thiếu số tài khoản/);
  assert.throws(() => vietQrPayload({ bank: "MB", account: "1", amount: 0, info: "" }), /Số tiền/);
});
