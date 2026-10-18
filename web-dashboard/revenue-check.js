// Đối chiếu doanh thu: số POS chốt (dashboardMonthly / dashboardDaily) với từng bill trên cloud. Hàm thuần.
// Quy tắc POS: bill PAID, dataScope LIVE, có closedAt, openedAt trong kỳ; doanh thu = bill.total.
// Bill trên cloud không mang dataScope: dùng dataScope của thanh toán (thiếu thanh toán thì không biết chắc).

const fmt = (ms) => { if (!ms) return ""; const d = new Date(Number(ms)); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}-${p(d.getMonth() + 1)}`; };

/**
 * snapshot: { revenue, paidBills, updatedAt }  ·  range: { from, to }
 * Trả về số cloud, độ lệch, và danh sách bill đáng ngờ kèm lý do. "explained" = phần lệch giải thích được
 * bởi bill đóng SAU lúc POS ghi snapshot (bình thường, lần đồng bộ sau sẽ khớp).
 */
export function reconcileRevenue({ snapshot, bills = [], payments = [], refunds = [], range }) {
  const payByBill = new Map(payments.map((p) => [String(p.billId), p]));
  const refundByBill = new Map();
  for (const r of refunds) if (r?.billId && r.dataScope !== "TEST") refundByBill.set(String(r.billId), (refundByBill.get(String(r.billId)) || 0) + Number(r.amount || 0));
  const inRange = (b) => Number(b.openedAt || 0) >= range.from && Number(b.openedAt || 0) < range.to;
  const counted = [];
  const suspects = [];
  const snapAt = Number(snapshot?.updatedAt || 0);
  for (const b of bills.filter(inRange)) {
    const pay = payByBill.get(String(b.id)) || null;
    const total = Number(b.total || 0);
    const scope = pay?.dataScope || null;
    const no = String(b.billNo ?? b.id);
    if (b.status === "REFUNDED") { suspects.push({ billNo: no, total, kind: "info", reason: "Đã hoàn toàn bộ: POS không tính, web cũng không tính." }); continue; }
    if (b.status !== "PAID" || !Number(b.closedAt || 0)) continue;
    if (scope && scope !== "LIVE") { suspects.push({ billNo: no, total, kind: "excluded", reason: `Thanh toán đánh dấu ${scope} (không phải bán thật): không tính.` }); continue; }
    counted.push(b);
    if (!pay) suspects.push({ billNo: no, total, kind: "warn", reason: "Không có bản ghi thanh toán trên cloud: không biết tiền mặt hay CK, có thể là bill thử." });
    else if (Number(pay.amount || 0) !== total) suspects.push({ billNo: no, total, kind: "warn", reason: `Tiền thanh toán ${Number(pay.amount || 0)} khác tổng bill ${total}.` });
    const closed = Number(b.closedAt || 0);
    if (snapAt && closed > snapAt) suspects.push({ billNo: no, total, kind: "late", reason: `Đóng lúc ${fmt(closed)}, sau lúc POS ghi số tổng (${fmt(snapAt)}).` });
    const ref = refundByBill.get(String(b.id));
    if (ref) suspects.push({ billNo: no, total, kind: "info", reason: `Có hoàn tiền một phần ${ref}: POS vẫn tính đủ tổng bill, tiền hoàn trừ riêng.` });
  }
  const cloudRevenue = counted.reduce((t, b) => t + Number(b.total || 0), 0);
  const snapRevenue = snapshot ? Number(snapshot.revenue || 0) : null;
  const diff = snapRevenue === null ? null : cloudRevenue - snapRevenue;
  const diffBills = snapshot ? counted.length - Number(snapshot.paidBills || 0) : null;
  const late = suspects.filter((s) => s.kind === "late");
  const explained = late.reduce((t, s) => t + s.total, 0);
  const unexplained = diff === null ? null : diff - explained;
  const leads = findLeads({ counted, snapAt, unexplained, unexplainedBills: diffBills === null ? null : diffBills - late.length });
  return { leads, snapRevenue, snapBills: snapshot ? Number(snapshot.paidBills || 0) : null, snapAt, cloudRevenue, cloudBills: counted.length, diff, diffBills, explained, explainedBills: late.length, unexplained, unexplainedBills: diffBills === null ? null : diffBills - late.length, suspects };
}

const LEAD_WINDOW_MS = 30 * 60_000;
/**
 * Gợi ý bill nào có thể là phần lệch chưa giải thích. POS chỉ lưu TỔNG nên không chỉ đích danh được;
 * thường là bill đóng sát lúc POS ghi số (POS đọc dữ liệu trước khi bill vừa đóng xong). Trả về các bill đóng trong 30 phút trước đó,
 * và các tổ hợp (đúng số bill còn lệch) cộng đúng bằng số tiền lệch.
 */
export function findLeads({ counted, snapAt, unexplained, unexplainedBills }) {
  if (!snapAt || !unexplainedBills || unexplainedBills < 0 || !unexplained) return null;
  const near = counted.filter((b) => Number(b.closedAt) <= snapAt && Number(b.closedAt) >= snapAt - LEAD_WINDOW_MS).sort((a, b) => Number(b.closedAt) - Number(a.closedAt)).slice(0, 40);
  const combos = [];
  const k = Math.min(unexplainedBills, 3);
  const walk = (start, picked, sum) => {
    if (combos.length >= 20) return;
    if (picked.length === k) { if (sum === unexplained) combos.push(picked.map((b) => String(b.billNo ?? b.id))); return; }
    for (let i = start; i < near.length; i++) walk(i + 1, [...picked, near[i]], sum + Number(near[i].total || 0));
  };
  if (unexplainedBills === k && unexplained > 0) walk(0, [], 0);
  const inCombo = new Set(combos.flat());
  return {
    windowMinutes: LEAD_WINDOW_MS / 60_000, combos,
    bills: near.map((b) => ({ billNo: String(b.billNo ?? b.id), total: Number(b.total || 0), closedAt: Number(b.closedAt), match: inCombo.has(String(b.billNo ?? b.id)) })),
  };
}
