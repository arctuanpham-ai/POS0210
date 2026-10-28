// Đọc báo cáo GrabMerchant (sheet "Giao dịch") và khớp với đơn GrabFood đang chờ trên POS.
// Hàm thuần: nhận mảng dòng (dòng đầu là tiêu đề) nên test được không cần thư viện Excel.
export const GRAB_SHEET = "Giao dịch";

const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const abs = (v) => Math.abs(num(v));
export const cleanCode = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** rows: mảng các mảng (dòng 1 là tiêu đề). Trả về danh sách đơn trong file. */
export function parseGrabRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const header = rows[0].map(norm);
  const at = (name) => header.indexOf(name);
  const col = {
    code: at("Mã đơn hàng ngắn"), amount: at("Số tiền"), status: at("Trạng thái"), category: at("Danh mục"), paidAt: at("Ngày chuyển khoản"),
    createdAt: at("Ngày tạo"), txnId: at("Mã giao dịch"), payoutRef: header.lastIndexOf("Mã giao dịch"), shopPromo: [at("Giảm giá (Quán tài trợ)"), at("Giảm phí giao hàng (Quán tài trợ)")],
    commission: ["Chiết khấu giao hàng", "Chiết khấu từ các kênh bán hàng", "Chiết khấu đơn hàng", "Chiết khấu cho GrabFood / GrabMart"].map(at),
    vat: at("VAT Amount"), pit: at("PIT Amount"), total: at("Tổng cộng"), cancel: at("Lý do hủy"), refund: at("Lý do hoàn tiền"),
  };
  if (col.code < 0 || col.amount < 0 || col.total < 0) return [];
  const cell = (r, i) => (i >= 0 ? r[i] : null);
  return rows.slice(1).filter((r) => Array.isArray(r) && cleanCode(cell(r, col.code))).map((r) => {
    const amount = num(cell(r, col.amount));
    const commission = col.commission.reduce((s, i) => s + abs(cell(r, i)), 0);
    const vat = abs(cell(r, col.vat)), pit = abs(cell(r, col.pit));
    const received = num(cell(r, col.total));
    const problems = [];
    if (norm(cell(r, col.status)).toLowerCase() !== "transferred") problems.push(`Trạng thái "${norm(cell(r, col.status)) || "trống"}" (chưa chuyển tiền)`);
    if (norm(cell(r, col.cancel))) problems.push(`Đơn huỷ: ${norm(cell(r, col.cancel))}`);
    if (norm(cell(r, col.refund))) problems.push(`Hoàn tiền: ${norm(cell(r, col.refund))}`);
    if (norm(cell(r, col.category)) && norm(cell(r, col.category)).toLowerCase() !== "payment") problems.push(`Loại giao dịch "${norm(cell(r, col.category))}"`);
    if (amount <= 0) problems.push("Giá trị đơn bằng 0");
    if (received < 0 || received + commission + vat + pit > amount) problems.push("Các khoản trừ lớn hơn giá trị đơn");
    return { code: cleanCode(cell(r, col.code)), orderValue: amount, commission, vat, pit, received, other: Math.max(0, amount - commission - vat - pit - received), paidAt: norm(cell(r, col.paidAt)), createdAt: norm(cell(r, col.createdAt)), category: norm(cell(r, col.category)).toLowerCase(), txnId: norm(cell(r, col.txnId)), payoutRef: col.payoutRef > at("Mã đơn hàng ngắn") ? norm(cell(r, col.payoutRef)) : "", shopPromo: col.shopPromo.reduce((s2, i) => s2 + abs(cell(r, i)), 0), status: norm(cell(r, col.status)), problems };
  });
}

/**
 * Khớp với đơn Grab đang chờ (pending: {billId, app, code, amount}) và mã đã chốt (settledCodes).
 * ready: tự chốt được; review: khớp mã nhưng có vấn đề (không tự chốt); notInPos: có trên Grab, POS chưa nhập; notInFile: POS chờ, file chưa có.
 */
export function matchGrab(parsed, pending, settledCodes = []) {
  const grabPending = pending.filter((o) => o.app === "GRAB" && o.billId);
  const byCode = new Map(grabPending.map((o) => [cleanCode(o.code), o]));
  const settled = new Set(settledCodes.map(cleanCode));
  const ready = [], review = [], notInPos = [], alreadyDone = [];
  const seen = new Set();
  for (const p of parsed) {
    const order = byCode.get(p.code);
    if (!order) { (settled.has(p.code) ? alreadyDone : notInPos).push(p); continue; }
    seen.add(p.code);
    const diffNote = order.amount !== p.orderValue ? `POS ghi ${order.amount}, Grab ${p.orderValue}` : "";
    (p.problems.length ? review : ready).push({ order, row: p, diffNote });
  }
  const notInFile = grabPending.filter((o) => !seen.has(cleanCode(o.code)));
  return { ready, review, notInPos, notInFile, alreadyDone };
}
