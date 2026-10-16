import test from "node:test";
import assert from "node:assert/strict";
import { aggregateItems, dailyKeys, dateKeyOf, liveSummary, serviceStatusLabel, summarizeDaily } from "../sales-snapshot-view.js";

const NOW = new Date(2026, 9, 13, 10, 0, 0); // 13/10/2026

test("chọn 3 hoặc 7 ngày cho đúng số document, từ cũ đến mới", () => {
  assert.deepEqual(dailyKeys(3, NOW), ["2026-10-11", "2026-10-12", "2026-10-13"]);
  assert.equal(dailyKeys(7, NOW).length, 7);
  assert.equal(dailyKeys(7, NOW)[0], "2026-10-07");
  assert.equal(dailyKeys(5, NOW).length, 7, "giá trị lạ rơi về 7 ngày");
});

test("7 ngày đi qua đầu tháng vẫn đúng", () => {
  const keys = dailyKeys(7, new Date(2026, 9, 3));
  assert.equal(keys[0], "2026-09-27");
  assert.equal(keys.at(-1), "2026-10-03");
  assert.equal(dateKeyOf(new Date(2026, 0, 5)), "2026-01-05");
});

test("ngày thiếu snapshot là không có dữ liệu chứ không phải 0 đồng", () => {
  const keys = dailyKeys(3, NOW);
  const docs = {
    "2026-10-11": { revenue: 300000, paidBills: 3, finalized: true },
    "2026-10-13": { revenue: 100000, paidBills: 1, finalized: false },
  };
  const summary = summarizeDaily(docs, keys, "2026-10-13");
  const missing = summary.days.find((day) => day.dateKey === "2026-10-12");
  assert.equal(missing.available, false);
  assert.equal(missing.revenue, null);
  assert.deepEqual(summary.unavailableDays, ["2026-10-12"]);
  assert.equal(summary.complete, false);
  assert.equal(summary.totalRevenue, 400000);
  assert.equal(summary.totalBills, 4);
  assert.equal(summary.averageBill, 100000);
});

test("ngày đã qua mà POS chưa chốt thì được cảnh báo", () => {
  const keys = dailyKeys(3, NOW);
  const docs = {
    "2026-10-11": { revenue: 1, paidBills: 1, finalized: true },
    "2026-10-12": { revenue: 2, paidBills: 1, finalized: false },
    "2026-10-13": { revenue: 3, paidBills: 1, finalized: false },
  };
  const summary = summarizeDaily(docs, keys, "2026-10-13");
  assert.deepEqual(summary.needsFinalizeDays, ["2026-10-12"]);
  assert.equal(summary.complete, true);
});

test("không có bill thì bill trung bình là 0, không chia cho 0", () => {
  const summary = summarizeDaily({ "2026-10-13": { revenue: 0, paidBills: 0, finalized: false } }, ["2026-10-13"], "2026-10-13");
  assert.equal(summary.days[0].averageBill, 0);
  assert.equal(summary.averageBill, 0);
});

test("gộp món theo itemId qua nhiều ngày và tính tỷ trọng", () => {
  const keys = ["2026-10-12", "2026-10-13"];
  const docs = {
    "2026-10-12": { items: [{ itemId: "m1", name: "Cà phê", qty: 2, revenue: 60000 }, { itemId: "m2", name: "Trà", qty: 1, revenue: 20000 }] },
    "2026-10-13": { items: [{ itemId: "m1", name: "Cà phê", qty: 3, revenue: 90000 }] },
  };
  const rows = aggregateItems(docs, keys, "combined");
  assert.equal(rows[0].itemId, "m1");
  assert.equal(rows[0].qty, 5);
  assert.equal(rows[0].revenue, 150000);
  assert.ok(Math.abs(rows[0].share - 150000 / 170000) < 1e-9);
  assert.equal(rows[1].itemId, "m2");
});

test("xem món theo từng ngày bỏ qua ngày không có snapshot", () => {
  const docs = { "2026-10-13": { items: [{ itemId: "m1", name: "Cà phê", qty: 1, revenue: 30000 }] } };
  const byDay = aggregateItems(docs, ["2026-10-12", "2026-10-13"], "byDay");
  assert.equal(byDay.length, 1);
  assert.equal(byDay[0].dateKey, "2026-10-13");
  assert.equal(byDay[0].rows[0].share, 1);
});

test("document thiếu items hoặc dữ liệu lạ không làm hỏng thống kê", () => {
  assert.deepEqual(aggregateItems({ "2026-10-13": {} }, ["2026-10-13"], "combined"), []);
  assert.deepEqual(aggregateItems(undefined, ["2026-10-13"], "combined"), []);
});

test("bàn mở: tạm tính cộng riêng, sắp theo giờ mở", () => {
  const live = liveSummary({
    liveTables: [
      { id: "t2", name: "Bàn 2", openedAt: 2000, currentTotal: 50000, serviceStatus: "WAITING" },
      { id: "t1", name: "Bàn 1", openedAt: 1000, currentTotal: 80000, serviceStatus: "" },
    ],
    revenueToday: 999999,
  });
  assert.equal(live.available, true);
  assert.equal(live.openTables, 2);
  assert.equal(live.provisionalTotal, 130000);
  assert.deepEqual(live.tables.map((table) => table.id), ["t1", "t2"]);
});

test("POS bản cũ chưa gửi liveTables thì báo không có sẵn để Web dùng cách cũ", () => {
  assert.equal(liveSummary({ openTables: 3 }).available, false);
  assert.equal(liveSummary(undefined).available, false);
  assert.equal(liveSummary({ liveTables: [] }).available, true);
});

test("nhãn trạng thái phục vụ bằng tiếng Việt", () => {
  assert.equal(serviceStatusLabel("SERVED"), "Đã phục vụ");
  assert.equal(serviceStatusLabel("WAITING"), "Đã gửi bếp");
  assert.equal(serviceStatusLabel(""), "Đang gọi món");
});

import { periodDailySummary } from "../sales-snapshot-view.js";
const dayRange = (y, m, d1, d2) => ({ from: new Date(y, m, d1).getTime(), to: new Date(y, m, d2 + 1).getTime() });

test("Hôm qua lấy doanh thu từ dashboardDaily của đúng ngày đó", () => {
  const docs = { "2026-10-12": { revenue: 500000, paidBills: 5, finalized: true } };
  const summary = periodDailySummary(dayRange(2026, 9, 12, 12), docs, NOW);
  assert.equal(summary.totalRevenue, 500000);
  assert.equal(summary.totalBills, 5);
  assert.equal(summary.complete, true);
});

test("7 ngày cộng các ngày có snapshot và báo thiếu những ngày chưa có", () => {
  const docs = { "2026-10-12": { revenue: 100, paidBills: 1 }, "2026-10-13": { revenue: 50, paidBills: 1 } };
  const summary = periodDailySummary(dayRange(2026, 9, 7, 13), docs, NOW);
  assert.equal(summary.totalRevenue, 150);
  assert.equal(summary.complete, false);
  assert.equal(summary.unavailableDays.length, 5);
});

test("khoảng ngoài 7 ngày gần nhất hoặc không giới hạn thì không dùng snapshot", () => {
  assert.equal(periodDailySummary(dayRange(2026, 9, 1, 13), {}, NOW), null);
  assert.equal(periodDailySummary({ from: -Infinity, to: Infinity }, {}, NOW), null);
  assert.equal(periodDailySummary(dayRange(2026, 8, 1, 3), {}, NOW), null);
});

test("thống kê món cộng chung món trùng tên khác mã", () => {
  const docs = { "2026-10-13": { items: [{ itemId: "d", name: "Bún gà 40 ", qty: 2, revenue: 80000 }, { itemId: "e", name: "bún gà 40", qty: 3, revenue: 120000 }] }, "2026-10-14": { items: [{ itemId: "e", name: "Bún gà 40", qty: 1, revenue: 40000 }] } };
  const rows = aggregateItems(docs, ["2026-10-13", "2026-10-14"], "combined");
  assert.equal(rows.length, 1); assert.equal(rows[0].qty, 6); assert.equal(rows[0].revenue, 240000);
  const byDay = aggregateItems(docs, ["2026-10-13"], "byDay");
  assert.equal(byDay[0].rows.length, 1); assert.equal(byDay[0].rows[0].qty, 5);
});
