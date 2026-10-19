import test from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET, CODE_PATTERN, LIMITS, STATUS, buildOrderDoc, cartFromOrder, cartLines, changeQty, countdownText, linesTotal, makeOrderCode, menuSections,
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
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: "x", qty: 1, note: "", price: 1000 }));
  assert.match(validateCheckout({ name: "A", phone: "0912345678", delivery: false, address: "", table: "", note: "", lines: many }).errors.cart, /tối đa 7/);
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
  assert.equal(progressSteps({ mode: "delivery" }).length, 5);
  assert.equal(progressSteps({ mode: "pickup" }).length, 4);
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
  assert.deepEqual(Object.values(STATUS).sort(), ["awaiting_payment", "delivering", "done", "expired", "new", "paid", "rejected"]);
});
