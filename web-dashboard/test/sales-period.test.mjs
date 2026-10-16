import test from "node:test";
import assert from "node:assert/strict";
import { changePct, monthSeries, periodPlan } from "../sales-snapshot-view.js";

const now = new Date(2026, 9, 16, 12);
test("kỳ xem doanh thu", () => {
  assert.equal(periodPlan("7d", now).dayKeys.length, 7);
  const tm = periodPlan("thisMonth", now);
  assert.equal(tm.dayKeys[0], "2026-10-01"); assert.equal(tm.dayKeys.at(-1), "2026-10-16"); assert.equal(tm.byMonth, false);
  const lm = periodPlan("lastMonth", now);
  assert.equal(lm.dayKeys.length, 30); assert.equal(lm.dayKeys[0], "2026-09-01"); assert.deepEqual(lm.monthKeys, ["2026-09"]);
  const y = periodPlan("12m", now);
  assert.equal(y.monthKeys.length, 12); assert.equal(y.monthKeys[0], "2025-11"); assert.equal(y.monthKeys.at(-1), "2026-10"); assert.equal(y.byMonth, true);
  assert.equal(y.dayKeys[0], "2025-11-01"); assert.equal(y.dayKeys.at(-1), "2026-10-16");
  assert.deepEqual(periodPlan("3m", now).monthKeys, ["2026-08", "2026-09", "2026-10"]);
});
test("doanh thu theo tháng: ưu tiên snapshot tháng, thiếu thì cộng ngày, không có thì chưa có", () => {
  const s = monthSeries(["2026-08", "2026-09", "2026-10"], { "2026-09": { revenue: 30_000_000, paidBills: 500 } }, { "2026-10-01": { revenue: 1_000_000, paidBills: 20 }, "2026-10-02": { revenue: 500_000, paidBills: 10 }, "2026-10-03": null });
  assert.deepEqual(s.map((x) => [x.monthKey, x.available, x.source, x.revenue]), [["2026-08", false, "none", null], ["2026-09", true, "monthly", 30_000_000], ["2026-10", true, "daily", 1_500_000]]);
  assert.equal(changePct(110, 100).toFixed(2), "0.10");
  assert.equal(changePct(5, 0), null);
});
