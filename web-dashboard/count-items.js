// Danh sách vật tư cần kiểm đếm hằng tuần: cấu hình (thêm/bớt) và gợi ý theo menu hiện tại. Hàm thuần, không Firebase, không DOM.
import { materialById, matchMaterial, unitFactor } from "./cost-recipe.js?v=20261029-34";
import { COUNT_ITEMS } from "./stock-count.js?v=20261029-34";
import { isSummaryReceipt, normalizeText } from "./expense-rules.js?v=20261029-34";

/** Nhóm tươi sống, mua dùng trong ngày: không đáng đếm tồn hằng tuần (khoai tây đông lạnh là ngoại lệ, để được lâu). */
const FRESH_GROUPS = new Set(["RAU"]);
const KEEPS_LONG = new Set(["khoai_tay"]);

/** Đồ liên quan đến sữa (nhóm SUA, tính theo g hoặc ml) luôn đếm bằng g / ml, không đếm theo hộp. */
export const isMilkRaw = (material) => Boolean(material && material.group === "SUA" && (material.base === "g" || material.base === "ml"));

/** Đơn vị đếm thuận tay cho một vật tư: kg / lít cho vật tư cân đong, riêng đồ sữa đếm thẳng g / ml. */
export const countUnitFor = (material) => {
  if (!material) return "";
  if (isMilkRaw(material)) return material.base;
  if (material.base === "g") return "kg";
  if (material.base === "ml") return "lít";
  return material.base;
};

/** Đơn vị đếm hợp lệ: đồ sữa bị ép về g / ml dù cấu hình cũ ghi hộp. */
const fixUnit = (id, unit) => (isMilkRaw(materialById.get(id)) ? materialById.get(id).base : unit);

const validEntry = (e) => e && typeof e.id === "string" && typeof e.unit === "string" && e.id && e.unit;

/** Cấu hình từ Firestore (hoặc undefined) → { items:[{id,unit}], dismissed:[id] }. Chưa có cấu hình thì dùng danh sách mặc định. */
export const normalizeCountConfig = (data) => {
  if (!data || !Array.isArray(data.items)) return { items: COUNT_ITEMS.map((x) => ({ id: x.id, unit: fixUnit(x.id, x.unit) })), dismissed: [], custom: false };
  const seen = new Set();
  const items = data.items.filter(validEntry).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).map((e) => ({ id: e.id, unit: fixUnit(e.id, e.unit) }));
  return { items, dismissed: Array.isArray(data.dismissed) ? [...new Set(data.dismissed.filter((x) => typeof x === "string"))] : [], custom: true };
};

/** Thêm một vật tư vào danh sách (bỏ khỏi danh sách đã bỏ qua). Trả cấu hình mới, hoặc null nếu không đếm được (thiếu vật tư / đơn vị không quy đổi). */
export const addCountItem = (cfg, id, unit) => {
  const m = materialById.get(id);
  const u = fixUnit(id, unit || countUnitFor(m));
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

/** Số ngày có mua từng vật tư trong 30 ngày trước `now`. Mua gần mỗi ngày (từ 12 ngày trở lên) là đồ tươi dùng trong ngày, không đáng đếm tồn. */
export const buyDaysLast30 = (receipts, now = Date.now()) => {
  const days = {};
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    if (!(at > now - 30 * 86400000 && at <= now)) continue;
    const key = new Date(at).toDateString();
    for (const l of r.items || []) { const m = matchMaterial(l); if (m) (days[m.id] ||= new Set()).add(key); }
  }
  return Object.fromEntries(Object.entries(days).map(([id, set]) => [id, set.size]));
};
export const DAILY_BUY_DAYS = 12;

const isStorable = (m) => m && m.kind === "NL" && !m.stub && (!FRESH_GROUPS.has(m.group) || KEEPS_LONG.has(m.id));

/**
 * Gợi ý vật tư lớn nên đếm, theo MENU HIỆN TẠI và thời điểm đếm.
 * usagePerDay: { materialId: lượng dùng mỗi ngày (đơn vị định lượng) } tính từ món đang bán × công thức.
 * costs: { materialId: { unitCost } }. buyDays: số ngày có mua trong 30 ngày (đồ mua gần mỗi ngày bị loại). firstBuy: { materialId: lần nhập mua đầu tiên }. countAt: thời điểm đếm.
 * Chỉ gợi ý vật tư đã từng nhập mua TRƯỚC thời điểm đếm (chưa mua thì không thể có tồn để đếm); ngược lại đếm vào skipped.
 */
export const suggestCountItems = ({ usagePerDay = {}, costs = {}, firstBuy = {}, buyDays = {}, countAt = Date.now(), cfg, limit = 6, minShare = 0.03 }) => {
  const listed = new Set(cfg.items.map((x) => x.id));
  const dismissed = new Set(cfg.dismissed);
  const rows = [];
  let total = 0;
  const skipped = { notBoughtYet: [], noPrice: [], daily: [] };
  for (const [id, perDay] of Object.entries(usagePerDay)) {
    const m = materialById.get(id);
    if (!isStorable(m) || !(perDay > 0)) continue;
    const unitCost = costs[id]?.unitCost ?? null;
    const value = unitCost > 0 ? perDay * unitCost : null;
    if (value !== null) total += value;
    if (listed.has(id) || dismissed.has(id)) continue;
    const first = firstBuy[id];
    if (!first || first > countAt) { skipped.notBoughtYet.push(m.name); continue; }
    if ((buyDays[id] || 0) >= DAILY_BUY_DAYS) { skipped.daily.push(m.name); continue; }
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

/** Tìm vật tư theo tên (không phân biệt hoa thường và dấu, gồm cả tên gọi khác). Mọi từ gõ vào phải xuất hiện; tên bắt đầu bằng từ khoá xếp trước. */
export const searchCountMaterials = (query, materials, limit = 8) => {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  for (const m of materials) {
    const name = normalizeText(m.name);
    const words = [name, ...(m.aliases || []).map(normalizeText)].join(" ").split(" ");
    if (!tokens.every((t) => words.some((w) => w.startsWith(t)))) continue; // mỗi từ gõ vào khớp đầu một từ trong tên
    const rank = name.startsWith(tokens[0]) ? 0 : tokens.every((t) => name.split(" ").some((w) => w.startsWith(t))) ? 1 : 2;
    scored.push({ m, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.m.name.localeCompare(b.m.name, "vi")).slice(0, limit).map((x) => x.m);
};
