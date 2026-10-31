import test from "node:test";
import assert from "node:assert/strict";
import { mergeDocs, scanPlan, rotationJobs, expireWeekly, sinceFrom, otherSlot, isoWeek } from "./lib.mjs";

test("ghép tài liệu: thêm mới, ghi đè bản mới hơn, giữ bản cũ hơn", () => {
  const snap = { data: {} };
  const d = (id, t, v) => ({ name: `x/bills/${id}`, updateTime: t, fields: { v: { integerValue: String(v) } } });
  assert.deepEqual(mergeDocs(snap, "bills", [d("a", "2026-10-01T00:00:00Z", 1), d("b", "2026-10-01T00:00:00Z", 2)]), { added: 2, changed: 0 });
  assert.deepEqual(mergeDocs(snap, "bills", [d("a", "2026-10-02T00:00:00Z", 9), d("b", "2026-09-01T00:00:00Z", 7)]), { added: 0, changed: 1 });
  assert.equal(snap.data.bills.a.fields.v.integerValue, "9");
  assert.equal(snap.data.bills.b.fields.v.integerValue, "2");
});
test("quét luân phiên chia theo số tài liệu, không vượt tổng tài liệu", () => {
  const p = scanPlan({ bills: 683, payments: 683, orderBatches: 1008, orderItems: 1667, refunds: 9 }, 700);
  assert.ok(p.orderItems > p.bills && p.refunds === 9);
  assert.ok(Object.values(p).reduce((a, b) => a + b, 0) <= 760);
});
test("bản chốt tuần vào chủ nhật, tháng vào ngày cuối tháng (giờ VN)", () => {
  const sun = Date.parse("2026-11-01T23:30:00+07:00"); // chủ nhật
  assert.equal(rotationJobs(sun).weekly, `weekly-${isoWeek(new Date(sun + 7 * 3600000))}.json.gz`);
  assert.equal(rotationJobs(Date.parse("2026-10-31T23:30:00+07:00")).monthly, "monthly-2026-10.json.gz");
  assert.equal(rotationJobs(Date.parse("2026-10-30T23:30:00+07:00")).monthly, null);
  assert.equal(rotationJobs(Date.parse("2026-10-31T23:30:00+07:00")).weekly, null); // thứ bảy
});
test("giữ 8 bản tuần mới nhất, không đụng bản tháng", () => {
  const names = Array.from({ length: 10 }, (_, i) => `weekly-2026-W${String(30 + i).padStart(2, "0")}.json.gz`).concat(["monthly-2026-09.json.gz"]);
  const drop = expireWeekly(names, 8);
  assert.deepEqual(drop.sort(), ["weekly-2026-W30.json.gz", "weekly-2026-W31.json.gz"]);
});
test("mốc delta có lề an toàn; lần đầu đọc từ đầu; A/B đổi chỗ", () => {
  assert.equal(sinceFrom(0, 1e12), 0);
  assert.equal(sinceFrom(1e12, 0), 1e12 - 12 * 3600000);
  assert.equal(otherSlot("A"), "B"); assert.equal(otherSlot("B"), "A");
});
