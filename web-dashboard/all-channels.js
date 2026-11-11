// Gộp doanh thu và bill của mọi kênh bán: tại quán (POS), đặt món online, GrabFood, ShopeeFood. Hàm thuần: không Firebase, không DOM.
// Không cộng trùng: bill đơn online do POS ghi (bản 209 tách onlineRevenue/onlineBills trong doanh thu ngày) và bill app food đã có trong sổ app food được lọc khỏi doanh thu tại quán bằng cách
// chỉ lấy snapshot dashboardDaily (doanh thu tại quán, không gồm app food) cho kênh "Tại quán".
import { OO_LABELS, ooToMillis } from "./online-orders.js?v=20261111-1";

export const CHANNELS = Object.freeze([
  { key: "STORE", label: "Tại quán" },
  { key: "ONLINE", label: "Đặt món online" },
  { key: "GRAB", label: "GrabFood" },
  { key: "SHOPEE", label: "ShopeeFood" },
  { key: "XANHNGON", label: "Xanh Ngon" },
]);
/** Các kênh là app giao đồ ăn (có sổ đối soát). Thêm app mới: thêm vào CHANNELS và danh sách này. */
export const APP_KEYS = Object.freeze(["GRAB", "SHOPEE", "XANHNGON"]);
export const channelLabel = (key) => CHANNELS.find((c) => c.key === key)?.label || String(key);

const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (n) => String(n).padStart(2, "0");
export const dayOfMs = (ms) => { const d = new Date(Number(ms) + VN_OFFSET_MS); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/** Các ngày yyyy-MM-dd từ from đến hết to (gồm cả hai đầu). */
export const enumerateDays = (from, to) => {
  const out = [];
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) return out;
  for (let t = parse(from); t <= parse(to) && out.length < 400; t += 86_400_000) { const d = new Date(t); out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`); }
  return out;
};

/** Đơn online tính doanh thu: đã nhận tiền (đang làm / đang giao / hoàn thành). Đơn chờ, từ chối, hết hạn, khách huỷ thì không. */
/** Doanh thu online ghi khi nhân viên bấm "Hoàn thành" (trên POS hoặc web), theo ngày bấm; đơn cũ thiếu doneAt dùng paidAt. */
export const isOnlineRevenue = (o) => o?.status === "done";
export const onlineMs = (o) => ooToMillis(o?.doneAt) ?? ooToMillis(o?.paidAt) ?? ooToMillis(o?.createdAt) ?? 0;
export const onlineDay = (o) => dayOfMs(onlineMs(o));

/** Dòng sổ app food tính doanh thu: bỏ đơn "cần xem lại" (huỷ / hoàn), vì chưa chắc đã bán được. */
const ledgerCounts = (r) => r && r.status !== "REVIEW";

/**
 * Doanh thu theo ngày và theo kênh.
 * storeDocs: { [yyyy-MM-dd]: dashboardDaily | null }; onlineOrders: đơn online; ledgerRows: sổ app food; days: danh sách ngày cần xem.
 * channels: tập kênh được chọn (mặc định tất cả); onlineMode: lọc đơn online theo hình thức (delivery/pickup/dinein) hoặc ALL.
 */
export function revenueByDay({ days, storeDocs = {}, onlineOrders = [], ledgerRows = [], channels = null, onlineMode = "ALL" }) {
  const want = new Set(channels && channels.length ? channels : CHANNELS.map((c) => c.key));
  const set = new Set(days);
  const blank = () => ({ revenue: 0, count: 0 });
  const rows = new Map(days.map((day) => [day, { day, STORE: blank(), ONLINE: blank(), GRAB: blank(), SHOPEE: blank(), XANHNGON: blank(), total: 0, count: 0, storeAvailable: Boolean(storeDocs?.[day]) }]));
  const totals = { STORE: blank(), ONLINE: blank(), GRAB: blank(), SHOPEE: blank(), XANHNGON: blank() };
  let review = { count: 0, value: 0 };
  const unpaid = { count: 0, value: 0 }; // đã bán, thực nhận đã tính nhưng app chưa chuyển về tài khoản
  const add = (day, key, amount) => { const r = rows.get(day); if (!r || !want.has(key)) return; r[key].revenue += amount; r[key].count += 1; totals[key].revenue += amount; totals[key].count += 1; };
  for (const day of days) {
    const d = storeDocs?.[day];
    if (!d || !want.has("STORE")) continue;
    const r = rows.get(day), revenue = Number(d.revenue || 0), count = Number(d.paidBills || 0);
    // POS từ bản 209 ghi onlineRevenue/onlineBills: phần đơn online nằm TRONG revenue/paidBills của ngày, tách ra thành kênh Online riêng, không cộng trùng.
    // Ngày cũ chưa có hai trường này: giữ nguyên, không cộng thêm đơn online vì POS bản trước đã ghi chúng vào doanh thu tại quán.
    const hasSplit = typeof d.onlineRevenue === "number";
    const onRev = hasSplit ? Math.min(revenue, Math.max(0, d.onlineRevenue)) : 0, onCnt = hasSplit ? Math.min(count, Math.max(0, Number(d.onlineBills || 0))) : 0;
    r.STORE = { revenue: revenue - onRev, count: count - onCnt }; totals.STORE.revenue += revenue - onRev; totals.STORE.count += count - onCnt;
    if (hasSplit && want.has("ONLINE") && onlineMode === "ALL") { r.ONLINE = { revenue: onRev, count: onCnt }; totals.ONLINE.revenue += onRev; totals.ONLINE.count += onCnt; }
  }
  // Ngày chưa có doc doanh thu của POS: lấy đơn online hoàn thành trực tiếp (ngày có doc thì online đã nằm trong doc, không cộng lại).
  for (const o of onlineOrders || []) {
    if (!isOnlineRevenue(o) || (onlineMode !== "ALL" && o.mode !== onlineMode)) continue;
    const day = onlineDay(o);
    if (set.has(day) && !storeDocs?.[day]) add(day, "ONLINE", Number(o.total || 0));
  }
  for (const r of ledgerRows || []) {
    if (!set.has(r?.saleDay) || !APP_KEYS.includes(r.app)) continue;
    if (!want.has(r.app)) continue;
    if (!ledgerCounts(r)) { review.count += 1; review.value += Number(r.orderValue || 0); continue; }
    add(r.saleDay, r.app, Number(r.received || 0)); // app food: chỉ tính tiền thực nhận sau chiết khấu, thuế, phí
    if (!r.payoutDay) { unpaid.count += 1; unpaid.value += Number(r.received || 0); }
  }
  const list = [...rows.values()];
  for (const r of list) { r.total = CHANNELS.reduce((t, c) => t + r[c.key].revenue, 0); r.count = CHANNELS.reduce((t, c) => t + r[c.key].count, 0); }
  const total = list.reduce((t, r) => t + r.total, 0), count = list.reduce((t, r) => t + r.count, 0);
  return { days: list, totals, total, count, avg: count ? Math.round(total / count) : 0, storeMissing: want.has("STORE") ? list.filter((r) => !r.storeAvailable).map((r) => r.day) : [], review, unpaid };
}

/**
 * Danh sách bill gộp, mới nhất trước.
 * storeBills: dòng bill tại quán (buildBillRows) của MỘT ngày, kèm storeDay; chỉ khi xem 1 ngày mới có từng bill tại quán.
 * Mỗi dòng: { id, channel, day, at, title, sub, amount, tag, tagKind, refund }.
 */
export function unifiedBills({ days, storeBills = [], storeDay = "", onlineOrders = [], ledgerRows = [], channel = "ALL", q = "", onlineMode = "ALL", status = "ALL" }) {
  const set = new Set(days);
  const out = [];
  const money0 = (n) => Number(n || 0);
  const appOnly = status !== "ALL"; // tình trạng tiền về chỉ có ở đơn app food
  if (!appOnly && (channel === "ALL" || channel === "STORE")) {
    for (const b of storeBills || []) {
      if (!set.has(storeDay)) break;
      if (String(b.reference || "").startsWith("ON-")) continue; // bill POS của đơn online: đã hiện ở kênh Đặt món online
      out.push({ id: `STORE_${b.id}`, ref: b.id, channel: "STORE", day: storeDay, at: money0(b.closedAt), title: `${b.tableName} · #${b.billNo}`, sub: b.paymentMissing ? "Chưa rõ" : String(b.method || ""), amount: money0(b.total), tag: b.refund ? "Đã hoàn" : b.flow === "prepaid" ? "Trả trước" : "Trả sau", tagKind: b.refund ? "warn" : b.flow === "prepaid" ? "" : "postpaid", refund: Boolean(b.refund) });
    }
  }
  if (!appOnly && (channel === "ALL" || channel === "ONLINE")) {
    for (const o of onlineOrders || []) {
      if (!isOnlineRevenue(o) || (onlineMode !== "ALL" && o.mode !== onlineMode)) continue;
      const day = onlineDay(o);
      if (!set.has(day)) continue;
      out.push({ id: `ONLINE_${o.id || o.code}`, channel: "ONLINE", day, at: onlineMs(o), title: `${o.code || o.id} · ${o.name || "Khách"}`, sub: `${{ delivery: "Giao tận nơi", pickup: "Mang đi", dinein: "Tại quán" }[o.mode] || o.mode || ""} · ${OO_LABELS[o.status] || o.status}`, amount: money0(o.total), tag: "Đã hoàn thành", tagKind: "", refund: false });
    }
  }
  for (const app of APP_KEYS) {
    if (channel !== "ALL" && channel !== app) continue;
    for (const r of ledgerRows || []) {
      if (r.app !== app || !set.has(r.saleDay)) continue;
      const review = !ledgerCounts(r);
      const st = review ? "REVIEW" : r.payoutDay ? "PAID" : "WAIT";
      if (appOnly && st !== status) continue;
      out.push({ id: `${app}_${r.code}`, channel: app, day: r.saleDay, at: money0(r.saleAt), title: `${r.code}`, sub: `giá app ${money0(r.orderValue).toLocaleString("vi-VN")}đ${(r.problems || []).length ? ` · ${r.problems.join("; ")}` : ""}`, amount: review ? money0(r.orderValue) : money0(r.received), tag: review ? "Cần xem lại" : r.payoutDay ? "Đã nhận tiền" : "Chưa về", tagKind: review ? "warn" : r.payoutDay ? "" : "postpaid", refund: false, review });
    }
  }
  const needle = String(q || "").trim().toUpperCase();
  const list = needle ? out.filter((r) => `${r.title} ${r.sub}`.toUpperCase().includes(needle)) : out;
  list.sort((a, b) => (b.at - a.at) || (a.id < b.id ? 1 : -1));
  const ok = list.filter((r) => !r.refund && !r.review);
  const byChannel = Object.fromEntries(CHANNELS.map((c) => { const x = ok.filter((r) => r.channel === c.key); return [c.key, { count: x.length, amount: x.reduce((t, r) => t + r.amount, 0) }]; }));
  return { rows: list, total: ok.reduce((t, r) => t + r.amount, 0), count: ok.length, byChannel };
}
