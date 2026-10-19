// Hàm thuần: nhập hàng theo tháng so với doanh thu tháng, và xuất CSV/JSON cho phân tích AI.
// Không đọc Firebase, không có DOM. Doanh thu thiếu thì tỷ lệ là null, không bao giờ là 0.
import { MATERIAL_GROUPS, groupCodeOrNull, groupLabelOf, isSummaryReceipt } from "./expense-rules.js?v=20261019-08";

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM" theo giờ máy đang xem. */
export const monthKeyOf = (ms) => { const d = new Date(Number(ms)); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

/** Mốc đầu tháng liền trước của `now`. Đây là cửa sổ phiếu tối thiểu web luôn giữ (≥ 30 ngày). */
export const startOfPreviousMonth = (now = Date.now()) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); };

/** Các tháng từ cũ đến mới, kết thúc ở tháng của `now`. */
export const lastMonthKeys = (count, now = Date.now()) => {
  const d = new Date(now);
  return Array.from({ length: count }, (_, i) => monthKeyOf(new Date(d.getFullYear(), d.getMonth() - (count - 1 - i), 1).getTime()));
};

const isActive = (receipt) => receipt && receipt.status !== "DELETED" && receipt.status !== "CANCELLED";

const itemAmount = (item) => Number(item.amount ?? Number(item.qty || 0) * Number(item.unitPrice || 0));

const groupOfItem = (item) =>
  groupCodeOrNull(item.materialGroup) || groupCodeOrNull(item.expenseGroup) ||
  (String(item.materialCode || "").includes("-") ? groupCodeOrNull(String(item.materialCode).split("-")[0]) : null) || "KHAC";

/**
 * Một dòng cho mỗi tháng trong monthKeys.
 * - purchases: tổng phiếu chưa huỷ theo purchaseDate (đúng tổng phiếu, không cộng lại từ dòng).
 * - summaryAmount/itemizedAmount: tách phiếu tổng và phiếu chi tiết.
 * - byGroup: chia theo nhóm từ dòng của phiếu; tổng nhóm luôn bằng purchases khi phiếu khớp tổng dòng.
 * - revenue: từ monthlyDocs[monthKey].revenue; thiếu thì dùng revenueFallback (chỉ cho tháng hiện tại), không có thì null.
 * - ratio: purchases / revenue, null khi không có doanh thu hoặc doanh thu <= 0.
 */
export const buildMonthlyReport = ({ receipts, monthlyDocs = {}, monthKeys, currentMonthKey = null, revenueFallback = null, otherCosts = [] }) => {
  const rows = new Map(monthKeys.map((key) => [key, { monthKey: key, receiptCount: 0, purchases: 0, summaryAmount: 0, itemizedAmount: 0, byGroup: {}, otherExpenses: 0, otherByCategory: {} }]));
  const addOther = (row, category, amount) => { row.otherExpenses += amount; row.otherByCategory[category] = (row.otherByCategory[category] || 0) + amount; };
  for (const c of Array.isArray(otherCosts) ? otherCosts : []) {
    const row = rows.get(monthKeyOf(c.at));
    if (row && Number(c.amount) > 0) addOther(row, c.category || "OTHER_EXPENSE", Number(c.amount));
  }
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    if (!isActive(receipt)) continue;
    const row = rows.get(monthKeyOf(receipt.purchaseDate));
    if (!row) continue;
    const total = Number(receipt.total || 0);
    // Phiếu từ máy POS có thể là lương, điện, nước…: không phải nhập hàng, tính vào chi phí khác.
    if (receipt.expenseCategory && receipt.expenseCategory !== "INVENTORY_PURCHASE") { addOther(row, receipt.expenseCategory, total); continue; }
    row.receiptCount += 1;
    row.purchases += total;
    if (isSummaryReceipt(receipt)) row.summaryAmount += total; else row.itemizedAmount += total;
    for (const item of receipt.items || []) {
      const group = groupOfItem(item);
      row.byGroup[group] = (row.byGroup[group] || 0) + itemAmount(item);
    }
  }
  return monthKeys.map((key) => {
    const row = rows.get(key);
    const doc = monthlyDocs[key];
    const docRevenue = doc && Number.isFinite(Number(doc.revenue)) ? Number(doc.revenue) : null;
    const fallback = key === currentMonthKey && Number.isFinite(Number(revenueFallback)) && revenueFallback !== null ? Number(revenueFallback) : null;
    const revenue = docRevenue ?? fallback;
    return {
      ...row,
      revenue,
      revenueSource: docRevenue !== null ? "dashboardMonthly" : fallback !== null ? "dashboard.monthRevenue" : null,
      paidBills: doc && Number.isFinite(Number(doc.paidBills)) ? Number(doc.paidBills) : null,
      revenueFinal: doc ? doc.finalized === true : false,
      ratio: revenue !== null && revenue > 0 ? row.purchases / revenue : null,
    };
  });
};

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV một dòng mỗi tháng; cột nhóm theo thứ tự MATERIAL_GROUPS. Ô thiếu dữ liệu để trống. */
export const monthlyCsv = (report) => {
  const header = ["thang", "doanh_thu", "nguon_doanh_thu", "doanh_thu_da_chot", "so_bill", "nhap_hang", "ti_le_nhap_tren_doanh_thu", "so_phieu", "phieu_tong", "phieu_chi_tiet", "chi_phi_khac", ...MATERIAL_GROUPS.map(([code]) => `nhom_${code}`)];
  const lines = [header.join(",")];
  for (const r of report) {
    lines.push([r.monthKey, r.revenue, r.revenueSource, r.revenueFinal, r.paidBills, r.purchases, r.ratio === null ? "" : r.ratio.toFixed(4), r.receiptCount, r.summaryAmount, r.itemizedAmount, r.otherExpenses, ...MATERIAL_GROUPS.map(([code]) => r.byGroup[code] || 0)].map(csvCell).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
};

/** JSON mô tả quy tắc và dữ liệu, để đưa kèm CSV cho AI hiểu từng cột. */
export const monthlyJson = (report, { generatedAt = Date.now(), rules = [] } = {}) => JSON.stringify({
  schema: "pos0210.monthly-purchases.v1",
  generatedAt,
  currency: "VND",
  description: {
    nhap_hang: "Tổng phiếu mua hàng chưa huỷ (nguyên liệu, bao bì, vật tư) theo ngày mua, giờ Việt Nam. Không gồm lương, điện, nước, mặt bằng.",
    doanh_thu: "Doanh thu bill đã thanh toán dữ liệu thật (LIVE), tính theo ngày đóng bill. Trống nghĩa là chưa có dữ liệu, không phải 0.",
    ti_le_nhap_tren_doanh_thu: "nhap_hang / doanh_thu. Trống khi không có doanh thu.",
    phieu_tong: "Hóa đơn nhập chung chung chỉ có nhóm và số tiền (không có tên vật tư), nên không dùng được cho thống kê giá/khối lượng.",
    phieu_chi_tiet: "Hóa đơn có từng dòng vật tư.",
    chi_phi_khac: "Chi phí không phải nhập hàng (lương, điện, nước, mặt bằng, bảo trì…) nhập ở Giao dịch khác hoặc trên máy POS. Không tính vào nhap_hang.",
    doanh_thu_da_chot: "true khi tháng đã kết thúc; false cho tháng đang chạy (số còn thay đổi).",
    nhom_: "Chia theo nhóm vật tư từ dòng phiếu. Nhóm 'KHAC' gồm dòng chưa phân nhóm được.",
  },
  materialGroups: MATERIAL_GROUPS.map(([code, label]) => ({ code, label })),
  learnedRules: rules.map((r) => ({ name: r.name, keyword: r.keyword ?? null, group: r.group, groupLabel: groupLabelOf(r.group) })),
  months: report,
}, null, 2);
