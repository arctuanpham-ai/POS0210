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

import { bankOf, canTreasure, hashPin, isMine, legacyOpenReceipts, memberByPinHash, memberId, memberOf, myAlerts, validPin } from "../reimburse.js";

const members = [
  { id: "huong-a1b2", name: "Phạm Thị Hương", role: "NGUOI_MUA", bank: "MB", account: "0909", holder: "PHAM THI HUONG" },
  { id: "lan-c3d4", name: "Lan", role: "THU_QUY" },
];
test("PIN: 4–6 số, băm cố định, tìm đúng người đang hoạt động", async () => {
  assert.ok(validPin("1234") && validPin("123456") && !validPin("123") && !validPin("12a4") && !validPin("1234567"));
  const h = await hashPin("1234");
  assert.equal(h.length, 64); assert.equal(h, await hashPin("1234")); assert.notEqual(h, await hashPin("1235"));
  const list = [{ id: "a", pinHash: h }, { id: "b", pinHash: await hashPin("9999"), active: false }];
  assert.equal(memberByPinHash(list, h).id, "a");
  assert.equal(memberByPinHash(list, await hashPin("9999")), null);
  assert.equal(memberId("Phạm Thị Hương", "x1y2"), "pham-thi-huong-x1y2");
});
test("người mua: theo mã người dùng trước, phiếu cũ khớp theo tên", () => {
  assert.equal(memberOf({ payerId: "huong-a1b2" }, members).name, "Phạm Thị Hương");
  assert.equal(memberOf({ enteredByName: "pham thi huong" }, members).id, "huong-a1b2");
  assert.equal(memberOf({ enteredByName: "Ai đó" }, members), null);
  assert.ok(isMine({ payerId: "lan-c3d4" }, "lan-c3d4"));
  assert.ok(!isMine({ payerId: "" }, ""));
  assert.ok(canTreasure("THU_QUY") && canTreasure("CHU_QUAN") && !canTreasure("NGUOI_MUA"));
});
test("tài khoản nhận: hồ sơ người dùng trước, danh sách cũ sau", () => {
  assert.equal(bankOf({ payerId: "huong-a1b2" }, members, []).from, "member");
  assert.equal(bankOf({ enteredByName: "Lan" }, members, [{ name: "Lan", bank: "VCB", account: "1" }]).from, "payee");
  assert.equal(bankOf({ enteredByName: "Lan" }, members, []), null);
});
test("phiếu cũ chưa gắn người dùng còn mở được gắn theo tên", () => {
  const rs = [
    { id: "1", enteredByName: "Phạm Thị Hương", fundSource: "PERSONAL" },
    { id: "2", enteredByName: "Phạm Thị Hương", fundSource: "PERSONAL", payerId: "huong-a1b2" },
    { id: "3", enteredByName: "Phạm Thị Hương", fundSource: "SHOP_CASH" },
    { id: "4", enteredByName: "Phạm Thị Hương", fundSource: "PERSONAL", reimbursement: { status: "CONFIRMED" } },
  ];
  assert.deepEqual(legacyOpenReceipts(members[0], rs).map((r) => r.id), ["1"]);
});
test("cảnh báo người mua: bị trả lại, chờ xác nhận, thiếu tài khoản", () => {
  const now = 10 * 86400000;
  const receipts = [
    { id: "a", payerId: "lan", fundSource: "PERSONAL", total: 100, reimbursement: { status: "REJECTED", rejectReason: "mờ" } },
    { id: "b", payerId: "lan", fundSource: "PERSONAL", total: 50 },
    { id: "c", payerId: "khac", fundSource: "PERSONAL", total: 70 },
  ];
  const batches = [{ id: "z", status: "PAID", payerId: "lan", amount: 200, paidAt: now - 2 * 86400000, payer: "Lan" }];
  const a = myAlerts({ myId: "lan", role: "NGUOI_MUA", me: {}, receipts, batches, now });
  assert.deepEqual(a.items.map((x) => x.key), ["rejected", "confirm", "waiting", "bank"]);
  assert.equal(a.badge, 3);
  assert.match(a.items[1].text, /quá 1 ngày/);
  const ok = myAlerts({ myId: "lan", role: "NGUOI_MUA", me: { bank: "MB", account: "1" }, receipts: [], batches: [], now });
  assert.equal(ok.badge, 0); assert.equal(ok.items.length, 0);
});
test("cảnh báo thủ quỹ: chờ duyệt, chờ hoàn, chưa rõ nguồn, thiếu tài khoản, chưa xác nhận", () => {
  const now = 10 * 86400000;
  const receipts = [
    { id: "a", enteredByName: "Lan", fundSource: "PERSONAL", total: 100 },
    { id: "b", enteredByName: "Tú", fundSource: "PERSONAL", total: 50, reimbursement: { status: "APPROVED" } },
    { id: "c", enteredByName: "Tú", total: 70 },
  ];
  const batches = [{ id: "z", status: "PAID", payerId: "huong-a1b2", payer: "Hương", amount: 1, paidAt: now - 3 * 86400000 }];
  const a = myAlerts({ myId: "lan-c3d4", role: "THU_QUY", me: { bank: "MB", account: "1" }, receipts, batches, members, now });
  assert.deepEqual(a.items.map((x) => x.key), ["approve", "pay", "unknown", "nobank", "late"]);
  assert.equal(a.badge, 3);
});

import { selfReviewBlocked } from "../reimburse.js";
test("chủ quán cũng là người mua: phiếu của mình để thủ quỹ duyệt, không tự duyệt", () => {
  const ms = [{ id: "tuan", role: "CHU_QUAN", bank: "MB", account: "1" }, { id: "lan", role: "THU_QUY" }];
  const r = { id: "x", payerId: "tuan", fundSource: "PERSONAL", total: 90 };
  assert.ok(selfReviewBlocked(r, "tuan", ms));
  assert.ok(!selfReviewBlocked(r, "lan", ms));
  assert.ok(!selfReviewBlocked(r, "tuan", [ms[0]]), "chưa có thủ quỹ thì chủ quán vẫn tự duyệt được");
  const owner = myAlerts({ myId: "tuan", role: "CHU_QUAN", me: ms[0], receipts: [r], members: ms });
  assert.deepEqual(owner.items.map((x) => x.key), ["waiting"]);
  const tq = myAlerts({ myId: "lan", role: "THU_QUY", me: { bank: "MB", account: "2" }, receipts: [r], members: ms });
  assert.deepEqual(tq.items.map((x) => x.key), ["approve"]);
});

import { bankDeeplink } from "../reimburse.js";
test("deeplink mở app ngân hàng người chuyển, điền sẵn người nhận / số tiền / nội dung", () => {
  const url = bankDeeplink({ fromBank: "MB", toBank: "VietinBank", account: "0936 539 689", holder: "Phạm Anh Tuấn", amount: 4010000, info: "HU1610 TUAN 1 PHIEU" });
  assert.equal(url, "https://dl.vietqr.io/pay?app=mb&ba=0936539689%40icb&am=4010000&tn=HU1610+TUAN+1+PHIEU&bn=PHAM+ANH+TUAN");
  assert.equal(bankDeeplink({ fromBank: "Cake", toBank: "MB", account: "1", amount: 1, info: "x" }), null);
});
