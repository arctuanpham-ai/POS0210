/* Logic thuần của trang đặt món (không đụng DOM/Firebase) để kiểm thử được bằng node --test. */

export const STATUS = Object.freeze({
  NEW: "new",
  REJECTED: "rejected",
  AWAITING_PAYMENT: "awaiting_payment",
  EXPIRED: "expired",
  PAID: "paid",
  DELIVERING: "delivering",
  DONE: "done",
});

/** Trạng thái còn "đang chờ" (tính vào giới hạn 2 đơn). */
export const PENDING_STATUSES = Object.freeze([STATUS.NEW, STATUS.AWAITING_PAYMENT]);
/** Trạng thái đã kết thúc: khách có thể đặt đơn mới. */
export const FINAL_STATUSES = Object.freeze([STATUS.REJECTED, STATUS.EXPIRED, STATUS.DONE]);

// Các hằng số này PHẢI khớp firestore rules (test/rules-contract.test.mjs kiểm tra).
export const LIMITS = Object.freeze({
  maxLines: 7,
  maxQty: 20,
  maxLineNote: 100,
  maxNote: 200,
  maxName: 50,
  maxAddress: 200,
  minAddress: 8,
  maxTable: 10,
  maxTotal: 5_000_000,
  maxPendingOrders: 2,
  limitWindowMinutes: 60,
  payMinutes: 10,
});

export const ORDER_KEYS = Object.freeze([
  "code", "createdAt", "uid", "name", "phone", "mode", "address", "table", "note", "items", "total", "status", "rejectReason", "transferContent", "expiresAt",
]);
export const LINE_KEYS = Object.freeze(["id", "name", "qty", "note", "price"]);
export const LIMIT_KEYS = Object.freeze(["pending", "lastAt", "lastOrder"]);

/** Bảng chữ cái mã đơn: bỏ 0/O/1/I để dễ đọc, dễ đọc to qua điện thoại. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/** Mã đơn 6 ký tự. rand(n) trả số nguyên ngẫu nhiên [0, n). Mặc định dùng crypto của trình duyệt/Node. */
export const makeOrderCode = (rand = (n) => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % n) =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[rand(CODE_ALPHABET.length)]).join("");

/** SĐT Việt Nam: bỏ khoảng trắng/dấu, đổi +84/84 thành 0. Trả "" nếu không phải số điện thoại hợp lệ. */
export const normalizePhone = (raw) => {
  let digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  else if (/^84\d{9,10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0\d{9,10}$/.test(digits) ? digits : "";
};

export const transferContentFor = (code) => `DM${code}`;

export const money = (value) => `${Math.round(Number(value) || 0).toLocaleString("vi-VN")}đ`;

/** Món đang bán được: còn bật, chưa xoá, có giá. */
export const isOrderable = (item, category) =>
  Boolean(item) && item.deleted !== true && item.active !== false && Number(item.price) > 0 && category?.active !== false;

const clampQty = (qty) => Math.max(0, Math.min(LIMITS.maxQty, Math.floor(Number(qty) || 0)));

/** Cộng/trừ số lượng trong giỏ. cart: { [menuId]: { qty, note } }. Trả giỏ mới (không sửa giỏ cũ). */
export const changeQty = (cart, id, delta) => {
  const next = { ...cart };
  const qty = clampQty((next[id]?.qty || 0) + delta);
  if (qty <= 0) delete next[id];
  else next[id] = { qty, note: next[id]?.note || "" };
  return next;
};

export const setNote = (cart, id, note) => (cart[id] ? { ...cart, [id]: { ...cart[id], note: String(note ?? "").slice(0, LIMITS.maxLineNote) } } : cart);

/** Dòng đơn từ giỏ + menu. Món đã tắt/xoá bị bỏ. Giữ nguyên tên món như trong menu (rules so khớp chính xác). */
export const cartLines = (cart, menuById, categoryById = {}) =>
  Object.entries(cart || {})
    .map(([id, entry]) => ({ id, entry, item: menuById[id] }))
    .filter(({ item }) => isOrderable(item, categoryById[item?.categoryId]))
    .filter(({ entry }) => entry.qty > 0)
    .map(({ id, entry, item }) => ({ id, name: item.name, qty: clampQty(entry.qty), note: String(entry.note || "").slice(0, LIMITS.maxLineNote), price: Math.round(Number(item.price)) }));

export const lineTotal = (line) => line.price * line.qty;
export const linesTotal = (lines) => lines.reduce((sum, line) => sum + lineTotal(line), 0);
export const linesCount = (lines) => lines.reduce((sum, line) => sum + line.qty, 0);

export const MODES = Object.freeze({ DELIVERY: "delivery", PICKUP: "pickup", DINEIN: "dinein" });
export const MODE_LABELS = Object.freeze({ delivery: "Giao tận nơi", pickup: "Mang đi", dinein: "Tại quán" });

/** Kiểm tra form đặt đơn. Trả { ok, errors, value }; value đã chuẩn hoá để ghi. */
export const validateCheckout = ({ name, phone, delivery, address, table, note, lines }) => {
  const errors = {};
  const cleanName = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!cleanName) errors.name = "Vui lòng nhập tên";
  else if (cleanName.length > LIMITS.maxName) errors.name = `Tên tối đa ${LIMITS.maxName} ký tự`;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) errors.phone = "Số điện thoại chưa đúng (ví dụ 0912345678)";
  const cleanAddress = String(address ?? "").trim().replace(/\s+/g, " ");
  const cleanTable = String(table ?? "").trim();
  let mode = MODES.PICKUP;
  if (delivery) {
    mode = MODES.DELIVERY;
    if (cleanAddress.length < LIMITS.minAddress) errors.address = "Vui lòng nhập địa chỉ giao hàng đầy đủ";
    else if (cleanAddress.length > LIMITS.maxAddress) errors.address = `Địa chỉ tối đa ${LIMITS.maxAddress} ký tự`;
  } else if (cleanTable) {
    mode = MODES.DINEIN;
    if (cleanTable.length > LIMITS.maxTable) errors.table = `Số bàn tối đa ${LIMITS.maxTable} ký tự`;
  }
  const cleanNote = String(note ?? "").trim().slice(0, LIMITS.maxNote);
  if (!lines || !lines.length) errors.cart = "Giỏ hàng đang trống";
  else if (lines.length > LIMITS.maxLines) errors.cart = `Mỗi đơn tối đa ${LIMITS.maxLines} loại món, vui lòng tách thành 2 đơn`;
  const total = linesTotal(lines || []);
  if (total > LIMITS.maxTotal) errors.cart = `Đơn tối đa ${money(LIMITS.maxTotal)}, vui lòng tách thành 2 đơn`;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name: cleanName, phone: cleanPhone, mode, address: mode === MODES.DELIVERY ? cleanAddress : "", table: mode === MODES.DINEIN ? cleanTable : "", note: cleanNote },
  };
};

/**
 * Tài liệu đơn mới. createdAt do nơi gọi gán bằng serverTimestamp() (rules bắt createdAt == request.time).
 * Trường rejectReason/transferContent/expiresAt khởi tạo rỗng: rules bắt đúng giá trị này khi tạo.
 */
export const buildOrderDoc = ({ code, uid, value, lines }) => ({
  code,
  uid,
  name: value.name,
  phone: value.phone,
  mode: value.mode,
  address: value.address,
  table: value.table,
  note: value.note,
  items: lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, note: l.note, price: l.price })),
  total: linesTotal(lines),
  status: STATUS.NEW,
  rejectReason: "",
  transferContent: "",
  expiresAt: null,
});

export const limitKeyForUid = (uid) => `u_${uid}`;
export const limitKeyForPhone = (phone) => `p_${phone}`;

/** Số đơn đang chờ hiện tại của một bộ đếm (doc limit) tại thời điểm nowMs; 0 nếu đã quá cửa sổ giới hạn. */
export const pendingBase = (limitDoc, nowMs) => {
  if (!limitDoc) return 0;
  const lastAt = toMillis(limitDoc.lastAt);
  if (!lastAt || lastAt + LIMITS.limitWindowMinutes * 60_000 <= nowMs) return 0;
  return Math.max(0, Math.floor(Number(limitDoc.pending) || 0));
};

/** Timestamp Firestore / Date / số / null -> mili giây (null nếu không có). */
export const toMillis = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return null;
};

/** Đếm ngược "mm:ss". */
export const countdownText = (remainingMs) => {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Trạng thái hiển thị cho khách. Đơn awaiting_payment quá hạn (theo giờ máy chủ ước tính) hiển thị là "expired"
 * dù tài liệu chưa được nhân viên đóng; vẫn giữ rawStatus để biết thật sự chưa đóng.
 */
export const orderView = (order, nowMs) => {
  const raw = order?.status || STATUS.NEW;
  const expiresAt = toMillis(order?.expiresAt);
  const remainingMs = raw === STATUS.AWAITING_PAYMENT && expiresAt ? expiresAt - nowMs : null;
  const status = raw === STATUS.AWAITING_PAYMENT && remainingMs !== null && remainingMs <= 0 ? STATUS.EXPIRED : raw;
  return { status, rawStatus: raw, remainingMs, isFinal: FINAL_STATUSES.includes(status), isDelivery: order?.mode === MODES.DELIVERY };
};

export const STATUS_TEXT = Object.freeze({
  new: { title: "Quán đang xác nhận đơn của bạn", hint: "Vui lòng giữ trang này mở. Quán sẽ xác nhận trong ít phút." },
  rejected: { title: "Quán chưa nhận được đơn này", hint: "" },
  awaiting_payment: { title: "Quán đã nhận đơn, mời bạn thanh toán", hint: "Quét mã QR bằng app ngân hàng hoặc chuyển khoản đúng số tiền và nội dung bên dưới." },
  expired: { title: "Đơn đã hết hạn vì chưa thanh toán", hint: "Bạn có thể đặt lại đơn này." },
  paid: { title: "Quán đã nhận tiền và đang làm món", hint: "" },
  delivering: { title: "Đơn đang trên đường giao đến bạn", hint: "" },
  done: { title: "Đơn đã hoàn thành. Cảm ơn bạn!", hint: "" },
});

/** Các bước thanh toán trên thanh tiến độ (không tính trạng thái từ chối/hết hạn). */
export const progressSteps = (order) => {
  const delivery = order?.mode === MODES.DELIVERY;
  return delivery
    ? [["new", "Chờ xác nhận"], ["awaiting_payment", "Thanh toán"], ["paid", "Đang làm món"], ["delivering", "Đang giao"], ["done", "Hoàn thành"]]
    : [["new", "Chờ xác nhận"], ["awaiting_payment", "Thanh toán"], ["paid", "Đang làm món"], ["done", "Hoàn thành"]];
};

/** Danh sách món của đơn cũ -> giỏ mới (cho nút "Đặt lại"), chỉ giữ món còn bán được. */
export const cartFromOrder = (order, menuById, categoryById = {}) => {
  const cart = {};
  for (const line of order?.items || []) {
    const item = menuById[line.id];
    if (!isOrderable(item, categoryById[item?.categoryId])) continue;
    cart[line.id] = { qty: clampQty(line.qty), note: String(line.note || "").slice(0, LIMITS.maxLineNote) };
  }
  return cart;
};

/** Giữ tối đa n mã đơn gần nhất, mới nhất trước, không trùng. */
export const rememberCode = (codes, code, n = 5) => [code, ...(codes || []).filter((c) => c !== code)].filter((c) => CODE_PATTERN.test(c)).slice(0, n);

/** Menu hiển thị: gom theo nhóm, nhóm theo sortOrder, bỏ món đã xoá. Món đang tắt vẫn có (hiện mờ). */
export const menuSections = (items, categories) => {
  const cats = [...(categories || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const live = (items || []).filter((m) => m && m.deleted !== true && m.name && Number(m.price) > 0);
  const sections = cats
    .map((c) => ({ id: c.id, name: String(c.name || "").trim(), active: c.active !== false, items: live.filter((m) => m.categoryId === c.id).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) }))
    .filter((s) => s.items.length);
  const orphans = live.filter((m) => !catById[m.categoryId]);
  if (orphans.length) sections.push({ id: "_other", name: "Khác", active: true, items: orphans });
  // Nhóm không còn món nào bán được vẫn hiện (mờ) nhưng xuống cuối; thứ tự còn lại giữ nguyên (sort ổn định).
  const sellable = (s) => s.active && s.items.some((m) => isOrderable(m));
  return sections.map((s, i) => ({ s, i })).sort((a, b) => Number(sellable(b.s)) - Number(sellable(a.s)) || a.i - b.i).map(({ s }) => s);
};
