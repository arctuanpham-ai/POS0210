export function filterExpenseReceipts(receipts, filters = {}) {
  const query = normalize(filters.material || "");
  const receiptId = normalize(filters.receiptId || "");
  return receipts.filter((receipt) => {
    if (receipt.status === "CANCELLED" || receipt.status === "DELETED") return false;
    if (filters.from != null && Number(receipt.purchaseDate || 0) < filters.from) return false;
    if (filters.to != null && Number(receipt.purchaseDate || 0) >= filters.to) return false;
    if (filters.employee && receipt.enteredByName !== filters.employee) return false;
    if (receiptId && !normalize(receipt.id).includes(receiptId)) return false;
    const lines = receipt.items || [];
    return lines.some((line) => (!filters.group || line.expenseGroup === filters.group) && (!query || normalize(line.materialName).includes(query) || normalize(line.materialCode).includes(query)));
  });
}

export function summarizeExpenseReceipts(receipts) {
  const active = receipts.filter((receipt) => receipt.status !== "CANCELLED" && receipt.status !== "DELETED");
  const lines = active.flatMap((receipt) => receipt.items || []);
  const total = active.reduce((sum, receipt) => sum + Number(receipt.total || 0), 0);
  return {
    total,
    receiptCount: active.length,
    lineCount: lines.length,
    byGroup: totals(lines, (line) => line.expenseGroup || "Chưa phân nhóm"),
    byMaterial: materialTotals(lines),
    byEmployee: totals(active, (receipt) => receipt.enteredByName || "Chưa xác định", (receipt) => receipt.total),
  };
}

export function vietnamDateRange(days, now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const vietnamToday = new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+07:00`);
  const from = new Date(vietnamToday.getTime() - (days - 1) * 86_400_000);
  return { from: from.getTime(), to: vietnamToday.getTime() + 86_400_000 };
}

function totals(rows, keyOf, valueOf = (row) => row.amount) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = keyOf(row);
    grouped.set(key, (grouped.get(key) || 0) + Number(valueOf(row) || 0));
  });
  return [...grouped].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, "vi"));
}

function materialTotals(lines) {
  const grouped = new Map();
  lines.forEach((line) => {
    const key = line.materialCode || line.materialName || "Chưa đặt tên";
    const current = grouped.get(key) || { key: line.materialName || key, total: 0, quantity: 0, unit: line.unit || "", weightedPrice: 0 };
    const quantity = Number(line.qty || 0);
    const amount = Number(line.amount ?? quantity * Number(line.unitPrice || 0));
    current.total += amount;
    current.quantity += quantity;
    current.weightedPrice += quantity * Number(line.unitPrice || 0);
    grouped.set(key, current);
  });
  return [...grouped.values()].map(({ weightedPrice, ...row }) => ({ ...row, averageUnitPrice: row.quantity ? Math.round(weightedPrice / row.quantity) : 0 })).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, "vi"));
}

function normalize(value) {
  return String(value || "").toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}
