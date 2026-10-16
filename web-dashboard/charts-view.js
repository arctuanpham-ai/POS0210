// Biểu đồ cột ngang cho tab Doanh thu: giờ cao điểm và món bán nhiều. Hàm thuần trả số liệu, phần vẽ ở app.js.

/** Cộng số bill theo giờ từ các snapshot ngày có trường hourlyBills. null nếu chưa ngày nào có (POS bản cũ). */
export const hourlyTotals = (docs, keys) => {
  const withHours = keys.map((k) => docs?.[k]).filter((d) => d && Array.isArray(d.hourlyBills) && d.hourlyBills.length === 24);
  if (!withHours.length) return null;
  const total = Array(24).fill(0);
  for (const d of withHours) d.hourlyBills.forEach((n, h) => { total[h] += Number(n || 0); });
  return { total, days: withHours.length };
};

/** Các giờ cần hiện: từ giờ có bill sớm nhất tới muộn nhất. Rỗng nếu không có bill. */
export const hourRows = (total) => {
  const idx = total.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
  if (!idx.length) return [];
  const peak = Math.max(...total);
  return Array.from({ length: idx[idx.length - 1] - idx[0] + 1 }, (_, i) => idx[0] + i).map((h) => ({ hour: h, count: total[h], peak: total[h] === peak }));
};

/** n món bán nhiều nhất theo số phần (đồng hạng xếp theo doanh thu). */
export const topItems = (rows, n = 10) => (Array.isArray(rows) ? rows : [])
  .filter((r) => Number(r.qty) > 0)
  .slice().sort((a, b) => Number(b.qty) - Number(a.qty) || Number(b.revenue) - Number(a.revenue))
  .slice(0, n);
