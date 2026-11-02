import test from "node:test";
import assert from "node:assert/strict";
import { THUMB_MAX_AGE_MS, decodeFields, encodeFields, planRebuild } from "../ops/build-menu-snapshot.mjs";
import { buildSnapshot } from "../public/menu-snapshot.js";

test("decode/encode Firestore REST khứ hồi", () => {
  const obj = { s: "x", n: 5, f: 1.5, b: true, z: null, a: [1, "y", { k: 2 }], m: { q: "w" } };
  assert.deepEqual(decodeFields(encodeFields(obj)), obj);
  assert.equal(decodeFields({ t: { timestampValue: "2026-11-03T00:00:00Z" } }).t, Date.UTC(2026, 10, 3));
});

const NOW = 10 * THUMB_MAX_AGE_MS;
const existing = (extra = {}) => ({ ...buildSnapshot({ items: [{ id: "a", name: "A", price: 1 }], cats: [], combos: [], hidden: [], thumbs: { menu_a: "data:image/png;base64,AA" }, thumbsVer: 5, now: NOW - 1000 }).data, ...extra });

test("planRebuild: không đổi thì không ghi, không đọc ảnh", () => {
  const e = existing();
  assert.deepEqual(planRebuild({ existing: e, hash: e.hash, shopThumbsVer: 5, now: NOW }), { write: false, thumbs: false, why: "không đổi" });
});
test("planRebuild: menu đổi thì ghi nhưng không đọc lại ảnh; ảnh đổi / quá 24 giờ thì đọc ảnh", () => {
  const e = existing();
  const a = planRebuild({ existing: e, hash: "khac", shopThumbsVer: 5, now: NOW });
  assert.equal(a.write, true); assert.equal(a.thumbs, false);
  assert.equal(planRebuild({ existing: e, hash: e.hash, shopThumbsVer: 6, now: NOW }).thumbs, true);
  assert.equal(planRebuild({ existing: e, hash: e.hash, shopThumbsVer: 5, now: NOW + THUMB_MAX_AGE_MS + 5000 }).thumbs, true);
});
test("planRebuild: chưa có bản chụp hoặc --force thì dựng đủ", () => {
  assert.deepEqual(planRebuild({ existing: null, hash: "x", shopThumbsVer: 0, now: NOW }).thumbs, true);
  assert.equal(planRebuild({ existing: existing(), hash: existing().hash, shopThumbsVer: 5, now: NOW, force: true }).write, true);
});
