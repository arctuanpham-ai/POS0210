// Kiểm đếm tồn kho hằng tuần cho vật tư đắt / để lâu, và hao hụt giữa hai lần đếm.
// Thực dùng = tồn lần trước + nhập trong kỳ − tồn lần này. Hao hụt = thực dùng − định mức (món bán × công thức).
import { materialById, matchMaterial, unitFactor } from "./cost-recipe.js?v=20261017-06";
import { isSummaryReceipt } from "./expense-rules.js?v=20261017-06";

/** Vật tư cần đếm và đơn vị đếm thuận tay (quy đổi về đơn vị định lượng khi lưu). */
export const COUNT_ITEMS = [
  ["cf_phin", "kg"], ["cf_espresso", "kg"], ["cf_coldbrew", "kg"], ["sua_dac", "hộp"], ["kem_beo", "hộp"],
  ["sua_tuoi", "hộp"], ["bo_lat", "kg"], ["pate", "kg"], ["dau_an", "lít"], ["thit_bo", "kg"],
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
