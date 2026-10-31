// Phân tích riêng một món từ snapshot ngày (dashboardDaily). Hàm thuần, không đọc Firebase, không có DOM.
// Snapshot chỉ có {name, qty, revenue} theo món theo ngày: giá bán thực tế = doanh thu / số phần bán lẻ.
import { expandComboName } from "./demo-receipts.js?v=20261029-33";

const nameKey = (s) => String(s || "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();
const isCombo = (name) => String(name || "").startsWith("COMBO");
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const weekdayOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** Dòng bán của một ngày: bán lẻ theo tên món, và số phần nằm trong combo. */
const dayItems = (snapshot) => {
  const retail = new Map();
  const combo = new Map();
  for (const it of Array.isArray(snapshot?.items) ? snapshot.items : []) {
    const qty = Number(it.qty || 0);
    if (!(qty > 0)) continue;
    if (isCombo(it.name)) { for (const [n, q] of expandComboName(it.name, qty)) { const k = nameKey(n); if (k) { const c = combo.get(k) || { name: String(n).trim(), qty: 0 }; c.qty += q; combo.set(k, c); } } continue; }
    const k = nameKey(it.name);
    if (!k) continue;
    const cur = retail.get(k) || { name: String(it.name).trim(), qty: 0, revenue: 0 };
    cur.qty += qty; cur.revenue += Number(it.revenue || 0);
    retail.set(k, cur);
  }
  return { retail, combo };
};

/** Danh sách món trong kỳ (bán lẻ + trong combo), nhiều nhất trước. */
export const itemChoices = (docs, keys) => {
  const map = new Map();
  for (const key of keys) {
    if (!docs?.[key]) continue;
    const { retail, combo } = dayItems(docs[key]);
    for (const [k, r] of retail) { const c = map.get(k) || { name: r.name, retail: 0, inCombo: 0 }; c.retail += r.qty; map.set(k, c); }
    for (const [k, q] of combo) { const c = map.get(k) || { name: q.name, retail: 0, inCombo: 0 }; c.inCombo += q.qty; map.set(k, c); }
  }
  return [...map.values()].map((c) => ({ ...c, total: c.retail + c.inCombo })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
};

/** Chuỗi theo ngày của một món. Ngày chưa có snapshot: available=false (không tính là 0). */
export const itemSeries = (docs, keys, name) => {
  const k = nameKey(name);
  return keys.map((dateKey) => {
    if (!docs?.[dateKey]) return { dateKey, available: false, retail: 0, inCombo: 0, revenue: 0, avgPrice: null };
    const { retail, combo } = dayItems(docs[dateKey]);
    const r = retail.get(k);
    return { dateKey, available: true, retail: r?.qty || 0, inCombo: combo.get(k)?.qty || 0, revenue: r?.revenue || 0, avgPrice: r?.qty ? Math.round(r.revenue / r.qty) : null };
  });
};

const roundUp1000 = (v) => Math.ceil(v / 1000) * 1000;

/**
 * Phân tích tổng hợp.
 * allRows: [{name, retail, revenue, unitCost|null}] của mọi món trong kỳ (để xếp hạng và phân loại).
 * target: ngưỡng % giá vốn an toàn của món (đồ ăn 0,40, đồ uống 0,30) để gợi ý giá.
 */
export const analyzeItem = ({ series, listPrice = 0, unitCost = null, allRows = [], name = "", target = 0.35, food = null }) => {
  const avail = series.filter((d) => d.available);
  const sold = avail.filter((d) => d.retail > 0);
  const retail = avail.reduce((t, d) => t + d.retail, 0);
  const inCombo = avail.reduce((t, d) => t + d.inCombo, 0);
  const revenue = avail.reduce((t, d) => t + d.revenue, 0);
  const avgPrice = retail ? Math.round(revenue / retail) : null;
  const prices = sold.map((d) => d.avgPrice);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  // Đổi giá: ngày có giá bình quân lệch hơn 3% so với ngày bán liền trước (giảm giá, đổi giá niêm yết, bán kèm khuyến mãi).
  const priceChanges = [];
  for (let i = 1; i < sold.length; i++) {
    const prev = sold[i - 1].avgPrice, cur = sold[i].avgPrice;
    if (prev > 0 && Math.abs(cur - prev) / prev > 0.03) priceChanges.push({ dateKey: sold[i].dateKey, from: prev, to: cur });
  }

  const best = sold.length ? sold.reduce((a, b) => (b.retail > a.retail ? b : a)) : null;
  const worst = sold.length ? sold.reduce((a, b) => (b.retail < a.retail ? b : a)) : null;

  const wd = WEEKDAYS.map((label, day) => {
    const days = avail.filter((d) => weekdayOf(d.dateKey) === day);
    const qty = days.reduce((t, d) => t + d.retail, 0);
    return { label, day, days: days.length, avg: days.length ? qty / days.length : null };
  });
  const wdVals = wd.filter((w) => w.avg !== null);
  const bestWeekday = wdVals.length >= 3 ? wdVals.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;

  // Xu hướng: bình quân phần/ngày nửa sau so với nửa đầu (cần ít nhất 6 ngày có số liệu).
  let trend = null;
  if (avail.length >= 6) {
    const half = Math.floor(avail.length / 2);
    const first = avail.slice(0, half), last = avail.slice(avail.length - half);
    const a = first.reduce((t, d) => t + d.retail + d.inCombo, 0) / half;
    const b = last.reduce((t, d) => t + d.retail + d.inCombo, 0) / half;
    // Món bán quá ít (dưới 1 phần/ngày ở nửa đầu hoặc dưới 10 phần cả kỳ) thì % tăng giảm không đáng tin: bỏ.
    const made = avail.reduce((t, d) => t + d.retail + d.inCombo, 0);
    trend = a >= 1 && made >= 10 ? { from: a, to: b, pct: (b - a) / a } : null;
  }

  const k = nameKey(name);
  const byRev = [...allRows].sort((x, y) => y.revenue - x.revenue);
  const byQty = [...allRows].sort((x, y) => y.retail - x.retail);
  const totalRev = allRows.reduce((t, r) => t + r.revenue, 0);
  const rankRevenue = byRev.findIndex((r) => nameKey(r.name) === k) + 1 || null;
  const rankQty = byQty.findIndex((r) => nameKey(r.name) === k) + 1 || null;

  // Lợi nhuận gộp (chỉ trên phần bán lẻ: combo là giá chung, không chia được doanh thu cho từng món).
  const hasCost = unitCost !== null && unitCost > 0 && avgPrice;
  const profit = hasCost ? (() => {
    const unitMargin = avgPrice - unitCost;
    const grossProfit = Math.round(unitMargin * retail);
    const costPct = unitCost / avgPrice;
    const priced = allRows.filter((r) => r.unitCost > 0 && r.retail > 0);
    const profits = priced.map((r) => ({ name: r.name, gp: (r.revenue / r.retail - r.unitCost) * r.retail }));
    const totalGp = profits.reduce((t, r) => t + r.gp, 0);
    const rankProfit = [...profits].sort((x, y) => y.gp - x.gp).findIndex((r) => nameKey(r.name) === k) + 1 || null;
    const listCostPct = listPrice > 0 ? unitCost / listPrice : null;
    // Giá để giá vốn bằng ngưỡng an toàn của nhóm món.
    const safePrice = roundUp1000(unitCost / target);
    // Tăng giá thêm bước 5.000đ: lượng bán giảm tối đa bao nhiêu thì lợi nhuận gộp không tụt.
    const step = 5000;
    const breakEvenDrop = unitMargin > 0 ? step / (unitMargin + step) : null;
    return { unitCost: Math.round(unitCost), unitMargin: Math.round(unitMargin), marginPct: unitMargin / avgPrice, costPct, listCostPct, grossProfit, shareOfProfit: totalGp > 0 ? (unitMargin * retail) / totalGp : null, rankProfit, ofProfit: priced.length, safePrice, safePriceGap: safePrice - avgPrice, step, breakEvenDrop, costAllMade: Math.round(unitCost * (retail + inCombo)) };
  })() : null;

  // Phân loại menu (menu engineering): phổ biến = bán lẻ ≥ 70% mức trung bình của các món; sinh lời = biên lợi nhuận/phần ≥ bình quân gia quyền.
  let quadrant = null;
  const pricedAll = allRows.filter((r) => r.unitCost > 0 && r.retail > 0);
  // So sánh trong cùng nhóm (đồ ăn với đồ ăn, đồ uống với đồ uống) khi nhóm có từ 4 món; không thì so chung.
  const sameGroup = food === null ? [] : pricedAll.filter((r) => r.food === food);
  const priced = sameGroup.length >= 4 ? sameGroup : pricedAll;
  const scope = sameGroup.length >= 4 ? (food ? "các món ăn" : "các đồ uống") : "tất cả các món";
  if (profit && priced.length >= 4) {
    const totalQty = priced.reduce((t, r) => t + r.retail, 0);
    const avgQty = totalQty / priced.length;
    const wMargin = priced.reduce((t, r) => t + (r.revenue / r.retail - r.unitCost) * r.retail, 0) / totalQty;
    const popular = retail >= 0.7 * avgQty;
    const rich = profit.unitMargin >= wMargin;
    quadrant = popular && rich ? { key: "star", label: "Món ngôi sao", tip: "Bán chạy và lời cao: giữ chất lượng, đặt vị trí nổi bật, đừng giảm giá." }
      : popular ? { key: "horse", label: "Món kéo khách", tip: "Bán chạy nhưng lãi mỗi phần dưới bình quân: thử tăng giá nhẹ, giảm định lượng hoặc bán kèm món lời cao." }
        : rich ? { key: "puzzle", label: "Món lời cao ít người gọi", tip: "Lãi mỗi phần cao nhưng ít bán: đưa lên đầu menu, nhân viên gợi ý, ghép combo." }
          : { key: "dog", label: "Món yếu", tip: "Bán ít và lãi mỗi phần dưới mức bình quân các món xem lại giá, công thức, hoặc cân nhắc bỏ khỏi menu." };
    quadrant.scope = scope; quadrant.n = priced.length; quadrant.avgQty = avgQty; quadrant.avgMargin = Math.round(wMargin);
  }

  return {
    retail, inCombo, totalMade: retail + inCombo, revenue, avgPrice, minPrice, maxPrice, listPrice: Number(listPrice || 0),
    realization: listPrice > 0 && avgPrice ? avgPrice / listPrice : null,
    priceChanges, soldDays: sold.length, openDays: avail.length, missingDays: series.length - avail.length,
    perSoldDay: sold.length ? retail / sold.length : null, perOpenDay: avail.length ? retail / avail.length : null,
    best, worst, weekdays: wd, bestWeekday, trend, share: totalRev > 0 ? revenue / totalRev : null, rankRevenue, rankQty, ofItems: allRows.length,
    comboShare: retail + inCombo ? inCombo / (retail + inCombo) : null, profit, quadrant,
  };
};
