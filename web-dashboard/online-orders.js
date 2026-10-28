/* Đơn đặt món online: logic cho nhân viên (thuần, kiểm thử được). Khớp với trang khách web-order và Firestore rules online-orders.rules. */

export const OO_STATUS = Object.freeze({ NEW: "new", REJECTED: "rejected", AWAITING_PAYMENT: "awaiting_payment", EXPIRED: "expired", PAID: "paid", DELIVERING: "delivering", DONE: "done", CANCELLED: "cancelled" });
export const OO_PAY_MINUTES = 10;
export const OO_LABELS = Object.freeze({
  new: "Chờ quán xác nhận", rejected: "Đã từ chối", awaiting_payment: "Chờ khách thanh toán", expired: "Hết hạn",
  paid: "Đã nhận tiền · đang làm", delivering: "Đang giao", done: "Hoàn thành", cancelled: "Khách đã huỷ",
});
export const OO_MODE_LABELS = Object.freeze({ delivery: "Giao tận nơi", pickup: "Mang đi", dinein: "Tại quán" });
export const OO_REJECT_REASONS = Object.freeze(["Hết món", "Quán sắp đóng cửa", "Ngoài khu vực giao hàng", "Quán đang quá tải, xin lỗi bạn"]);

export const ooToMillis = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
};

export const transferContentFor = (code) => `DM${code}`;
/** Khoá bộ đếm giới hạn 2 đơn chờ (cùng định dạng với trang khách). */
export const limitKeys = (order) => [`u_${order.uid}`, `p_${order.phone}`];
/** Đơn đang tính vào giới hạn: chờ xác nhận hoặc chờ thanh toán. */
export const isPending = (order) => order?.status === OO_STATUS.NEW || order?.status === OO_STATUS.AWAITING_PAYMENT;

/** Quá hạn thanh toán (theo giờ của máy nhân viên) nhưng tài liệu chưa được đóng. */
export const isOverdue = (order, nowMs) => order?.status === OO_STATUS.AWAITING_PAYMENT && ooToMillis(order.expiresAt) != null && ooToMillis(order.expiresAt) <= nowMs;

/** Hành động nhân viên được làm với một đơn, theo trạng thái. Nút thứ nhất là hành động chính. */
export const nextActions = (order, nowMs = Date.now()) => {
  switch (order?.status) {
    case OO_STATUS.NEW: return [{ key: "accept", label: "Nhận đơn" }, { key: "reject", label: "Từ chối" }];
    case OO_STATUS.AWAITING_PAYMENT:
      return isOverdue(order, nowMs)
        ? [{ key: "paid", label: "Đã nhận tiền" }, { key: "expire", label: "Đóng đơn hết hạn" }]
        : [{ key: "paid", label: "Đã nhận tiền" }, { key: "expire", label: "Huỷ (khách không trả)" }];
    case OO_STATUS.EXPIRED: return [{ key: "paid", label: "Khách trả muộn: đã nhận tiền" }];
    case OO_STATUS.CANCELLED: return [{ key: "paid", label: "Khách đã chuyển tiền trước khi huỷ: ghi nhận" }];
    case OO_STATUS.PAID: return order.mode === "delivery" ? [{ key: "deliver", label: "Đang giao" }, { key: "done", label: "Hoàn thành" }] : [{ key: "done", label: "Hoàn thành" }];
    case OO_STATUS.DELIVERING: return [{ key: "done", label: "Hoàn thành" }];
    default: return [];
  }
};

// "paid" cũng được từ "expired"/"cancelled": khách chuyển tiền muộn sau khi đơn đã đóng, nhân viên vẫn ghi nhận được.
const FROM = { accept: ["new"], reject: ["new"], paid: ["awaiting_payment", "expired", "cancelled"], expire: ["awaiting_payment"], deliver: ["paid"], done: ["paid", "delivering"] };

/**
 * Kết quả của một hành động: patch cho tài liệu đơn + có phải trừ bộ đếm giới hạn không.
 * Ném lỗi nếu hành động không hợp lệ với trạng thái hiện tại (ví dụ nhân viên khác vừa đổi).
 */
export const buildTransition = (order, action, { now = Date.now(), who = "", reason = "" } = {}) => {
  if (!FROM[action]) throw new Error(`Hành động không hợp lệ: ${action}`);
  if (!FROM[action].includes(order?.status)) throw new Error(`Đơn đã đổi sang "${OO_LABELS[order?.status] || order?.status}", hãy xem lại.`);
  const by = who ? { handledBy: who } : {};
  switch (action) {
    case "accept": return { patch: { status: "awaiting_payment", transferContent: transferContentFor(order.code), confirmedAt: now, expiresAt: now + OO_PAY_MINUTES * 60_000, ...by }, releasesLimit: false };
    case "reject": {
      const text = String(reason || "").trim();
      if (!text) throw new Error("Cần nhập lý do từ chối để khách biết.");
      return { patch: { status: "rejected", rejectReason: text.slice(0, 200), closedAt: now, ...by }, releasesLimit: true };
    }
    case "paid": return { patch: { status: "paid", paidAt: now, ...by }, releasesLimit: isPending(order) };
    case "expire": return { patch: { status: "expired", closedAt: now, ...by }, releasesLimit: true };
    case "deliver": return { patch: { status: "delivering", deliveringAt: now, ...by }, releasesLimit: false };
    default: return { patch: { status: "done", doneAt: now, ...by }, releasesLimit: false };
  }
};

/** Giá trị mới của một bộ đếm sau khi đóng đơn: giảm 1, không âm. */
export const releasedCount = (limitDoc) => Math.max(0, Math.floor(Number(limitDoc?.pending) || 0) - 1);

/** Gom đơn để hiển thị: cần xử lý ngay trước, rồi chờ thanh toán, đang làm/giao, và đã xong trong ngày. */
export const groupOrders = (orders, nowMs = Date.now()) => {
  const byTime = (a, b) => (ooToMillis(a.createdAt) || 0) - (ooToMillis(b.createdAt) || 0);
  const list = [...(orders || [])];
  const startOfDay = new Date(nowMs); startOfDay.setHours(0, 0, 0, 0);
  return {
    needAction: list.filter((o) => o.status === OO_STATUS.NEW).sort(byTime),
    awaiting: list.filter((o) => o.status === OO_STATUS.AWAITING_PAYMENT).sort(byTime),
    making: list.filter((o) => o.status === OO_STATUS.PAID || o.status === OO_STATUS.DELIVERING).sort(byTime),
    recent: list.filter((o) => [OO_STATUS.DONE, OO_STATUS.REJECTED, OO_STATUS.EXPIRED, OO_STATUS.CANCELLED].includes(o.status) && (ooToMillis(o.createdAt) || 0) >= startOfDay.getTime()).sort((a, b) => byTime(b, a)),
  };
};

/** Số đơn cần nhân viên để ý (hiện trên tab): đơn mới + đơn quá hạn chờ đóng. */
export const attentionCount = (orders, nowMs = Date.now()) => (orders || []).filter((o) => o.status === OO_STATUS.NEW || isOverdue(o, nowMs)).length;

/** Chờ thêm 3 phút sau hạn thanh toán trước khi tự đóng, phòng khi tiền về trễ vài chục giây. */
export const OO_SWEEP_GRACE_MS = 3 * 60_000;
/** Đơn awaiting_payment quá hạn cần tự đóng thành expired (chỉ khi nhân viên đang mở trang). */
export const overdueOrders = (orders, nowMs = Date.now()) => (orders || []).filter((o) => isOverdue(o, nowMs - OO_SWEEP_GRACE_MS));

/** Có đơn MỚI (chưa từng thấy) kể từ lần trước, để phát chuông. */
export const newOrderCodes = (orders, seen) => (orders || []).filter((o) => o.status === OO_STATUS.NEW && !seen.has(o.id || o.code)).map((o) => o.id || o.code);

export const minutesAgoText = (ms, nowMs = Date.now()) => {
  if (ms == null) return "";
  const m = Math.max(0, Math.round((nowMs - ms) / 60_000));
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : `${Math.floor(m / 60)} giờ ${m % 60} phút trước`;
};

/** Kiểm tra form thông tin quán. Trả { ok, errors, value } (value để ghi vào online_config/shop). */
export const validateShopConfig = (input) => {
  const text = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const errors = {};
  const value = {
    name: text(input.name, 60), tagline: text(input.tagline, 80), address: text(input.address, 200), phone: text(input.phone, 20), hours: text(input.hours, 120),
    notice: text(input.notice, 160), legalName: text(input.legalName, 100), regNo: text(input.regNo, 30), owner: text(input.owner, 60), email: text(input.email, 80), siteUrl: text(input.siteUrl, 200), bank: text(input.bank, 40), account: text(input.account, 25).replace(/\s+/g, ""), holder: text(input.holder, 60),
    orderingEnabled: input.orderingEnabled !== false,
  };
  if (!value.name) errors.name = "Nhập tên quán";
  if (value.phone && !/^[\d+\s.()-]{8,20}$/.test(value.phone)) errors.phone = "Số điện thoại chưa đúng";
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = "Email chưa đúng";
  if (value.siteUrl && !/^https:\/\/[^\s]+$/.test(value.siteUrl)) errors.siteUrl = "Đường dẫn phải bắt đầu bằng https://";
  if ((value.bank || value.account) && !(value.bank && value.account && value.holder)) errors.bank = "Nhập đủ ngân hàng, số tài khoản và tên tài khoản (hoặc để trống cả 3).";
  return { ok: Object.keys(errors).length === 0, errors, value };
};
