// Hàm thuần cho khối "Kết quả 3/7 ngày" và danh sách bàn mở. Không đọc Firebase, không có DOM.
// Dữ liệu vào là snapshot do POS ghi (dashboard/current và dashboardDaily/{YYYY-MM-DD}).

const pad = (n) => String(n).padStart(2, "0");

export const dateKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Các dateKey từ cũ đến mới, kết thúc ở hôm nay. Chỉ nhận 3 hoặc 7 ngày. */
export const dailyKeys = (days, now = new Date()) => {
  const count = Number(days) === 3 ? 3 : 7;
  return Array.from({ length: count }, (_, index) =>
    dateKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index))));
};

/**
 * Tổng hợp doanh thu theo ngày. Ngày thiếu snapshot là "không có dữ liệu", KHÔNG được tính là 0 đồng:
 * tổng chỉ cộng các ngày có dữ liệu và cờ complete cho biết kết quả có đầy đủ hay không.
 */
export const summarizeDaily = (docs, keys, todayKey) => {
  const days = keys.map((key) => {
    const snapshot = docs?.[key];
    if (!snapshot) return { dateKey: key, available: false, revenue: null, paidBills: null, averageBill: null, finalized: false, needsFinalize: false };
    const revenue = Number(snapshot.revenue || 0);
    const paidBills = Number(snapshot.paidBills || 0);
    return {
      dateKey: key,
      available: true,
      revenue,
      paidBills,
      averageBill: paidBills ? Math.round(revenue / paidBills) : 0,
      finalized: snapshot.finalized === true,
      needsFinalize: snapshot.finalized !== true && key < todayKey,
    };
  });
  const present = days.filter((day) => day.available);
  const totalRevenue = present.reduce((sum, day) => sum + day.revenue, 0);
  const totalBills = present.reduce((sum, day) => sum + day.paidBills, 0);
  const unavailableDays = days.filter((day) => !day.available).map((day) => day.dateKey);
  return {
    days,
    totalRevenue,
    totalBills,
    averageBill: totalBills ? Math.round(totalRevenue / totalBills) : 0,
    unavailableDays,
    needsFinalizeDays: days.filter((day) => day.needsFinalize).map((day) => day.dateKey),
    complete: unavailableDays.length === 0,
  };
};

const withShare = (rows) => {
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  return rows
    .map((row) => ({ ...row, share: total > 0 ? row.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue || String(a.itemId).localeCompare(String(b.itemId)));
};

const itemRows = (snapshot) => (Array.isArray(snapshot?.items) ? snapshot.items : []).map((item) => ({
  itemId: String(item.itemId ?? item.name ?? ""),
  name: String(item.name ?? "Món"),
  qty: Number(item.qty || 0),
  revenue: Number(item.revenue || 0),
}));

/**
 * Thống kê món. mode "combined": gộp mọi ngày có dữ liệu theo itemId.
 * mode "byDay": mỗi ngày một danh sách riêng, từ cũ đến mới.
 */
export const aggregateItems = (docs, keys, mode = "combined") => {
  if (mode === "byDay") {
    return keys.filter((key) => docs?.[key]).map((key) => ({ dateKey: key, rows: withShare(itemRows(docs[key])) }));
  }
  const merged = new Map();
  keys.forEach((key) => {
    itemRows(docs?.[key]).forEach((row) => {
      const current = merged.get(row.itemId) || { itemId: row.itemId, name: row.name, qty: 0, revenue: 0 };
      current.qty += row.qty;
      current.revenue += row.revenue;
      merged.set(row.itemId, current);
    });
  });
  return withShare([...merged.values()]);
};

/** Bàn đang mở lấy từ dashboard/current.liveTables. available=false khi POS bản cũ chưa gửi liveTables. */
export const liveSummary = (dashboard = {}) => {
  if (!Array.isArray(dashboard.liveTables)) return { available: false, openTables: 0, provisionalTotal: 0, tables: [] };
  const tables = dashboard.liveTables
    .map((table) => ({
      id: String(table.id ?? ""),
      name: String(table.name ?? "Bàn"),
      openedAt: table.openedAt == null ? null : Number(table.openedAt),
      currentTotal: Number(table.currentTotal || 0),
      serviceStatus: String(table.serviceStatus || ""),
    }))
    .sort((a, b) => (a.openedAt ?? Infinity) - (b.openedAt ?? Infinity));
  return {
    available: true,
    openTables: tables.length,
    provisionalTotal: tables.reduce((sum, table) => sum + table.currentTotal, 0),
    tables,
  };
};

export const serviceStatusLabel = (status) =>
  status === "SERVED" || status === "DELIVERED" ? "Đã phục vụ" : status === "WAITING" || status === "SENT" ? "Đã gửi bếp" : "Đang gọi món";

/**
 * Doanh thu cho một khoảng ngày (Hôm qua, 7 ngày, tùy chọn) từ các dashboardDaily đã đọc.
 * Trả về null nếu khoảng không phải các ngày nguyên nằm trong 7 ngày gần nhất (khi đó không có snapshot để tính).
 */
export const periodDailySummary = (range, docs, now = new Date()) => {
  if (!Number.isFinite(range?.from) || !Number.isFinite(range?.to) || range.to <= range.from) return null;
  const first = new Date(range.from);
  let cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const last = new Date(range.to - 1);
  const keys = [];
  while (cursor <= last && keys.length < 8) {
    keys.push(dateKeyOf(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  if (!keys.length || keys.length > 7) return null;
  const window = new Set(dailyKeys(7, now));
  if (!keys.every((key) => window.has(key))) return null;
  return summarizeDaily(docs, keys, dateKeyOf(now));
};
