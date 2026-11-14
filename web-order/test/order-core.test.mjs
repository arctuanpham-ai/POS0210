import test from "node:test";
import assert from "node:assert/strict";
import {
  notifyPayload, CODE_ALPHABET, CODE_PATTERN, LIMITS, STATUS, buildOrderDoc, cartFromOrder, cartLines, changeQty, countdownText, linesTotal, makeOrderCode, menuSections,
  normalizePhone, orderView, pendingBase, progressSteps, rememberCode, setNote, toMillis, transferContentFor, validateCheckout,
} from "../public/order-core.js";

const menu = {
  a: { id: "a", categoryId: "c1", name: "Bạc xỉu", price: 30000, active: true },
  b: { id: "b", categoryId: "c1", name: "Americano ", price: 35000, active: true },
  off: { id: "off", categoryId: "c1", name: "Món tắt", price: 20000, active: false },
  gone: { id: "gone", categoryId: "c1", name: "Món xoá", price: 20000, deleted: true },
};

test("mã đơn 6 ký tự, không có ký tự dễ nhầm", () => {
  for (let i = 0; i < 300; i += 1) { const c = makeOrderCode(); assert.match(c, CODE_PATTERN); assert.ok(!/[01OI]/.test(c)); }
  assert.equal(CODE_ALPHABET.length, 32);
  assert.equal(makeOrderCode(() => 0), "AAAAAA");
  assert.equal(transferContentFor("K7P2QX"), "DMK7P2QX");
});

test("chuẩn hoá SĐT", () => {
  assert.equal(normalizePhone("0912 345 678"), "0912345678");
  assert.equal(normalizePhone("+84 912.345.678"), "0912345678");
  assert.equal(normalizePhone("84912345678"), "0912345678");
  assert.equal(normalizePhone("123"), "");
  assert.equal(normalizePhone("abc"), "");
  assert.equal(normalizePhone("0912345678901"), "");
});

test("giỏ hàng: cộng trừ, giới hạn, ghi chú, bỏ món tắt/xoá", () => {
  let cart = {};
  cart = changeQty(cart, "a", 1); cart = changeQty(cart, "a", 1); cart = changeQty(cart, "b", 1);
  assert.equal(cart.a.qty, 2);
  cart = setNote(cart, "a", "ít đá");
  assert.equal(cart.a.note, "ít đá");
  assert.equal(setNote(cart, "zzz", "x"), cart);
  cart = changeQty(cart, "b", -1);
  assert.equal(cart.b, undefined);
  for (let i = 0; i < 40; i += 1) cart = changeQty(cart, "a", 1);
  assert.equal(cart.a.qty, LIMITS.maxQty);
  cart = { ...cart, off: { qty: 1, note: "" }, gone: { qty: 1, note: "" }, ghost: { qty: 1, note: "" } };
  const lines = cartLines(cart, menu);
  assert.deepEqual(lines.map((l) => l.id), ["a"]);
  assert.equal(lines[0].name, "Bạc xỉu");
  assert.equal(linesTotal(lines), 30000 * LIMITS.maxQty);
});

test("cartLines giữ nguyên tên món như menu (kể cả khoảng trắng thừa) để khớp rules", () => {
  const lines = cartLines({ b: { qty: 1, note: "" } }, menu);
  assert.equal(lines[0].name, "Americano ");
});

test("nhóm món tắt thì món trong nhóm không đặt được", () => {
  const lines = cartLines({ a: { qty: 1, note: "" } }, menu, { c1: { id: "c1", active: false } });
  assert.deepEqual(lines, []);
});

const goodLines = [{ id: "a", name: "Bạc xỉu", qty: 2, note: "", price: 30000 }];

test("validateCheckout: mang đi, tại bàn, giao hàng", () => {
  let r = validateCheckout({ name: "  Lan  ", phone: "0912 345 678", delivery: false, address: "ignored", table: "", note: "", lines: goodLines });
  assert.ok(r.ok); assert.equal(r.value.mode, "pickup"); assert.equal(r.value.name, "Lan"); assert.equal(r.value.address, "");
  r = validateCheckout({ name: "Lan", phone: "0912345678", delivery: false, address: "", table: "05", note: "", lines: goodLines });
  assert.equal(r.value.mode, "dinein"); assert.equal(r.value.table, "05");
  r = validateCheckout({ name: "Lan", phone: "0912345678", delivery: true, address: "12 Lê Lợi, Hải Phòng", table: "5", note: "gọi trước", lines: goodLines });
  assert.equal(r.value.mode, "delivery"); assert.equal(r.value.table, ""); assert.equal(r.value.address, "12 Lê Lợi, Hải Phòng");
});

test("validateCheckout: báo lỗi từng trường", () => {
  const r = validateCheckout({ name: "", phone: "12", delivery: true, address: "abc", table: "", note: "", lines: [] });
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors).sort(), ["address", "cart", "name", "phone"]);
  const many = Array.from({ length: 31 }, (_, i) => ({ id: `m${i}`, name: "x", qty: 1, note: "", price: 1000 }));
  assert.match(validateCheckout({ name: "A", phone: "0912345678", delivery: false, address: "", table: "", note: "", lines: many }).errors.cart, /tối đa 30/);
  const big = [{ id: "a", name: "x", qty: 20, note: "", price: 300000 }];
  assert.match(validateCheckout({ name: "A", phone: "0912345678", delivery: false, address: "", table: "", note: "", lines: big }).errors.cart, /tối đa/);
});

test("buildOrderDoc: đủ trường, tổng tiền đúng, status new", () => {
  const v = validateCheckout({ name: "Lan", phone: "0912345678", delivery: false, address: "", table: "", note: "", lines: goodLines }).value;
  const doc = buildOrderDoc({ code: "K7P2QX", uid: "u1", value: v, lines: goodLines });
  assert.equal(doc.total, 60000); assert.equal(doc.status, "new"); assert.equal(doc.expiresAt, null); assert.equal(doc.transferContent, ""); assert.equal(doc.rejectReason, "");
  assert.deepEqual(doc.items, [{ id: "a", name: "Bạc xỉu", qty: 2, note: "", price: 30000 }]);
});

test("bộ đếm giới hạn: tự về 0 sau cửa sổ 60 phút", () => {
  const now = 10_000_000_000;
  assert.equal(pendingBase(null, now), 0);
  assert.equal(pendingBase({ pending: 2, lastAt: { toMillis: () => now - 10 * 60_000 } }, now), 2);
  assert.equal(pendingBase({ pending: 2, lastAt: { toMillis: () => now - 61 * 60_000 } }, now), 0);
  assert.equal(pendingBase({ pending: -3, lastAt: now - 1000 }, now), 0);
});

test("orderView: hết hạn tính theo giờ, đồng hồ đếm ngược", () => {
  const now = 1_000_000;
  const order = { status: "awaiting_payment", expiresAt: { toMillis: () => now + 125_000 } };
  let v = orderView(order, now);
  assert.equal(v.status, "awaiting_payment"); assert.equal(v.remainingMs, 125_000);
  assert.equal(countdownText(v.remainingMs), "02:05");
  v = orderView(order, now + 125_000);
  assert.equal(v.status, "expired"); assert.equal(v.rawStatus, "awaiting_payment"); assert.ok(v.isFinal);
  assert.equal(orderView({ status: "paid" }, now).status, "paid");
  // Thanh toán tách khỏi tiến độ: chưa thu / đã thu (paidAt hoặc đơn cũ "paid"); đơn đã nhận không hết hạn khi không có expiresAt.
  const accepted = orderView({ status: "awaiting_payment", expiresAt: null }, now);
  assert.equal(accepted.status, "awaiting_payment"); assert.equal(accepted.paid, false); assert.equal(accepted.stage, "making"); assert.equal(accepted.remainingMs, null);
  assert.equal(orderView({ status: "delivering", paidAt: 5 }, now).paid, true);
  assert.equal(orderView({ status: "paid" }, now).paid, true);
  assert.equal(orderView({ status: "new" }, now).paid, false);
  assert.equal(orderView({ status: "paid" }, now).stage, "making");
  assert.equal(orderView({ status: "done" }, now).isFinal, true);
  assert.equal(orderView({ status: "new" }, now).isFinal, false);
  assert.equal(countdownText(-5), "00:00");
  assert.equal(countdownText(600_000), "10:00");
});

test("toMillis nhận nhiều dạng", () => {
  assert.equal(toMillis(null), null); assert.equal(toMillis(5), 5); assert.equal(toMillis(new Date(7)), 7);
  assert.equal(toMillis({ seconds: 2, nanoseconds: 5_000_000 }), 2005);
});

test("thanh tiến độ: giao hàng có thêm bước Đang giao", () => {
  assert.equal(progressSteps({ mode: "delivery" }).length, 4);
  assert.equal(progressSteps({ mode: "pickup" }).length, 3);
});

test("đặt lại đơn: chỉ giữ món còn bán", () => {
  const cart = cartFromOrder({ items: [{ id: "a", qty: 2, note: "ít đá" }, { id: "off", qty: 1 }, { id: "ghost", qty: 1 }] }, menu);
  assert.deepEqual(cart, { a: { qty: 2, note: "ít đá" } });
});

test("nhớ mã đơn: mới nhất trước, không trùng, tối đa 5, bỏ mã sai định dạng", () => {
  let codes = [];
  for (const c of ["AAAAAA", "BBBBBB", "AAAAAA", "CCCCCC", "DDDDDD", "EEEEEE", "FFFFFF"]) codes = rememberCode(codes, c);
  assert.deepEqual(codes, ["FFFFFF", "EEEEEE", "DDDDDD", "CCCCCC", "AAAAAA"]);
  assert.deepEqual(rememberCode(["xx"], "AAAAAA"), ["AAAAAA"]);
});

test("menu hiển thị: theo nhóm, bỏ món xoá, nhóm không bán được xuống cuối, món mồ côi vào 'Khác'", () => {
  const cats = [{ id: "c2", name: "Trà", sortOrder: 2 }, { id: "c1", name: "Cà phê", sortOrder: 1 }, { id: "c3", name: "Ngừng", sortOrder: 0, active: false }];
  const items = [
    { id: "1", categoryId: "c1", name: "A", price: 1000, sortOrder: 2 }, { id: "2", categoryId: "c1", name: "B", price: 1000, sortOrder: 1 },
    { id: "3", categoryId: "c2", name: "C", price: 1000 }, { id: "4", categoryId: "c3", name: "D", price: 1000 },
    { id: "5", categoryId: "none", name: "E", price: 1000 }, { id: "6", categoryId: "c1", name: "X", price: 1000, deleted: true }, { id: "7", categoryId: "c1", name: "Y", price: 0 },
  ];
  const s = menuSections(items, cats);
  assert.deepEqual(s.map((x) => x.name), ["Cà phê", "Trà", "Khác", "Ngừng"]);
  assert.deepEqual(s[0].items.map((m) => m.id), ["2", "1"]);
});

test("hằng số trạng thái", () => {
  assert.deepEqual(Object.values(STATUS).sort(), ["awaiting_payment", "cancelled", "delivering", "done", "expired", "new", "paid", "rejected"]);
});

import { comboItemsFrom, COMBO_CATEGORY } from "../public/order-core.js";
test("combo hiện thành nhóm Combo, id có tiền tố c_, bỏ combo tắt/ẩn", () => {
  const combos = [
    { id: "a1", name: "Cafe Ngon", price: 45000, active: true, sortOrder: 2, items: [{ name: "Cafe sữa", qty: 1 }, { name: "Bánh mì", qty: 2 }] },
    { id: "a2", name: "Tắt", price: 1000, active: false },
    { id: "a3", name: "Ẩn", price: 1000, active: true },
    { id: "a4", name: "Trà", price: 30000, active: true, sortOrder: 1, items: [] , description: "Trà + bánh" },
  ];
  const items = comboItemsFrom(combos, new Set(["c_a3"]));
  assert.deepEqual(items.map((i) => i.id), ["c_a4", "c_a1"]);
  assert.equal(items[1].description, "Cafe sữa + 2× Bánh mì");
  assert.equal(items[0].description, "Trà + bánh");
  const sections = menuSections(items, [COMBO_CATEGORY]);
  assert.equal(sections[0].name, "Combo");
});

import { pricingFor } from "../public/order-core.js";
test("khuyến mãi tự động như POS: giảm % trên món lẻ, combo giữ giá cố định, phụ thu tính trước khi giảm", () => {
  const lines = [{ id: "a", name: "A", qty: 2, note: "", price: 30000 }, { id: "c_k1", name: "Combo", qty: 1, note: "", price: 69000 }];
  const noon = new Date(2026, 9, 20, 12, 0);
  const promo = { rules: [{ name: "Giảm 10%", kind: "DISCOUNT", percent: 10 }, { name: "Giờ vàng", kind: "DISCOUNT", percent: 20, startMinute: 360, endMinute: 540 }] };
  const p = pricingFor(lines, promo, noon);
  assert.equal(p.subtotal, 129000);
  assert.equal(p.discount, 6000); // 10% của 60.000 (combo không giảm)
  assert.equal(p.total, 123000);
  const morning = pricingFor(lines, promo, new Date(2026, 9, 20, 7, 0));
  assert.equal(morning.discount, 12000);
  const sur = pricingFor(lines, { rules: [{ kind: "SURCHARGE", percent: 10 }, { kind: "DISCOUNT", percent: 10 }] }, noon);
  assert.equal(sur.surcharge, 6000); assert.equal(sur.discount, 6600); assert.equal(sur.total, 129000 + 6000 - 6600);
  assert.equal(pricingFor(lines, null, noon).total, 129000);
});

import { comboItemsFrom as _cif } from "../public/order-core.js";
test("combo giữ nguyên tên gốc (kể cả khoảng trắng) để khớp luật máy chủ", () => {
  const items = _cif([{ id: "x1", name: "Combo A ", price: 50000, active: true }]);
  assert.equal(items[0].name, "Combo A ");
});

test("thông báo ntfy: có mã đơn, số phần, tổng, hình thức; KHÔNG có tên, SĐT, địa chỉ", () => {
  const order = { name: "Nguyễn Văn A", phone: "0912345678", address: "12 Phố X", mode: "dinein", table: "5", items: [{ name: "Bạc xỉu", qty: 2 }, { name: "Americano", qty: 1 }], total: 95000 };
  const p = notifyPayload({ topic: "t-123", code: "AB12", order, click: "https://x.y/#donline" });
  assert.equal(p.topic, "t-123");
  assert.equal(p.priority, 5);
  assert.match(p.title, /AB12/);
  assert.equal(p.message, "3 phần · 95.000đ · Tại quán · bàn 5");
  const all = JSON.stringify(p);
  for (const secret of ["Nguyễn", "0912345678", "Phố X"]) assert.ok(!all.includes(secret), secret);
  assert.equal(p.click, "https://x.y/#donline");
  assert.equal(notifyPayload({ topic: "t", code: "Z", order: { mode: "delivery", items: [{ qty: 1 }], total: 1000 } }).message, "1 phần · 1.000đ · Giao tận nơi");
});

/* ---------- Giảm giá khi đặt online ---------- */
import { onlineDiscountPercent, onlinePrice } from "../public/order-core.js";

const L = (id, price, qty = 1) => ({ id, name: id, price, qty, note: "" });

test("mức giảm online: chỉ nhận số nguyên 1-50, còn lại là không giảm", () => {
  assert.equal(onlineDiscountPercent({ onlineDiscountPercent: 10 }), 10);
  assert.equal(onlineDiscountPercent({ onlineDiscountPercent: "10" }), 10);
  assert.equal(onlineDiscountPercent({ onlineDiscountPercent: 0 }), 0);
  assert.equal(onlineDiscountPercent({ onlineDiscountPercent: -5 }), 0);
  assert.equal(onlineDiscountPercent({ onlineDiscountPercent: 51 }), 0);
  assert.equal(onlineDiscountPercent({ onlineDiscountPercent: "abc" }), 0);
  assert.equal(onlineDiscountPercent({}), 0);
  assert.equal(onlineDiscountPercent(null), 0);
});

test("giá một phần sau giảm 10%", () => {
  assert.equal(onlinePrice(30000, 10), 27000);
  assert.equal(onlinePrice(35000, 10), 31500);
  assert.equal(onlinePrice(6000, 10), 5400);
  assert.equal(onlinePrice(25000, 0), 25000);
});

test("đơn online giảm 10% trên mọi dòng, kể cả combo; luật Firestore (giảm ≤ 60%, tổng khớp) vẫn đúng", () => {
  const lines = [L("a", 30000, 2), L("b", 35000), L("c_x", 69000)];
  const sum = 30000 * 2 + 35000 + 69000;
  const p = pricingFor(lines, null, new Date(), { onlinePercent: 10 });
  assert.equal(p.subtotal, sum);
  assert.equal(p.discount, Math.floor(sum / 10));
  assert.equal(p.total, sum - p.discount);
  assert.equal(p.surcharge, 0);
  assert.equal(p.discountName, "Đặt online giảm 10%");
  assert.ok(p.discount * 100 <= sum * 60);
  assert.equal(p.total, sum + p.surcharge - p.discount);
});

test("tổng đơn khớp tổng giá từng món sau giảm khi giá tròn chục", () => {
  const lines = [L("a", 30000, 2), L("b", 35000), L("c", 25000, 3)];
  const p = pricingFor(lines, null, new Date(), { onlinePercent: 10 });
  const perDish = lines.reduce((t, l) => t + onlinePrice(l.price, 10) * l.qty, 0);
  assert.equal(p.total, perDish);
});

test("không cộng dồn với khuyến mãi của POS: lấy mức giảm lớn hơn", () => {
  const promo = { rules: [{ name: "Giờ vàng", kind: "DISCOUNT", percent: 20 }] };
  const lines = [L("a", 50000)];
  const big = pricingFor(lines, promo, new Date(), { onlinePercent: 10 });
  assert.equal(big.discount, 10000);
  assert.equal(big.discountName, "Giờ vàng");
  const small = pricingFor(lines, { rules: [{ name: "Nhỏ", kind: "DISCOUNT", percent: 5 }] }, new Date(), { onlinePercent: 10 });
  assert.equal(small.discount, 5000);
  assert.equal(small.discountName, "Đặt online giảm 10%");
});

test("không bật giảm online thì giá như cũ", () => {
  const lines = [L("a", 30000)];
  assert.equal(pricingFor(lines, null).discount, 0);
  assert.equal(pricingFor(lines, null, new Date(), { onlinePercent: 0 }).total, 30000);
});

import { splitPhones as _sp, phoneLinksHtml as _pl } from "../public/order-core.js";
test("splitPhones: một hoặc hai số, mỗi số một liên kết tel", () => {
  assert.deepEqual(_sp("0912 345 678").map((p) => p.tel), ["0912345678"]);
  assert.deepEqual(_sp("0912 345 678 / 0987.654.321").map((p) => p.tel), ["0912345678", "0987654321"]);
  assert.deepEqual(_sp("0912345678, 0987654321").length, 2);
  assert.deepEqual(_sp(""), []);
  assert.match(_pl("0912 345 678 / 0987 654 321", (x) => x), /tel:0912345678.*tel:0987654321/);
});

import { menuSections as _ms, COMBO_CATEGORY as _CC } from "../public/order-core.js";
test("menuSections: combo, bán chạy, cơm trưa, cà phê, rồi các nhóm còn lại theo thứ tự quán đặt", () => {
  const cats = [
    { id: "an", name: "Ăn sáng", sortOrder: 1, active: true }, { id: "tra", name: "Trà", sortOrder: 2, active: true },
    { id: "cf", name: "Cà phê", sortOrder: 3, active: true }, { id: "ct", name: "cơm trưa", sortOrder: 4, active: true },
    { id: "off", name: "Đồ ăn vặt", sortOrder: 5, active: false }, _CC,
  ];
  const items = [
    { id: "a1", categoryId: "an", name: "Bánh mì", price: 25000 }, { id: "t1", categoryId: "tra", name: "Trà đào", price: 30000 },
    { id: "c1", categoryId: "cf", name: "Bạc xỉu", price: 30000 }, { id: "k1", categoryId: "ct", name: "Cơm gà", price: 45000 },
    { id: "o1", categoryId: "off", name: "Hạt", price: 20000 }, { id: "c_x", categoryId: _CC.id, name: "Combo X", price: 60000, active: true },
  ];
  const names = (top) => _ms(items, cats, { top }).map((s) => s.name);
  assert.deepEqual(names(["c1", "k1"]), ["Combo", "Bán chạy nhất", "cơm trưa", "Cà phê", "Ăn sáng", "Trà", "Đồ ăn vặt"]);
  assert.deepEqual(names([]), ["Combo", "cơm trưa", "Cà phê", "Ăn sáng", "Trà", "Đồ ăn vặt"], "không có thống kê thì không có mục bán chạy");
  assert.deepEqual(_ms(items, cats, { top: ["c1", "o1", "nope", "c_x"] }).find((s) => s.id === "_top").items.map((m) => m.id), ["c1"], "chỉ món đang bán được, không combo, không id lạ");
  assert.deepEqual(_ms(items, cats).map((s) => s.name), names([]), "gọi không có tuỳ chọn vẫn chạy");
});

import { shortAddress, offerMessage, splitPhones as splitPhones2 } from "../public/order-core.js";
test("địa chỉ ngắn đầu trang", () => {
  assert.equal(shortAddress({ address: "LK 02-10 Hoàng Huy riverside" }), "Hoàng Huy Riverside");
  assert.equal(shortAddress({ address: "LK 02-10 Hoàng Huy riverside", shortAddress: "Hoàng Huy" }), "Hoàng Huy");
  assert.equal(shortAddress({ address: "12 Lê Lợi, Hồng Bàng" }), "Lê Lợi");
  assert.equal(shortAddress({ address: "Hoàng Huy Riverside" }), "Hoàng Huy Riverside");
  assert.equal(shortAddress({}), "");
});
test("thông điệp ưu đãi theo cấu hình, không cấu hình thì rỗng", () => {
  assert.equal(offerMessage(10), "Đặt trực tiếp trên web – Giá giảm 10% so với tại quán");
  assert.equal(offerMessage(15), "Đặt trực tiếp trên web – Giá giảm 15% so với tại quán");
  assert.equal(offerMessage(0), "");
  assert.equal(offerMessage(undefined), "");
});
test("tách số điện thoại cả khi ngăn bằng dấu chấm giữa", () => {
  assert.deepEqual(splitPhones2("0702245400 · 0968563539").map((p) => p.tel), ["0702245400", "0968563539"]);
});

import { featuredRetail, menuLayout, menuViews, isMainCategory, HOME_VIEW, RETAIL_VIEW, COMBO_VIEW } from "../public/order-core.js";
const mk = (id, categoryId, price, extra = {}) => ({ id, categoryId, name: `Món ${id}`, price, active: true, sortOrder: 0, ...extra });
const SECS = [
  { id: "_combo", name: "Combo", active: true, items: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ ...mk(`c_${n}`, "_combo", 60000 + n), parts: [] })) },
  { id: "com", name: "cơm trưa", active: true, items: [mk("com1", "com", 59000), mk("com2", "com", 75000), mk("addon", "com", 29000)] },
  { id: "cf", name: "Cà phê", active: true, items: [mk("cf1", "cf", 50000), mk("cf2", "cf", 25000)] },
  { id: "sang", name: "Ăn sáng", active: true, items: [mk("bit", "sang", 85000), mk("bun", "sang", 50000), mk("bm", "sang", 25000), mk("off", "sang", 99000, { active: false })] },
  { id: "tra", name: "Trà", active: true, items: [mk("t1", "tra", 40000)] },
  { id: "vat", name: "Đồ ăn vặt", active: true, items: [mk("v1", "vat", 45000)] },
];
test("nhóm món chính: loại đồ uống và ăn vặt, giữ 'Ăn sáng'", () => {
  assert.equal(isMainCategory("cơm trưa"), true);
  assert.equal(isMainCategory("Ăn sáng"), true);
  assert.equal(isMainCategory("Cà phê"), false);
  assert.equal(isMainCategory("Trà sữa"), false);
  assert.equal(isMainCategory("Nước ép"), false);
  assert.equal(isMainCategory("Đồ ăn vặt"), false);
  assert.equal(isMainCategory("Đồ uống"), false);
});
test("món lẻ nổi bật: món ăn chính, giá cao trước, không có món tắt/combo/đồ uống", () => {
  const ids = featuredRetail(SECS).map((m) => m.id);
  assert.deepEqual(ids, ["bit", "com2", "com1", "bun", "addon", "bm"]);
  assert.deepEqual(featuredRetail(SECS, 2).map((m) => m.id), ["bit", "com2"]);
});
test("món lẻ nổi bật: quá ít món chính thì lấy mọi món lẻ", () => {
  const only = [{ id: "cf", name: "Cà phê", active: true, items: [mk("a", "cf", 30000), mk("b", "cf", 40000)] }];
  assert.deepEqual(featuredRetail(only).map((m) => m.id), ["b", "a"]);
  assert.deepEqual(featuredRetail([]), []);
});
test("trang chủ: món lẻ nổi bật → combo (tối đa 4) → các nhóm; có nút xem tất cả", () => {
  const l = menuLayout(SECS);
  assert.deepEqual(l.map((s) => s.id), ["_featured", "_combo", "com", "cf", "sang", "tra", "vat"]);
  assert.equal(l[0].items.length, 6);
  assert.deepEqual(l[0].more, { view: RETAIL_VIEW, label: "Xem tất cả món lẻ" });
  assert.equal(l[1].items.length, 4);
  assert.deepEqual(l[1].more, { view: COMBO_VIEW, label: "Xem tất cả combo" });
  assert.equal(l[1].name, "Combo tiện lợi");
});
test("trang chủ: ít combo / ít món lẻ thì không hiện nút xem tất cả", () => {
  const few = [{ id: "_combo", name: "Combo", active: true, items: SECS[0].items.slice(0, 3) }, { id: "m", name: "Cơm", active: true, items: [mk("x", "m", 50000), mk("y", "m", 40000)] }];
  const l = menuLayout(few);
  assert.equal(l[0].more, null); assert.equal(l[1].more, null);
});
test("chọn trang: Món lẻ = mọi nhóm trừ combo; Combo = tất cả combo; nhóm = đúng nhóm đó; trang lạ về Nổi bật", () => {
  assert.deepEqual(menuLayout(SECS, RETAIL_VIEW).map((s) => s.id), ["com", "cf", "sang", "tra", "vat"]);
  const c = menuLayout(SECS, COMBO_VIEW); assert.equal(c.length, 1); assert.equal(c[0].items.length, 7);
  assert.deepEqual(menuLayout(SECS, "sang").map((s) => s.id), ["sang"]);
  assert.equal(menuLayout(SECS, "khong-co")[0].id, "_featured");
  assert.deepEqual(menuViews(SECS).map((v) => v.id), [HOME_VIEW, RETAIL_VIEW, COMBO_VIEW, "com", "cf", "sang", "tra", "vat"]);
  assert.deepEqual(menuViews([]), []);
});

import { comboSaving as _comboSaving, comboItemsFrom as _comboItemsFrom } from "../public/order-core.js";
test("comboSaving: tổng món lẻ (theo SL) trừ giá combo; thiếu giá → null; không lời → null", () => {
  const items = [{ id: "a", price: 30000 }, { id: "b", price: 25000 }];
  const [c] = _comboItemsFrom([{ id: "1", name: "C", price: 49000, items: [{ menuItemId: "a", name: "A", qty: 1 }, { menuItemId: "b", name: "B", qty: 1 }] }]);
  assert.equal(_comboSaving(c, items), 6000);
  assert.equal(_comboSaving({ ...c, price: 55000 }, items), null);
  assert.equal(_comboSaving(c, [items[0]]), null);
  const [d] = _comboItemsFrom([{ id: "2", name: "D", price: 80000, items: [{ menuItemId: "a", name: "A", qty: 3 }] }]);
  assert.equal(_comboSaving(d, items), 10000);
});
