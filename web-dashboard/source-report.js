// Báo cáo nguồn đơn online (UTM / nơi giới thiệu). Hàm thuần: không Firebase, không DOM.
// Doanh thu chỉ tính đơn đã thanh toán (cùng tập trạng thái với phễu: paid / delivering / done); đơn huỷ, từ chối, hết hạn không tính.
// Đây là doanh thu ĐƯỢC GẮN nguồn, không phải doanh thu tăng thêm nhờ quảng cáo.
import { ooToMillis } from "./online-orders.js?v=20261029-45";
import { TEST_ORDER_NAME, dayKeyVN, lastDays } from "./stats-view.js?v=20261029-45";

const PAID = new Set(["paid", "delivering", "done"]);
const LOST = new Set(["rejected", "expired", "cancelled"]);
const PAID_MEDIUMS = new Set(["paid_social", "paid", "cpc", "ppc", "ads", "paidsocial"]);
export const UNKNOWN = "Không xác định";

/** Nhóm nguồn dễ đọc cho một đơn (src có thể thiếu: đơn cũ / khách mở bằng trình duyệt khác). */
export function channelOf(src) {
  const source = String(src?.source || "").toLowerCase();
  if (!source) return UNKNOWN;
  const medium = String(src?.medium || "").toLowerCase();
  if (source === "facebook" || source === "fb") {
    if (PAID_MEDIUMS.has(medium)) return "Facebook Ads";
    if (medium === "fbclid" || medium === "referral") return "Facebook (chưa rõ quảng cáo hay tự nhiên)";
    return "Facebook tự nhiên";
  }
  if (source === "google") return "Google";
  if (source === "qr") return "QR";
  return `Khác: ${source}`;
}

const blank = () => ({ orders: 0, paid: 0, lost: 0, revenue: 0 });
const add = (m, key, o) => {
  const c = m.get(key) || blank();
  c.orders += 1;
  if (PAID.has(o.status)) { c.paid += 1; c.revenue += Math.max(0, Math.round(Number(o.total) || 0)); }
  else if (LOST.has(o.status)) c.lost += 1;
  m.set(key, c);
};
const finish = (m) => [...m.entries()].map(([key, c]) => ({ key, ...c, avg: c.paid ? Math.round(c.revenue / c.paid) : 0 })).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.key.localeCompare(b.key, "vi"));

/** @returns {{channels: Array, campaigns: Array, total: object}} trong `days` ngày gần nhất (giờ Việt Nam). */
export function buildSourceReport(orders, nowMs, days) {
  const keep = new Set(lastDays(nowMs, days));
  const channels = new Map(), campaigns = new Map(), total = blank();
  for (const o of orders || []) {
    if (!o || o.name === TEST_ORDER_NAME) continue;
    const at = ooToMillis(o.createdAt);
    if (at == null || !keep.has(dayKeyVN(at))) continue;
    add(channels, channelOf(o.src), o);
    if (o.src?.source) add(campaigns, `${channelOf(o.src)} · ${o.src.campaign || "(không có chiến dịch)"}${o.src.content ? ` · ${o.src.content}` : ""}`, o);
    total.orders += 1;
    if (PAID.has(o.status)) { total.paid += 1; total.revenue += Math.max(0, Math.round(Number(o.total) || 0)); } else if (LOST.has(o.status)) total.lost += 1;
  }
  return { channels: finish(channels), campaigns: finish(campaigns), total };
}
