// Tab "App food": đơn ShopeeFood / GrabFood. Dữ liệu do máy POS ghi vào dashboard/foodApp.
const APPS = [["SHOPEE", "ShopeeFood"], ["GRAB", "GrabFood"]];
export const appLabel = (app) => (APPS.find(([code]) => code === app) || [app, app || "App"])[1];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const list = (v) => (Array.isArray(v) ? v : []);

/** Chuẩn hoá tài liệu cloud (có thể thiếu trường) thành dạng dễ vẽ. */
export function normalizeFoodApp(data) {
  const d = data && typeof data === "object" ? data : {};
  const pendingBy = (app) => ({ count: num(d.pending?.[app]?.count), amount: num(d.pending?.[app]?.amount) });
  const pendingOrders = list(d.pendingOrders).map((o) => ({ billId: String(o.billId || ""), app: String(o.app || ""), code: String(o.code || ""), amount: num(o.amount), at: num(o.at), billNo: String(o.billNo || "") }));
  const settledOrders = list(d.settledOrders).map((o) => ({ app: String(o.app || ""), code: String(o.code || ""), amount: num(o.amount), received: num(o.received), fee: Math.max(0, num(o.amount) - num(o.received)), at: num(o.at) }));
  const days = list(d.days).map((x) => ({ date: String(x.date || ""), shopee: num(x.SHOPEE), grab: num(x.GRAB), shopeeBills: num(x.SHOPEE_N), grabBills: num(x.GRAB_N) })).filter((x) => x.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { updatedAt: num(d.updatedAt), pending: { SHOPEE: pendingBy("SHOPEE"), GRAB: pendingBy("GRAB") }, pendingOrders, settledOrders, days, empty: !data };
}

/** Tổng hợp để hiện lên đầu trang. */
export function foodAppTotals(v) {
  const pendingAmount = v.pending.SHOPEE.amount + v.pending.GRAB.amount;
  const pendingCount = v.pending.SHOPEE.count + v.pending.GRAB.count;
  const settledAmount = v.settledOrders.reduce((s, o) => s + o.amount, 0);
  const feeAmount = v.settledOrders.reduce((s, o) => s + o.fee, 0);
  const salesDays = v.days.reduce((s, x) => s + x.shopee + x.grab, 0);
  return { pendingAmount, pendingCount, settledAmount, feeAmount, salesDays };
}

/** Chỉ giữ chữ số của ô nhập tiền; rỗng hoặc quá dài thì null. */
export const parseMoneyInput = (text) => { const digits = String(text ?? "").replace(/\D/g, ""); return digits && digits.length <= 12 ? Number(digits) : null; };

/** Kiểm tra số người dùng nhập; trả thông báo lỗi hoặc "" nếu hợp lệ. */
export function entryProblem(orderValue, received) {
  if (orderValue == null || orderValue <= 0) return "Nhập giá trị đơn trên app (lớn hơn 0).";
  if (received == null) return "Nhập số tiền thực nhận (nhập 0 nếu app chưa trả hoặc huỷ).";
  if (received > orderValue) return "Tiền thực nhận không được lớn hơn giá trị đơn.";
  return "";
}

/** Tài liệu foodAppSettle/<billId> web ghi cho máy POS; applied=false để POS biết cần xử lý. */
export const buildEntry = (order, orderValue, received, by, now) => ({ billId: order.billId, app: order.app, code: order.code, orderValue, received, by, at: now, applied: false });
