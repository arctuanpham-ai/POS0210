// Banner "món đỉnh nhất": món bán nhiều nhất hôm nay / 7 ngày / tháng này, từ snapshot dashboardDaily. Hàm thuần.
import { aggregateItems, dateKeyOf } from "./sales-snapshot-view.js?v=20261020-16";

const keysBack = (now, days) => Array.from({ length: days }, (_, i) => dateKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i))));
const monthKeys = (now) => Array.from({ length: now.getDate() }, (_, i) => dateKeyOf(new Date(now.getFullYear(), now.getMonth(), i + 1)));

/** Mỗi kỳ: món đứng đầu theo số ly/phần, hoà thì theo doanh thu; kèm á quân để khoe khoảng cách. */
export function topSellers(docs, now = new Date()) {
  const periods = [["today", "Hôm nay", [dateKeyOf(now)]], ["week", "7 ngày qua", keysBack(now, 7)], ["month", `Tháng ${now.getMonth() + 1}`, monthKeys(now)]];
  return periods.map(([id, label, keys]) => {
    const rows = aggregateItems(docs, keys, "combined").slice().sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
    const totalQty = rows.reduce((t, r) => t + r.qty, 0);
    const [first, second] = rows;
    return first && first.qty > 0 ? { id, label, itemId: first.itemId, name: first.name, qty: first.qty, revenue: first.revenue, share: totalQty ? first.qty / totalQty : 0, lead: second ? first.qty - second.qty : first.qty, runnerUp: second?.name || "", days: keys.filter((k) => docs?.[k]).length } : { id, label, name: "", qty: 0, revenue: 0, share: 0, lead: 0, runnerUp: "", days: keys.filter((k) => docs?.[k]).length };
  });
}
