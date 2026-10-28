import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyReport, lastMonthKeys, monthKeyOf, monthlyCsv, monthlyJson, startOfPreviousMonth } from "../monthly-report.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test("khoá tháng và cửa sổ tháng trước", () => {
  assert.equal(monthKeyOf(at(2026, 10, 1, 0)), "2026-10");
  assert.equal(monthKeyOf(new Date(2026, 8, 30, 23, 59).getTime()), "2026-09");
  assert.equal(startOfPreviousMonth(at(2026, 10, 14)), new Date(2026, 8, 1).getTime());
  assert.equal(startOfPreviousMonth(at(2026, 1, 5)), new Date(2025, 11, 1).getTime());
  assert.deepEqual(lastMonthKeys(3, at(2026, 1, 15)), ["2025-11", "2025-12", "2026-01"]);
});

const receipts = [
  { id: "a", purchaseDate: at(2026, 9, 3), total: 300000, items: [{ materialName: "Thịt", materialGroup: "Thịt, gia cầm", qty: 1, unitPrice: 300000 }] },
  { id: "b", purchaseDate: at(2026, 9, 20), total: 200000, detailLevel: "SUMMARY", items: [{ kind: "SUMMARY_LINE", materialName: "Tổng hợp · Rau, củ, quả", materialGroup: "Rau, củ, quả", qty: 1, unitPrice: 200000, amount: 200000 }] },
  { id: "c", purchaseDate: at(2026, 9, 21), total: 999999, status: "DELETED", items: [] },
  { id: "d", purchaseDate: at(2026, 10, 2), total: 100000, items: [{ materialName: "Lạ", qty: 1, unitPrice: 100000 }] },
  { id: "e", purchaseDate: at(2026, 7, 2), total: 5, items: [] },
];

test("tổng nhập theo tháng, tách phiếu tổng/chi tiết, bỏ phiếu huỷ và tháng ngoài danh sách", () => {
  const r = buildMonthlyReport({ receipts, monthlyDocs: { "2026-09": { revenue: 2000000, paidBills: 40, finalized: true } }, monthKeys: ["2026-09", "2026-10"], currentMonthKey: "2026-10", revenueFallback: 700000 });
  assert.equal(r[0].purchases, 500000);
  assert.equal(r[0].summaryAmount, 200000);
  assert.equal(r[0].itemizedAmount, 300000);
  assert.equal(r[0].receiptCount, 2);
  assert.equal(r[0].byGroup.THIT, 300000);
  assert.equal(r[0].byGroup.RAU, 200000);
  assert.equal(r[0].ratio, 0.25);
  assert.equal(r[0].revenueFinal, true);
  assert.equal(r[1].purchases, 100000);
  assert.equal(r[1].byGroup.KHAC, 100000);
  assert.equal(r[1].revenue, 700000); // dự phòng chỉ cho tháng hiện tại
  assert.equal(r[1].revenueSource, "dashboard.monthRevenue");
});

test("thiếu doanh thu thì tỷ lệ null, không phải 0; dự phòng không áp cho tháng cũ", () => {
  const r = buildMonthlyReport({ receipts, monthlyDocs: {}, monthKeys: ["2026-09", "2026-10"], currentMonthKey: "2026-10", revenueFallback: null });
  assert.equal(r[0].revenue, null);
  assert.equal(r[0].ratio, null);
  assert.equal(r[1].ratio, null);
  const z = buildMonthlyReport({ receipts, monthlyDocs: { "2026-09": { revenue: 0 } }, monthKeys: ["2026-09"] });
  assert.equal(z[0].revenue, 0);
  assert.equal(z[0].ratio, null);
  const old = buildMonthlyReport({ receipts, monthlyDocs: {}, monthKeys: ["2026-09"], currentMonthKey: "2026-10", revenueFallback: 5 });
  assert.equal(old[0].revenue, null);
});

test("CSV: có BOM, đủ cột, ô thiếu để trống, ký tự đặc biệt được bọc", () => {
  const r = buildMonthlyReport({ receipts, monthlyDocs: { "2026-09": { revenue: 2000000, paidBills: 40, finalized: true } }, monthKeys: ["2026-09", "2026-10"], currentMonthKey: "2026-10" });
  const csv = monthlyCsv(r);
  assert.ok(csv.startsWith("﻿thang,"));
  const [header, sep, oct] = csv.trim().split("\r\n");
  const cols = header.replace("﻿", "").split(",").length;
  assert.equal(sep.split(",").length, cols);
  assert.equal(oct.split(",").length, cols);
  assert.match(sep, /^2026-09,2000000,dashboardMonthly,true,40,500000,0\.2500,2,200000,300000/);
  assert.match(oct, /^2026-10,,,false,,100000,,1,/);
});

test("JSON mô tả có schema, nhóm vật tư và quy tắc đã học", () => {
  const r = buildMonthlyReport({ receipts, monthlyDocs: {}, monthKeys: ["2026-09"] });
  const json = JSON.parse(monthlyJson(r, { generatedAt: 1, rules: [{ name: "chanh day", group: "MUT" }] }));
  assert.equal(json.schema, "pos0210.monthly-purchases.v1");
  assert.equal(json.months.length, 1);
  assert.equal(json.learnedRules[0].group, "MUT");
  assert.ok(json.materialGroups.length >= 14);
});

test("CSV có cột app food khi tháng có sổ app food", async () => {
  const { monthlyCsv, buildMonthlyReport } = await import("../monthly-report.js");
  const rep = buildMonthlyReport({ receipts: [], monthlyDocs: {}, monthKeys: ["2026-10"], currentMonthKey: "2026-10", revenueFallback: 1000 }).map((r) => ({ ...r, food: { gross: 500, commission: 100, other: 20, vat: 5, pit: 2, accrual: 380, cashIn: 300 } }));
  const [header, row] = monthlyCsv(rep).replace("﻿", "").trim().split("\r\n");
  const h = header.split(","), v = row.split(",");
  assert.equal(h.length, v.length);
  assert.equal(v[h.indexOf("app_food_doanh_thu")], "500");
  assert.equal(v[h.indexOf("app_food_hoa_hong_phi")], "120");
  assert.equal(v[h.indexOf("app_food_thue_giu_ho")], "7");
  assert.equal(v[h.indexOf("app_food_rong")], "380");
  assert.equal(v[h.indexOf("app_food_tien_ve")], "300");
});
