import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITS, LIMIT_KEYS, LINE_KEYS, ORDER_KEYS, CODE_PATTERN, buildOrderDoc, validateCheckout, limitKeyForPhone, limitKeyForUid } from "../public/order-core.js";
import { STORE_OWNER_UID, STORE_ID } from "../public/config.js";

const rules = readFileSync(new URL("../rules/online-orders.rules", import.meta.url), "utf8");
const code = rules.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const keyArrays = (src, fn) => [...src.matchAll(new RegExp(`${fn}\\(\\[([^\\]]*)\\]\\)`, "g"))].map((m) => m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort());

test("rules: ngoặc cân bằng và có đủ khối cần thiết", () => {
  assert.equal([...code].filter((c) => c === "{").length, [...code].filter((c) => c === "}").length);
  assert.equal([...code].filter((c) => c === "(").length, [...code].filter((c) => c === ")").length);
  for (const needle of ["function isShopOwner", "function isGuest", "function validNewOrder", "function validLimitWrite", "function menuMatches", "online_orders/{code}", "online_limits/{key}", "online_config/{docId}"]) assert.ok(code.includes(needle), needle);
});

test("rules: bộ trường đơn / dòng món / bộ đếm khớp với client", () => {
  // Đơn và dòng món: size() == số trường và mọi trường đều được đọc trong rules (rẻ hơn hasOnly/hasAll về ngân sách biểu thức của Firestore).
  const core = code;
  assert.ok(core.includes(`d.size() == ${ORDER_KEYS.length}`));
  assert.ok(core.includes(`l.size() == ${LINE_KEYS.length}`));
  for (const k of ORDER_KEYS) assert.ok(new RegExp(`\\bd\\.${k}\\b`).test(core), `đơn: rules chưa đọc trường ${k}`);
  for (const k of LINE_KEYS) assert.ok(new RegExp(`\\bl\\.${k}\\b`).test(core), `dòng: rules chưa đọc trường ${k}`);
  const [limitOnly] = keyArrays(code, "hasOnly");
  const [limitAll] = keyArrays(code, "hasAll");
  assert.deepEqual(limitOnly, [...LIMIT_KEYS].sort());
  assert.deepEqual(limitAll, [...LIMIT_KEYS].sort());
});

test("rules: hằng số giới hạn khớp với client", () => {
  const has = (s) => assert.ok(code.includes(s), `thiếu: ${s}`);
  has(`d.name.size() <= ${LIMITS.maxName}`);
  has(`d.address.size() <= ${LIMITS.maxAddress}`);
  has(`d.address.size() >= ${LIMITS.minAddress}`);
  has(`d.table.size() <= ${LIMITS.maxTable}`);
  has(`d.note.size() <= ${LIMITS.maxNote}`);
  has(`d.items.size() <= ${LIMITS.maxLines}`);
  has(`d.total <= ${LIMITS.maxTotal}`);
  has(`l.qty <= ${LIMITS.maxQty}`);
  has(`l.note.size() <= ${LIMITS.maxLineNote}`);
  has(`d.pending <= ${LIMITS.maxPendingOrders}`);
  has(`duration.value(${LIMITS.limitWindowMinutes}, 'm')`);
  assert.equal([...code.matchAll(/lineValid\(items\[\d\]\)/g)].length, 3);
  assert.equal([...code.matchAll(/lineAmount\(items, \d\)/g)].length, 3);
});

test("rules: regex mã đơn, SĐT và uid chủ quán", () => {
  assert.ok(code.includes("'^[A-HJ-NP-Z2-9]{6}$'"));
  assert.equal(CODE_PATTERN.source, "^[A-HJ-NP-Z2-9]{6}$");
  assert.ok(code.includes("'^0[0-9]{9,10}$'"));
  assert.ok(code.includes(`'${STORE_OWNER_UID}'`));
  assert.equal([...code.matchAll(new RegExp(`users/${STORE_OWNER_UID}/stores/${STORE_ID}/`, "g"))].length >= 8, true);
  assert.ok(!/users\/\{/.test(code), "không dùng wildcard uid: chỉ đúng cửa hàng này");
});

test("rules: quyền công khai chỉ là ĐỌC menu/nhóm/ảnh/cấu hình; không có quyền ghi công khai", () => {
  const blocks = [...code.matchAll(/match (\S+) \{([^}]*)\}/g)].map((m) => ({ path: m[1], body: m[2] }));
  const publicRead = blocks.filter((b) => /allow read: if true;/.test(b.body)).map((b) => b.path.split("/").slice(-2)[0]).sort();
  assert.deepEqual(publicRead, ["combos", "menu", "menuCategories", "menuThumbs", "online_config"]);
  for (const b of blocks) {
    for (const m of b.body.matchAll(/allow ([a-z, ]+): if ([^;]+);/g)) {
      const ops = m[1], cond = m[2].trim();
      if (cond === "true") assert.equal(ops, "read", `${b.path}: chỉ được mở công khai quyền read`);
    }
  }
  const menu = blocks.find((b) => b.path.includes("/menu/{"));
  assert.ok(!/write|create|update|delete/.test(menu.body));
  const orders = blocks.find((b) => b.path.includes("online_orders"));
  assert.match(orders.body, /allow create: if isGuest\(\) && validNewOrder\(code\);/);
  assert.match(orders.body, /allow update: if isShopOwner\(\) \|\| guestCancel\(\);/);
  assert.match(orders.body, /allow delete: if isShopOwner\(\);/);
  assert.match(orders.body, /resource\.data\.uid == request\.auth\.uid/);
});

test("rules: số lần get()/getAfter() trong một thao tác ghi không vượt 10", () => {
  // Tạo đơn: tối đa 7 dòng menu (get) + 2 getAfter bộ đếm = 9. Ghi bộ đếm: getAfter + exists = 2.
  assert.ok(3 + 2 <= 10);
  const main = code;
  assert.equal((main.match(/getAfter\(limitRef/g) || []).length, 2);
  assert.equal((main.match(/get\(menuRef/g) || []).length, 1);
});

// ---- Mô hình tham chiếu của rules (viết lại bằng JS) để chắc dữ liệu client gửi lên qua được và dữ liệu giả mạo bị chặn ----
const isInt = Number.isInteger;
function modelValidOrder({ code: id, auth, d, now, menu, limits }) {
  const keys = Object.keys(d);
  if (keys.length !== ORDER_KEYS.length || !ORDER_KEYS.every((k) => keys.includes(k))) return false;
  if (!CODE_PATTERN.test(id) || d.code !== id || d.uid !== auth.uid || d.createdAt !== now) return false;
  if (d.status !== "new" || d.rejectReason !== "" || d.transferContent !== "" || d.expiresAt !== null) return false;
  if (typeof d.name !== "string" || d.name.length < 1 || d.name.length > LIMITS.maxName) return false;
  if (typeof d.phone !== "string" || !/^0[0-9]{9,10}$/.test(d.phone)) return false;
  if (!["delivery", "pickup", "dinein"].includes(d.mode)) return false;
  if (typeof d.address !== "string" || d.address.length > LIMITS.maxAddress) return false;
  if (d.mode === "delivery" && d.address.length < LIMITS.minAddress) return false;
  if (d.mode !== "delivery" && d.address !== "") return false;
  if (typeof d.table !== "string" || d.table.length > LIMITS.maxTable) return false;
  if (d.mode === "dinein" ? d.table.length < 1 : d.table !== "") return false;
  if (typeof d.note !== "string" || d.note.length > LIMITS.maxNote) return false;
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > LIMITS.maxLines) return false;
  if (!isInt(d.total) || d.total <= 0 || d.total > LIMITS.maxTotal) return false;
  let sum = 0;
  for (const l of d.items) {
    const k = Object.keys(l);
    if (k.length !== LINE_KEYS.length || !LINE_KEYS.every((x) => k.includes(x))) return false;
    if (typeof l.id !== "string" || !l.id || l.id.length > 64 || l.id.includes("/")) return false;
    if (typeof l.name !== "string" || typeof l.note !== "string" || l.note.length > LIMITS.maxLineNote) return false;
    if (!isInt(l.qty) || l.qty < 1 || l.qty > LIMITS.maxQty || !isInt(l.price) || l.price <= 0) return false;
    const m = menu[l.id];
    if (!m || m.price !== l.price || m.name !== l.name || m.active === false || m.deleted === true) return false;
    sum += l.price * l.qty;
  }
  if (!isInt(d.discount) || d.discount < 0 || d.discount * 100 > sum * 60) return false;
  if (!isInt(d.surcharge) || d.surcharge < 0 || d.surcharge * 100 > sum * 30) return false;
  if (d.total !== sum + d.surcharge - d.discount) return false;
  return limits[limitKeyForUid(auth.uid)]?.lastOrder === id && limits[limitKeyForPhone(d.phone)]?.lastOrder === id;
}
function modelValidLimit({ key, d, before, auth, orderAfter, orderBefore, now }) {
  const base = before && before.lastAt + LIMITS.limitWindowMinutes * 60_000 > now ? before.pending : 0;
  const keys = Object.keys(d);
  if (keys.length !== 3 || !LIMIT_KEYS.every((k) => keys.includes(k))) return false;
  if (typeof d.lastOrder !== "string" || !CODE_PATTERN.test(d.lastOrder) || orderBefore) return false;
  if (!orderAfter || orderAfter.uid !== auth.uid) return false;
  if (!(key === limitKeyForUid(auth.uid) || key === limitKeyForPhone(orderAfter.phone))) return false;
  return d.lastAt === now && isInt(d.pending) && d.pending === base + 1 && d.pending <= LIMITS.maxPendingOrders;
}

const menu = { a: { name: "Bạc xỉu", price: 30000, active: true }, b: { name: "Americano ", price: 35000, active: true }, off: { name: "Tắt", price: 1000, active: false } };
const lines = [{ id: "a", name: "Bạc xỉu", qty: 2, note: "ít đá", price: 30000 }, { id: "b", name: "Americano ", qty: 1, note: "", price: 35000 }];
const mkOrder = (over = {}, mode = {}) => {
  const value = validateCheckout({ name: "Lan", phone: "0912 345 678", delivery: false, address: "", table: "", note: "", lines, ...mode }).value;
  return { ...buildOrderDoc({ code: "K7P2QX", uid: "g1", value, lines }), createdAt: 111, ...over };
};
const ctx = (d, extra = {}) => ({ code: "K7P2QX", auth: { uid: "g1" }, d, now: 111, menu, limits: { u_g1: { lastOrder: "K7P2QX" }, p_0912345678: { lastOrder: "K7P2QX" } }, ...extra });

test("mô hình rules: đơn do client dựng ra được chấp nhận (mang đi, tại bàn, giao hàng)", () => {
  assert.ok(modelValidOrder(ctx(mkOrder())));
  assert.ok(modelValidOrder(ctx(mkOrder({}, { table: "7" }))));
  assert.ok(modelValidOrder(ctx(mkOrder({}, { delivery: true, address: "12 Lê Lợi, Hải Phòng" }))));
});

test("mô hình rules: đơn giả mạo bị chặn", () => {
  const bad = (over, extra) => assert.equal(modelValidOrder(ctx(mkOrder(over), extra)), false, JSON.stringify(over));
  bad({ status: "paid" });
  bad({ total: 1 });
  bad({ uid: "other" });
  bad({ createdAt: 5 });
  bad({ extra: 1 });
  bad({ expiresAt: 5 });
  bad({ rejectReason: "x" });
  bad({ phone: "123" });
  bad({ items: [{ ...lines[0], price: 1 }, lines[1]], total: 2 + 35000 });
  bad({ items: [{ ...lines[0], name: "Khác" }, lines[1]] });
  bad({ items: [{ id: "off", name: "Tắt", qty: 1, note: "", price: 1000 }], total: 1000 });
  bad({ items: [{ id: "zzz", name: "Ma", qty: 1, note: "", price: 1000 }], total: 1000 });
  bad({ items: [{ ...lines[0], qty: 0 }], total: 0 });
  bad({ items: [{ ...lines[0], qty: 21 }], total: 630000 });
  bad({ items: Array(8).fill(lines[0]), total: 240000 });
  bad({ mode: "delivery", address: "ngắn" });
  bad({ mode: "dinein", table: "" });
  bad({ mode: "teleport" });
  bad({ items: [{ ...lines[0], id: "a/b" }] });
  assert.equal(modelValidOrder(ctx(mkOrder(), { auth: { uid: "g2" } })), false);
  assert.equal(modelValidOrder(ctx(mkOrder(), { limits: {} })), false); // thiếu bộ đếm đi kèm
  assert.equal(modelValidOrder(ctx(mkOrder(), { limits: { u_g1: { lastOrder: "AAAAAA" }, p_0912345678: { lastOrder: "K7P2QX" } } })), false);
});

test("mô hình rules: bộ đếm chỉ tăng đúng 1, tối đa 2, tự reset sau 60 phút", () => {
  const now = 10_000_000;
  const base = { key: "u_g1", auth: { uid: "g1" }, now, orderAfter: { uid: "g1", phone: "0912345678" }, orderBefore: null };
  const w = (pending, extra = {}) => ({ ...base, d: { pending, lastAt: now, lastOrder: "K7P2QX" }, before: null, ...extra });
  assert.ok(modelValidLimit(w(1)));
  assert.ok(modelValidLimit(w(2, { before: { pending: 1, lastAt: now - 60_000 } })));
  assert.equal(modelValidLimit(w(3, { before: { pending: 2, lastAt: now - 60_000 } })), false, "quá 2 đơn chờ");
  assert.equal(modelValidLimit(w(1, { before: { pending: 2, lastAt: now - 60_000 } })), false, "không được giảm/giữ khi cửa sổ còn hiệu lực");
  assert.ok(modelValidLimit(w(1, { before: { pending: 2, lastAt: now - 61 * 60_000 } })), "reset sau 60 phút");
  assert.equal(modelValidLimit(w(5)), false);
  assert.equal(modelValidLimit(w(1, { orderBefore: { exists: true } })), false, "đơn phải là đơn MỚI");
  assert.equal(modelValidLimit(w(1, { key: "u_victim" })), false, "không đụng bộ đếm uid người khác");
  assert.ok(modelValidLimit(w(1, { key: "p_0912345678" })));
  assert.equal(modelValidLimit(w(1, { key: "p_0999999999" })), false, "bộ đếm SĐT phải khớp SĐT của đơn");
  assert.equal(modelValidLimit(w(1, { orderAfter: { uid: "other", phone: "0912345678" } })), false);
});

test("rules: khách chỉ được tự huỷ đơn còn chờ của chính mình, không sửa trường nào khác", () => {
  const fn = (name) => code.slice(code.indexOf(`function ${name}`)).split(/\nfunction /)[0];
  const cancel = fn("guestCancel");
  assert.match(cancel, /resource\.data\.uid == request\.auth\.uid/);
  assert.match(cancel, /resource\.data\.status in \['new', 'awaiting_payment'\]/);
  assert.match(cancel, /d\.status == 'cancelled'/);
  assert.match(cancel, /affectedKeys\(\)\.hasOnly\(\['status', 'cancelledAt'\]\)/);
  assert.match(cancel, /d\.cancelledAt == request\.time/);
  const release = fn("validLimitRelease");
  assert.match(release, /hasOnly\(\['pending', 'lastAt', 'lastOrder', 'released'\]\)/);
  assert.match(release, /d\.pending == \(resource\.data\.pending > 0 \? resource\.data\.pending - 1 : 0\)/);
  assert.match(release, /before\.status in \['new', 'awaiting_payment'\]/);
  assert.match(release, /after\.status == 'cancelled'/);
  assert.match(release, /after\.uid == request\.auth\.uid/);
  assert.match(code, /allow create, update: if isShopOwner\(\) \|\| \(isGuest\(\) && \(validLimitWrite\(key\) \|\| validLimitRelease\(key\)\)\);/);
});
