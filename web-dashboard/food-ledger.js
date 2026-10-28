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

/** Đơn đã đọc từ file (parseGrabRows) -> các dòng sổ. Đơn huỷ/hoàn tiền/chưa chuyển tiền được gắn cờ, không tính doanh thu. */
export function ledgerDocs(app, parsed, { source = "", now = Date.now(), by = "" } = {}) {
  return (Array.isArray(parsed) ? parsed : []).map((p) => {
    const saleAt = parseVnDateTime(p.createdAt);
    const payoutAt = parseVnDateTime(p.paidAt);
    const flagged = p.problems.length > 0;
    return {
      id: ledgerId(app, p.code), app, code: p.code,
      saleAt, saleDay: vnDay(saleAt) || vnDay(payoutAt), payoutAt, payoutDay: vnDay(payoutAt), payoutRef: p.payoutRef || "",
      orderValue: p.orderValue, commission: p.commission, vat: p.vat, pit: p.pit, shopPromo: p.shopPromo || 0, other: p.other, received: p.received,
      status: flagged ? "REVIEW" : "OK", problems: p.problems, source, importedAt: now, importedBy: by,
    };
  });
}

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
