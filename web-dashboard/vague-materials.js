// Tìm vật tư tính theo đơn vị đóng gói (túi, gói, hộp…) mà không có định lượng rõ ràng (g, kg, ml, lít) trong đơn vị hoặc tên.
// Hàm thuần: không Firebase, không DOM.
import { normalizeText, normalizeQuantity } from "./expense-rules.js?v=20261029-17";
import { NON_MATERIAL } from "./expense-kind.js?v=20261029-17";

/** Đơn vị đo được (đã quy đổi được ra kg / lít). */
const MEASURED = new Set(["lang", "g", "gr", "gam", "kg", "ml", "l", "lit", "cl"]);
/** Đơn vị đếm rõ ràng: mỗi đơn vị là một vật cụ thể, không cần định lượng. */
const COUNTABLE = new Set(["cai", "qua", "trai", "con", "ly", "o", "mieng", "chiec", "cay", "to", "quyen", "bo", "doi", "suat", "phan", "lan", "tam", "mon", "chai nho"]);
/** Đơn vị đóng gói: bên trong chứa bao nhiêu không rõ. */
const PACKAGE = new Set(["tui", "goi", "bich", "hop", "thung", "chai", "lon", "bao", "lo", "bo", "vi", "can", "loc", "cuon", "hu", "ket", "xach", "bat", "chau", "binh", "tuyp", "lo nho", "bich lon"]);
// "500g", "1,5 kg", "330ml", "2 lít", "1l" trong tên vật tư = đã ghi định lượng.
const QTY_IN_NAME = /(^|[^a-z0-9])\d+([.,]\d+)?\s*(g|gr|gam|kg|ml|cl|l|lit)(?![a-z])/;

export const hasQuantityInName = (name) => QTY_IN_NAME.test(normalizeText(name));
/** "packaged" = đơn vị đóng gói; "unknown" = đơn vị lạ (không phải đo, đếm, đóng gói); "" = rõ ràng. */
export const unitClass = (unit) => {
  const u = normalizeText(unit);
  if (!u) return "unknown";
  if (MEASURED.has(u) || normalizeQuantity(1, unit).baseUnit !== String(unit ?? "").trim()) return "";
  if (PACKAGE.has(u)) return "packaged";
  if (COUNTABLE.has(u)) return "";
  return "unknown";
};

/**
 * Gom các dòng phiếu chi vật tư mơ hồ theo mã vật tư (không có mã thì theo tên chuẩn hoá).
 * receipts: phiếu còn hiệu lực. Chỉ xét dòng mua hàng, bỏ dòng đã ghi định lượng trong tên.
 * Trả về { rows, hintedCount } với rows sắp theo tổng tiền giảm dần.
 */
export const vagueKey = (code, name) => code || `n:${normalizeText(name)}`;
/** Tập khoá đã duyệt bỏ qua (theo mã và theo tên chuẩn hoá) từ các quy tắc UNIT_OK đã lưu. */
export const approvedKeys = (rules) => {
  const set = new Set();
  for (const r of rules || []) { if (r?.kind !== "UNIT_OK") continue; if (r.code) set.add(r.code); if (r.name) set.add(`n:${normalizeText(r.name)}`); if (r.key) set.add(r.key); }
  return set;
};
export const vagueMaterials = (receipts, approved = new Set()) => {
  const map = new Map();
  let hinted = new Set();
  const skipped = new Set();
  for (const r of receipts || []) {
    for (const it of r.items || []) {
      if (NON_MATERIAL.has(it.kind) || !String(it.materialName || "").trim()) continue;
      const cls = unitClass(it.unit);
      if (!cls) continue;
      const key = vagueKey(it.materialCode, it.materialName);
      if (approved.has(key) || approved.has(`n:${normalizeText(it.materialName)}`)) { skipped.add(key); continue; }
      if (hasQuantityInName(it.materialName)) { hinted.add(key); continue; }
      const row = map.get(key) || { key, name: it.materialName, code: it.materialCode || "", units: new Map(), receipts: new Map(), amount: 0, lastAt: 0, lastReceiptId: "", classes: new Set() };
      const at = Number(r.purchaseDate || 0);
      row.units.set(String(it.unit || "(trống)").trim(), (row.units.get(String(it.unit || "(trống)").trim()) || 0) + Number(it.qty || 0));
      row.receipts.set(r.id, true);
      row.amount += Number(it.amount ?? Math.round(Number(it.qty || 0) * Number(it.unitPrice || 0)));
      row.classes.add(cls);
      if (at >= row.lastAt) { row.lastAt = at; row.lastReceiptId = r.id; row.name = it.materialName; }
      map.set(key, row);
    }
  }
  const rows = [...map.values()].map((x) => ({ ...x, receiptCount: x.receipts.size, receiptIds: [...x.receipts.keys()], unitList: [...x.units].map(([unit, qty]) => ({ unit, qty })), kind: x.classes.has("packaged") ? "packaged" : "unknown" }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "vi"));
  return { rows, hintedCount: [...hinted].filter((k) => !map.has(k)).length, approvedCount: skipped.size };
};
