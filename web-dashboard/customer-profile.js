// Hồ sơ khách đặt online theo số điện thoại: số lần mua, tổng chi, món hay gọi, lịch sử các lần mua. Khớp với POS (CustomerProfile.kt).
export const PURCHASED = ["paid", "delivering", "done"];
export const TEST_NAME = "KIEM THU TU DONG";

const toMs = (v) => (typeof v?.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);

/** orders: các đơn của số này (kể cả đơn đang xem, loại bằng excludeCode). note: { note, updatedAt, updatedBy } hoặc null. */
export function buildProfile(phone, orders, note, excludeCode = "", historyLimit = 8) {
  const bought = (orders || [])
    .filter((o) => String(o.phone || "") === phone && PURCHASED.includes(o.status) && (o.code || o.id) !== excludeCode && o.name !== TEST_NAME)
    .map((o) => ({ ...o, _at: toMs(o.createdAt) }))
    .sort((a, b) => b._at - a._at);
  const qtyByName = new Map();
  for (const o of bought) for (const l of o.items || []) { const n = String(l.name || "").trim(); if (n) qtyByName.set(n, (qtyByName.get(n) || 0) + Number(l.qty || 0)); }
  const favorites = [...qtyByName.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi")).slice(0, 3);
  return {
    phone,
    orderCount: bought.length,
    totalSpend: bought.reduce((s, o) => s + Number(o.total || 0), 0),
    lastAt: bought[0]?._at || null,
    favorites,
    history: bought.slice(0, historyLimit).map((o) => ({ code: o.code || o.id, at: o._at, total: Number(o.total || 0), mode: o.mode, items: o.items || [] })),
    note: String(note?.note || ""),
    noteBy: String(note?.updatedBy || ""),
  };
}

export const profileHeadline = (p, money) => (p.orderCount === 0 ? "Khách mới (chưa có đơn nào được thanh toán)" : `Khách quen · ${p.orderCount} lần mua · tổng ${money(p.totalSpend)}`);
