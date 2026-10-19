// Kiểm thử rules THẬT bằng Firestore Emulator. Cần máy có mạng + Java:
//   cd web-order/rules-test && npm install && npm test
// Tệp rules được ghép: khối "service" tối thiểu + nội dung ../rules/online-orders.rules (đúng phần sẽ dán vào Console).
import test, { before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { buildOrderDoc, cartLines, limitKeyForPhone, limitKeyForUid, validateCheckout } from "../public/order-core.js";

const OWNER = "X9ln8CP7UtbOLOHfipYMCjfbb1p1";
const ROOT = `users/${OWNER}/stores/0210`;
const addon = readFileSync(new URL("../rules/online-orders.rules", import.meta.url), "utf8");
// Quy tắc "cũ" giả lập: chủ quán đọc/ghi mọi thứ trong cửa hàng của mình; người khác không có quyền gì.
const rules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{uid}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }\n${addon}\n  }\n}`;

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: "demo-pos0210", firestore: { rules } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${ROOT}/menu/a`), { id: "a", categoryId: "c1", name: "Bạc xỉu", price: 30000, active: true });
    await setDoc(doc(db, `${ROOT}/menu/b`), { id: "b", categoryId: "c1", name: "Americano ", price: 35000, active: true });
    await setDoc(doc(db, `${ROOT}/menu/off`), { id: "off", categoryId: "c1", name: "Tắt", price: 1000, active: false });
    await setDoc(doc(db, `${ROOT}/bills/b1`), { id: "b1", total: 1 });
  });
});

const guest = (uid = "guest1") => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const owner = () => env.authenticatedContext(OWNER, { firebase: { sign_in_provider: "password" } }).firestore();
const menu = { a: { id: "a", categoryId: "c1", name: "Bạc xỉu", price: 30000 }, b: { id: "b", categoryId: "c1", name: "Americano ", price: 35000 } };
const mk = (uid, over = {}, code = "K7P2QX", lines) => {
  const l = lines || cartLines({ a: { qty: 2, note: "ít đá" }, b: { qty: 1, note: "" } }, menu);
  const value = validateCheckout({ name: "Lan", phone: "0912345678", delivery: false, address: "", table: "", note: "", lines: l }).value;
  return { ...buildOrderDoc({ code, uid, value, lines: l }), ...over };
};
const place = (db, uid, order, { limits = true, pendingU = 1, pendingP = 1 } = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, `${ROOT}/online_orders/${order.code}`), { ...order, createdAt: serverTimestamp() });
  if (limits) {
    b.set(doc(db, `${ROOT}/online_limits/${limitKeyForUid(uid)}`), { pending: pendingU, lastAt: serverTimestamp(), lastOrder: order.code });
    b.set(doc(db, `${ROOT}/online_limits/${limitKeyForPhone(order.phone)}`), { pending: pendingP, lastAt: serverTimestamp(), lastOrder: order.code });
  }
  return b.commit();
};

test("khách ẩn danh đặt đơn hợp lệ", async () => { await assertSucceeds(place(guest(), "guest1", mk("guest1"))); });
test("sai đơn giá bị chặn", async () => { const o = mk("guest1"); o.items[0].price = 1; o.total = 2 + 35000; await assertFails(place(guest(), "guest1", o)); });
test("sai tổng tiền bị chặn", async () => { await assertFails(place(guest(), "guest1", mk("guest1", { total: 10 }))); });
test("món đã tắt bị chặn", async () => {
  const lines = [{ id: "off", name: "Tắt", qty: 1, note: "", price: 1000 }];
  await assertFails(place(guest(), "guest1", mk("guest1", {}, "K7P2QX", lines)));
});
test("status khác 'new' bị chặn", async () => { await assertFails(place(guest(), "guest1", mk("guest1", { status: "paid" }))); });
test("uid giả mạo bị chặn", async () => { await assertFails(place(guest(), "guest1", mk("guest2"))); });
test("thiếu bộ đếm đi kèm bị chặn", async () => { await assertFails(place(guest(), "guest1", mk("guest1"), { limits: false })); });
test("quá 7 dòng món bị chặn", async () => {
  const many = Array.from({ length: 8 }, () => ({ id: "a", name: "Bạc xỉu", qty: 1, note: "", price: 30000 }));
  await assertFails(place(guest(), "guest1", mk("guest1", {}, "K7P2QX", many)));
});
test("đơn thứ 3 đang chờ bị chặn (bộ đếm tối đa 2)", async () => {
  const db = guest();
  await assertSucceeds(place(db, "guest1", mk("guest1", {}, "AAAAAA")));
  await assertSucceeds(place(db, "guest1", mk("guest1", {}, "BBBBBB"), { pendingU: 2, pendingP: 2 }));
  await assertFails(place(db, "guest1", mk("guest1", {}, "CCCCCC"), { pendingU: 3, pendingP: 3 }));
  await assertFails(place(db, "guest1", mk("guest1", {}, "DDDDDD"), { pendingU: 1, pendingP: 1 })); // không được "reset" bộ đếm trong cửa sổ
});
test("khách chỉ đọc đơn của mình", async () => {
  await assertSucceeds(place(guest("guest1"), "guest1", mk("guest1")));
  await assertSucceeds(getDoc(doc(guest("guest1"), `${ROOT}/online_orders/K7P2QX`)));
  await assertFails(getDoc(doc(guest("guest2"), `${ROOT}/online_orders/K7P2QX`)));
  await assertSucceeds(getDocs(query(collection(guest("guest1"), `${ROOT}/online_orders`), where("uid", "==", "guest1"))));
  await assertFails(getDocs(collection(guest("guest1"), `${ROOT}/online_orders`)));
});
test("khách không sửa/xoá được đơn; nhân viên đổi trạng thái được", async () => {
  await assertSucceeds(place(guest(), "guest1", mk("guest1")));
  await assertFails(updateDoc(doc(guest(), `${ROOT}/online_orders/K7P2QX`), { status: "paid" }));
  await assertSucceeds(updateDoc(doc(owner(), `${ROOT}/online_orders/K7P2QX`), { status: "awaiting_payment", transferContent: "DMK7P2QX" }));
});
test("menu đọc công khai nhưng không ghi; dữ liệu bán hàng không đọc được", async () => {
  await assertSucceeds(getDoc(doc(guest(), `${ROOT}/menu/a`)));
  await assertFails(setDoc(doc(guest(), `${ROOT}/menu/a`), { price: 1 }));
  await assertFails(getDoc(doc(guest(), `${ROOT}/bills/b1`)));
  await assertFails(getDocs(collection(guest(), `${ROOT}/payments`)));
});
test("khách không ghi được cấu hình quán; nhân viên ghi được", async () => {
  await assertFails(setDoc(doc(guest(), `${ROOT}/online_config/shop`), { bank: "x" }));
  await assertSucceeds(setDoc(doc(owner(), `${ROOT}/online_config/shop`), { name: "0210", bank: "Techcombank" }));
  await assertSucceeds(getDoc(doc(guest(), `${ROOT}/online_config/shop`)));
});
