// Hàm thuần cho khối "Lịch sử bill trong ngày". Không đọc Firebase, không có DOM.
// Dữ liệu vào là các collection POS ghi một chiều: bills, payments, sessions, tableStatus, orderBatches, orderItems, refunds.

const pad = (n) => String(n).padStart(2, "0");

/** dateKey "YYYY-MM-DD" của một mốc thời gian (giờ máy đang xem). */
export const keyOfTime = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Khoảng [from, to) của một dateKey theo giờ máy. Trả null nếu dateKey sai. */
export const dayRange = (dateKey) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!m) return null;
  const from = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const to = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime();
  return Number.isFinite(from) ? { from, to } : null;
};

export const methodLabel = (method) => (method === "CASH" ? "Tiền mặt" : method === "TRANSFER" ? "Chuyển khoản" : method === "SHOPEE" ? "ShopeeFood (app trả sau)" : method === "GRAB" ? "GrabFood (app trả sau)" : method ? String(method) : "Chưa rõ");

export const timeLabel = (ms) => {
  if (!Number.isFinite(Number(ms)) || !Number(ms)) return "—";
  const d = new Date(Number(ms));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const byId = (list) => new Map((Array.isArray(list) ? list : []).map((x) => [String(x.id), x]));

/**
 * Danh sách bill đã thanh toán trong ngày, mới nhất trước.
 * - Chỉ bill PAID, thuộc ngày MỞ bill (openedAt): bill trả chậm qua hôm sau vẫn nằm đúng ngày bán.
 * - Bill có payment dataScope khác LIVE (chế độ thử) bị loại, để không lẫn doanh thu thật.
 * - Thiếu payment vẫn hiện, đánh dấu paymentMissing để người xem biết dữ liệu chưa đủ.
 */
export const buildBillRows = ({ bills, payments, sessions, tables, refunds, range }) => {
  const paymentByBill = new Map((Array.isArray(payments) ? payments : []).map((p) => [String(p.billId), p]));
  const sessionMap = byId(sessions);
  const tableMap = byId(tables);
  const refundByBill = new Map();
  (Array.isArray(refunds) ? refunds : []).forEach((r) => { if (r.billId) refundByBill.set(String(r.billId), r); });
  const rows = (Array.isArray(bills) ? bills : [])
    .filter((b) => (b.status === "PAID" || b.status === "REFUNDED") && Number(b.closedAt || 0) > 0 && Number(b.openedAt || 0) >= range.from && Number(b.openedAt || 0) < range.to)
    .map((b) => {
      const payment = paymentByBill.get(String(b.id)) || null;
      const session = sessionMap.get(String(b.sessionId)) || null;
      const table = session ? tableMap.get(String(session.tableId)) : null;
      // Bill đã hoàn mà phiếu hoàn ngoài khoảng đọc: vẫn đánh dấu đã hoàn đủ tiền bill để không lẫn vào thực thu.
      const refund = refundByBill.get(String(b.id)) || (b.status === "REFUNDED" ? { amount: Number(b.total || 0), status: "DONE", reason: "", createdAt: 0, method: "" } : null);
      return {
        id: String(b.id),
        billNo: String(b.billNo ?? ""),
        sessionId: String(b.sessionId ?? ""),
        openedAt: Number(b.openedAt || 0),
        closedAt: Number(b.closedAt || 0),
        tableName: table?.name ? String(table.name) : "Bàn ?",
        subtotal: Number(b.subtotal || 0),
        total: Number(b.total || 0),
        method: payment?.method ?? null,
        paidAt: payment ? Number(payment.paidAt || 0) : null,
        amountPaid: payment ? Number(payment.amount || 0) : null,
        cashReceived: payment?.cashReceived == null ? null : Number(payment.cashReceived),
        change: payment?.change == null ? null : Number(payment.change),
        reference: payment?.reference ? String(payment.reference) : "",
        cashierId: payment?.cashierId ? String(payment.cashierId) : "",
        flow: session?.flow === "prepaid" ? "prepaid" : session?.flow === "postpaid" ? "postpaid" : "",
        paymentMissing: !payment,
        scope: payment?.dataScope ?? "LIVE",
        refund: refund ? { amount: Number(refund.amount || 0), status: refund.status === "FROZEN" ? "FROZEN" : "DONE", reason: String(refund.reason ?? ""), createdAt: Number(refund.createdAt || 0), method: refund.method === "CASH" ? "CASH" : "TRANSFER" } : null,
      };
    })
    .filter((r) => r.scope === "LIVE")
    .sort((a, b) => b.closedAt - a.closedAt || b.billNo.localeCompare(a.billNo));
  return rows;
};

/** Tổng kết ngày: số bill, doanh thu, tiền mặt / chuyển khoản, trừ hoàn tiền nếu có. */
export const summarizeBillRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const sum = (fn) => list.reduce((s, r) => s + fn(r), 0);
  const total = sum((r) => r.total);
  const cash = sum((r) => (r.method === "CASH" ? r.total : 0));
  const transfer = sum((r) => (r.method === "TRANSFER" ? r.total : 0));
  const shopee = sum((r) => (r.method === "SHOPEE" ? r.total : 0));
  const grab = sum((r) => (r.method === "GRAB" ? r.total : 0));
  const refunded = sum((r) => (r.refund ? r.refund.amount : 0));
  return {
    count: list.length,
    total,
    cash,
    transfer,
    shopee,
    grab,
    shopeeCount: list.filter((r) => r.method === "SHOPEE").length,
    grabCount: list.filter((r) => r.method === "GRAB").length,
    unknown: total - cash - transfer - shopee - grab,
    refunded,
    refundedCount: list.filter((r) => r.refund).length,
    net: total - refunded,
    averageBill: list.length ? Math.round(total / list.length) : 0,
    missingPayment: list.filter((r) => r.paymentMissing).length,
  };
};

/**
 * Chi tiết một bill: các lần gọi món (batch) theo thứ tự, mỗi lần gồm các dòng món.
 * Batch bị hủy không tính. Chênh lệch giữa tổng dòng món và tổng bill hiển thị riêng (giảm giá, điều chỉnh).
 */
export const buildBillDetail = ({ row, batches, items }) => {
  const batchList = (Array.isArray(batches) ? batches : [])
    .filter((b) => String(b.sessionId) === row.sessionId && b.status !== "CANCELLED")
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0) || Number(a.createdAt || 0) - Number(b.createdAt || 0));
  const itemList = Array.isArray(items) ? items : [];
  const groups = batchList.map((b) => {
    const lines = itemList
      .filter((i) => String(i.batchId) === String(b.id))
      .map((i) => {
        const qty = Number(i.qty || 0);
        const unitPrice = Number(i.unitPrice || 0);
        return { id: String(i.id), name: String(i.itemName ?? "Món"), qty, unitPrice, amount: qty * unitPrice, note: String(i.note ?? ""), adjustment: !!i.adjustmentOfItemId, combo: i.comboPartsSnapshot ? String(i.comboPartsSnapshot) : "" };
      });
    return {
      id: String(b.id),
      sequence: Number(b.sequence || 0),
      serviceNo: b.serviceNo == null ? null : Number(b.serviceNo),
      createdAt: Number(b.createdAt || 0),
      sentAt: b.sentAt == null ? null : Number(b.sentAt),
      deliveredAt: b.deliveredAt == null ? null : Number(b.deliveredAt),
      lines,
      subtotal: lines.reduce((s, l) => s + l.amount, 0),
    };
  });
  const itemsTotal = groups.reduce((s, g) => s + g.subtotal, 0);
  return { groups, itemsTotal, difference: row.total - itemsTotal, hasItems: groups.some((g) => g.lines.length > 0) };
};

/** Chia mảng thành nhóm ≤ size phần tử (Firestore "in" tối đa 30 giá trị). */
export const chunk = (list, size = 30) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** Bộ lọc danh sách bill: hình thức (trả trước / trả sau), cách thanh toán (tiền mặt / CK), đã hoàn. "ALL" = không lọc. */
export const filterBillRows = (rows, { flow = "ALL", method = "ALL", refund = "ALL" } = {}) => (Array.isArray(rows) ? rows : []).filter((r) =>
  (flow === "ALL" || (flow === "postpaid" ? r.flow !== "prepaid" : r.flow === flow))
  && (method === "ALL" || (method === "UNKNOWN" ? r.paymentMissing || !["CASH", "TRANSFER", "SHOPEE", "GRAB"].includes(r.method) : r.method === method))
  && (refund === "ALL" || (refund === "REFUNDED" ? Boolean(r.refund) : !r.refund)));
