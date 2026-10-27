import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFoodApp, foodAppTotals, appLabel, parseMoneyInput, entryProblem, buildEntry, otherDeduction } from "../food-app.js";

test("tài liệu rỗng không làm hỏng", () => {
  const v = normalizeFoodApp(undefined);
  assert.equal(v.empty, true);
  assert.deepEqual(foodAppTotals(v), { pendingAmount: 0, pendingCount: 0, settledAmount: 0, feeAmount: 0, salesDays: 0, commission: 0, vat: 0, pit: 0, other: 0 });
});
test("tổng chờ, phí app và doanh thu ngày", () => {
  const v = normalizeFoodApp({
    updatedAt: 5,
    pending: { SHOPEE: { count: 2, amount: 150000 }, GRAB: { count: 1, amount: 80000 } },
    pendingOrders: [{ app: "GRAB", code: "GF1", amount: 80000, at: 1, billNo: "B1" }],
    settledOrders: [{ app: "SHOPEE", code: "SF9", amount: 100000, received: 75000, at: 2 }, { app: "GRAB", code: "G2", amount: 50000, received: 60000, at: 3 }],
    days: [{ date: "2026-10-25", SHOPEE: 100, GRAB: 50, SHOPEE_N: 1, GRAB_N: 1 }, { date: "2026-10-26", SHOPEE: 10, GRAB: 0 }],
  });
  const t = foodAppTotals(v);
  assert.equal(t.pendingAmount, 230000);
  assert.equal(t.pendingCount, 3);
  assert.equal(t.settledAmount, 150000);
  assert.equal(t.feeAmount, 25000); // đơn nhận nhiều hơn giá trị: phí không âm
  assert.equal(t.salesDays, 160);
  assert.equal(v.days[0].date, "2026-10-26");
  assert.equal(appLabel("GRAB"), "GrabFood");
});

test("ô nhập tiền và kiểm tra", () => {
  assert.equal(parseMoneyInput("37.933 đ"), 37933);
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput("1234567890123"), null);
  assert.match(entryProblem({ orderValue: null, received: 5 }), /giá trị đơn/);
  assert.match(entryProblem({ orderValue: 50000, received: null }), /thực nhận/);
  assert.match(entryProblem({ orderValue: 50000, received: 60000 }), /lớn hơn giá trị đơn/);
  assert.match(entryProblem({ orderValue: 50000, commission: 9817, vat: 1500, pit: 750, received: 40000 }), /lớn hơn giá trị đơn/);
  assert.equal(entryProblem({ orderValue: 50000, commission: 9817, vat: 1500, pit: 750, received: 37933 }), "");
  assert.equal(entryProblem({ orderValue: 50000, received: 0 }), "");
});
test("khoản trừ khác và tài liệu gửi máy POS", () => {
  const e = { orderValue: 50000, commission: 9817, vat: 1500, pit: 750, received: 37000 };
  assert.equal(otherDeduction(e), 933);
  const doc = buildEntry({ billId: "b1", app: "GRAB", code: "GF-824" }, { orderValue: 50000, commission: 9817, vat: 1500, pit: 750, received: 37933 }, "Lan", 9);
  assert.deepEqual(doc, { billId: "b1", app: "GRAB", code: "GF-824", orderValue: 50000, commission: 9817, vat: 1500, pit: 750, received: 37933, by: "Lan", at: 9, applied: false });
  assert.equal(normalizeFoodApp({ pendingOrders: [{ billId: "b1", app: "GRAB", code: "X", amount: 1, at: 1 }] }).pendingOrders[0].billId, "b1");
  const v = normalizeFoodApp({ settledOrders: [{ app: "GRAB", code: "G", amount: 50000, received: 37933, commission: 9817, vat: 1500, pit: 750, other: 0, at: 1 }] });
  const t = foodAppTotals(v);
  assert.equal(t.commission, 9817); assert.equal(t.vat, 1500); assert.equal(t.pit, 750); assert.equal(t.feeAmount, 12067);
});

test("foodInPeriod cộng đơn app food theo khoảng ngày", async () => {
  const { foodInPeriod } = await import("../food-app.js");
  const days = [
    { date: "2026-10-27", shopee: 0, grab: 50000, shopeeBills: 0, grabBills: 1 },
    { date: "2026-10-26", shopee: 30000, grab: 20000, shopeeBills: 1, grabBills: 2 },
  ];
  assert.deepEqual(foodInPeriod(days, "2026-10-27", "2026-10-28"), { shopee: 0, grab: 50000, shopeeBills: 0, grabBills: 1 });
  assert.equal(foodInPeriod(days, "2026-10-20", "2026-10-28").grabBills, 3);
});
