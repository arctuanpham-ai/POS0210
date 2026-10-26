import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFoodApp, foodAppTotals, appLabel } from "../food-app.js";

test("tài liệu rỗng không làm hỏng", () => {
  const v = normalizeFoodApp(undefined);
  assert.equal(v.empty, true);
  assert.deepEqual(foodAppTotals(v), { pendingAmount: 0, pendingCount: 0, settledAmount: 0, feeAmount: 0, salesDays: 0 });
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
