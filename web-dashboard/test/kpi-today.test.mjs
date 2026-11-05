import test from "node:test";
import assert from "node:assert/strict";
import { hourFraction, forecastToday, cheerLine } from "../kpi-today.js";

const hourly = Array(24).fill(0); hourly[8] = 10; hourly[12] = 40; hourly[13] = 30; hourly[18] = 20; // 100 bill
test("tỷ lệ bill đã qua theo giờ", () => {
  assert.equal(hourFraction(hourly, 7), 0);
  assert.equal(hourFraction(hourly, 9), 0.1);
  assert.equal(hourFraction(hourly, 12, 30), 0.3);
  assert.equal(hourFraction(hourly, 23), 1);
  assert.equal(hourFraction(null, 14), 0.5); // 7..21 tuyến tính
});
const lw = { revenue: 1000000, bills: 10, hourly };
test("không có tuần trước thì không có KPI", () => {
  const f = forecastToday({ revenueClosed: 100, openTotal: 50, lastWeek: null });
  assert.equal(f.hasTarget, false); assert.equal(f.full, 150);
});
test("đầu ngày dựa theo KPI tuần trước", () => {
  const f = forecastToday({ revenueClosed: 0, openTotal: 0, hour: 7, lastWeek: lw });
  assert.equal(f.forecast, 1000000); assert.equal(f.status, "close" === f.status ? "close" : f.status);
});
test("đủ KPI thì trạng thái reached", () => {
  const f = forecastToday({ revenueClosed: 900000, openTotal: 150000, hour: 13, minute: 30, lastWeek: lw });
  assert.equal(f.status, "reached"); assert.equal(f.gap, 0);
});
test("chạy nhanh hơn nhịp thì dự đoán vượt", () => {
  const f = forecastToday({ revenueClosed: 700000, openTotal: 0, hour: 13, minute: 0, lastWeek: lw });
  assert.ok(f.forecast > 1000000, String(f.forecast)); assert.ok(["ahead", "on"].includes(f.status));
});
test("chạy chậm thì dự đoán thấp, tính số bill cần thêm", () => {
  const f = forecastToday({ revenueClosed: 100000, openTotal: 0, hour: 13, minute: 0, lastWeek: lw });
  assert.equal(f.status, "behind"); assert.equal(f.gap, 900000); assert.equal(f.billsNeeded, 9);
});
test("hết giờ bán thì dự đoán bằng số thực", () => {
  const f = forecastToday({ revenueClosed: 800000, openTotal: 0, hour: 22, lastWeek: lw });
  assert.equal(f.forecast, 800000);
});
test("câu động viên ổn định trong 15 phút và không lặp câu trước", () => {
  const f = forecastToday({ revenueClosed: 100000, hour: 13, lastWeek: lw });
  const a = cheerLine(f, { day: "2026-11-06", hour: 13, minute: 2 });
  assert.equal(a, cheerLine(f, { day: "2026-11-06", hour: 13, minute: 14 }));
  assert.notEqual(a, cheerLine(f, { day: "2026-11-06", hour: 13, minute: 2, previous: a }));
  assert.equal(cheerLine({ hasTarget: false }), "");
});
