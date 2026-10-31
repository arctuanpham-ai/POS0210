// Danh sách vật tư cần kiểm đếm hằng tuần: cấu hình (thêm/bớt) và gợi ý theo menu hiện tại. Hàm thuần, không Firebase, không DOM.
import { materialById, matchMaterial, unitFactor } from "./cost-recipe.js?v=20261029-28";
import { COUNT_ITEMS } from "./stock-count.js?v=20261029-28";
import { isSummaryReceipt, normalizeText } from "./expense-rules.js?v=20261029-28";

/** Nhóm tươi sống, mua dùng trong ngày: không đáng đếm tồn hằng tuần (khoai tây đông lạnh là ngoại lệ, để được lâu). */
const FRESH_GROUPS = new Set(["RAU"]);
const KEEPS_LONG = new Set(["khoai_tay"]);

/** Đơn vị đếm thuận tay cho một vật tư: kg / lít cho vật tư cân đong, hộp cho sữa, còn lại theo đơn vị định lượng. */
export const countUnitFor = (material) => {
  if (!material) return "";
  const units = (material.units || []).map((u) => u.unit);
  if (material.base === "g") return units.includes("hộp") ? "hộp" : "kg";
  if (material.base === "ml") return units.includes("hộp") ? "hộp" : "lít";
  return material.base;
};

const validEntry = (e) => e && typeof e.id === "string" && typeof e.unit === "string" && e.id && e.unit;

/** Cấu hình từ Firestore (hoặc undefined) → { items:[{id,unit}], dismissed:[id] }. Chưa có cấu hình thì dùng danh sách mặc định. */
export const normalizeCountConfig = (data) => {
  if (!data || !Array.isArray(data.items)) return { items: COUNT_ITEMS.map((x) => ({ ...x })), dismissed: [], custom: false };
  const seen = new Set();
  const items = data.items.filter(validEntry).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).map((e) => ({ id: e.id, unit: e.unit }));
  return { items, dismissed: Array.isArray(data.dismissed) ? [...new Set(data.dismissed.filter((x) => typeof x === "string"))] : [], custom: true };
};

/** Thêm một vật tư vào danh sách (bỏ khỏi danh sách đã bỏ qua). Trả cấu hình mới, hoặc null nếu không đếm được (thiếu vật tư / đơn vị không quy đổi). */
export const addCountItem = (cfg, id, unit) => {
  const m = materialById.get(id);
  const u = unit || countUnitFor(m);
  if (!m || !u || unitFactor(m, u) === null) return null;
  if (cfg.items.some((x) => x.id === id)) return { ...cfg, dismissed: cfg.dismissed.filter((x) => x !== id) };
  return { ...cfg, items: [...cfg.items, { id, unit: u }], dismissed: cfg.dismissed.filter((x) => x !== id), custom: true };
};

/** Bỏ một vật tư khỏi danh sách; ghi vào danh sách bỏ qua để không gợi ý lại. Số đếm đã lưu trước đó không bị xoá. */
export const removeCountItem = (cfg, id) => ({ ...cfg, items: cfg.items.filter((x) => x.id !== id), dismissed: [...new Set([...cfg.dismissed, id])], custom: true });

/** Bỏ qua một gợi ý (không đưa vào danh sách, không gợi ý lại). */
export const dismissCountItem = (cfg, id) => ({ ...cfg, dismissed: [...new Set([...cfg.dismissed, id])], custom: true });

/** Thời điểm nhập mua đầu tiên của từng vật tư, từ các phiếu chưa huỷ (bỏ phiếu tổng vì không có dòng chi tiết). */
export const firstPurchaseTimes = (receipts) => {
  const out = {};
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    if (!(at > 0)) continue;
    for (const l of r.items || []) {
      const m = matchMaterial(l);
      if (m && Number(l.qty || 0) > 0 && (!(m.id in out) || at < out[m.id])) out[m.id] = at;
    }
  }
  return out;
};

const isStorable = (m) => m && m.kind === "NL" && !m.stub && (!FRESH_GROUPS.has(m.group) || KEEPS_LONG.has(m.id));

/**
 * Gợi ý vật tư lớn nên đếm, theo MENU HIỆN TẠI và thời điểm đếm.
 * usagePerDay: { materialId: lượng dùng mỗi ngày (đơn vị định lượng) } tính từ món đang bán × công thức.
 * costs: { materialId: { unitCost } }. firstBuy: { materialId: lần nhập mua đầu tiên }. countAt: thời điểm đếm.
 * Chỉ gợi ý vật tư đã từng nhập mua TRƯỚC thời điểm đếm (chưa mua thì không thể có tồn để đếm); ngược lại đếm vào skipped.
 */
export const suggestCountItems = ({ usagePerDay = {}, costs = {}, firstBuy = {}, countAt = Date.now(), cfg, limit = 6, minShare = 0.03 }) => {
  const listed = new Set(cfg.items.map((x) => x.id));
  const dismissed = new Set(cfg.dismissed);
  const rows = [];
  let total = 0;
  const skipped = { notBoughtYet: [], noPrice: [] };
  for (const [id, perDay] of Object.entries(usagePerDay)) {
    const m = materialById.get(id);
    if (!isStorable(m) || !(perDay > 0)) continue;
    const unitCost = costs[id]?.unitCost ?? null;
    const value = unitCost > 0 ? perDay * unitCost : null;
    if (value !== null) total += value;
    if (listed.has(id) || dismissed.has(id)) continue;
    const first = firstBuy[id];
    if (!first || first > countAt) { skipped.notBoughtYet.push(m.name); continue; }
    if (value === null) { skipped.noPrice.push(m.name); continue; }
    rows.push({ id, name: m.name, base: m.base, unit: countUnitFor(m), perDay, valuePerDay: value, firstAt: first });
  }
  const ranked = rows.map((r) => ({ ...r, share: total > 0 ? r.valuePerDay / total : 0 })).sort((a, b) => b.valuePerDay - a.valuePerDay || a.name.localeCompare(b.name, "vi"));
  const picked = ranked.filter((r, i) => r.share >= minShare || i < 3).slice(0, limit);
  return { suggestions: picked, skipped, totalValuePerDay: total };
};

/** Vật tư có thể thêm tay: mọi vật tư nguyên liệu đếm được chưa có trong danh sách. */
export const addableMaterials = (cfg, materials) => {
  const listed = new Set(cfg.items.map((x) => x.id));
  return materials.filter((m) => m.kind === "NL" && !m.stub && !listed.has(m.id) && unitFactor(m, countUnitFor(m)) !== null)
    .sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)));
};
