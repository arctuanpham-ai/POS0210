/* Logic thuần của trang đặt món (không đụng DOM/Firebase) để kiểm thử được bằng node --test. */

export const STATUS = Object.freeze({
  NEW: "new",
  REJECTED: "rejected",
  AWAITING_PAYMENT: "awaiting_payment",
  EXPIRED: "expired",
  PAID: "paid",
  DELIVERING: "delivering",
  DONE: "done",
  CANCELLED: "cancelled",
});

/** Trạng thái còn "đang chờ" (tính vào giới hạn 2 đơn). */
export const PENDING_STATUSES = Object.freeze([STATUS.NEW, STATUS.AWAITING_PAYMENT]);
/** Trạng thái đã kết thúc: khách có thể đặt đơn mới. */
export const FINAL_STATUSES = Object.freeze([STATUS.REJECTED, STATUS.EXPIRED, STATUS.DONE, STATUS.CANCELLED]);

// Các hằng số này PHẢI khớp firestore rules (test/rules-contract.test.mjs kiểm tra).
export const LIMITS = Object.freeze({
  maxLines: 30,
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
  payMinutes: 30,
});

export const ORDER_KEYS = Object.freeze([
  "code", "createdAt", "uid", "name", "phone", "mode", "address", "table", "note", "items", "total", "discount", "surcharge", "status", "rejectReason", "transferContent", "expiresAt",
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
export const buildOrderDoc = ({ code, uid, value, lines, pricing, src = null }) => ({
  code,
  uid,
  name: value.name,
  phone: value.phone,
  mode: value.mode,
  address: value.address,
  table: value.table,
  note: value.note,
  items: lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, note: l.note, price: l.price })),
  total: pricing ? pricing.total : linesTotal(lines),
  discount: pricing ? pricing.discount : 0,
  surcharge: pricing ? pricing.surcharge : 0,
  status: STATUS.NEW,
  rejectReason: "",
  transferContent: "",
  expiresAt: null,
  ...(src ? { src } : {}),
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
  // Thanh toán tách khỏi tiến độ làm món: khách trả trước (QR) hoặc sau (tiền mặt khi nhận) đều được. Đã thu = quán ghi paidAt hoặc đơn cũ ở trạng thái "paid".
  const paid = !!order?.paidAt || raw === STATUS.PAID || (status === STATUS.DONE && !!order?.payMethod);
  return { status, rawStatus: raw, remainingMs, paid, stage: stageOf(status), isFinal: FINAL_STATUSES.includes(status), isDelivery: order?.mode === MODES.DELIVERY };
};

/** Bước hiển thị trên thanh tiến độ: đơn đã nhận (chờ thu hoặc đã thu) đều là "making" (đang làm món). */
export const stageOf = (status) => (status === STATUS.AWAITING_PAYMENT || status === STATUS.PAID ? "making" : status);

export const STATUS_TEXT = Object.freeze({
  new: { title: "Đã gửi đơn đến quán", hint: "Quán đang xác nhận, thường dưới 3 phút. Bạn có thể thanh toán ngay bằng mã QR bên dưới, hoặc trả tiền mặt khi nhận hàng. Bạn không cần làm gì thêm." },
  rejected: { title: "Quán chưa nhận được đơn này", hint: "" },
  awaiting_payment: { title: "Quán đã nhận đơn và đang làm món", hint: "Bạn thanh toán lúc nào cũng được: quét mã QR bên dưới hoặc trả tiền mặt khi nhận hàng." },
  expired: { title: "Đơn đã hết hạn vì chưa thanh toán", hint: "Bạn có thể đặt lại đơn này." },
  paid: { title: "Đã thanh toán · quán đang làm món", hint: "" },
  delivering: { title: "Đơn đang trên đường giao đến bạn", hint: "" },
  done: { title: "Đơn đã hoàn thành. Cảm ơn bạn!", hint: "" },
  cancelled: { title: "Bạn đã huỷ đơn này", hint: "Bạn có thể đặt lại bất cứ lúc nào." },
});

/** Các bước thanh toán trên thanh tiến độ (không tính trạng thái từ chối/hết hạn). */
export const progressSteps = (order) => {
  const delivery = order?.mode === MODES.DELIVERY;
  return delivery
    ? [["new", "Chờ quán nhận"], ["making", "Đang làm món"], ["delivering", "Đang giao"], ["done", "Hoàn thành"]]
    : [["new", "Chờ quán nhận"], ["making", "Đang làm món"], ["done", "Hoàn thành"]];
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
const foldName = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
export const TOP_SECTION = Object.freeze({ id: "_top", name: "Bán chạy nhất" });
/** Thứ tự ưu tiên khi hiện menu: combo, bán chạy, cơm trưa, cà phê, rồi các nhóm còn lại theo thứ tự quán đã đặt. Số nhỏ = lên trước. */
const sectionRank = (s) => {
  if (s.id === COMBO_CATEGORY.id) return 0;
  if (s.id === TOP_SECTION.id) return 1;
  const n = foldName(s.name);
  if (/(^| )com trua( |$)/.test(n)) return 2;
  if (n === "ca phe" || n === "cafe") return 3;
  return 9;
};

export const menuSections = (items, categories, { top = [] } = {}) => {
  const cats = [...(categories || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const live = (items || []).filter((m) => m && m.deleted !== true && m.name && Number(m.price) > 0);
  const sections = cats
    .map((c) => ({ id: c.id, name: String(c.name || "").trim(), active: c.active !== false, items: live.filter((m) => m.categoryId === c.id).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) }))
    .filter((s) => s.items.length);
  const orphans = live.filter((m) => !catById[m.categoryId]);
  if (orphans.length) sections.push({ id: "_other", name: "Khác", active: true, items: orphans });
  // Mục "Bán chạy nhất": các món đề xuất (theo thống kê bán hàng), chỉ món đang bán được; món vẫn hiện thêm trong nhóm riêng của nó.
  const byId = Object.fromEntries(live.map((m) => [m.id, m]));
  const topItems = (top || []).map((id) => byId[id]).filter((m) => m && isOrderable(m, catById[m.categoryId]) && m.categoryId !== COMBO_CATEGORY.id);
  if (topItems.length) sections.push({ id: TOP_SECTION.id, name: TOP_SECTION.name, active: true, items: topItems });
  // Nhóm không còn món nào bán được vẫn hiện (mờ) nhưng xuống cuối; sau đó theo thứ tự ưu tiên ở trên, còn lại giữ nguyên (sort ổn định).
  const sellable = (s) => s.active && s.items.some((m) => isOrderable(m));
  return sections.map((s, i) => ({ s, i })).sort((a, b) => Number(sellable(b.s)) - Number(sellable(a.s)) || sectionRank(a.s) - sectionRank(b.s) || a.i - b.i).map(({ s }) => s);
};

/** Combo của quán (users/.../combos) hiển thị như một nhóm "Combo"; id dòng món = "c_" + id combo để rules tra đúng bảng. */
export const COMBO_ID_PREFIX = "c_";
export const COMBO_CATEGORY = Object.freeze({ id: "_combo", name: "Combo", sortOrder: -1, active: true });
export const comboItemsFrom = (combos, hidden = new Set()) =>
  (combos || [])
    .filter((c) => c && String(c.name || "").trim() && c.active !== false && c.deleted !== true && Number(c.price) > 0 && !hidden.has(`${COMBO_ID_PREFIX}${c.id}`))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((c) => ({
      id: `${COMBO_ID_PREFIX}${c.id}`, name: String(c.name), price: Math.round(Number(c.price)), categoryId: COMBO_CATEGORY.id, sortOrder: Number(c.sortOrder || 0), active: true,
      parts: (Array.isArray(c.items) ? c.items : []).filter((p) => p && p.menuItemId).map((p) => ({ id: String(p.menuItemId), name: String(p.name || "").trim() })).slice(0, 3),
      lines: (Array.isArray(c.items) ? c.items : []).filter((p) => p && p.menuItemId).map((p) => ({ id: String(p.menuItemId), qty: Math.max(1, Math.floor(Number(p.qty) || 1)) })),
      description: (Array.isArray(c.items) ? c.items : []).filter((p) => p && p.name).map((p) => `${Number(p.qty) > 1 ? `${Number(p.qty)}× ` : ""}${String(p.name).trim()}`).join(" + ") || String(c.description || ""),
    }));
/** Combo rẻ hơn mua lẻ bao nhiêu: tổng giá các món thành phần (theo SL) trừ giá combo. Thiếu giá một món → null (không đoán). */
export const comboSaving = (combo, items) => {
  const lines = combo?.lines;
  if (!lines?.length) return null;
  const byId = new Map((items || []).map((m) => [m.id, m]));
  let sum = 0;
  for (const l of lines) { const m = byId.get(l.id); const p = Number(m?.price); if (!(p > 0)) return null; sum += p * l.qty; }
  const saving = sum - Number(combo.price);
  return saving > 0 ? Math.round(saving) : null;
};
export const comboTools = Object.freeze({ COMBO_CATEGORY, comboItemsFrom });

/* ---------- Khuyến mãi / phụ thu tự động của POS (online_config/promo do máy POS đẩy lên) ---------- */
const ruleInTime = (rule, now) => {
  const t = now.getTime();
  if (rule.startAt != null && t < Number(rule.startAt)) return false;
  if (rule.endAt != null && t > Number(rule.endAt)) return false;
  const start = rule.startMinute, end = rule.endMinute;
  if (start != null && end != null) {
    const minute = now.getHours() * 60 + now.getMinutes();
    const ok = start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
    if (!ok) return false;
  }
  return true;
};

/** Mức giảm giá khi đặt online (% so với giá tại quán) từ online_config/shop. Chỉ nhận số nguyên 1-50; mọi giá trị khác = không giảm. */
export const onlineDiscountPercent = (shop) => {
  const p = Math.floor(Number(shop?.onlineDiscountPercent));
  return Number.isFinite(p) && p > 0 && p <= 50 ? p : 0;
};

/** Giá một phần sau giảm online, để hiển thị trên menu (cùng cách làm tròn xuống như tổng giảm của đơn). */
export const onlinePrice = (price, percent) => Math.max(0, Number(price) - Math.floor((Number(price) * (Number(percent) || 0)) / 100));

/**
 * Tính giá như POS (PricingCore.calculatePricing, phần tự động áp dụng): giá combo là giá cố định nên chỉ tính trên món lẻ.
 * total = subtotal + surcharge - discount. promo = { rules: [{ name, kind: DISCOUNT|SURCHARGE, percent, startAt, endAt, startMinute, endMinute }] }.
 */
export const pricingFor = (lines, promo, now = new Date(), { onlinePercent = 0 } = {}) => {
  const subtotal = linesTotal(lines);
  const comboSub = lines.filter((l) => String(l.id).startsWith(COMBO_ID_PREFIX)).reduce((a, l) => a + l.price * l.qty, 0);
  const base = Math.max(0, subtotal - comboSub);
  const rules = (Array.isArray(promo?.rules) ? promo.rules : []).filter((r) => r && Number(r.percent) > 0 && ruleInTime(r, now));
  const surchargeRules = rules.filter((r) => r.kind === "SURCHARGE");
  const surcharge = surchargeRules.reduce((a, r) => a + Math.floor((base * Math.floor(Number(r.percent))) / 100), 0);
  const after = base + surcharge;
  let discount = 0, best = null;
  for (const r of rules.filter((x) => x.kind === "DISCOUNT")) {
    const d = Math.floor((after * Math.floor(Number(r.percent))) / 100);
    if (d > discount) { discount = d; best = r; }
  }
  // Giảm giá riêng cho đơn đặt online (% so với giá tại quán), tính trên MỌI dòng kể cả combo. Không cộng dồn với khuyến mãi của POS:
  // lấy mức giảm lớn hơn. Giá từng dòng vẫn là giá menu (luật Firestore đối chiếu đúng giá menu), mức giảm nằm ở trường discount của đơn.
  let discountName = best?.name || "";
  const onlineDiscount = onlinePercent > 0 ? Math.floor((subtotal * onlinePercent) / 100) : 0;
  if (onlineDiscount > 0 && onlineDiscount >= discount) { discount = onlineDiscount; discountName = `Đặt online giảm ${onlinePercent}%`; }
  return { subtotal, surcharge, discount, total: Math.max(0, subtotal + surcharge - discount), discountName, surchargeNames: surchargeRules.map((r) => r.name).filter(Boolean) };
};

/**
 * Nội dung thông báo ntfy khi có đơn mới. CỐ TÌNH không có tên, số điện thoại, địa chỉ khách:
 * ntfy.sh là máy chủ công cộng bên thứ ba, chỉ gửi mã đơn, số món, tổng tiền và hình thức nhận.
 */
export const notifyPayload = ({ topic, code, order, click = "" }) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const count = items.reduce((t, l) => t + (Number(l.qty) || 0), 0);
  const how = MODE_LABELS[order?.mode] || "";
  const where = order?.mode === "dinein" && order?.table ? ` · bàn ${String(order.table).slice(0, 12)}` : "";
  return {
    topic,
    title: `Đơn online mới ${code}`,
    message: `${count} phần · ${money(order?.total)}${how ? ` · ${how}` : ""}${where}`,
    priority: 5,
    tags: ["bell"],
    ...(click ? { click } : {}),
  };
};

/** Chuỗi số điện thoại của quán (một hoặc nhiều số, cách nhau bởi , ; / hoặc " - ") -> danh sách {text, tel}. */
export function splitPhones(raw) {
  return String(raw ?? "").split(/\s*[,;/|·•]\s*|\s+-\s+|\s+(?:hoặc|hoac)\s+/i).map((t) => t.trim()).filter(Boolean)
    .map((text) => ({ text, tel: text.replace(/[^\d+]/g, "") })).filter((p) => p.tel.length >= 6);
}

/** HTML các số bấm gọi được (mỗi số một liên kết tel:); `esc` là hàm thoát HTML của trang gọi. */
export const phoneLinksHtml = (raw, esc) => splitPhones(raw).map((p) => `<a href="tel:${esc(p.tel)}">${esc(p.text)}</a>`).join(" · ");

/** Địa chỉ ngắn để hiện ngay đầu trang: ưu tiên trường shortAddress của quán, nếu không thì bỏ số lô/số nhà đứng đầu ("LK 02-10 Hoàng Huy riverside" -> "Hoàng Huy Riverside"). */
export const shortAddress = (shop) => {
  const set = String(shop?.shortAddress || "").trim();
  if (set) return set;
  const full = String(shop?.address || "").trim();
  if (!full) return "";
  const first = full.split(",")[0].trim();
  const rest = first.replace(/^(?:lk|lô|lo|số|so)?\s*\d[\d\-/.\s]*/i, "").trim();
  const base = rest.length >= 3 ? rest : first;
  return base.split(/\s+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
};

/** Câu truyền thông ưu đãi đặt trực tiếp; rỗng nếu quán chưa bật giảm giá online (chỉ là lời nhắn, không tính giá). */
export const offerMessage = (percent) => {
  const p = Math.floor(Number(percent));
  return Number.isFinite(p) && p > 0 ? `Đặt trực tiếp trên web – Giá giảm ${p}% so với tại quán` : "";
};

/* ---------- Trang chủ menu: món lẻ nổi bật → combo tiện lợi → các nhóm còn lại; chọn nhóm = lọc đúng nhóm đó ---------- */
export const HOME_VIEW = "home";
export const RETAIL_VIEW = "retail";
export const COMBO_VIEW = "combo";
export const FEATURED_SECTION = Object.freeze({ id: "_featured", name: "Món lẻ nổi bật" });
export const COMBO_HOME_SECTION = Object.freeze({ id: "_combo", name: "Combo tiện lợi" });
export const HOME_LIMITS = Object.freeze({ featured: 6, combos: 4 });

/** Nhóm đồ uống / ăn vặt (theo tên nhóm của quán) không tính là "món ăn chính" khi chọn món lẻ nổi bật. */
const NOT_MAIN_CATEGORY = /(^| )(ca phe|cafe|coffee|tra|nuoc|nuoc ep|sinh to|do uong|matcha|smoothie|soda|da xay|an vat|topping)( |$)/;
export const isMainCategory = (name) => !NOT_MAIN_CATEGORY.test(foldName(name));

const retailOnly = (sections) => (sections || []).filter((s) => s && s.id !== COMBO_CATEGORY.id && s.id !== TOP_SECTION.id);

/**
 * Món lẻ nổi bật: món ăn chính (loại nhóm đồ uống/ăn vặt), đang bán được, giá cao xếp trước (cơm, bún, bít tết… thường là món chính),
 * tối đa `limit` món. Chỉ dùng dữ liệu menu thật, không ghi cứng tên món. Quá ít món chính thì lấy từ mọi món lẻ đang bán.
 */
export const featuredRetail = (sections, limit = HOME_LIMITS.featured) => {
  const retail = retailOnly(sections).filter((s) => s.active !== false);
  const pool = (list) => list.flatMap((s) => s.items.filter((m) => isOrderable(m, s)));
  const byPrice = (a, b) => Number(b.price) - Number(a.price) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  let items = pool(retail.filter((s) => isMainCategory(s.name)));
  if (items.length < 2) items = pool(retail);
  return items.sort(byPrice).slice(0, limit);
};

/** Các "trang" của menu: Nổi bật (mặc định), Món lẻ, Combo và từng nhóm thật của quán. */
export const menuViews = (sections) => {
  const all = sections || [];
  const hasCombo = all.some((s) => s.id === COMBO_CATEGORY.id && s.items.length);
  const retail = retailOnly(all);
  if (!retail.length && !hasCombo) return [];
  return [
    { id: HOME_VIEW, name: all.some((s) => s.id === TOP_SECTION.id) ? "Bán chạy" : "Nổi bật" },
    ...(retail.length ? [{ id: RETAIL_VIEW, name: "Món lẻ" }] : []),
    ...(hasCombo ? [{ id: COMBO_VIEW, name: "Combo" }] : []),
    ...retail.map((s) => ({ id: s.id, name: s.name })),
  ];
};

/** Các mục hiển thị theo trang đang chọn. Mỗi mục: {id, name, items, more?: {view, label}}. Trang không còn tồn tại → về Nổi bật. */
export const menuLayout = (sections, view = HOME_VIEW, limits = HOME_LIMITS) => {
  const all = sections || [];
  const combo = all.find((s) => s.id === COMBO_CATEGORY.id);
  const retail = retailOnly(all);
  const valid = menuViews(all).some((v) => v.id === view) ? view : HOME_VIEW;
  if (valid === RETAIL_VIEW) return retail;
  if (valid === COMBO_VIEW) return combo ? [{ ...combo, name: COMBO_HOME_SECTION.name }] : [];
  if (valid !== HOME_VIEW) return retail.filter((s) => s.id === valid);
  const out = [];
  const top = all.find((s) => s.id === TOP_SECTION.id);
  const topItems = top ? top.items.filter((m) => isOrderable(m)).slice(0, limits.featured) : [];
  const featured = topItems.length ? topItems : featuredRetail(all, limits.featured);
  const retailTotal = retail.filter((s) => s.active !== false).reduce((n, s) => n + s.items.filter((m) => isOrderable(m, s)).length, 0);
  if (featured.length) out.push({ id: FEATURED_SECTION.id, name: topItems.length ? "Món bán chạy" : FEATURED_SECTION.name, active: true, items: featured, more: retailTotal > featured.length ? { view: RETAIL_VIEW, label: "Xem tất cả món lẻ" } : null });
  if (combo?.items.length) out.push({ id: COMBO_HOME_SECTION.id, name: COMBO_HOME_SECTION.name, active: true, items: combo.items.slice(0, limits.combos), more: combo.items.length > limits.combos ? { view: COMBO_VIEW, label: "Xem tất cả combo" } : null });
  return out.concat(retail);
};
