import test from "node:test";
import assert from "node:assert/strict";
import { otherCostRows } from "../other-costs.js";
import { buildMonthlyReport } from "../monthly-report.js";

test("chi phí khác: bỏ bản sao phiếu chi và phiếu huỷ", () => {
  const purchases = [
    { id: "a", purchasedAt: 3, total: 500000, expenseCategory: "ELECTRICITY", paidByName: "Tuấn" },
    { id: "web:r1", purchasedAt: 2, total: 100000, expenseCategory: "INVENTORY_PURCHASE" },
    { id: "r2", purchasedAt: 2, total: 200000, expenseCategory: "INVENTORY_PURCHASE" },
    { id: "b", purchasedAt: 1, total: 300000, expenseCategory: "PAYROLL", status: "DELETED" },
    { id: "c", purchasedAt: 1, total: 0 },
  ];
  const rows = otherCostRows(purchases, new Set(["r2"]));
  assert.deepEqual(rows.map((r) => r.id), ["a"]);
  assert.equal(rows[0].category, "ELECTRICITY");
});

test("báo cáo tháng: phiếu POS lương/điện và chi phí khác không cộng vào nhập hàng", () => {
  const at = new Date(2026, 9, 5).getTime();
  const receipts = [
    { id: "x", purchaseDate: at, total: 100, items: [{ materialName: "Thịt", qty: 1, unitPrice: 100 }] },
    { id: "y", purchaseDate: at, total: 900, expenseCategory: "PAYROLL", items: [{ materialName: "Lương", qty: 1, unitPrice: 900 }] },
    { id: "z", purchaseDate: at, total: 50, expenseCategory: "INVENTORY_PURCHASE", items: [{ materialName: "Rau", qty: 1, unitPrice: 50 }] },
  ];
  const [r] = buildMonthlyReport({ receipts, monthKeys: ["2026-10"], otherCosts: [{ at, amount: 300, category: "ELECTRICITY" }] });
  assert.equal(r.purchases, 150);
  assert.equal(r.otherExpenses, 1200);
  assert.deepEqual(r.otherByCategory, { ELECTRICITY: 300, PAYROLL: 900 });
});
