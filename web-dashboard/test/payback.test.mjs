import test from "node:test";
import assert from "node:assert/strict";
import { paybackStatus } from "../payback.js";

test("cộng dòng tiền ròng các tháng đã lưu và tháng đang chạy", () => {
  const p = paybackStatus({ initial: 300_000_000, closings: [{ monthKey: "2026-10", net: 20_000_000 }, { monthKey: "2026-11", net: 30_000_000 }], current: { monthKey: "2026-12", net: 5_000_000 } });
  assert.equal(p.recovered, 55_000_000);
  assert.equal(p.remaining, 245_000_000);
  assert.equal(Math.round(p.percent * 10) / 10, 18.3);
  assert.equal(p.avg, 25_000_000);
  assert.equal(p.monthsLeft, 245_000_000 / 25_000_000);
});
test("tháng đang chạy đã lưu thì không cộng hai lần", () => {
  const p = paybackStatus({ initial: 100, closings: [{ monthKey: "2026-10", net: 40 }], current: { monthKey: "2026-10", net: 99 } });
  assert.equal(p.recovered, 40);
});
test("tháng lỗ làm giảm số đã thu hồi; trung bình âm thì không ước tính", () => {
  const p = paybackStatus({ initial: 100, closings: [{ monthKey: "2026-10", net: -10 }] });
  assert.equal(p.recovered, -10); assert.equal(p.remaining, 110); assert.equal(p.percent, 0); assert.equal(p.monthsLeft, null);
});
test("chưa nhập vốn thì set=false; bỏ tháng trước khai trương", () => {
  const p = paybackStatus({ initial: 0, closings: [{ monthKey: "2026-08", net: 5 }, { monthKey: "2026-10", net: 7 }], openingMonth: "2026-09" });
  assert.equal(p.set, false); assert.equal(p.recovered, 7);
});
test("thu hồi đủ thì còn lại 0, 100%", () => {
  const p = paybackStatus({ initial: 50, closings: [{ monthKey: "2026-10", net: 60 }] });
  assert.equal(p.remaining, 0); assert.equal(p.percent, 100); assert.equal(p.monthsLeft, 0);
});
