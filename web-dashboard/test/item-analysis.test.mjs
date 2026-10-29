import test from "node:test";
import assert from "node:assert/strict";
import { itemChoices, itemSeries, analyzeItem } from "../item-analysis.js";
import { itemComboChart } from "../item-chart.js";

const keys = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
const docs = {
  "2026-10-26": { items: [{ name: "Cơm gà chiên mắm", qty: 4, revenue: 236000 }, { name: "Cafe sữa", qty: 5, revenue: 150000 }] },
  "2026-10-27": { items: [{ name: "Cơm gà chiên mắm", qty: 3, revenue: 177000 }, { name: "COMBO · Trà Ngon [1×Trà chanh nha đam + 1×Cơm gà chiên mắm]", qty: 2, revenue: 138000 }] },
  "2026-10-28": { items: [{ name: "Cơm gà chiên mắm", qty: 5, revenue: 250000 }, { name: "Cafe sữa", qty: 4, revenue: 120000 }] },
  "2026-10-29": { items: [{ name: "Cơm gà chiên mắm", qty: 6, revenue: 354000 }] },
  "2026-10-31": { items: [{ name: "Cafe sữa", qty: 9, revenue: 270000 }, { name: "Cơm gà chiên mắm", qty: 7, revenue: 413000 }] },
};

test("danh sách món gồm cả món chỉ nằm trong combo, nhiều nhất trước", () => {
  const c = itemChoices(docs, keys);
  assert.equal(c[0].name, "Cơm gà chiên mắm");
  assert.equal(c[0].retail, 25);
  assert.equal(c[0].inCombo, 2);
  assert.ok(c.some((x) => x.name === "Trà chanh nha đam" && x.retail === 0 && x.inCombo === 2));
});

test("chuỗi theo ngày: ngày thiếu snapshot không tính là 0", () => {
  const s = itemSeries(docs, keys, "cơm gà chiên mắm");
  assert.equal(s.length, 7);
  assert.equal(s[4].available, false);
  assert.equal(s[1].inCombo, 2);
  assert.equal(s[0].avgPrice, 59000);
});

test("phân tích: giá bình quân, đổi giá, xu hướng và lợi nhuận", () => {
  const series = itemSeries(docs, keys, "Cơm gà chiên mắm");
  const allRows = [
    { name: "Cơm gà chiên mắm", retail: 25, revenue: 1430000, unitCost: 22000 },
    { name: "Cafe sữa", retail: 18, revenue: 540000, unitCost: 6000 },
    { name: "A", retail: 10, revenue: 300000, unitCost: 9000 },
    { name: "B", retail: 3, revenue: 90000, unitCost: 15000 },
  ];
  const a = analyzeItem({ series, listPrice: 59000, unitCost: 22000, allRows, name: "Cơm gà chiên mắm", target: 0.4 });
  assert.equal(a.retail, 25);
  assert.equal(a.avgPrice, Math.round(1430000 / 25));
  assert.equal(a.soldDays, 5);
  assert.equal(a.missingDays, 2);
  assert.equal(a.best.dateKey, "2026-10-31");
  assert.equal(a.rankQty, 1);
  assert.equal(a.profit.unitMargin, a.avgPrice - 22000);
  assert.equal(a.profit.grossProfit, Math.round((a.avgPrice - 22000) * 25));
  assert.equal(a.profit.safePrice, 55000);
  assert.ok(a.profit.breakEvenDrop > 0 && a.profit.breakEvenDrop < 1);
  assert.ok(a.quadrant);
  assert.equal(a.trend, null); // chỉ 5 ngày có số liệu: chưa đủ 6 ngày để kết luận xu hướng
});

test("không có giá vốn thì không bịa lợi nhuận", () => {
  const series = itemSeries(docs, keys, "Cafe sữa");
  const a = analyzeItem({ series, listPrice: 30000, unitCost: null, allRows: [], name: "Cafe sữa" });
  assert.equal(a.profit, null);
  assert.equal(a.quadrant, null);
});

test("biểu đồ vẽ được kể cả khi giá không đổi và có ngày thiếu", () => {
  const svg = itemComboChart(itemSeries(docs, keys, "Cafe sữa"), { name: "Cafe sữa" });
  assert.match(svg, /<svg/);
  assert.match(svg, /polyline/);
  assert.equal(itemComboChart([], {}), "");
});
