import test from "node:test";
import assert from "node:assert/strict";
import { filterExpenseReceipts, summarizeExpenseReceipts, vietnamDateRange } from "../expense-report.js";

const receipts = [
  { id: "PC-01", purchaseDate: 1_000, enteredByName: "Hương", status: "ACTIVE", total: 125_000, items: [
    { materialName: "Gà", materialCode: "THIT-001", expenseGroup: "Thịt, gia cầm", qty: 1, unit: "kg", unitPrice: 100_000, amount: 100_000 },
    { materialName: "Túi", materialCode: "BAOBI-001", expenseGroup: "Bao bì, vật tư phục vụ", qty: 10, unit: "cái", unitPrice: 2_500, amount: 25_000 },
  ] },
  { id: "PC-02", purchaseDate: 2_000, enteredByName: "Lan", status: "ACTIVE", total: 20_000, items: [
    { materialName: "Gà", materialCode: "THIT-001", expenseGroup: "Thịt, gia cầm", qty: 0.2, unit: "kg", unitPrice: 100_000, amount: 20_000 },
  ] },
  { id: "PC-HUY", purchaseDate: 2_000, enteredByName: "Lan", status: "CANCELLED", total: 999_000, items: [] },
];

test("lọc phiếu chi kết hợp và bỏ phiếu đã hủy", () => {
  const result = filterExpenseReceipts(receipts, { from: 900, to: 2_100, employee: "Hương", group: "Thịt, gia cầm", material: "ga", receiptId: "PC" });
  assert.deepEqual(result.map((receipt) => receipt.id), ["PC-01"]);
});

test("tổng hợp chi phí theo phiếu, dòng, nhóm và vật tư", () => {
  const report = summarizeExpenseReceipts(receipts);
  assert.equal(report.total, 145_000);
  assert.equal(report.receiptCount, 2);
  assert.equal(report.lineCount, 3);
  assert.deepEqual(report.byGroup, [{ key: "Thịt, gia cầm", total: 120_000 }, { key: "Bao bì, vật tư phục vụ", total: 25_000 }]);
  assert.deepEqual(report.byMaterial[0], { key: "Gà", total: 120_000, quantity: 1.2, unit: "kg", averageUnitPrice: 100_000 });
});

test("kỳ tra cứu dùng ngày Việt Nam, không phụ thuộc múi giờ thiết bị", () => {
  const range = vietnamDateRange(3, Date.parse("2026-10-11T18:00:00.000Z"));
  assert.equal(range.from, Date.parse("2026-10-09T17:00:00.000Z"));
  assert.equal(range.to, Date.parse("2026-10-12T17:00:00.000Z"));
});
