import test from "node:test";
import assert from "node:assert/strict";
import { buildBillDetail, buildBillRows, chunk, dayRange, keyOfTime, methodLabel, summarizeBillRows, timeLabel } from "../bill-history-view.js";

const range = dayRange("2026-10-14");
const at = (h, m) => new Date(2026, 9, 14, h, m).getTime();
const tables = [{ id: "t1", name: "BÀN 01" }, { id: "t2", name: "BÀN 02" }];
const sessions = [{ id: "s1", tableId: "t1", flow: "prepaid" }, { id: "s2", tableId: "t2", flow: "postpaid" }, { id: "s3", tableId: "t1" }];
const bills = [
  { id: "b1", sessionId: "s1", billNo: "0001", openedAt: at(8, 0), closedAt: at(8, 5), subtotal: 50000, total: 45000, status: "PAID" },
  { id: "b2", sessionId: "s2", billNo: "0002", openedAt: at(9, 0), closedAt: at(9, 30), subtotal: 30000, total: 30000, status: "PAID" },
  { id: "b3", sessionId: "s3", billNo: "0003", openedAt: at(10, 0), closedAt: at(10, 2), subtotal: 20000, total: 20000, status: "PAID" },
  { id: "b4", sessionId: "s1", billNo: "0004", openedAt: at(11, 0), closedAt: null, subtotal: 1, total: 1, status: "OPEN" },
  { id: "b5", sessionId: "s1", billNo: "0005", openedAt: new Date(2026, 9, 13, 22, 0).getTime(), closedAt: new Date(2026, 9, 13, 23, 0).getTime(), subtotal: 9, total: 9, status: "PAID" },
];
const payments = [
  { id: "p1", billId: "b1", method: "CASH", amount: 45000, paidAt: at(8, 5), cashReceived: 50000, change: 5000, dataScope: "LIVE", cashierId: "u1" },
  { id: "p2", billId: "b2", method: "TRANSFER", amount: 30000, paidAt: at(9, 30), reference: "FT123", dataScope: "LIVE" },
  { id: "p3", billId: "b3", method: "CASH", amount: 20000, paidAt: at(10, 2), dataScope: "TEST" },
];

test("dayRange và keyOfTime khớp nhau, sai định dạng trả null", () => {
  assert.equal(keyOfTime(range.from), "2026-10-14");
  assert.equal(range.to - range.from, 86400000);
  assert.equal(dayRange("abc"), null);
});

test("chỉ lấy bill PAID trong ngày, bỏ bill thử, mới nhất trước", () => {
  const rows = buildBillRows({ bills, payments, sessions, tables, refunds: [], range });
  assert.deepEqual(rows.map((r) => r.id), ["b2", "b1"]);
  assert.equal(rows[1].tableName, "BÀN 01");
  assert.equal(rows[1].method, "CASH");
  assert.equal(rows[1].cashReceived, 50000);
  assert.equal(rows[1].change, 5000);
  assert.equal(rows[1].flow, "prepaid");
  assert.equal(rows[0].reference, "FT123");
});

test("thiếu payment vẫn hiện và đánh dấu; thiếu bàn hiện Bàn ?", () => {
  const rows = buildBillRows({ bills: [bills[0]], payments: [], sessions: [], tables: [], refunds: [], range });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paymentMissing, true);
  assert.equal(rows[0].tableName, "Bàn ?");
  assert.equal(rows[0].method, null);
});

test("tổng kết: tiền mặt, chuyển khoản, hoàn tiền, thực thu", () => {
  const refunds = [{ id: "r1", billId: "b2", amount: 30000, method: "TRANSFER", status: "FROZEN", reason: "khách đổi ý", createdAt: at(9, 40) }];
  const rows = buildBillRows({ bills, payments, sessions, tables, refunds, range });
  const s = summarizeBillRows(rows);
  assert.equal(s.count, 2);
  assert.equal(s.total, 75000);
  assert.equal(s.cash, 45000);
  assert.equal(s.transfer, 30000);
  assert.equal(s.refunded, 30000);
  assert.equal(s.net, 45000);
  assert.equal(s.refundedCount, 1);
  assert.equal(rows[0].refund.status, "FROZEN");
  assert.equal(s.averageBill, 37500);
  assert.equal(summarizeBillRows([]).averageBill, 0);
});

test("chi tiết bill: gom theo lần gọi, bỏ batch hủy, tính chênh lệch giảm giá", () => {
  const rows = buildBillRows({ bills, payments, sessions, tables, refunds: [], range });
  const row = rows.find((r) => r.id === "b1");
  const batches = [
    { id: "x2", sessionId: "s1", sequence: 2, createdAt: at(8, 3), status: "SENT", serviceNo: 7 },
    { id: "x1", sessionId: "s1", sequence: 1, createdAt: at(8, 1), status: "SENT", serviceNo: 6 },
    { id: "x3", sessionId: "s1", sequence: 3, createdAt: at(8, 4), status: "CANCELLED" },
    { id: "y1", sessionId: "s2", sequence: 1, createdAt: at(9, 1), status: "SENT" },
  ];
  const items = [
    { id: "i1", batchId: "x1", itemName: "Cà phê sữa", unitPrice: 25000, qty: 1, note: "ít đá" },
    { id: "i2", batchId: "x2", itemName: "Bạc xỉu", unitPrice: 25000, qty: 1 },
    { id: "i3", batchId: "x3", itemName: "Món hủy", unitPrice: 99000, qty: 1 },
    { id: "i4", batchId: "y1", itemName: "Món bàn khác", unitPrice: 1, qty: 1 },
  ];
  const d = buildBillDetail({ row, batches, items });
  assert.deepEqual(d.groups.map((g) => g.id), ["x1", "x2"]);
  assert.equal(d.groups[0].lines[0].note, "ít đá");
  assert.equal(d.itemsTotal, 50000);
  assert.equal(d.difference, -5000);
  assert.equal(d.hasItems, true);
});

test("bill không có món vẫn trả kết quả an toàn", () => {
  const rows = buildBillRows({ bills: [bills[1]], payments, sessions, tables, refunds: [], range });
  const d = buildBillDetail({ row: rows[0], batches: [], items: [] });
  assert.equal(d.hasItems, false);
  assert.equal(d.itemsTotal, 0);
  assert.equal(d.difference, 30000);
});

test("nhãn và chia nhóm", () => {
  assert.equal(methodLabel("CASH"), "Tiền mặt");
  assert.equal(methodLabel("TRANSFER"), "Chuyển khoản");
  assert.equal(methodLabel(null), "Chưa rõ");
  assert.equal(timeLabel(at(8, 5)), "08:05");
  assert.equal(timeLabel(0), "—");
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("bill trả chậm qua hôm sau vẫn thuộc ngày mở bill", () => {
  const late = { id: "late", sessionId: "s2", billNo: "0009", openedAt: at(21, 0), closedAt: new Date(2026, 9, 15, 9, 0).getTime(), subtotal: 90000, total: 90000, status: "PAID" };
  const pay = { id: "pl", billId: "late", method: "CASH", amount: 90000, paidAt: late.closedAt, dataScope: "LIVE" };
  assert.deepEqual(buildBillRows({ bills: [late], payments: [pay], sessions, tables, refunds: [], range }).map((r) => r.id), ["late"]);
  assert.equal(buildBillRows({ bills: [late], payments: [pay], sessions, tables, refunds: [], range: dayRange("2026-10-15") }).length, 0);
});

import { filterBillRows } from "../bill-history-view.js";
test("bill đã hoàn vẫn hiện (đánh dấu hoàn), lọc theo hình thức / thanh toán / hoàn", () => {
  const range = dayRange("2026-10-14");
  const at = (h, m) => new Date(2026, 9, 14, h, m).getTime();
  const rows = buildBillRows({
    bills: [
      { id: "a", sessionId: "s1", billNo: "1", openedAt: at(8, 0), closedAt: at(8, 5), total: 100, status: "PAID" },
      { id: "b", sessionId: "s2", billNo: "2", openedAt: at(9, 0), closedAt: at(9, 5), total: 50, status: "REFUNDED" },
      { id: "c", sessionId: "s3", billNo: "3", openedAt: at(10, 0), closedAt: at(10, 5), total: 70, status: "PAID" },
    ],
    payments: [{ billId: "a", method: "CASH", amount: 100 }, { billId: "b", method: "TRANSFER", amount: 50 }, { billId: "c", method: "TRANSFER", amount: 70 }],
    sessions: [{ id: "s1", flow: "prepaid" }, { id: "s2", flow: "prepaid" }, { id: "s3", flow: "postpaid" }],
    tables: [], refunds: [], range,
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.id === "b").refund.amount, 50);
  assert.equal(summarizeBillRows(rows).net, 170);
  assert.deepEqual(filterBillRows(rows, { flow: "postpaid" }).map((r) => r.id), ["c"]);
  assert.deepEqual(filterBillRows(rows, { method: "CASH" }).map((r) => r.id), ["a"]);
  assert.deepEqual(filterBillRows(rows, { flow: "prepaid", method: "TRANSFER" }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterBillRows(rows, { refund: "REFUNDED" }).map((r) => r.id), ["b"]);
  assert.equal(filterBillRows(rows, {}).length, 3);
});

test("đơn app food: tính vào số bill và doanh thu, tách riêng khỏi tiền mặt/CK", () => {
  const rows = [
    { total: 100000, method: "CASH", refund: null, paymentMissing: false },
    { total: 50000, method: "GRAB", refund: null, paymentMissing: false },
    { total: 30000, method: "SHOPEE", refund: null, paymentMissing: false },
  ];
  const s = summarizeBillRows(rows);
  assert.equal(s.count, 3);
  assert.equal(s.total, 180000);
  assert.equal(s.cash, 100000);
  assert.equal(s.grab, 50000);
  assert.equal(s.shopee, 30000);
  assert.equal(s.unknown, 0);
  assert.equal(methodLabel("GRAB"), "GrabFood (app trả sau)");
});
