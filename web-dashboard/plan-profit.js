// Dự báo nguyên liệu ngày mai và xếp hạng món theo lãi gộp. Hàm thuần.
import { averageDailySales, dailyMaterialUsage } from "./demo-receipts.js?v=20261029-15";
import { MATERIALS, materialById, recipeCost } from "./cost-recipe.js?v=20261029-15";

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Lượng bán dự kiến ngày mai theo món: TB cùng thứ trong 4 tuần (cần ≥ 2 ngày có bán), không thì TB 7 ngày gần nhất có bán. */
export function tomorrowSales(dailyDocs, now = new Date()) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const back = (n) => Array.from({ length: n }, (_, i) => keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const has = (k) => dailyDocs?.[k] && Number(dailyDocs[k].revenue || 0) > 0;
  const same = back(28).filter((k) => has(k) && new Date(`${k}T12:00:00`).getDay() === tomorrow.getDay());
  const recent = back(14).filter(has).slice(0, 7);
  const [keys, basis] = same.length >= 2 ? [same.slice(0, 4), `TB ${Math.min(4, same.length)} ngày cùng thứ`] : [recent, `TB ${recent.length} ngày gần nhất`];
  return { date: keyOf(tomorrow), sales: keys.length ? averageDailySales(dailyDocs, keys) : {}, basis, days: keys.length };
}

const fmtQty = (q, base) => {
  if (base === "g" && q >= 1000) return `${(q / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg`;
  if (base === "ml" && q >= 1000) return `${(q / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} lít`;
  return `${Math.ceil(q).toLocaleString("vi-VN")} ${base}`;
};

/** Danh sách cần chuẩn bị: định mức × lượng bán dự kiến × (1 + dự phòng). Chỉ nguyên liệu (NL), bỏ vận hành. */
export function prepList(sales, recipeFor, buffer = 0.1) {
  const usage = dailyMaterialUsage(sales, recipeFor);
  return Object.entries(usage)
    .map(([id, q]) => ({ id, m: materialById.get(id), q: q * (1 + buffer) }))
    .filter((x) => x.m && x.m.kind !== "VH" && x.q > 0)
    .sort((a, b) => MATERIALS.indexOf(a.m) - MATERIALS.indexOf(b.m))
    .map((x) => ({ id: x.id, name: x.m.name, kind: x.m.kind, qty: x.q, label: fmtQty(x.q, x.m.base) }));
}

/** Xếp hạng món theo lãi gộp = (giá bán − giá vốn công thức) × số lượng. Món thiếu giá vật tư: lãi gộp để trống, xếp cuối. */
export function profitRanking(items, menuItems, recipeFor, costs) {
  const norm = (s) => String(s || "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();
  return items.map((it) => {
    const m = menuItems.find((x) => String(x.id) === String(it.itemId)) || menuItems.find((x) => norm(x.name) === norm(it.name));
    const price = it.qty ? it.revenue / it.qty : Number(m?.price || 0);
    const lines = recipeFor(m?.name || it.name, m);
    const r = lines.length ? recipeCost(lines, costs, price) : null;
    const unitCost = r && r.complete ? r.total : null;
    const gross = unitCost === null ? null : Math.round((price - unitCost) * it.qty);
    return { name: it.name, qty: it.qty, revenue: it.revenue, price: Math.round(price), unitCost, gross, margin: unitCost === null || !price ? null : (price - unitCost) / price, missing: r ? r.missing : ["chưa có công thức"] };
  }).sort((a, b) => (b.gross ?? -Infinity) - (a.gross ?? -Infinity) || b.revenue - a.revenue);
}
