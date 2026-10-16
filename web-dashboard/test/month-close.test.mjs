import test from "node:test";
import assert from "node:assert/strict";
import { bookingDate, closedMonthEditProblem, shiftNote, withShiftNote } from "../month-close.js";

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).getTime();
const now = at(2026, 10, 16, 9);

test("tháng chưa chốt: giữ nguyên ngày", () => {
  assert.deepEqual(bookingDate(at(2026, 9, 20), ["2026-08"], now), { ts: at(2026, 9, 20), shifted: false });
});
test("tháng đã chốt: dời sang ngày 1 tháng chưa chốt gần nhất, bỏ qua các tháng chốt liền nhau", () => {
  const s = bookingDate(at(2026, 8, 20), ["2026-08", "2026-09"], now);
  assert.equal(s.shifted, true); assert.equal(s.ts, at(2026, 10, 1, 0)); assert.equal(s.fromKey, "2026-08"); assert.equal(s.toKey, "2026-10");
  assert.equal(shiftNote(s), "Nhập bù ngày 20/08/2026: tháng 8/2026 đã chốt chia cổ đông nên tính vào tháng 10/2026.");
  assert.equal(withShiftNote("Chợ Sắt", s), `Chợ Sắt · ${shiftNote(s)}`);
  assert.equal(withShiftNote("", { shifted: false }), "");
});
test("qua năm và không vượt quá hiện tại", () => {
  const s = bookingDate(at(2026, 12, 5), ["2026-12"], at(2027, 1, 3));
  assert.equal(s.ts, at(2027, 1, 1, 0));
  const t = bookingDate(at(2026, 10, 2), ["2026-10"], now);
  assert.equal(t.ts, now, "tháng hiện tại lỡ bị chốt thì ghi vào lúc này, không ghi sang tương lai");
});
test("phiếu thuộc tháng đã chốt: chặn sửa tiền / đổi ngày / huỷ, cho sửa ghi chú, người mua", () => {
  const r = { purchaseDate: at(2026, 9, 3), total: 100, status: "ACTIVE" };
  assert.equal(closedMonthEditProblem(r, { ...r, note: "x" }, ["2026-09"]), "");
  assert.match(closedMonthEditProblem(r, { ...r, total: 120 }, ["2026-09"]), /đã chốt/);
  assert.match(closedMonthEditProblem(r, { ...r, purchaseDate: at(2026, 10, 1) }, ["2026-09"]), /đã chốt/);
  assert.match(closedMonthEditProblem(r, { ...r, status: "CANCELLED" }, ["2026-09"]), /đã chốt/);
  assert.equal(closedMonthEditProblem(r, { ...r, total: 120 }, ["2026-08"]), "");
});
