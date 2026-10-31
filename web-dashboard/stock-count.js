// Kiểm đếm tồn kho hằng tuần cho vật tư đắt / để lâu, và hao hụt giữa hai lần đếm.
// Thực dùng = tồn lần trước + nhập trong kỳ − tồn lần này. Hao hụt = thực dùng − định mức (món bán × công thức).
import { materialById, matchMaterial, unitFactor } from "./cost-recipe.js?v=20261029-35";
import { isSummaryReceipt } from "./expense-rules.js?v=20261029-35";

/** Vật tư cần đếm và đơn vị đếm thuận tay (quy đổi về đơn vị định lượng khi lưu). */
export const COUNT_ITEMS = [
  ["cf_phin", "kg"], ["cf_espresso", "kg"], ["cf_coldbrew", "kg"], ["sua_dac", "g"], ["kem_beo", "ml"],
  ["sua_tuoi", "ml"], ["bo_lat", "g"], ["pate", "kg"], ["dau_an", "lít"], ["thit_bo", "kg"],
].map(([id, unit]) => ({ id, unit }));

/** Đổi số đếm (theo đơn vị đếm) ra đơn vị định lượng. null nếu không đổi được. */
export const countToBase = (materialId, unit, qty) => {
  const m = materialById.get(materialId);
  const f = m && unitFactor(m, unit);
  const q = Number(qty);
  return f && Number.isFinite(q) && q >= 0 ? q * f : null;
};

const purchasedBetween = (receipts, from, to) => {
  const out = {};
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    if (at <= from || at > to) continue; // nhập sau lần đếm trước, tới hết lần đếm này
    for (const l of r.items || []) {
      const m = matchMaterial(l);
      const f = m && unitFactor(m, l.unit);
      if (m && f) out[m.id] = (out[m.id] || 0) + Number(l.qty || 0) * f;
    }
  }
  return out;
};

/**
 * Hao hụt giữa hai lần đếm liên tiếp. prev/next: { countedAt, items: { materialId: lượng theo đơn vị định lượng } }.
 * expectedUsage(from, to) trả { materialId: lượng lẽ ra dùng }. costs: giá vật tư (materialCosts().costs).
 * Vật tư chỉ có ở một trong hai lần đếm thì bỏ qua (không đủ số để tính).
 */
export const varianceBetween = ({ prev, next, receipts, expectedUsage, costs = {} }) => {
  const from = Number(prev.countedAt), to = Number(next.countedAt);
  const bought = purchasedBetween(receipts, from, to);
  const expected = expectedUsage(from, to) || {};
  const rows = [];
  for (const id of Object.keys(next.items || {})) {
    if (!(id in (prev.items || {}))) continue;
    const m = materialById.get(id);
    if (!m) continue;
    const actual = Number(prev.items[id]) + (bought[id] || 0) - Number(next.items[id]);
    const exp = expected[id] || 0;
    const diff = actual - exp;
    const unitCost = costs[id]?.unitCost ?? null;
    rows.push({ materialId: id, name: m.name, base: m.base, opening: Number(prev.items[id]), bought: bought[id] || 0, closing: Number(next.items[id]), actual, expected: exp, diff, diffPct: exp > 0 ? diff / exp : null, diffValue: unitCost === null ? null : Math.round(diff * unitCost), suspicious: actual < 0 });
  }
  return rows.sort((a, b) => Math.abs(b.diffValue ?? 0) - Math.abs(a.diffValue ?? 0) || a.name.localeCompare(b.name));
};

/**
 * Lần đếm DEMO khớp với bộ phiếu demo: mô phỏng tồn kho theo ngày (nhập vào, dùng ra theo định mức × hao hụt),
 * đếm mỗi `every` ngày lúc 22:00. Tồn đầu kỳ = 3 ngày dùng.
 */
export const buildDemoCounts = ({ receipts, usagePerDay, waste = {}, now = Date.now(), days = 30, every = 7, batch = "demo" }) => {
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)).getTime();
  const stock = Object.fromEntries(COUNT_ITEMS.map(({ id }) => [id, (usagePerDay[id] || 0) * 3]));
  const counts = [];
  for (let d = 0; d < days; d += 1) {
    const dayStart = start + d * 86400000;
    const bought = purchasedBetween(receipts, dayStart - 1, dayStart + 86400000 - 1);
    for (const { id } of COUNT_ITEMS) stock[id] = Math.max(0, stock[id] + (bought[id] || 0) - (usagePerDay[id] || 0) * (waste[id] ?? 1.04));
    const countedAt = dayStart + 22 * 3600000;
    if (d % every === 0 && countedAt <= now) {
      const items = Object.fromEntries(COUNT_ITEMS.filter(({ id }) => usagePerDay[id] > 0).map(({ id }) => [id, Math.round(stock[id])]));
      const key = new Date(countedAt);
      const id = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, "0")}-${String(key.getDate()).padStart(2, "0")}`;
      counts.push({ id, countedAt, countedBy: "Demo · Tuấn", items, demo: true, demoBatch: batch });
    }
  }
  return counts;
};

/**
 * Giá trị tiền của một lần đếm: lượng tồn × giá vốn mỗi đơn vị định lượng (bình quân từ phiếu chi).
 * count: { items: { materialId: lượng đơn vị định lượng } }. costs: materialCosts().costs.
 * Vật tư chưa có giá thì không cộng vào tổng và được liệt kê riêng để người dùng biết con số còn thiếu.
 */
export const stockValue = (count, costs = {}) => {
  const rows = [];
  const unpriced = [];
  for (const [id, qty] of Object.entries(count?.items || {})) {
    const m = materialById.get(id);
    const q = Number(qty);
    if (!m || !(q >= 0)) continue;
    const fromReceipts = costs[id]?.unitCost;
    const manual = Number(count?.manualCosts?.[id]);
    const unitCost = fromReceipts > 0 ? fromReceipts : manual > 0 ? manual : null; // giá phiếu chi ưu tiên; không có thì dùng giá ước tính nhập tay
    if (!(unitCost > 0)) { if (q > 0) unpriced.push(m.name); continue; }
    rows.push({ materialId: id, name: m.name, base: m.base, qty: q, unitCost, value: Math.round(q * unitCost), estimated: !(fromReceipts > 0) });
  }
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "vi"));
  return { rows, total: rows.reduce((t, r) => t + r.value, 0), unpriced, estimated: rows.filter((r) => r.estimated).length };
};

/** Bản ghi giá trị lưu cùng lần đếm: giữ đơn giá tại thời điểm đếm để phân tích về sau không bị đổi theo giá hiện tại. */
export const makeValuation = (count, costs = {}) => {
  const v = stockValue(count, costs);
  return { total: v.total, unpriced: v.unpriced, estimated: v.estimated, rows: v.rows.map((r) => ({ materialId: r.materialId, qty: r.qty, unitCost: r.unitCost, value: r.value, estimated: r.estimated })) };
};

/** Giá trị của một lần đếm: dùng bản đã lưu lúc đếm nếu có, không thì tính theo giá hiện tại. Cùng dạng với stockValue. */
export const countValuation = (count, costs = {}) => {
  const saved = count?.valuation;
  if (!saved || !Array.isArray(saved.rows)) return stockValue(count, costs);
  const rows = saved.rows.map((r) => { const m = materialById.get(r.materialId); return m ? { materialId: r.materialId, name: m.name, base: m.base, qty: Number(r.qty), unitCost: Number(r.unitCost), value: Number(r.value), estimated: Boolean(r.estimated) } : null; }).filter(Boolean)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "vi"));
  return { rows, total: Number(saved.total) || rows.reduce((t, r) => t + r.value, 0), unpriced: Array.isArray(saved.unpriced) ? saved.unpriced : [], estimated: Number(saved.estimated) || 0 };
};

/** So sánh hai lần đếm (a: kỳ trước, b: kỳ sau) theo từng vật tư: lượng và giá trị, kèm tổng. */
export const compareStock = (a, b, costs = {}) => {
  const va = countValuation(a, costs), vb = countValuation(b, costs);
  const ma = new Map(va.rows.map((r) => [r.materialId, r])), mb = new Map(vb.rows.map((r) => [r.materialId, r]));
  const ids = [...new Set([...Object.keys(a?.items || {}), ...Object.keys(b?.items || {})])].filter((id) => materialById.has(id));
  const pct = (from, to) => (from > 0 ? (to - from) / from : null);
  const rows = ids.map((id) => {
    const m = materialById.get(id), qa = a?.items?.[id], qb = b?.items?.[id];
    const qtyA = qa === undefined ? null : Number(qa), qtyB = qb === undefined ? null : Number(qb);
    const valA = ma.get(id)?.value ?? null, valB = mb.get(id)?.value ?? null;
    const dVal = (valA ?? 0) !== 0 || (valB ?? 0) !== 0 ? (valB ?? 0) - (valA ?? 0) : 0;
    return { materialId: id, name: m.name, base: m.base, qtyA, qtyB, dQty: (qtyB ?? 0) - (qtyA ?? 0), valA, valB, dVal, dPct: pct(valA ?? 0, valB ?? 0) };
  }).sort((x, y) => Math.abs(y.dVal) - Math.abs(x.dVal) || x.name.localeCompare(y.name, "vi"));
  return { rows, totalA: va.total, totalB: vb.total, dTotal: vb.total - va.total, dPct: pct(va.total, vb.total) };
};
