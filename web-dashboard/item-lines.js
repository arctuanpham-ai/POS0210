// Phân tích món từ DÒNG MÓN của từng bill (orderItems) + sổ app food + phiếu mua. Hàm thuần, không đọc Firebase, không có DOM.
import { expandComboName } from "./demo-receipts.js?v=20261029-34";
import { materialById, materialCosts, recipeCost } from "./cost-recipe.js?v=20261029-34";

const nameKey = (s) => String(s || "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();
const isCombo = (name) => String(name || "").startsWith("COMBO");
export const channelOf = (method) => (method === "GRAB" ? "GRAB" : method === "SHOPEE" ? "SHOPEE" : "STORE");

/**
 * Gộp bill + lần gọi (batch) + dòng món thành bill có dòng món.
 * - Chỉ nhận bill đã có trong `bills` (đã lọc PAID, dữ liệu thật).
 * - Batch bị hủy không tính. Dòng điều chỉnh (qty âm) được cộng vào cùng món; món cộng xong ≤ 0 thì bỏ.
 * - Một phiên có nhiều bill (tách bill): KHÔNG chia được món cho từng bill nên bỏ qua, đếm riêng trong `skippedSplit`.
 * - Combo tách thành món lẻ (inCombo) để đếm gọi kèm và giờ bán; doanh thu combo không chia cho món lẻ.
 */
export const buildLineBills = ({ bills, batches, items }) => {
  const perSession = new Map();
  for (const b of bills) perSession.set(b.sessionId, (perSession.get(b.sessionId) || 0) + 1);
  const batchBySession = new Map();
  for (const b of Array.isArray(batches) ? batches : []) {
    if (b.status === "CANCELLED") continue;
    const list = batchBySession.get(String(b.sessionId)) || [];
    list.push(b);
    batchBySession.set(String(b.sessionId), list);
  }
  const itemsByBatch = new Map();
  for (const i of Array.isArray(items) ? items : []) {
    const list = itemsByBatch.get(String(i.batchId)) || [];
    list.push(i);
    itemsByBatch.set(String(i.batchId), list);
  }
  const out = [];
  let skippedSplit = 0;
  for (const bill of bills) {
    if ((perSession.get(bill.sessionId) || 0) > 1) { skippedSplit += 1; continue; }
    const map = new Map(); // key → {name, retail, inCombo, amount, atByQty}
    for (const batch of batchBySession.get(String(bill.sessionId)) || []) {
      const at = Number(batch.createdAt || 0);
      for (const it of itemsByBatch.get(String(batch.id)) || []) {
        const name = String(it.itemName ?? "").trim();
        const qty = Number(it.qty || 0);
        const amount = qty * Number(it.unitPrice || 0);
        if (!name || !qty) continue;
        const add = (n, field, q, amt) => {
          const k = nameKey(n);
          const cur = map.get(k) || { name: String(n).trim(), key: k, retail: 0, inCombo: 0, amount: 0, hours: new Map() };
          cur[field] += q; cur.amount += amt;
          if (at) { const h = new Date(at).getHours(); cur.hours.set(h, (cur.hours.get(h) || 0) + q); }
          map.set(k, cur);
        };
        if (isCombo(name)) {
          const parts = expandComboName(name, qty);
          if (parts.length && !(parts.length === 1 && parts[0][0] === name)) { parts.forEach(([n, q], idx) => add(n, "inCombo", q, idx === 0 ? amount : 0)); continue; }
        }
        add(name, "retail", qty, amount);
      }
    }
    const lines = [...map.values()].filter((l) => l.retail + l.inCombo > 0);
    out.push({ id: bill.id, method: bill.method, channel: channelOf(bill.method), openedAt: bill.openedAt, total: Number(bill.total || 0), subtotal: Number(bill.subtotal || 0), lines, hasLines: lines.length > 0 });
  }
  const withLines = out.filter((b) => b.hasLines);
  return { bills: withLines, billsTotal: bills.length, billsNoItems: out.length - withLines.length, skippedSplit };
};

const mean = (list) => (list.length ? list.reduce((t, x) => t + x, 0) / list.length : null);

/**
 * Thống kê một món trên các bill có dòng món: gọi kèm, bill trung bình, giờ bán, kênh bán.
 * pairs: món khác xuất hiện cùng bill; support = số bill có cả hai / số bill có món này; lift = support / tỷ lệ bill có món kia (>1: hay đi cùng nhau).
 */
export const itemBillStats = (lineBills, name, { minPairs = 3 } = {}) => {
  const k = nameKey(name);
  const N = lineBills.length;
  const has = (b) => b.lines.some((l) => l.key === k);
  const withItem = lineBills.filter(has);
  const without = lineBills.filter((b) => !has(b));
  const bills = withItem.length;
  const others = new Map(); // key → {name, together, billsWith}
  const bill = (b) => { for (const l of b.lines) { if (l.key === k) continue; const c = others.get(l.key) || { name: l.name, together: 0, billsWith: 0 }; c.billsWith += 1; others.set(l.key, c); } };
  lineBills.forEach(bill);
  const together = new Map();
  for (const b of withItem) for (const l of b.lines) { if (l.key === k) continue; together.set(l.key, (together.get(l.key) || 0) + 1); }
  const pairs = [...together.entries()].map(([key, c]) => {
    const o = others.get(key);
    const support = bills ? c / bills : 0;
    const base = N ? o.billsWith / N : 0;
    return { name: o.name, together: c, support, lift: base > 0 ? support / base : null };
  }).filter((p) => p.together >= minPairs).sort((a, b) => b.together - a.together || (b.lift ?? 0) - (a.lift ?? 0)).slice(0, 8);
  const alone = withItem.filter((b) => b.lines.every((l) => l.key === k)).length;
  const hours = Array(24).fill(0);
  const channels = { STORE: { bills: 0, qty: 0, revenue: 0 }, GRAB: { bills: 0, qty: 0, revenue: 0 }, SHOPEE: { bills: 0, qty: 0, revenue: 0 } };
  for (const b of withItem) {
    const l = b.lines.find((x) => x.key === k);
    for (const [h, q] of l.hours) hours[h] += q;
    const c = channels[b.channel];
    c.bills += 1; c.qty += l.retail + l.inCombo; c.revenue += l.retail > 0 ? l.amount : 0;
  }
  return {
    totalBills: N, bills, share: N ? bills / N : null, alone, aloneShare: bills ? alone / bills : null,
    avgBillWith: mean(withItem.map((b) => b.total)), avgBillWithout: mean(without.map((b) => b.total)),
    pairs, hours, channels,
  };
};

/**
 * Tỷ lệ app giữ lại theo từng app, từ sổ đối soát: phí + khuyến mãi/khác (chi phí thật) và thuế giữ hộ (VAT/PIT) tách riêng.
 * Chỉ dùng đơn hợp lệ (không cờ REVIEW). ok=false khi chưa đủ đơn để tin được.
 */
export const appDeductionRates = (rows, { minOrders = 10 } = {}) => {
  const acc = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.status === "REVIEW" || !(r.orderValue > 0) || !r.payoutDay) continue; // đơn chưa có tiền về thì app chưa trừ phí, không dùng để tính tỷ lệ
    const a = (acc[r.app] ||= { app: r.app, orders: 0, gross: 0, fee: 0, tax: 0, received: 0, first: r.saleDay, last: r.saleDay });
    a.orders += 1; a.gross += r.orderValue; a.fee += Number(r.commission || 0) + Number(r.other || 0); a.tax += Number(r.vat || 0) + Number(r.pit || 0); a.received += Number(r.received || 0);
    if (r.saleDay && (!a.first || r.saleDay < a.first)) a.first = r.saleDay;
    if (r.saleDay && (!a.last || r.saleDay > a.last)) a.last = r.saleDay;
  }
  return Object.fromEntries(Object.values(acc).map((a) => [a.app, { ...a, feeRate: a.fee / a.gross, taxRate: a.tax / a.gross, ok: a.orders >= minOrders }]));
};

/**
 * Lãi một phần theo kênh nếu bán ở giá `price`: tại quán không bị trừ; app trừ feeRate (phí + khuyến mãi). Thuế giữ hộ không tính vào lãi.
 * appPriceToMatch: giá đăng trên app để lãi tuyệt đối bằng bán tại quán (price / (1 − feeRate)).
 */
export const channelEconomics = ({ price, cost, rates }) => {
  const rows = [{ key: "STORE", label: "Tại quán", price, feeRate: 0, fee: 0, net: price, margin: price - cost, ok: true }];
  for (const [key, label] of [["GRAB", "GrabFood"], ["SHOPEE", "ShopeeFood"]]) {
    const r = rates?.[key];
    if (!r) { rows.push({ key, label, ok: false, reason: "chưa có đơn nào trong sổ" }); continue; }
    const fee = price * r.feeRate;
    const net = price - fee;
    rows.push({ key, label, price, feeRate: r.feeRate, taxRate: r.taxRate, fee, net, margin: net - cost, ok: r.ok, assumed: Boolean(r.assumed), orders: r.orders, first: r.first, last: r.last, reason: r.ok ? "" : `mới có ${r.orders} đơn, chưa đủ để tin`, appPriceToMatch: r.feeRate < 0.95 ? Math.ceil(price / (1 - r.feeRate) / 1000) * 1000 : null });
  }
  return rows.map((x) => (x.ok === false && x.price == null ? x : { ...x, marginPct: x.price > 0 ? x.margin / x.price : null, vsStore: x.margin - (price - cost) }));
};

const WEEK = 7 * 86400000;
/**
 * Giá vốn một phần của món qua từng tuần gần đây: tại mỗi mốc chỉ dùng phiếu mua đã có đến mốc đó (giá bình quân 30 ngày trước mốc).
 * Mốc thiếu giá vật tư thì null. drivers: vật tư làm giá vốn đổi nhiều nhất giữa mốc đủ dữ liệu đầu tiên và cuối cùng.
 */
export const costTrend = ({ receipts, lines, price, now = Date.now(), weeks = 8 }) => {
  const points = [];
  for (let k = weeks - 1; k >= 0; k--) {
    const at = now - k * WEEK;
    const known = (Array.isArray(receipts) ? receipts : []).filter((r) => Number(r.purchaseDate || 0) <= at);
    const { costs } = materialCosts(known, { now: at, windowDays: 30 });
    const r = recipeCost(lines, costs, price);
    points.push({ at, total: r.complete ? r.total : null, percent: r.complete ? r.percent : null, rows: r.complete ? r.rows : null, missing: r.missing });
  }
  const ok = points.filter((p) => p.total != null);
  let drivers = [];
  if (ok.length >= 2) {
    const a = ok[0], b = ok[ok.length - 1];
    drivers = b.rows.map((rb) => {
      const ra = a.rows.find((x) => x.materialId === rb.materialId);
      const m = materialById.get(rb.materialId);
      return { name: rb.name, base: m?.base ?? "", from: ra?.cost ?? 0, to: rb.cost ?? 0, delta: (rb.cost ?? 0) - (ra?.cost ?? 0), unitFrom: ra?.unitCost ?? null, unitTo: rb.unitCost ?? null };
    }).filter((d) => Math.abs(d.delta) >= 1).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 4);
  }
  return { points, usable: ok.length >= 2, drivers, change: ok.length >= 2 ? { from: ok[0].total, to: ok[ok.length - 1].total, pct: ok[0].total > 0 ? (ok[ok.length - 1].total - ok[0].total) / ok[0].total : null, fromAt: ok[0].at, toAt: ok[ok.length - 1].at } : null };
};
