// Hoàn vốn: một con số vốn đầu tư ban đầu (chủ quán nhập tay) so với dòng tiền ròng tích luỹ từng tháng.
// Ghi chép đầu tư ban đầu cũ (phiếu lẻ trước khai trương) KHÔNG cộng vào đâu cả: chỉ để tham khảo.
// Hàm thuần, không đọc Firebase, không có DOM.

/** Tháng đã lưu đối soát dùng số đã lưu; tháng đang chạy (chưa lưu) dùng số tạm tính. */
export function paybackStatus({ initial, closings = [], current = null, openingMonth = "" }) {
  const base = Math.max(0, Math.round(Number(initial) || 0));
  const byMonth = new Map();
  for (const c of closings) {
    if (!c?.monthKey || (openingMonth && c.monthKey < openingMonth)) continue;
    byMonth.set(c.monthKey, { monthKey: c.monthKey, net: Math.round(Number(c.net) || 0), saved: true });
  }
  if (current?.monthKey && !byMonth.has(current.monthKey) && (!openingMonth || current.monthKey >= openingMonth)) {
    byMonth.set(current.monthKey, { monthKey: current.monthKey, net: Math.round(Number(current.net) || 0), saved: false });
  }
  const months = [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const recovered = months.reduce((t, m) => t + m.net, 0);
  const remaining = Math.max(0, base - recovered);
  const percent = base > 0 ? Math.max(0, Math.min(100, (recovered / base) * 100)) : 0;
  // Ước tính số tháng còn lại theo trung bình 3 tháng đã lưu gần nhất (tháng đang chạy chưa trọn nên bỏ qua).
  const recent = months.filter((m) => m.saved).slice(-3);
  const avg = recent.length ? recent.reduce((t, m) => t + m.net, 0) / recent.length : null;
  const monthsLeft = remaining === 0 ? 0 : avg && avg > 0 ? remaining / avg : null;
  return { initial: base, recovered, remaining, percent, months, avg, monthsLeft, set: base > 0 };
}
