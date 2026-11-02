import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapshot, chunkThumbs, menuContent, menuHash, mergeThumbChunks, plain, usableSnapshot, THUMB_CHUNK_BYTES } from "../public/menu-snapshot.js";

const items = [{ id: "b", name: "Trà", price: 20000, categoryId: "c1", active: true, updatedAt: { toMillis: () => 5 } }, { id: "a", name: "Cà phê", price: 25000, categoryId: "c1", active: true, extra: undefined }];
const cats = [{ id: "c1", name: "Đồ uống", sortOrder: 1, active: true }];
const combos = [{ id: "x", name: "Combo", price: 40000, items: [{ menuItemId: "a", name: "Cà phê", qty: 1 }] }];
const img = (n) => `data:image/jpeg;base64,${"A".repeat(n)}`;

test("bản dashboard giống hệt bản trang đặt món", () => {
  assert.equal(readFileSync(new URL("../public/menu-snapshot.js", import.meta.url), "utf8"), readFileSync(new URL("../../web-dashboard/menu-snapshot.js", import.meta.url), "utf8"));
});

test("plain: Timestamp thành mili giây, bỏ undefined", () => {
  assert.deepEqual(plain({ a: 1, t: { toMillis: () => 7 }, u: undefined, n: [1, undefined] }), { a: 1, t: 7, n: [1] });
});

test("băm ổn định: đổi thứ tự không đổi hash, đổi giá thì đổi hash", () => {
  const h1 = menuHash(menuContent({ items, cats, combos, hidden: ["z", "y"] }));
  const h2 = menuHash(menuContent({ items: [...items].reverse(), cats, combos, hidden: ["y", "z"] }));
  assert.equal(h1, h2);
  const h3 = menuHash(menuContent({ items: [{ ...items[0], price: 21000 }, items[1]], cats, combos, hidden: ["z", "y"] }));
  assert.notEqual(h1, h3);
});

test("buildSnapshot: có ảnh thì chia nhóm, không ảnh thì giữ thông số cũ", () => {
  const a = buildSnapshot({ items, cats, combos, hidden: [], thumbs: { menu_a: img(100), menu_b: img(100) }, thumbsVer: 99, now: 1 });
  assert.equal(a.data.thumbsParts, 1); assert.equal(a.data.thumbsVer, 99); assert.deepEqual(Object.keys(a.thumbDocs), ["thumbs_0"]);
  assert.ok(usableSnapshot(a.data));
  const b = buildSnapshot({ items, cats, combos, hidden: [], keep: { thumbsParts: 2, thumbsVer: 77 }, now: 2 });
  assert.equal(b.thumbDocs, null); assert.equal(b.data.thumbsParts, 2); assert.equal(b.data.thumbsVer, 77);
  assert.equal(a.hash, b.hash, "cùng nội dung menu thì cùng hash dù ảnh khác");
});

test("chunkThumbs: mỗi nhóm không vượt trần; ảnh lạ / quá lớn bị bỏ; gộp lại đủ ảnh", () => {
  const map = Object.fromEntries(Array.from({ length: 52 }, (_, i) => [`menu_${i}`, img(13_000)]));
  const chunks = chunkThumbs(map);
  assert.ok(chunks.length >= 2 && chunks.length <= 3, `số nhóm ${chunks.length}`);
  for (const c of chunks) assert.ok(Object.values(c).join("").length <= THUMB_CHUNK_BYTES);
  assert.equal(Object.keys(mergeThumbChunks(chunks.map((m) => ({ map: m })))).length, 52);
  assert.equal(chunkThumbs({ a: "not-an-image", b: img(THUMB_CHUNK_BYTES + 10) }).length, 0);
  assert.throws(() => chunkThumbs(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`m${i}`, img(300_000)]))), /quá giới hạn/);
});

test("usableSnapshot từ chối dữ liệu thiếu / sai phiên bản", () => {
  assert.equal(usableSnapshot(null), false);
  assert.equal(usableSnapshot({ schema: 2, items: [], cats: [], combos: [], hidden: [] }), false);
  assert.equal(usableSnapshot({ schema: 1, items: [], cats: [] }), false);
});
