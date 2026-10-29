// Cảnh báo mua vật tư bất thường: mua trùng, mua quá định mức, nhịp mua lệch. Hàm thuần, không Firebase, không DOM.
// Chỉ là gợi ý để kiểm tra: hao hụt, nhân viên dùng, tặng khách, công thức chưa đủ đều làm lệch định mức.
import { lineTargets, materialById, usageVsPurchase } from "./cost-recipe.js?v=20261029-21";
import { isSummaryReceipt } from "./expense-rules.js?v=20261029-21";

export const MIN_DATA_DAYS = 30;
const DAY = 86400000;
const median = (list) => { const s = [...list].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const money = (n) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const fmtQty = (q, base) => (base === "g" || base === "ml") ? `${(q / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${base === "g" ? "kg" : "lít"}` : `${Math.round(q * 10) / 10} ${base}`;
const dm = (ms) => { const d = new Date(Number(ms) + 7 * 3600000); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/** Mỗi dòng phiếu chi tiết thành một lần mua: { materialId, name, base, qty (đơn vị định lượng), amount, at, receiptId, code, by }. */
export function purchaseEvents(receipts) {
  const out = [];
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    if (!at) continue;
    for (const l of r.items || []) {
      const t = lineTargets(l).find((x) => x.factor && materialById.get(x.id));
      if (!t || !(Number(l.qty) > 0)) continue;
      const m = materialById.get(t.id);
      out.push({ materialId: t.id, name: m.name, base: m.base, qty: Number(l.qty) * t.factor, amount: Number(l.amount ?? Number(l.qty) * Number(l.unitPrice || 0)), at, receiptId: r.id, code: r.code || "", by: r.enteredByName || "" });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Số ngày dữ liệu: từ lần mua có chi tiết sớm nhất đến hôm nay. */
export const dataSpanDays = (events, now = Date.now()) => (events.length ? Math.floor((now - events[0].at) / DAY) : 0);

/** Đủ 30 ngày dữ liệu chưa. */
export const readiness = (spanDays, min = MIN_DATA_DAYS) => ({ ready: spanDays >= min, span: spanDays, daysLeft: Math.max(0, min - spanDays) });

/**
 * Danh sách cảnh báo, sắp theo số tiền liên quan giảm dần.
 * - DUP: cùng vật tư, cùng lượng, hai phiếu khác nhau trong ≤ dupDays ngày.
 * - OVER: 30 ngày gần nhất mua ≥ overRatio lần định mức và phần thừa ≥ minExcess đồng.
 * - RHYTHM: lần mua mới nhất cách lần trước < 35% khoảng cách thường lệ, hoặc lượng > 2,5 lần lượng thường lệ (cần ≥ 4 lần mua).
 */
export function materialAlerts({ receipts, usagePerDay = {}, now = Date.now(), windowDays = 30, dupDays = 5, overRatio = 1.5, minExcess = 150000, minRhythmAmount = 100000 }) {
  const events = purchaseEvents(receipts);
  const alerts = [];
  const byMat = new Map();
  for (const e of events) { (byMat.get(e.materialId) || byMat.set(e.materialId, []).get(e.materialId)).push(e); }

  for (const [id, list] of byMat) {
    // Trùng
    const flagged = new Set();
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i], b = list[j];
      if (b.at - a.at > dupDays * DAY) break;
      if (a.receiptId === b.receiptId || Math.abs(a.qty - b.qty) > 1e-9) continue;
      if (now - b.at > windowDays * DAY) continue;
      const key = `${a.receiptId}|${b.receiptId}`;
      if (flagged.has(key)) continue;
      flagged.add(key);
      alerts.push({ kind: "DUP", severity: "high", materialId: id, name: a.name, amount: b.amount, receipts: [a.receiptId, b.receiptId], text: `${a.name}: mua ${fmtQty(a.qty, a.base)} hai lần (${a.code || dm(a.at)} ngày ${dm(a.at)} và ${b.code || dm(b.at)} ngày ${dm(b.at)}), ${money(b.amount)} một lần. Kiểm tra có nhập trùng không.` });
    }
    // Nhịp mua
    const recent = list.filter((e) => now - e.at <= 120 * DAY);
    if (recent.length >= 4) {
      const gaps = []; for (let i = 1; i < recent.length - 1; i += 1) gaps.push((recent[i].at - recent[i - 1].at) / DAY);
      const qtys = recent.slice(0, -1).map((e) => e.qty);
      const last = recent[recent.length - 1], prev = recent[recent.length - 2];
      const gapLast = (last.at - prev.at) / DAY;
      const medGap = median(gaps), medQty = median(qtys);
      if (now - last.at <= windowDays * DAY && last.amount >= minRhythmAmount) {
        if (medGap >= 2 && gapLast < medGap * 0.35 && gapLast > 0.2) alerts.push({ kind: "RHYTHM", severity: "mid", materialId: id, name: last.name, amount: last.amount, receipts: [last.receiptId], text: `${last.name}: lần mua ngày ${dm(last.at)} chỉ cách lần trước ${gapLast.toFixed(1)} ngày, thường cách ~${medGap.toFixed(1)} ngày.` });
        else if (medQty > 0 && last.qty > medQty * 2.5) alerts.push({ kind: "RHYTHM", severity: "mid", materialId: id, name: last.name, amount: last.amount, receipts: [last.receiptId], text: `${last.name}: lần mua ngày ${dm(last.at)} là ${fmtQty(last.qty, last.base)}, thường chỉ ~${fmtQty(medQty, last.base)} một lần.` });
      }
    }
  }

  // Quá định mức trong windowDays ngày gần nhất
  const from = now - windowDays * DAY;
  const over = usageVsPurchase({ receipts, usagePerDay, from, to: now });
  for (const r of over) {
    if (r.ratio === null || r.ratio < overRatio || !(r.bought > 0)) continue;
    const spend = events.filter((e) => e.materialId === r.materialId && e.at >= from && e.at < now).reduce((t, e) => t + e.amount, 0);
    const excess = spend * (1 - r.expected / r.bought);
    if (excess < minExcess) continue;
    alerts.push({ kind: "OVER", severity: r.ratio >= 2.5 ? "high" : "mid", materialId: r.materialId, name: r.name, amount: excess, text: `${r.name}: ${windowDays} ngày mua ${fmtQty(r.bought, r.base)}, định mức theo món bán chỉ ${fmtQty(r.expected, r.base)} (${Math.round(r.ratio * 100)}%), phần thừa khoảng ${money(excess)}.` });
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1) || b.amount - a.amount);
}
