import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateReceiptTotal,
  createStableDraft,
  filterReceipts,
  rangeForVietnamPeriod,
  validateReceipt,
} from "../expense-domain.js";

test("calculates a receipt containing multiple material lines", () => {
  assert.equal(calculateReceiptTotal([{ qty: 2, unitPrice: 30000 }, { qty: 0.5, unitPrice: 120000 }]), 120000);
});

test("keeps one receipt id when an offline draft is retried", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = createStableDraft(storage, { uid: "staff-1", displayName: "Lan" }, () => "receipt-1");
  const retry = createStableDraft(storage, { uid: "staff-1", displayName: "Lan" }, () => "receipt-2");
  assert.equal(first.id, "receipt-1");
  assert.equal(retry.id, "receipt-1");
});

test("rejects a receipt with invalid material line before cloud write", () => {
  assert.deepEqual(validateReceipt({ id: "r1", purchaseDate: 1, items: [{ materialName: "Gà", qty: 0, unit: "kg", unitPrice: 100 }] }), { ok: false, error: "Dòng 1: số lượng phải lớn hơn 0" });
});

test("builds Vietnam-local three-day window including today", () => {
  const now = new Date("2026-10-11T22:00:00+07:00");
  const range = rangeForVietnamPeriod("3d", now);
  assert.equal(range.from, Date.parse("2026-10-08T17:00:00Z"));
  assert.equal(range.to, Date.parse("2026-10-11T17:00:00Z"));
});

test("combines cached receipt filters", () => {
  const rows = [
    { id: "a", enteredByName: "Lan", expenseGroup: "FOOD", items: [{ materialCode: "GA", materialName: "Gà", subcategoryId: "chicken" }] },
    { id: "b", enteredByName: "Huy", expenseGroup: "DRINK", items: [{ materialCode: "CF", materialName: "Cà phê", subcategoryId: "coffee" }] },
  ];
  assert.deepEqual(filterReceipts(rows, { staff: "Lan", group: "FOOD", material: "gà" }).map((x) => x.id), ["a"]);
});

import { freshenDraft } from "../expense-domain.js";
test("nháp trống lấy lại giờ hiện tại, nháp có nội dung giữ ngày và báo cũ", () => {
  const now = Date.parse("2026-10-18T13:57:00Z"), old = Date.parse("2026-10-11T16:50:00Z");
  const empty = { purchaseDate: old, note: "", items: [{ materialName: "", unitPrice: 0 }] };
  const r = freshenDraft(empty, now);
  assert.equal(r.draft.purchaseDate, now); assert.equal(r.reset, true); assert.equal(r.stale, false);
  const filled = { purchaseDate: old, note: "", items: [{ materialName: "Rau thơm", unitPrice: 5000 }] };
  const f = freshenDraft(filled, now);
  assert.equal(f.draft.purchaseDate, old); assert.equal(f.stale, true);
  assert.equal(freshenDraft({ ...filled, purchaseDate: now - 3600_000 }, now).stale, false);
});

test("huỷ phiếu ghi người huỷ và lý do khi có", async () => {
  const { buildCancelledReceipt } = await import("../expense-domain.js");
  const r = buildCancelledReceipt({ id: "a", status: "ACTIVE", updatedAt: 1 }, { now: 1000, uid: "u", by: "Tuấn", reason: "trùng phiếu" });
  assert.equal(r.status, "DELETED"); assert.equal(r.cancelledByName, "Tuấn"); assert.equal(r.cancelReason, "trùng phiếu");
  const r2 = buildCancelledReceipt({ id: "a", status: "ACTIVE", updatedAt: 1 }, { now: 1000, uid: "u" });
  assert.equal("cancelledByName" in r2, false);
});

test("yêu cầu huỷ phiếu: người mua gửi, chủ quán xác nhận hoặc từ chối", async () => {
  const { buildCancelRequest, resolveCancelRequest, pendingCancelRequest } = await import("../expense-domain.js");
  const base = { id: "a", status: "ACTIVE", updatedAt: 1, total: 310000 };
  assert.throws(() => buildCancelRequest(base, { now: 10, uid: "u", reason: "  " }));
  const req = buildCancelRequest(base, { now: 10, uid: "u", by: "Trang", byId: "t", reason: "trùng phiếu" });
  assert.equal(req.status, "ACTIVE");
  assert.equal(pendingCancelRequest(req).reason, "trùng phiếu");
  const done = resolveCancelRequest(req, { now: 20, uid: "o", by: "Tuấn", approve: true });
  assert.equal(done.status, "DELETED"); assert.equal(done.cancelledByName, "Trang"); assert.equal(done.cancelReason, "trùng phiếu"); assert.equal(done.cancelRequest.status, "APPROVED");
  assert.equal(pendingCancelRequest(done), null);
  const no = resolveCancelRequest(req, { now: 20, uid: "o", by: "Tuấn", note: "vẫn mua 2 lần" });
  assert.equal(no.status, "ACTIVE"); assert.equal(no.cancelRequest.status, "REJECTED"); assert.equal(pendingCancelRequest(no), null);
  const wd = resolveCancelRequest(req, { now: 20, uid: "t", by: "Trang", withdraw: true });
  assert.equal(wd.cancelRequest.status, "WITHDRAWN");
  assert.throws(() => resolveCancelRequest(no, { now: 30, uid: "o", approve: true }));
});
