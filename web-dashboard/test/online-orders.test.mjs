import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OO_LABELS, OO_STATUS, isPending, attentionCount, buildTransition, groupOrders, isOverdue, newOrderCodes, nextActions, overdueOrders, releasedCount, validateShopConfig, limitKeys, minutesAgoText } from "../online-orders.js";
import { STATUS as CUSTOMER_STATUS } from "../../web-order/public/order-core.js";

const now = 1_700_000_000_000;
const order = (over = {}) => ({ id: "K7P2QX", code: "K7P2QX", uid: "g1", phone: "0912345678", status: "new", mode: "pickup", createdAt: now - 60_000, ...over });

test("trạng thái khớp với trang khách", () => {
  assert.deepEqual(Object.values(OO_STATUS).sort(), Object.values(CUSTOMER_STATUS).sort());
});

test("nhận đơn: chờ thanh toán 10 phút, nội dung CK DM<mã>, không trừ bộ đếm", () => {
  const t = buildTransition(order(), "accept", { now, who: "Hương" });
  assert.equal(t.patch.status, "awaiting_payment");
  assert.equal(t.patch.transferContent, "DMK7P2QX");
  assert.equal(t.patch.expiresAt, now + 600_000);
  assert.equal(t.patch.handledBy, "Hương");
  assert.equal(t.releasesLimit, false);
});

test("từ chối cần lý do và trả bộ đếm", () => {
  assert.throws(() => buildTransition(order(), "reject", { now, reason: "  " }), /lý do/);
  const t = buildTransition(order(), "reject", { now, reason: "Hết món" });
  assert.equal(t.patch.status, "rejected"); assert.equal(t.patch.rejectReason, "Hết món"); assert.ok(t.releasesLimit);
});

test("chuyển trạng thái chỉ đi theo luồng hợp lệ", () => {
  assert.throws(() => buildTransition(order({ status: "paid" }), "accept"), /đã đổi/);
  assert.throws(() => buildTransition(order({ status: "new" }), "paid"), /đã đổi/);
  assert.throws(() => buildTransition(order({ status: "done" }), "done"), /đã đổi/);
  assert.throws(() => buildTransition(order(), "bay"), /không hợp lệ/);
  assert.equal(buildTransition(order({ status: "awaiting_payment" }), "paid", { now }).releasesLimit, true);
  assert.equal(buildTransition(order({ status: "awaiting_payment" }), "expire", { now }).patch.status, "expired");
  assert.equal(buildTransition(order({ status: "paid" }), "deliver", { now }).patch.status, "delivering");
  assert.equal(buildTransition(order({ status: "delivering" }), "done", { now }).patch.status, "done");
  assert.equal(buildTransition(order({ status: "paid" }), "done", { now }).releasesLimit, false);
  // khách trả muộn sau khi đơn đã hết hạn: ghi nhận được, và không trừ bộ đếm lần nữa
  const late = buildTransition(order({ status: "expired" }), "paid", { now });
  assert.equal(late.patch.status, "paid"); assert.equal(late.releasesLimit, false);
  assert.deepEqual(nextActions(order({ status: "expired" })).map((a) => a.key), ["paid"]);
});

test("nút theo trạng thái; giao hàng mới có 'Đang giao'", () => {
  assert.deepEqual(nextActions(order()).map((a) => a.key), ["accept", "reject"]);
  assert.deepEqual(nextActions(order({ status: "paid", mode: "pickup" })).map((a) => a.key), ["done"]);
  assert.deepEqual(nextActions(order({ status: "paid", mode: "delivery" })).map((a) => a.key), ["deliver", "done"]);
  assert.deepEqual(nextActions(order({ status: "delivering" })).map((a) => a.key), ["done"]);
  assert.deepEqual(nextActions(order({ status: "done" })), []);
  assert.deepEqual(nextActions(order({ status: "awaiting_payment", expiresAt: now + 1000 }), now).map((a) => a.key), ["paid", "expire"]);
});

test("quá hạn thanh toán", () => {
  const o = order({ status: "awaiting_payment", expiresAt: now - 1 });
  assert.ok(isOverdue(o, now)); assert.ok(!isOverdue({ ...o, expiresAt: now + 5 }, now)); assert.ok(!isOverdue(order(), now));
  assert.equal(overdueOrders([o, order()], now).length, 0, "chưa quá hạn + 3 phút");
  assert.equal(overdueOrders([o, order()], now + 3 * 60_000).length, 1);
  assert.equal(attentionCount([o, order(), order({ status: "paid" })], now), 2);
});

test("bộ đếm giảm 1, không âm; khoá u_/p_", () => {
  assert.equal(releasedCount({ pending: 2 }), 1); assert.equal(releasedCount({ pending: 0 }), 0); assert.equal(releasedCount(null), 0);
  assert.deepEqual(limitKeys(order()), ["u_g1", "p_0912345678"]);
});

test("gom đơn: cần xử lý (cũ nhất trước), chờ thanh toán, đang làm, đã xong hôm nay", () => {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const g = groupOrders([
    order({ id: "A", status: "new", createdAt: now - 1000 }), order({ id: "B", status: "new", createdAt: now - 5000 }),
    order({ id: "C", status: "awaiting_payment" }), order({ id: "D", status: "paid" }), order({ id: "E", status: "delivering" }),
    order({ id: "F", status: "done", createdAt: start.getTime() + 1000 }), order({ id: "G", status: "done", createdAt: start.getTime() - 86_400_000 }),
  ], now);
  assert.deepEqual(g.needAction.map((o) => o.id), ["B", "A"]);
  assert.deepEqual(g.awaiting.map((o) => o.id), ["C"]);
  assert.deepEqual(g.making.map((o) => o.id), ["D", "E"]);
  assert.deepEqual(g.recent.map((o) => o.id), ["F"]);
});

test("phát chuông một lần cho mỗi đơn mới", () => {
  const seen = new Set(["A"]);
  assert.deepEqual(newOrderCodes([order({ id: "A" }), order({ id: "B" }), order({ id: "C", status: "paid" })], seen), ["B"]);
});

test("thời gian tương đối", () => {
  assert.equal(minutesAgoText(now - 10_000, now), "vừa xong");
  assert.equal(minutesAgoText(now - 5 * 60_000, now), "5 phút trước");
  assert.equal(minutesAgoText(now - 125 * 60_000, now), "2 giờ 5 phút trước");
});

test("form thông tin quán", () => {
  let r = validateShopConfig({ name: " 0210  Cafe ", phone: "0912 345 678", bank: "Techcombank", account: "1903 1234 5678", holder: "NGUYEN VAN A", siteUrl: "https://datmon.0210.vn", orderingEnabled: true });
  assert.ok(r.ok); assert.equal(r.value.name, "0210 Cafe"); assert.equal(r.value.account, "190312345678");
  r = validateShopConfig({ name: "", phone: "abc", bank: "MB", account: "", holder: "", siteUrl: "http://x" });
  assert.deepEqual(Object.keys(r.errors).sort(), ["bank", "name", "phone", "siteUrl"]);
  assert.ok(validateShopConfig({ name: "A" }).ok, "để trống ngân hàng vẫn lưu được");
  r = validateShopConfig({ name: "A", legalName: " Hộ kinh doanh  0210 ", regNo: "8001234567", owner: "Nguyễn Văn A", email: "quan@0210.vn" });
  assert.ok(r.ok); assert.equal(r.value.legalName, "Hộ kinh doanh 0210"); assert.equal(r.value.email, "quan@0210.vn");
  assert.deepEqual(Object.keys(validateShopConfig({ name: "A", email: "abc" }).errors), ["email"]);
});

test("rules cho phép nhân viên (uid chủ quán) sửa đơn và bộ đếm", () => {
  const rules = readFileSync(new URL("../../web-order/rules/online-orders.rules", import.meta.url), "utf8");
  assert.match(rules, /allow update: if isShopOwner\(\) \|\| guestCancel\(\);/);
  assert.match(rules, /allow delete: if isShopOwner\(\);/);
  assert.match(rules, /allow create, update: if isShopOwner\(\) \|\| \(isGuest\(\) && \(validLimitWrite\(key\) \|\| validLimitRelease\(key\)\)\);/);
});

test("đơn khách đã huỷ: nhân viên chỉ ghi nhận được nếu khách đã chuyển tiền; không trừ bộ đếm lần nữa", () => {
  const order = { code: "K7P2QX", status: "cancelled", uid: "g", phone: "0912345678", mode: "pickup" };
  assert.deepEqual(nextActions(order).map((a) => a.key), ["paid"]);
  const t = buildTransition(order, "paid", { now: 1 });
  assert.equal(t.patch.status, "paid");
  assert.equal(t.releasesLimit, false);
  assert.throws(() => buildTransition(order, "accept"));
  assert.equal(isPending(order), false);
  assert.equal(OO_LABELS.cancelled, "Khách đã huỷ");
  const now = Date.now();
  assert.equal(groupOrders([{ ...order, id: "a", createdAt: now - 1000 }], now).recent.length, 1);
});
