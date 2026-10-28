import test from "node:test";
import assert from "node:assert/strict";
import { fundMonth, prevMonthKey } from "../fund-close.js";
import { countsAsCost, initialReview, reviewStatus } from "../reimburse.js";

const at = (d) => new Date(2026, 9, d, 10).getTime();
test("duyệt phiếu: phiếu chờ / bị trả lại chưa tính chi phí; phiếu cũ coi như đã duyệt", () => {
  assert.equal(reviewStatus({ status: "ACTIVE" }), "APPROVED");
  assert.equal(reviewStatus({ fundSource: "PERSONAL", reimbursement: { status: "PENDING" } }), "PENDING");
  assert.equal(reviewStatus({ fundSource: "SHOP_CASH", review: "PENDING" }), "PENDING");
  assert.equal(reviewStatus({ status: "CANCELLED", review: "APPROVED" }), "NONE");
  assert.ok(!countsAsCost({ review: "REJECTED" }));
  const ms = [{ id: "tuan", role: "CHU_QUAN" }, { id: "trang", role: "THU_QUY" }];
  assert.equal(initialReview("trang", ms), "PENDING");
  assert.equal(initialReview("tuan", [ms[0]]), "APPROVED", "quán chỉ có một người duyệt thì không chặn");
  assert.equal(prevMonthKey("2026-01"), "2025-12");
});
test("đối soát quỹ tháng: ví dụ đầu kỳ 0, chia đôi", () => {
  const receipts = [
    { id: "a", purchaseDate: at(2), total: 25_000_000, fundSource: "SHOP_CASH", review: "APPROVED" },
    { id: "b", purchaseDate: at(3), total: 3_000_000, fundSource: "PERSONAL", reimbursement: { status: "CONFIRMED" } },
    { id: "c", purchaseDate: at(4), total: 2_000_000, fundSource: "PERSONAL", reimbursement: { status: "APPROVED" } },
    { id: "d", purchaseDate: at(5), total: 1_000_000, fundSource: "SHOP_CASH", review: "APPROVED", expenseCategory: "ADDITIONAL_INVESTMENT" },
    { id: "e", purchaseDate: at(6), total: 500_000, fundSource: "SHOP_CASH", review: "PENDING" },
    { id: "f", purchaseDate: at(1), total: 40_000_000, fundSource: "SHOP_CASH", review: "APPROVED", expenseCategory: "INITIAL_INVESTMENT_SUNK" },
  ];
  const movements = [{ type: "PAYER_REIMBURSEMENT", amount: 3_000_000, occurredAt: at(10) }];
  const r = fundMonth({ monthKey: "2026-10", revenue: 60_000_000, receipts, movements, opening: 0, partners: [{ name: "Tuấn", shareBasisPoints: 5000 }, { name: "Trang", shareBasisPoints: 5000 }] });
  assert.equal(r.operating, 30_000_000);
  assert.equal(r.investment, 1_000_000);
  assert.equal(r.net, 29_000_000);
  assert.equal(r.fromFund, 26_000_000);
  assert.equal(r.expected, 60_000_000 - 26_000_000 - 3_000_000);
  assert.equal(r.owedTotal, 2_000_000);
  assert.equal(r.distributable, 29_000_000);
  assert.equal(r.mismatch, 0);
  assert.deepEqual(r.shares.map((s) => s.amount), [14_500_000, 14_500_000]);
  assert.deepEqual(r.pending, { count: 1, total: 500_000 });
  const counted = fundMonth({ monthKey: "2026-10", revenue: 60_000_000, receipts, movements, opening: 0, cashCounted: 5_000_000, bankBalance: 25_500_000, reserve: 0 });
  assert.equal(counted.actual, 30_500_000);
  assert.equal(counted.diff, -500_000);
  assert.equal(counted.distributable, 28_500_000);
});

test("app food: lãi theo ngày bán, quỹ theo tiền về", async () => {
  const { fundMonth } = await import("../fund-close.js");
  const base = fundMonth({ monthKey: "2026-10", revenue: 1000000 });
  const withFood = fundMonth({ monthKey: "2026-10", revenue: 1000000, foodAccrual: 200000, foodCash: 150000 });
  assert.equal(withFood.net - base.net, 200000);
  assert.equal(withFood.expected - base.expected, 150000);
  assert.equal(withFood.foodAccrual, 200000);
  assert.equal(base.foodAccrual, 0);
});
