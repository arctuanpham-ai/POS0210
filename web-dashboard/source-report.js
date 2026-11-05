// Báo cáo nguồn đơn online (UTM / nơi giới thiệu). Hàm thuần: không Firebase, không DOM.
// Doanh thu chỉ tính đơn đã thanh toán (cùng tập trạng thái với phễu: paid / delivering / done); đơn huỷ, từ chối, hết hạn không tính.
// Đây là doanh thu ĐƯỢC GẮN nguồn, không phải doanh thu tăng thêm nhờ quảng cáo.
import { ooToMillis } from "./online-orders.js?v=20261106-10";
import { TEST_ORDER_NAME, dayKeyVN, lastDays } from "./stats-view.js?v=20261106-10";

const PAID = new Set(["paid", "delivering", "done"]);
const LOST = new Set(["rejected", "expired", "cancelled"]);
const PAID_MEDIUMS = new Set(["paid_social", "paid", "cpc", "ppc", "ads", "paidsocial"]);
export const UNKNOWN = "Không xác định";

/** Nhóm nguồn dễ đọc cho một đơn (src có thể thiếu: đơn cũ / khách mở bằng trình duyệt khác). */
export function channelOf(src) {
  const source = String(src?.source || "").toLowerCase();
  if (!source || source === "unknown") return UNKNOWN;
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

const blank = () => ({ visits: 0, orders: 0, paid: 0, lost: 0, revenue: 0 });
const add = (m, key, o) => {
  const c = m.get(key) || blank();
  c.orders += 1;
  if (PAID.has(o.status)) { c.paid += 1; c.revenue += Math.max(0, Math.round(Number(o.total) || 0)); }
  else if (LOST.has(o.status)) c.lost += 1;
  m.set(key, c);
};
const finish = (m) => [...m.entries()].map(([key, c]) => ({ key, ...c, avg: c.paid ? Math.round(c.revenue / c.paid) : 0, perVisit: c.visits ? c.orders / c.visits : null })).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.key.localeCompare(b.key, "vi"));

const campaignKey = (src) => `${channelOf(src)} · ${src.campaign || "(không có chiến dịch)"}${src.content ? ` · ${src.content}` : ""}`;

/**
 * @param visitDocs  bộ đếm lượt vào theo nguồn (online_stats_src): [{id:"yyyymmdd~hash", visit, source, medium, campaign, content}]
 * @returns {{channels: Array, campaigns: Array, total: object}} trong `days` ngày gần nhất (giờ Việt Nam).
 *   perVisit = số đơn ÷ số lượt vào của cùng nguồn (lượt vào đếm theo phiên truy cập mỗi ngày, nên đây là tỷ lệ gần đúng, không phải số khách duy nhất).
 */
export function buildSourceReport(orders, nowMs, days, visitDocs = []) {
  const keep = new Set(lastDays(nowMs, days));
  const channels = new Map(), campaigns = new Map(), total = blank();
  for (const o of orders || []) {
    if (!o || o.name === TEST_ORDER_NAME) continue;
    const at = ooToMillis(o.createdAt);
    if (at == null || !keep.has(dayKeyVN(at))) continue;
    add(channels, channelOf(o.src), o);
    if (o.src?.source) add(campaigns, campaignKey(o.src), o);
    total.orders += 1;
    if (PAID.has(o.status)) { total.paid += 1; total.revenue += Math.max(0, Math.round(Number(o.total) || 0)); } else if (LOST.has(o.status)) total.lost += 1;
  }
  for (const d of visitDocs || []) {
    const n = Math.max(0, Math.round(Number(d?.visit) || 0));
    if (!d || !n || !keep.has(String(d.id || "").slice(0, 8))) continue;
    const bump = (m, key) => { const c = m.get(key) || blank(); c.visits += n; m.set(key, c); };
    bump(channels, channelOf(d));
    if (d.source && d.source !== "unknown") bump(campaigns, campaignKey(d));
    total.visits += n;
  }
  return { channels: finish(channels), campaigns: finish(campaigns), total };
}
