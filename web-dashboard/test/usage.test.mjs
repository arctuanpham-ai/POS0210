import test from "node:test";
import assert from "node:assert/strict";
import { dayUsage, usageTrend, pacificDay, nextReset, lastPacificDays } from "../usage.js";

test("ngày Pacific và mốc reset", () => {
  const t = Date.UTC(2026, 9, 16, 16, 0); // 23:00 VN 16-10 = 09:00 PDT 16-10
  assert.equal(pacificDay(t), "2026-10-16");
  assert.equal(new Date(nextReset(t)).toISOString(), "2026-10-17T07:00:00.000Z"); // 14:00 VN
  assert.deepEqual(lastPacificDays(3, t), ["2026-10-14", "2026-10-15", "2026-10-16"]);
});
test("cộng ghi máy POS + web, đọc của web", () => {
  const d = dayUsage({ day: "x", app: { total: 3000, sales: 2000 }, web: { devices: { a: { reads: 1200, writes: 40 }, b: { reads: 300, writes: 10, deletes: 2 } } } });
  assert.equal(d.writes.used, 3050); assert.equal(d.writes.remaining, 16950);
  assert.equal(d.reads.used, 1500); assert.equal(d.reads.pct, 3);
  assert.equal(d.deletes.used, 2); assert.equal(d.categories.sales, 2000);
});
test("cảnh báo ngày tăng vọt và gần hạn mức", () => {
  const mk = (w, r) => dayUsage({ day: "d", app: { total: w }, web: { devices: { a: { reads: r } } } });
  const t = usageTrend([mk(2000, 1000), mk(2200, 1000), mk(16000, 40000)]);
  assert.equal(t[0].flags.length, 0);
  assert.ok(t[2].flags.some((f) => f.startsWith("ghi tăng")));
  assert.ok(t[2].flags.includes("ghi 80% hạn mức"));
  assert.ok(t[2].flags.includes("đọc 80% hạn mức"));
});
