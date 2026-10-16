// Tháng đã chốt chia cổ đông (máy POS đẩy lên shareholderCloses): không ghi thêm chi phí vào tháng đó.
// Phiếu nhập bù có ngày thuộc tháng đã chốt được dời sang tháng chưa chốt gần nhất, giữ ngày mua thật trong ghi chú.
// Hàm thuần: không Firebase, không DOM.

const pad = (n) => String(n).padStart(2, "0");
export const monthKey = (ms) => { const d = new Date(Number(ms)); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const monthLabel = (key) => { const [y, m] = String(key).split("-"); return `${Number(m)}/${y}`; };
const dayLabel = (ms) => { const d = new Date(Number(ms)); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };

/**
 * Ngày ghi sổ cho một khoản có ngày thật `ts`. Thuộc tháng chưa chốt thì giữ nguyên.
 * Thuộc tháng đã chốt thì dời sang 00:00 ngày 1 của tháng chưa chốt gần nhất sau đó (không vượt quá `now`).
 */
export const bookingDate = (ts, closedKeys, now = Date.now()) => {
  const closed = new Set(closedKeys || []);
  const fromKey = monthKey(ts);
  if (!closed.has(fromKey)) return { ts: Number(ts), shifted: false };
  const d = new Date(Number(ts));
  let y = d.getFullYear(), m = d.getMonth();
  do { m += 1; if (m > 11) { m = 0; y += 1; } } while (closed.has(`${y}-${pad(m + 1)}`));
  const target = Math.min(new Date(y, m, 1, 0, 0, 0, 0).getTime(), Number(now));
  return { ts: target, shifted: true, fromKey, toKey: monthKey(target), original: Number(ts) };
};

/** Ghi chú kèm theo khi bị dời ngày. */
export const shiftNote = (shift) => (shift?.shifted
  ? `Nhập bù ngày ${dayLabel(shift.original)}: tháng ${monthLabel(shift.fromKey)} đã chốt chia cổ đông nên tính vào tháng ${monthLabel(shift.toKey)}.`
  : "");
export const withShiftNote = (note, shift) => { const extra = shiftNote(shift); const base = String(note || "").trim(); return extra ? (base ? `${base} · ${extra}` : extra) : base; };

/** Thay đổi làm lệch số tiền của tháng đã chốt (sửa tiền, đổi ngày, huỷ) thì không cho. */
export const closedMonthEditProblem = (original, next, closedKeys) => {
  const closed = new Set(closedKeys || []);
  const key = monthKey(original?.purchaseDate);
  if (!original || !closed.has(key)) return "";
  const cancelled = next && next.status && next.status !== original.status && next.status !== "ACTIVE";
  const changed = !next || cancelled || Number(next.total) !== Number(original.total) || monthKey(next.purchaseDate) !== key;
  return changed ? `Phiếu thuộc tháng ${monthLabel(key)} đã chốt chia cổ đông: không sửa số tiền, đổi ngày hay huỷ được. Thiếu thì nhập phiếu bổ sung (sẽ tính vào tháng chưa chốt); thừa thì chốt lại tháng đó trên app.` : "";
};
