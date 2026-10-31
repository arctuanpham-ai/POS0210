// Sản lượng thực làm: tách combo thành món lẻ để thống kê số phần và nguyên liệu tiêu hao. Hàm thuần.
// Doanh thu vẫn tính theo dòng bán (combo là một dòng giá cố định); file này chỉ trả lời "bếp đã làm bao nhiêu phần".
import { expandComboName } from "./demo-receipts.js?v=20261029-37";

const nameKey = (s) => String(s || "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();
const isCombo = (name) => String(name || "").startsWith("COMBO");

/**
 * Gộp snapshot ngày của các ngày `keys` thành sản lượng theo món lẻ.
 * retail: bán lẻ; inCombo: nằm trong combo; total = retail + inCombo; revenue: doanh thu của dòng bán lẻ (không chia từ combo).
 */
export const outputRows = (docs, keys) => {
  const map = new Map();
  const add = (name, field, qty, revenue = 0) => {
    const k = nameKey(name);
    if (!k || !(qty > 0)) return;
    const cur = map.get(k) || { name: String(name).trim(), retail: 0, inCombo: 0, total: 0, revenue: 0 };
    cur[field] += qty;
    cur.total += qty;
    cur.revenue += revenue;
    map.set(k, cur);
  };
  for (const key of keys) {
    for (const it of Array.isArray(docs?.[key]?.items) ? docs[key].items : []) {
      const qty = Number(it.qty || 0);
      if (isCombo(it.name)) for (const [n, q] of expandComboName(it.name, qty)) add(n, "inCombo", q);
      else add(it.name ?? "Món", "retail", qty, Number(it.revenue || 0));
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
};

/** Số combo đã bán trong kỳ (để ghi chú), theo dòng bán. */
export const comboCount = (docs, keys) => keys.reduce((t, key) => t + (Array.isArray(docs?.[key]?.items) ? docs[key].items : []).filter((it) => isCombo(it.name)).reduce((s, it) => s + Number(it.qty || 0), 0), 0);

/**
 * Nguyên liệu tiêu hao = Σ sản lượng món lẻ × công thức hiện hành.
 * recipeFor(tênMón) → { lines: [{materialId, qty}], saved: boolean }. Món không có công thức vào `noRecipe`; món dùng bản đề xuất (chưa lưu) vào `drafts`.
 */
export const materialConsumption = (rows, recipeFor) => {
  const usage = {};
  const noRecipe = [];
  const drafts = [];
  for (const r of rows) {
    const rec = recipeFor(r.name) || { lines: [], saved: false };
    const lines = (rec.lines || []).filter((l) => Number(l.qty) > 0);
    if (!lines.length) { noRecipe.push(r.name); continue; }
    if (!rec.saved) drafts.push(r.name);
    for (const l of lines) usage[l.materialId] = (usage[l.materialId] || 0) + Number(l.qty) * r.total;
  }
  return { usage, noRecipe, drafts };
};

/** Số lượng theo đơn vị gốc → chữ dễ đọc: g → kg, ml → lít. */
export const formatBaseQty = (qty, base) => (base === "g" || base === "ml")
  ? `${(qty / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ${base === "g" ? "kg" : "lít"}`
  : `${Math.round(qty * 10) / 10} ${base}`;
