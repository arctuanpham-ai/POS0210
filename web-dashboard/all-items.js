// Thống kê món bán ra gộp mọi kênh: tại quán (snapshot POS), đặt món online, GrabFood, ShopeeFood, Xanh Ngon. Hàm thuần.
// Số phần = sản lượng thực làm: combo được tách thành món lẻ (như thống kê tại quán).
import { expandComboName } from "./demo-receipts.js?v=20261106-6";
import { outputRows } from "./item-output.js?v=20261106-6";
import { isOnlineRevenue, onlineDay } from "./all-channels.js?v=20261106-6";

export const ITEM_CHANNELS = Object.freeze(["STORE", "ONLINE", "GRAB", "SHOPEE", "XANHNGON"]);
/** "Mang đi" = mọi kênh không phải khách ngồi tại quán: đặt món online và các app giao đồ ăn. */
export const TAKEAWAY = Object.freeze(["ONLINE", "GRAB", "SHOPEE", "XANHNGON"]);

const nameKey = (s) => String(s || "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();
const blank = () => ({ STORE: 0, ONLINE: 0, GRAB: 0, SHOPEE: 0, XANHNGON: 0 });

/** Gộp số phần theo món và theo kênh. Trả { items: Map, orders: {kênh: số đơn có tên món}, noItems: {kênh: số đơn thiếu tên món} }. */
export function itemsByChannel({ days, storeDocs = {}, onlineOrders = [], ledgerRows = [], onlineMode = "ALL" }) {
  const set = new Set(days);
  const items = new Map();
  const orders = blank(), noItems = blank();
  const add = (channel, name, qty) => {
    const k = nameKey(name);
    if (!k || !(qty > 0)) return;
    const cur = items.get(k) || { key: k, name: String(name).trim(), qty: blank() };
    cur.qty[channel] += qty;
    items.set(k, cur);
  };
  const addLines = (channel, lines) => {
    for (const l of lines) {
      const qty = Number(l?.qty || 0);
      if (String(l?.name || "").startsWith("COMBO")) for (const [n, q] of expandComboName(l.name, qty)) add(channel, n, q);
      else add(channel, l?.name, qty);
    }
  };
  // Tại quán: snapshot ngày đã tách combo sẵn bằng outputRows.
  for (const r of outputRows(storeDocs, days)) add("STORE", r.name, r.total);
  for (const day of days) if (storeDocs?.[day]) orders.STORE += Number(storeDocs[day].paidBills || 0);
  for (const o of onlineOrders || []) {
    if (!isOnlineRevenue(o) || !set.has(onlineDay(o)) || (onlineMode !== "ALL" && o.mode !== onlineMode)) continue;
    if (Array.isArray(o.items) && o.items.length) { orders.ONLINE += 1; addLines("ONLINE", o.items); } else noItems.ONLINE += 1;
  }
  for (const r of ledgerRows || []) {
    if (!set.has(r?.saleDay) || !TAKEAWAY.includes(r.app) || r.status === "REVIEW") continue;
    if (Array.isArray(r.items) && r.items.length) { orders[r.app] += 1; addLines(r.app, r.items); } else noItems[r.app] += 1;
  }
  return { items, orders, noItems };
}

/** Xếp hạng món theo tổng số phần của các kênh được chọn. */
export function rankItems(items, channels, limit = 10) {
  const sel = channels && channels.length ? channels : ITEM_CHANNELS;
  const rows = [];
  for (const it of items.values()) {
    const qty = sel.reduce((t, c) => t + it.qty[c], 0);
    if (qty > 0) rows.push({ key: it.key, name: it.name, qty, by: it.qty });
  }
  rows.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "vi"));
  const total = rows.reduce((t, r) => t + r.qty, 0);
  return { rows: rows.slice(0, limit), total, kinds: rows.length };
}
