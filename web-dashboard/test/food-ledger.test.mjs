import test from "node:test";
import assert from "node:assert/strict";
import { ledgerDocs, ledgerId, parseVnDateTime, payoutGroups, periodDays, receivable, summarizeSales, vnDay } from "../food-ledger.js";
import { parseGrabRows } from "../grab-report.js";

test("đọc ngày giờ file Grab theo giờ Việt Nam", () => {
  const ms = parseVnDateTime("25 Oct 2026 11:20 AM");
  assert.equal(vnDay(ms), "2026-10-25");
  assert.equal(new Date(ms).toISOString(), "2026-10-25T04:20:00.000Z");
  assert.equal(vnDay(parseVnDateTime("26 Oct 2026 12:05 AM")), "2026-10-26");
  assert.equal(new Date(parseVnDateTime("26 Oct 2026 12:30 PM")).toISOString(), "2026-10-26T05:30:00.000Z");
  assert.equal(parseVnDateTime("abc"), 0);
});

const header = ["Mã đơn hàng ngắn", "Ngày tạo", "Số tiền", "Trạng thái", "Danh mục", "Ngày chuyển khoản", "Mã giao dịch", "Chiết khấu từ các kênh bán hàng", "VAT Amount", "PIT Amount", "Tổng cộng", "Lý do hủy"];
const row = (code, sale, paid, ref, amount, fee, vat, pit, total, status = "Transferred", cancel = null) => [code, sale, amount, status, "Payment ", paid, ref, -fee, -vat, -pit, total, cancel];

test("đơn Grab -> dòng sổ: ngày bán, ngày tiền về, mã đợt", () => {
  const parsed = parseGrabRows([header, row("GF-824", "25 Oct 2026 11:20 AM", "26 Oct 2026 7:33 AM", "SVNW3UG7TA9I", 50000, 9817, 1500, 750, 37933)]);
  const [d] = ledgerDocs("GRAB", parsed, { source: "f.xlsx", now: 1 });
  assert.equal(d.id, "GRAB_GF-824");
  assert.equal(d.saleDay, "2026-10-25"); assert.equal(d.payoutDay, "2026-10-26"); assert.equal(d.payoutRef, "SVNW3UG7TA9I");
  assert.equal(d.received, 37933); assert.equal(d.status, "OK");
});

test("doanh thu theo ngày bán, tiền về theo ngày giải ngân; đơn huỷ không vào doanh thu", () => {
  const parsed = parseGrabRows([header,
    row("A1", "25 Oct 2026 11:20 AM", "26 Oct 2026 7:33 AM", "P1", 50000, 9000, 1500, 750, 38750),
    row("A2", "25 Oct 2026 8:00 PM", "27 Oct 2026 7:00 AM", "P2", 100000, 20000, 3000, 1500, 75500),
    row("A3", "26 Oct 2026 9:00 AM", "27 Oct 2026 7:00 AM", "P2", 40000, 8000, 1000, 500, 30500),
    row("A4", "26 Oct 2026 9:30 AM", "27 Oct 2026 7:00 AM", "P2", 60000, 0, 0, 0, 0, "Transferred", "Khách huỷ")]);
  const rows = ledgerDocs("GRAB", parsed);
  const s = summarizeSales(rows, "2026-10-25", "2026-10-27");
  assert.equal(s.orders, 3); assert.equal(s.gross, 190000); assert.equal(s.commission, 37000); assert.equal(s.review, 1); assert.equal(s.reviewAmount, 60000);
  assert.equal(s.days[0].day, "2026-10-26"); assert.equal(s.byDay["2026-10-25"].gross, 150000);
  const p = payoutGroups(rows, "2026-10-26", "2026-10-28");
  assert.deepEqual(p.map((g) => [g.day, g.ref, g.orders, g.received]), [["2026-10-27", "P2", 2, 106000], ["2026-10-26", "P1", 1, 38750]]);
  assert.equal(p[0].firstSale, "2026-10-25");
});

test("phải thu và khoá chống trùng", () => {
  assert.equal(receivable([{ status: "OK", payoutDay: "", orderValue: 50000 }, { status: "OK", payoutDay: "2026-10-26", orderValue: 1 }, { status: "REVIEW", payoutDay: "", orderValue: 9 }]), 50000);
  assert.equal(ledgerId("GRAB", " gf-824 "), "GRAB_GF-824");
});

test("kỳ báo cáo theo ngày Việt Nam", () => {
  assert.deepEqual(periodDays("today", "2026-10-28"), { from: "2026-10-28", to: "2026-10-29" });
  assert.deepEqual(periodDays("7", "2026-10-28"), { from: "2026-10-22", to: "2026-10-29" });
  assert.deepEqual(periodDays("month", "2026-10-28"), { from: "2026-10-01", to: "2026-10-29" });
  assert.deepEqual(periodDays("1", "2026-12-31"), { from: "2026-12-31", to: "2027-01-01" });
});
