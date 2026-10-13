// Hàm thuần cho khối "Quy trình thanh toán" và "Hoàn tiền". Không đọc Firebase, không có DOM.
// Dữ liệu vào là doc config/paymentFlow và collection refunds do POS ghi (một chiều).

export const flowLabel = (flow) => (flow === "prepaid" ? "Trả trước" : "Trả sau");

/** Chế độ hiện tại; thiếu dữ liệu hoặc giá trị lạ coi là Trả sau (đơn cũ không có flow). */
export const currentFlow = (doc) => (doc?.current === "prepaid" ? "prepaid" : "postpaid");

/** Lịch sử đổi, mới nhất trước. Bỏ qua dòng hỏng. */
export const historyRows = (doc) =>
  (Array.isArray(doc?.history) ? doc.history : [])
    .filter((h) => h && Number.isFinite(Number(h.at)))
    .map((h) => ({ at: Number(h.at), by: String(h.by ?? ""), from: currentFlow({ current: h.from }), to: currentFlow({ current: h.to }) }))
    .sort((a, b) => b.at - a.at);

/** Hoàn tiền từ mốc `since` (ms), chỉ dữ liệu LIVE, mới nhất trước, kèm tổng theo phương thức. */
export const summarizeRefunds = (refunds, since = 0) => {
  const list = (Array.isArray(refunds) ? refunds : [])
    .filter((r) => (r.dataScope ?? "LIVE") === "LIVE" && Number(r.createdAt || 0) >= since)
    .map((r) => ({
      id: String(r.id ?? ""),
      createdAt: Number(r.createdAt || 0),
      amount: Number(r.amount || 0),
      method: r.method === "CASH" ? "CASH" : "TRANSFER",
      reason: String(r.reason ?? ""),
      status: r.status === "FROZEN" ? "FROZEN" : "DONE",
      settledAt: Number(r.settledAt || 0),
      settleNote: String(r.settleNote ?? ""),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
  const sum = (m) => list.filter((r) => r.method === m).reduce((s, r) => s + r.amount, 0);
  const frozen = list.filter((r) => r.status === "FROZEN");
  return { frozen: frozen.length, frozenTotal: frozen.reduce((s, r) => s + r.amount, 0), rows: list, total: sum("CASH") + sum("TRANSFER"), cash: sum("CASH"), transfer: sum("TRANSFER"), count: list.length };
};

/** Khoản CK đóng băng (chưa hoàn xong), mọi thời điểm, mới nhất trước. Dùng dữ liệu LIVE. */
export const frozenRefunds = (refunds) => {
  const list = summarizeRefunds(refunds, 0).rows.filter((r) => r.status === "FROZEN");
  return { rows: list, count: list.length, total: list.reduce((s, r) => s + r.amount, 0) };
};
