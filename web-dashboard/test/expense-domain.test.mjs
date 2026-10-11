import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateReceiptTotal,
  createStableDraft,
  filterReceipts,
  rangeForVietnamPeriod,
  validateReceipt,
} from "../expense-domain.js";

test("calculates a receipt containing multiple material lines", () => {
  assert.equal(calculateReceiptTotal([{ qty: 2, unitPrice: 30000 }, { qty: 0.5, unitPrice: 120000 }]), 120000);
});

test("keeps one receipt id when an offline draft is retried", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = createStableDraft(storage, { uid: "staff-1", displayName: "Lan" }, () => "receipt-1");
  const retry = createStableDraft(storage, { uid: "staff-1", displayName: "Lan" }, () => "receipt-2");
  assert.equal(first.id, "receipt-1");
  assert.equal(retry.id, "receipt-1");
});

test("rejects a receipt with invalid material line before cloud write", () => {
  assert.deepEqual(validateReceipt({ id: "r1", purchaseDate: 1, items: [{ materialName: "Gà", qty: 0, unit: "kg", unitPrice: 100 }] }), { ok: false, error: "Dòng 1: số lượng phải lớn hơn 0" });
});

test("builds Vietnam-local three-day window including today", () => {
  const now = new Date("2026-10-11T22:00:00+07:00");
  const range = rangeForVietnamPeriod("3d", now);
  assert.equal(range.from, Date.parse("2026-10-08T17:00:00Z"));
  assert.equal(range.to, Date.parse("2026-10-11T17:00:00Z"));
});

test("combines cached receipt filters", () => {
  const rows = [
    { id: "a", enteredByName: "Lan", expenseGroup: "FOOD", items: [{ materialCode: "GA", materialName: "Gà", subcategoryId: "chicken" }] },
    { id: "b", enteredByName: "Huy", expenseGroup: "DRINK", items: [{ materialCode: "CF", materialName: "Cà phê", subcategoryId: "coffee" }] },
  ];
  assert.deepEqual(filterReceipts(rows, { staff: "Lan", group: "FOOD", material: "gà" }).map((x) => x.id), ["a"]);
});
