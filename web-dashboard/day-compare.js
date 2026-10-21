// So sánh ngày với ngày và cùng thứ tuần trước: số bill, giá trị bill trung bình, số món làm ra, doanh thu. Hàm thuần.
// Ngày thiếu snapshot là "không có dữ liệu" (null), tuyệt đối không tính thành 0.
import { outputRows } from "./item-output.js?v=20261021-01";

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return keyOf(new Date(y, m - 1, d + n)); };
export const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const weekdayOf = (key) => { const [y, m, d] = key.split("-").map(Number); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; };

/** Chỉ số một ngày; null nếu không có snapshot. items = số phần bếp làm (đã tách combo). */
export const dayMetrics = (docs, key) => {
  const snap = docs?.[key];
  if (!snap) return null;
  const bills = Number(snap.paidBills || 0);
  const revenue = Number(snap.revenue || 0);
  return { bills, revenue, avgBill: bills ? Math.round(revenue / bills) : 0, items: outputRows(docs, [key]).reduce((t, r) => t + r.total, 0) };
};

const FIELDS = ["bills", "revenue", "avgBill", "items"];
/** Chênh lệch a so với b: diff tuyệt đối và pct (null khi b = 0 hoặc thiếu số liệu). */
export const delta = (a, b) => {
  if (!a || !b) return null;
  return Object.fromEntries(FIELDS.map((f) => [f, { diff: a[f] - b[f], pct: b[f] > 0 ? (a[f] - b[f]) / b[f] : null, base: b[f] }]));
};

/** `days` ngày gần nhất (cũ → mới, kết thúc hôm nay), mỗi ngày kèm so với hôm trước và cùng thứ tuần trước. */
export const compareRows = (docs, todayKey, days = 7) => Array.from({ length: days }, (_, i) => {
  const key = addDays(todayKey, -(days - 1 - i));
  const m = dayMetrics(docs, key);
  const prev = dayMetrics(docs, addDays(key, -1));
  const week = dayMetrics(docs, addDays(key, -7));
  return { dateKey: key, weekday: weekdayOf(key), today: key === todayKey, m, prevKey: addDays(key, -1), weekKey: addDays(key, -7), vsPrev: delta(m, prev), vsWeek: delta(m, week) };
});

/** 7 ngày gần nhất so với 7 ngày liền trước: tổng, trung bình mỗi ngày có số liệu, giá trị TB mỗi bill. */
export const weekTotals = (docs, todayKey) => {
  const sum = (from) => {
    const list = Array.from({ length: 7 }, (_, i) => dayMetrics(docs, addDays(from, i))).filter(Boolean);
    const t = list.reduce((a, x) => ({ bills: a.bills + x.bills, revenue: a.revenue + x.revenue, items: a.items + x.items }), { bills: 0, revenue: 0, items: 0 });
    const n = list.length;
    return { days: n, ...t, billsPerDay: n ? t.bills / n : 0, itemsPerDay: n ? t.items / n : 0, revenuePerDay: n ? t.revenue / n : 0, avgBill: t.bills ? Math.round(t.revenue / t.bills) : 0 };
  };
  const cur = sum(addDays(todayKey, -6));
  const prev = sum(addDays(todayKey, -13));
  const pct = (a, b) => (b > 0 ? (a - b) / b : null);
  // Tổng so với tổng khi hai tuần có cùng số ngày dữ liệu; lệch số ngày thì so theo trung bình mỗi ngày để không bị lệch.
  const same = cur.days === prev.days;
  return { cur, prev, same, pct: {
    bills: same ? pct(cur.bills, prev.bills) : pct(cur.billsPerDay, prev.billsPerDay),
    items: same ? pct(cur.items, prev.items) : pct(cur.itemsPerDay, prev.itemsPerDay),
    revenue: same ? pct(cur.revenue, prev.revenue) : pct(cur.revenuePerDay, prev.revenuePerDay),
    avgBill: pct(cur.avgBill, prev.avgBill) } };
};

/** Khoảng ngày cần đọc để so sánh: 14 ngày kết thúc hôm nay. */
export const compareKeys = (todayKey) => Array.from({ length: 14 }, (_, i) => addDays(todayKey, -(13 - i)));
