// Sổ app food: dữ liệu đến từ FILE ĐỐI SOÁT của từng app (tải về, nhập lên web), KHÔNG phụ thuộc máy POS ở quán.
// Mỗi đơn một dòng, khoá "APP_MÃĐƠN" nên nhập lại file (kể cả file chồng ngày) chỉ cập nhật, không nhân đôi.
// Ba mốc tách riêng: ngày bán (doanh thu, chiết khấu), ngày tiền về (dòng tiền), khấu trừ thuế (không phải chi phí).

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (n) => String(n).padStart(2, "0");

/** "25 Oct 2026 11:20 AM" (giờ Việt Nam) -> mili giây; không đọc được thì 0. */
export function parseVnDateTime(text) {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?)?\s*$/.exec(String(text ?? ""));
  if (!m || !MONTHS[m[2].toLowerCase()]) return 0;
  let hour = m[4] == null ? 0 : Number(m[4]);
  if (m[6]) { const pm = m[6].toLowerCase() === "pm"; if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12; }
  return Date.UTC(Number(m[3]), MONTHS[m[2].toLowerCase()] - 1, Number(m[1]), hour, Number(m[5] || 0)) - VN_OFFSET_MS;
}

/** Ngày theo giờ Việt Nam, dạng yyyy-MM-dd (không phụ thuộc múi giờ máy xem). */
export function vnDay(ms) {
  if (!Number.isFinite(Number(ms)) || !Number(ms)) return "";
  const d = new Date(Number(ms) + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const ledgerId = (app, code) => `${app}_${String(code).trim().toUpperCase().replace(/[\s/]+/g, "")}`;

const rowKey = (p) => [p.txnId, p.category, p.orderValue, p.received, p.commission, p.vat, p.pit, p.paidAt, p.createdAt].join("|");
const isCancelOrRefund = (p) => p.problems.some((x) => /^(Đơn huỷ|Hoàn tiền)/.test(x));

/**
 * Chống trùng khi một mã đơn xuất hiện nhiều dòng trong file:
 *  - dòng giống hệt nhau (file chồng ngày, xuất lặp): giữ một, bỏ phần còn lại;
 *  - dòng khác loại (điều chỉnh, phụ phí...) cùng mã: cộng vào tiền thực nhận của đơn gốc, KHÔNG ghi đè dòng thanh toán;
 *  - nhiều dòng thanh toán khác số liệu: giữ dòng đầu, gắn cờ cần xem.
 * Trả { docs, duplicates, merged }.
 */
export function ledgerBuild(app, parsed, { source = "", now = Date.now(), by = "" } = {}) {
  const groups = new Map();
  for (const p of Array.isArray(parsed) ? parsed : []) { const id = ledgerId(app, p.code); (groups.get(id) || groups.set(id, []).get(id)).push(p); }
  let duplicates = 0, merged = 0;
  const docs = [];
  for (const [id, list] of groups) {
    const uniq = [], seen = new Set();
    for (const p of list) { const k = rowKey(p); if (seen.has(k)) { duplicates += 1; continue; } seen.add(k); uniq.push(p); }
    const isMain = (p) => (p.category === "" || p.category === "payment") && p.orderValue > 0;
    const mains = uniq.filter(isMain);
    const extras = uniq.filter((p) => !isMain(p));
    const base = { ...(mains[0] || uniq[0]) };
    const problems = [...base.problems];
    if (mains.length > 1) problems.push(`Mã đơn có ${mains.length} dòng thanh toán khác số liệu, chỉ lấy dòng đầu`);
    let adjustment = 0;
    for (const x of extras) {
      if (x === base) continue;
      if (isCancelOrRefund(x)) { problems.push(...x.problems); } else { adjustment += x.received; merged += 1; }
    }
    if (!mains.length) problems.push("Không có dòng thanh toán cho mã đơn này");
    base.received += adjustment;
    const saleAt = parseVnDateTime(base.createdAt), payoutAt = parseVnDateTime(base.paidAt);
    docs.push({
      id, app, code: base.code,
      saleAt, saleDay: vnDay(saleAt) || vnDay(payoutAt), payoutAt, payoutDay: vnDay(payoutAt), payoutRef: base.payoutRef || "",
      orderValue: base.orderValue, commission: base.commission, vat: base.vat, pit: base.pit, shopPromo: base.shopPromo || 0, other: base.other, received: base.received, adjustment,
      status: problems.length ? "REVIEW" : "OK", problems: [...new Set(problems)], source, importedAt: now, importedBy: by,
    });
  }
  return { docs, duplicates, merged };
}

export const ledgerDocs = (app, parsed, opts) => ledgerBuild(app, parsed, opts).docs;

/** Tổng hợp theo ngày bán trong [fromDay, toDay). Dòng cờ REVIEW chỉ đếm riêng, không vào doanh thu. */
export function summarizeSales(rows, fromDay, toDay) {
  const out = { orders: 0, gross: 0, commission: 0, vat: 0, pit: 0, other: 0, received: 0, review: 0, reviewAmount: 0, byDay: {} };
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r.saleDay || r.saleDay < fromDay || r.saleDay >= toDay) return;
    if (r.status === "REVIEW") { out.review += 1; out.reviewAmount += r.orderValue; return; }
    const d = (out.byDay[r.saleDay] ||= { day: r.saleDay, orders: 0, gross: 0, commission: 0, vat: 0, pit: 0, other: 0, received: 0 });
    for (const k of ["gross", "commission", "vat", "pit", "other", "received"]) { const v = k === "gross" ? r.orderValue : r[k]; d[k] += v; out[k] += v; }
    d.orders += 1; out.orders += 1;
  });
  out.days = Object.values(out.byDay).sort((a, b) => (a.day < b.day ? 1 : -1));
  return out;
}

/** Tiền về theo ngày giải ngân và mã đợt: để đối chiếu từng khoản trên sao kê ngân hàng. */
export function payoutGroups(rows, fromDay, toDay) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (r.status === "REVIEW" || !r.payoutDay || r.payoutDay < fromDay || r.payoutDay >= toDay) return;
    const key = `${r.payoutDay}|${r.app}|${r.payoutRef}`;
    const g = map.get(key) || { day: r.payoutDay, app: r.app, ref: r.payoutRef, orders: 0, received: 0, gross: 0, firstSale: r.saleDay, lastSale: r.saleDay };
    g.orders += 1; g.received += r.received; g.gross += r.orderValue;
    if (r.saleDay && r.saleDay < g.firstSale) g.firstSale = r.saleDay;
    if (r.saleDay && r.saleDay > g.lastSale) g.lastSale = r.saleDay;
    map.set(key, g);
  });
  return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.ref < b.ref ? -1 : 1));
}

/** Phải thu: đơn đã bán trong sổ nhưng chưa có ngày tiền về. */
export const receivable = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => r.status !== "REVIEW" && !r.payoutDay).reduce((s, r) => s + r.orderValue, 0);

/** Kỳ [from, to) theo ngày: "hôm nay", 7, 14, 30 ngày, tháng này. today = yyyy-MM-dd. Trả { from, to } (to là ngày đầu tiên ngoài kỳ). */
export function periodDays(kind, today) {
  const [y, m, d] = today.split("-").map(Number);
  const add = (n) => vnDay(Date.UTC(y, m - 1, d + n) - VN_OFFSET_MS + 12 * 3_600_000);
  const to = add(1);
  if (kind === "month") return { from: `${y}-${pad(m)}-01`, to };
  const n = kind === "today" ? 1 : Number(kind) || 14;
  return { from: add(1 - n), to };
}

/** Khoảng thời gian của báo cáo: dòng "Khoảng thời gian | 25/10/2026 - 25/10/2026" trong sheet Tóm tắt. Trả { from, to } yyyy-MM-dd hoặc null. */
export function parseCoverage(summaryRows) {
  for (const r of Array.isArray(summaryRows) ? summaryRows : []) {
    if (!Array.isArray(r) || String(r[0] ?? "").trim().toLowerCase() !== "khoảng thời gian") continue;
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(r.slice(1).find((c) => c != null && c !== "") ?? ""));
    if (m) return { from: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, to: `${m[6]}-${pad(m[5])}-${pad(m[4])}` };
  }
  return null;
}

/**
 * Dữ liệu app food đã cập nhật đến hết ngày nào. metas: [{ app, coveredTo }] (mỗi app một mốc, lấy từ file đối soát đã nhập).
 * Nhiều app: lấy mốc CŨ NHẤT (tổng chỉ đủ đến ngày mà mọi app đều có dữ liệu). Chưa có mốc: dùng ngày bán mới nhất trong sổ (rows) và đánh dấu approximate.
 * ok = đã tới hôm nay; behind = số ngày còn thiếu tính đến hôm nay (0 nếu ok).
 */
export function freshness(metas, rows, today) {
  const list = (Array.isArray(metas) ? metas : []).filter((m) => m && m.coveredTo);
  let through = list.length ? list.reduce((min, m) => (m.coveredTo < min ? m.coveredTo : min), list[0].coveredTo) : "";
  let approximate = false;
  if (!through) {
    through = (Array.isArray(rows) ? rows : []).reduce((max, r) => (r.saleDay && r.saleDay > max ? r.saleDay : max), "");
    approximate = Boolean(through);
  }
  if (!through) return null;
  const toMs = (d) => Date.UTC(...d.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const behind = Math.max(0, Math.round((toMs(today) - toMs(through)) / 86_400_000));
  const dm = through.split("-").reverse().slice(0, 2).join("/");
  return { through, behind, ok: behind === 0, approximate, label: `${dm}` };
}

/** Dòng chữ cảnh báo ngắn cho thẻ/nhãn: ✔ hoặc ⚠. */
export function freshnessText(f) {
  if (!f) return "";
  if (f.ok) return `✔ app food cập nhật đến hết hôm nay (${f.label})`;
  return `⚠ app food chỉ cập nhật đến hết ${f.label}${f.approximate ? " (ước theo đơn mới nhất)" : ""}, thiếu ${f.behind} ngày tới hôm nay`;
}

/** Ngày đầu của tháng kế tiếp: "2026-10" -> "2026-11-01". */
const nextMonthStart = (monthKey) => { const [y, m] = monthKey.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`; };

/**
 * App food trong một tháng (monthKey = yyyy-MM, giờ Việt Nam).
 * - gross / commission / other / vat / pit: theo NGÀY BÁN (doanh thu và chi phí thuộc tháng bán).
 * - accrual = gross − commission − other (VAT/PIT app giữ hộ là thuế, không tính vào chi phí).
 * - cashIn: tiền app đã chuyển về TK theo NGÀY GIẢI NGÂN trong tháng (dòng tiền), không phụ thuộc tháng bán.
 * - review: số đơn bị cờ, không nằm trong doanh thu.
 */
export function foodMonth(rows, monthKey) {
  const from = `${monthKey}-01`;
  const to = nextMonthStart(monthKey);
  const s = summarizeSales(rows, from, to);
  const cashIn = (Array.isArray(rows) ? rows : []).filter((r) => r.status !== "REVIEW" && r.payoutDay && r.payoutDay >= from && r.payoutDay < to).reduce((t, r) => t + r.received, 0);
  return { monthKey, orders: s.orders, gross: s.gross, commission: s.commission, other: s.other, vat: s.vat, pit: s.pit, accrual: s.gross - s.commission - s.other, cashIn, review: s.review, reviewAmount: s.reviewAmount };
}
