import test from "node:test";
import assert from "node:assert/strict";
import { buildCancelledReceipt, buildEditedReceipt, receiptToDraft } from "../expense-domain.js";

const GROUPS = [["THIT", "Thịt, gia cầm"], ["RAU", "Rau, củ, quả"], ["KHAC", "Vật tư khác"]];

const androidReceipt = {
  id: "p1", source: "ANDROID_POS", status: "ACTIVE", purchaseDate: 1000, note: "cũ", updatedAt: 5000, expenseCategory: "INVENTORY_PURCHASE", enteredByName: "Hương",
  items: [
    { id: "i1", materialName: "Gà", materialCode: "THIT-AAAAAAAAAAAA", expenseGroup: "Thịt, gia cầm", materialGroup: "Thịt, gia cầm", qty: 2, unit: "kg", unitPrice: 90000, amount: 180000 },
    { id: "i2", materialName: "Điện", materialCode: "pc_fixed", expenseGroup: "INVENTORY_PURCHASE", qty: 1, unit: "lần", unitPrice: 50000, amount: 50000 },
  ],
};

test("mở phiếu để sửa giữ id phiếu, id dòng và suy ra nhóm vật tư", () => {
  const draft = receiptToDraft(androidReceipt, GROUPS);
  assert.equal(draft.id, "p1");
  assert.deepEqual(draft.items.map((item) => item.id), ["i1", "i2"]);
  assert.equal(draft.items[0].expenseGroup, "Thịt, gia cầm");
  assert.equal(draft.items[1].expenseGroup, "Vật tư khác", "mã cũ không có nhóm thì về Vật tư khác, không hiện mã kỹ thuật");
});

test("nhóm lấy từ tiền tố mã khi dòng chưa có materialGroup", () => {
  const draft = receiptToDraft({ id: "x", purchaseDate: 1, items: [{ id: "a", materialName: "Rau", materialCode: "RAU-123", qty: 1, unitPrice: 1 }] }, GROUPS);
  assert.equal(draft.items[0].expenseGroup, "Rau, củ, quả");
});

test("sửa phiếu Android giữ source và đánh dấu editedBy, tính lại tổng", () => {
  const draft = receiptToDraft(androidReceipt, GROUPS);
  draft.note = "mới";
  draft.items[0].qty = 3;
  const saved = buildEditedReceipt(androidReceipt, draft, { now: 9000, uid: "web-uid" });
  assert.equal(saved.source, "ANDROID_POS");
  assert.equal(saved.editedBy, "WEB_MANAGER");
  assert.equal(saved.expenseCategory, "INVENTORY_PURCHASE");
  assert.equal(saved.note, "mới");
  assert.equal(saved.total, 270000 + 50000);
  assert.equal(saved.items[0].amount, 270000);
  assert.equal(saved.items[0].materialGroup, "Thịt, gia cầm");
  assert.equal(saved.status, "ACTIVE");
  assert.equal(saved.updatedAt, 9000);
});

test("sửa phiếu do Web tạo không thêm editedBy", () => {
  const original = { ...androidReceipt, source: "WEB_MANAGER" };
  const saved = buildEditedReceipt(original, receiptToDraft(original, GROUPS), { now: 9000, uid: "u" });
  assert.equal(saved.source, "WEB_MANAGER");
  assert.equal("editedBy" in saved, false);
});

test("updatedAt luôn tăng dù đồng hồ trình duyệt chậm hơn máy POS", () => {
  const saved = buildEditedReceipt(androidReceipt, receiptToDraft(androidReceipt, GROUPS), { now: 1, uid: "u" });
  assert.equal(saved.updatedAt, 5001);
});

test("huỷ phiếu đánh dấu DELETED, giữ nguyên các dòng", () => {
  const cancelled = buildCancelledReceipt(androidReceipt, { now: 9000, uid: "u" });
  assert.equal(cancelled.status, "DELETED");
  assert.equal(cancelled.editedBy, "WEB_MANAGER");
  assert.equal(cancelled.items.length, 2);
  assert.equal(cancelled.updatedAt, 9000);
  assert.equal(cancelled.cancelledAt, 9000);
});
