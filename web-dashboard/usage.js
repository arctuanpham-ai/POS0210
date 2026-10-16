// Mức dùng Firebase so với gói Spark (miễn phí). Hàm thuần.
// Hạn mức Firestore tính theo NGÀY GIỜ PACIFIC (America/Los_Angeles): reset 14:00 (mùa hè) hoặc 15:00 (mùa đông) giờ Việt Nam.
export const SPARK = { reads: 50_000, writes: 20_000, deletes: 20_000, storedGiB: 1, egressGiBMonth: 10, hostingMBDay: 360 };
export const POS_CEILING = 16_000; // máy POS tự dừng đồng bộ ở trần này để chừa chỗ cho web

const PACIFIC = "America/Los_Angeles";
/** "YYYY-MM-DD" theo giờ Pacific, trùng cách máy POS đặt tên config/quota-{ngày}. */
export function pacificDay(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Mốc reset kế tiếp (00:00 Pacific ngày sau), tính bằng dò từng phút quanh mốc để đúng cả giờ mùa hè/đông. */
export function nextReset(ms = Date.now()) {
  const today = pacificDay(ms);
  let lo = ms, hi = ms + 26 * 3600_000;
  while (hi - lo > 60_000) { const mid = Math.floor((lo + hi) / 2); if (pacificDay(mid) === today) lo = mid; else hi = mid; }
  return Math.floor(hi / 60_000) * 60_000;
}
/** Các ngày Pacific gần nhất, cũ → mới. */
export function lastPacificDays(n, ms = Date.now()) {
  const out = []; let t = ms;
  while (out.length < n) { const d = pacificDay(t); if (out[0] !== d) out.unshift(d); t -= 86_400_000; }
  return out;
}

const metric = (used, limit) => ({ used, limit, pct: limit ? (used / limit) * 100 : 0, remaining: Math.max(0, limit - used), remainingPct: limit ? Math.max(0, 100 - (used / limit) * 100) : 0 });

/** Một ngày: ghi = máy POS (đếm chính xác) + web; đọc = web (máy POS đọc rất ít, chưa đếm). */
export function dayUsage({ day, app = null, web = null }) {
  const webSum = { reads: 0, writes: 0, deletes: 0 };
  for (const d of Object.values(web?.devices || {})) { webSum.reads += Number(d.reads || 0); webSum.writes += Number(d.writes || 0); webSum.deletes += Number(d.deletes || 0); }
  const appWrites = Number(app?.total || 0);
  const categories = Object.fromEntries(["sales", "dashboard", "catalog", "finance", "people", "backup", "media", "system"].map((k) => [k, Number(app?.[k] || 0)]));
  return {
    day, appWrites, categories, web: webSum, hasApp: Boolean(app), hasWeb: Boolean(web),
    reads: metric(webSum.reads, SPARK.reads),
    writes: metric(appWrites + webSum.writes, SPARK.writes),
    deletes: metric(webSum.deletes, SPARK.deletes),
  };
}

/** So sánh các ngày: trung bình các ngày trước, ngày nào tăng vọt (> 1,5× trung bình và > 1.000) hoặc vượt 70% hạn mức. */
export function usageTrend(days) {
  return days.map((d, i) => {
    const window7 = days.slice(Math.max(0, i - 7), i);
    const avg = (list, f) => (list.length ? list.reduce((t, x) => t + f(x), 0) / list.length : null);
    const aw = avg(window7.filter((x) => x.hasApp || x.hasWeb), (x) => x.writes.used);
    const ar = avg(window7.filter((x) => x.hasWeb), (x) => x.reads.used); // chỉ so với ngày đã có số đếm web
    const flags = [];
    if (aw !== null && d.writes.used > 1000 && d.writes.used > aw * 1.5) flags.push(`ghi tăng ${Math.round((d.writes.used / Math.max(1, aw) - 1) * 100)}% so với TB`);
    if (ar !== null && d.reads.used > 1000 && d.reads.used > ar * 1.5) flags.push(`đọc tăng ${Math.round((d.reads.used / Math.max(1, ar) - 1) * 100)}% so với TB`);
    if (d.writes.pct >= 70) flags.push(`ghi ${d.writes.pct.toFixed(0)}% hạn mức`);
    if (d.reads.pct >= 70) flags.push(`đọc ${d.reads.pct.toFixed(0)}% hạn mức`);
    return { ...d, avgWrites: aw, avgReads: ar, flags };
  });
}
