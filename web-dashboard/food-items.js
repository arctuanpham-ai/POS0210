// Thống kê món bán qua app food (GrabFood, ShopeeFood) từ dòng `items` lưu trong sổ đối soát. Hàm thuần, không đọc Firebase, không có DOM.
// Mỗi đơn trong sổ có thể mang items: [{ name, qty, price }] (giá niêm yết trên app, trước giảm giá). Gộp chung hoặc tách theo app khi cần.

const nameKey = (s) => String(s ?? "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();
const isCancelOrRefund = (r) => (Array.isArray(r.problems) ? r.problems : []).some((x) => /^(Đơn huỷ|Hoàn tiền)/.test(String(x)));
const blank = () => ({ orders: 0, qty: 0, revenue: 0 });

/**
 * rows: dòng sổ app food. [fromDay, toDay): theo ngày bán (yyyy-MM-dd). app: "ALL" (gộp) hoặc mã app ("GRAB", "SHOPEE").
 * Bỏ đơn huỷ/hoàn tiền. Đơn chưa có tên món chỉ được đếm vào noItems, không làm sai số món.
 * Trả { orders, qty, revenue, apps, items, noItems }; items sắp theo số phần giảm dần, mỗi món có byApp để tách riêng từng app.
 */
export function appItems(rows, fromDay, toDay, app = "ALL") {
  const out = { orders: 0, qty: 0, revenue: 0, apps: {}, items: [], noItems: 0 };
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.saleDay || r.saleDay < fromDay || r.saleDay >= toDay) continue;
    if (app !== "ALL" && r.app !== app) continue;
    if (isCancelOrRefund(r)) continue;
    const lines = (Array.isArray(r.items) ? r.items : []).filter((l) => l && String(l.name ?? "").trim() && Number(l.qty) > 0);
    if (!lines.length) { out.noItems += 1; continue; }
    const a = (out.apps[r.app] ||= blank());
    a.orders += 1; out.orders += 1;
    const seen = new Set();
    for (const l of lines) {
      const key = nameKey(l.name), qty = Number(l.qty), revenue = qty * Number(l.price || 0);
      const it = map.get(key) || { key, name: String(l.name).trim(), qty: 0, revenue: 0, orders: 0, byApp: {} };
      const b = (it.byApp[r.app] ||= { orders: 0, qty: 0, revenue: 0 });
      it.qty += qty; it.revenue += revenue; b.qty += qty; b.revenue += revenue;
      if (!seen.has(key)) { it.orders += 1; b.orders += 1; seen.add(key); }
      a.qty += qty; a.revenue += revenue; out.qty += qty; out.revenue += revenue;
      map.set(key, it);
    }
  }
  out.items = [...map.values()].sort((x, y) => y.qty - x.qty || y.revenue - x.revenue || (x.name < y.name ? -1 : 1));
  return out;
}
