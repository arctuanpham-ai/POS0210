import test from "node:test";
import assert from "node:assert/strict";
import { CACHE_VERSION, MAX_CACHED, mergeReceipts, planLoad } from "../receipt-cache.js";

test("không có cache, khác tài khoản, sai phiên bản hoặc không phủ mốc thì đọc đủ", () => {
  assert.equal(planLoad(null, { uid: "u", from: 10 }).mode, "full");
  const ok = { version: CACHE_VERSION, uid: "u", from: 10, cursor: 5, receipts: [] };
  assert.equal(planLoad({ ...ok, uid: "x" }, { uid: "u", from: 10 }).mode, "full");
  assert.equal(planLoad({ ...ok, version: 0 }, { uid: "u", from: 10 }).mode, "full");
  assert.equal(planLoad({ ...ok, from: 20 }, { uid: "u", from: 10 }).mode, "full");
  assert.equal(planLoad({ ...ok, cursor: 0 }, { uid: "u", from: 10 }).mode, "full");
  assert.deepEqual(planLoad(ok, { uid: "u", from: 10 }), { mode: "incremental", cursor: 5 });
  assert.equal(planLoad(ok, { uid: "u", from: 30 }).mode, "incremental"); // cache phủ rộng hơn mốc cần
});

test("gộp theo id, phiếu mới hơn thắng, cursor tăng, phiếu sửa/huỷ thay bản cũ", () => {
  const cache = { version: CACHE_VERSION, uid: "u", from: 0, cursor: 100, receipts: [{ id: "a", purchaseDate: 5, updatedAt: 100, total: 1 }, { id: "b", purchaseDate: 6, updatedAt: 90, total: 2 }] };
  const next = mergeReceipts(cache, [{ id: "a", purchaseDate: 5, updatedAt: 200, total: 9, status: "DELETED" }, { id: "c", purchaseDate: 7, updatedAt: 150, total: 3 }], { uid: "u", from: 0 });
  assert.equal(next.cursor, 200);
  assert.deepEqual(next.receipts.map((r) => r.id), ["c", "b", "a"]);
  assert.equal(next.receipts.find((r) => r.id === "a").status, "DELETED");
  const stale = mergeReceipts(next, [{ id: "a", purchaseDate: 5, updatedAt: 50, total: 1 }], { uid: "u", from: 0 });
  assert.equal(stale.receipts.find((r) => r.id === "a").status, "DELETED");
  assert.equal(stale.cursor, 200);
});

test("bỏ phiếu cũ hơn mốc; cắt quá giới hạn thì nâng from để lần sau đọc lại đủ", () => {
  const many = Array.from({ length: MAX_CACHED + 5 }, (_, i) => ({ id: `r${i}`, purchaseDate: 1000 + i, updatedAt: i + 1 }));
  const cut = mergeReceipts(null, many, { uid: "u", from: 1000 });
  assert.equal(cut.receipts.length, MAX_CACHED);
  assert.equal(cut.from, 1000 + 5);
  assert.equal(planLoad(cut, { uid: "u", from: 1000 }).mode, "full");
  const old = mergeReceipts(null, [{ id: "o", purchaseDate: 1, updatedAt: 1 }], { uid: "u", from: 10 });
  assert.equal(old.receipts.length, 0);
});
