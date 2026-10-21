// Thống kê lượt truy cập trang đặt món theo từng cấp (phễu). Hàm thuần: không Firebase, không DOM.
// Khớp với web-order/public/stats-core.js (cùng tên bộ đếm) và online_orders.
import { ooToMillis } from "./online-orders.js?v=20261021-06";

export const FUNNEL = Object.freeze([
  ["visit", "Lượt vào trang"], ["menu", "Xem được menu"], ["add", "Thêm món vào giỏ"], ["cart", "Mở giỏ hàng"],
  ["submit", "Bấm gửi đơn"], ["created", "Đơn gửi được"], ["paid", "Đã thanh toán"],
]);
const HOURS = Array.from({ length: 24 }, (_, h) => `vh${String(h).padStart(2, "0")}`);
const PAID = new Set(["paid", "delivering", "done"]);
export const TEST_ORDER_NAME = "KIEM THU TU DONG";
const VN = 7 * 3_600_000;
export const dayKeyVN = (ms) => new Date(ms + VN).toISOString().slice(0, 10).replace(/-/g, "");
export const dayLabel = (key) => `${key.slice(6, 8)}/${key.slice(4, 6)}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Các khoá ngày (yyyymmdd, giờ VN) của `days` ngày gần nhất, ngày mới nhất trước. */
export const lastDays = (nowMs, days) => Array.from({ length: days }, (_, i) => dayKeyVN(nowMs - i * 86_400_000));

/**
 * Gộp bộ đếm (docs: [{id:'yyyymmdd', visit, ...}]) với đơn thật (bỏ đơn kiểm thử) thành từng dòng theo ngày.
 * Trả về { rows, total, hours } — hours là lượt vào theo 24 khung giờ.
 */
export const buildStats = (statDocs, orders, nowMs, days) => {
  const keys = lastDays(nowMs, days);
  const byId = new Map((statDocs || []).map((d) => [d.id, d]));
  const orderDay = new Map();
  for (const o of orders || []) {
    if (!o || o.name === TEST_ORDER_NAME) continue;
    const at = ooToMillis(o.createdAt);
    if (at == null) continue;
    const k = dayKeyVN(at);
    const cur = orderDay.get(k) || { created: 0, paid: 0 };
    cur.created += 1;
    if (PAID.has(o.status)) cur.paid += 1;
    orderDay.set(k, cur);
  }
  const total = Object.fromEntries([...FUNNEL.map(([k]) => [k, 0]), ["device", 0]]);
  const hours = HOURS.map(() => 0);
  const rows = keys.map((day) => {
    const s = byId.get(day) || {}, o = orderDay.get(day) || { created: 0, paid: 0 };
    const row = { day, visit: num(s.visit), device: num(s.device), menu: num(s.menu), add: num(s.add), cart: num(s.cart), submit: num(s.submit), created: o.created, paid: o.paid };
    for (const k of Object.keys(total)) total[k] += row[k];
    HOURS.forEach((h, i) => { hours[i] += num(s[h]); });
    return row;
  });
  return { rows, total, hours };
};

/** Phễu: mỗi cấp kèm % so với lượt vào và % giữ lại so với cấp trước. */
export const funnelSteps = (total) => FUNNEL.map(([key, label], i) => {
  const value = num(total[key]), prev = i ? num(total[FUNNEL[i - 1][0]]) : null, base = num(total.visit);
  return { key, label, value, ofVisit: base ? value / base : null, ofPrev: prev ? value / prev : (i ? null : 1) };
});
export const pct = (v) => (v == null ? "–" : `${Math.round(v * 1000) / 10}%`);
