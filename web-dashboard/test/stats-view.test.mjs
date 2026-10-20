import test from "node:test";
import assert from "node:assert/strict";
import { buildStats, funnelSteps, pct, lastDays, dayKeyVN } from "../stats-view.js";

const NOW = Date.UTC(2026, 9, 20, 10); // 17:00 20/10 giờ VN
test("các ngày gần nhất theo giờ VN, mới nhất trước", () => {
  assert.deepEqual(lastDays(NOW, 3), ["20261020", "20261019", "20261018"]);
});
test("gộp bộ đếm với đơn thật, bỏ đơn kiểm thử, tính cả khung giờ", () => {
  const stats = [{ id: "20261020", visit: 10, device: 6, menu: 9, add: 5, cart: 4, submit: 3, vh09: 4, vh14: 6 }, { id: "20261019", visit: 2, vh09: 2 }];
  const orders = [
    { name: "An", status: "paid", createdAt: NOW }, { name: "Bình", status: "expired", createdAt: NOW - 1000 },
    { name: "KIEM THU TU DONG", status: "paid", createdAt: NOW }, { name: "Chi", status: "done", createdAt: NOW - 86_400_000 },
  ];
  const { rows, total, hours } = buildStats(stats, orders, NOW, 7);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].created, 2); assert.equal(rows[0].paid, 1); assert.equal(rows[1].paid, 1);
  assert.equal(total.visit, 12); assert.equal(total.created, 3); assert.equal(total.paid, 2);
  assert.equal(hours[9], 6); assert.equal(hours[14], 6);
  assert.equal(dayKeyVN(NOW), "20261020");
});
test("phễu: % so với lượt vào và so với cấp trước, không chia cho 0", () => {
  const steps = funnelSteps({ visit: 10, menu: 8, add: 4, cart: 2, submit: 2, created: 1, paid: 1 });
  assert.equal(steps[2].ofVisit, 0.4); assert.equal(steps[2].ofPrev, 0.5);
  assert.equal(pct(0.4), "40%"); assert.equal(pct(null), "–");
  const empty = funnelSteps({});
  assert.equal(empty[0].ofVisit, null); assert.equal(empty[3].ofPrev, null);
});
