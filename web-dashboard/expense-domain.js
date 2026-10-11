const DRAFT_PREFIX = "pos0210.expense-draft.";

export const calculateReceiptTotal = (items = []) => Math.round(items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0));

export function validateReceipt(receipt) {
  if (!receipt?.id) return { ok: false, error: "Thiếu mã phiếu" };
  if (!Number.isFinite(Number(receipt.purchaseDate)) || Number(receipt.purchaseDate) <= 0) return { ok: false, error: "Ngày mua không hợp lệ" };
  if (!Array.isArray(receipt.items) || receipt.items.length === 0) return { ok: false, error: "Phiếu chưa có vật tư" };
  for (const [index, item] of receipt.items.entries()) {
    const n = index + 1;
    if (!String(item.materialName || "").trim()) return { ok: false, error: `Dòng ${n}: thiếu tên vật tư` };
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) return { ok: false, error: `Dòng ${n}: số lượng phải lớn hơn 0` };
    if (!String(item.unit || "").trim()) return { ok: false, error: `Dòng ${n}: thiếu đơn vị tính` };
    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) return { ok: false, error: `Dòng ${n}: đơn giá không hợp lệ` };
  }
  return { ok: true, total: calculateReceiptTotal(receipt.items) };
}

export function createStableDraft(storage, user, createId = () => crypto.randomUUID()) {
  const key = `${DRAFT_PREFIX}${user.uid}`;
  const saved = storage.getItem(key);
  if (saved) {
    try { return JSON.parse(saved); } catch { storage.removeItem?.(key); }
  }
  const now = Date.now();
  const draft = { id: createId(), purchaseDate: now, enteredByUid: user.uid, enteredByName: user.displayName || user.email || "Nhân viên", createdAt: now, items: [{ id: createId(), materialName: "", materialCode: "", expenseGroup: "FOOD", subcategoryId: "", qty: 1, unit: "kg", unitPrice: 0 }], note: "" };
  storage.setItem(key, JSON.stringify(draft));
  return draft;
}

const zonedParts = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
const vietnamMidnight = (year, month, day) => Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000;

export function rangeForVietnamPeriod(period, now = new Date()) {
  const p = zonedParts(now); const todayUtc = Date.UTC(p.year, p.month - 1, p.day);
  const days = period === "today" ? 1 : period === "3d" ? 3 : period === "7d" ? 7 : 1;
  const fromDay = new Date(todayUtc - (days - 1) * 86400000);
  return { from: vietnamMidnight(fromDay.getUTCFullYear(), fromDay.getUTCMonth() + 1, fromDay.getUTCDate()), to: vietnamMidnight(p.year, p.month, p.day + 1) };
}

export function filterReceipts(receipts, filters = {}) {
  const q = String(filters.material || "").trim().toLocaleLowerCase("vi");
  return receipts.filter((receipt) => {
    if (filters.staff && receipt.enteredByName !== filters.staff) return false;
    if (filters.group && receipt.expenseGroup !== filters.group && !receipt.items?.some((item) => item.expenseGroup === filters.group)) return false;
    if (filters.subcategory && !receipt.items?.some((item) => item.subcategoryId === filters.subcategory)) return false;
    if (filters.receiptId && receipt.id !== filters.receiptId) return false;
    return !q || receipt.items?.some((item) => `${item.materialName || ""} ${item.materialCode || ""}`.toLocaleLowerCase("vi").includes(q));
  });
}
