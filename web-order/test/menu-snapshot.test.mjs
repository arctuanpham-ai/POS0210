import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapshot, remoteSalesDocs, chunkThumbs, menuContent, menuHash, mergeThumbChunks, plain, usableSnapshot, THUMB_CHUNK_BYTES } from "../public/menu-snapshot.js";

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

import { topSellerIds } from "../public/menu-snapshot.js";
test("topSellerIds: cộng mọi ngày + phần trong combo, bỏ món rẻ/ẩn/không có trong menu, cần đủ 3 món", () => {
  const menu = [
    { id: "cf", name: "Cà phê sữa", price: 27000, active: true }, { id: "tra", name: "Trà đá", price: 5000, active: true },
    { id: "bm", name: "Bánh mì trứng", price: 25000, active: true }, { id: "bun", name: "Bún gà 50", price: 50000, active: true },
    { id: "off", name: "Món ngừng", price: 30000, active: false }, { id: "hid", name: "Món ẩn", price: 30000, active: true },
    { id: "it", name: "Ít bán", price: 30000, active: true },
  ];
  const days = [
    { items: [{ name: "Cà phê sữa", qty: 10 }, { name: "Trà đá", qty: 99 }, { name: "Món ngừng", qty: 50 }, { name: "Món ẩn", qty: 40 }, { name: "Ít bán", qty: 1 }, { name: "Món đã xoá khỏi menu", qty: 80 }] },
    { items: [{ name: "Bánh mì trứng", qty: 4 }, { name: "Bún gà 50", qty: 5 }, { name: "COMBO · Cafe Ngon [1× Cà phê sữa + 2× Bánh mì trứng]", qty: 3 }, { name: "Cà phê sữa", qty: 2 }] },
  ];
  // cf: 10 + 2 + 3 = 15; bm: 4 + 6 = 10; bun: 5
  assert.deepEqual(topSellerIds(days, menu, { hidden: ["hid"] }), ["cf", "bm", "bun"]);
  assert.deepEqual(topSellerIds(days, menu, { hidden: ["hid"], limit: 2 }), ["cf", "bm"]);
  assert.deepEqual(topSellerIds([days[1]], menu, { hidden: ["hid"], minQty: 6 }), [], "dưới 3 món đủ doanh số thì không hiện mục");
  assert.deepEqual(topSellerIds([], menu), []);
});

test("remoteSalesDocs: chỉ lấy đơn online đã hoàn thành và đơn app food OK/REVIEW, bỏ đơn huỷ", () => {
  const docs = remoteSalesDocs({
    ledgerRows: [{ status: "OK", items: [{ name: "Cơm gà", qty: 2 }] }, { status: "REVIEW", items: [{ name: "Cơm gà", qty: 1 }] }, { status: "CANCELLED", items: [{ name: "Cơm gà", qty: 9 }] }],
    onlineOrders: [{ status: "done", items: [{ name: "Cơm bò", qty: 1 }] }, { status: "cancelled", items: [{ name: "Cơm bò", qty: 7 }] }, { status: "new", items: [{ name: "Cơm bò", qty: 5 }] }],
  });
  const sum = (n) => docs.flatMap((d) => d.items).filter((i) => i.name === n).reduce((t, i) => t + i.qty, 0);
  assert.equal(sum("Cơm gà"), 3);
  assert.equal(sum("Cơm bò"), 1);
});

test("món bán chạy theo kênh online/app food, không theo bán tại quán", () => {
  const items = [{ id: "a", name: "Cơm gà", price: 59000 }, { id: "b", name: "Cafe sữa", price: 25000 }, { id: "c", name: "Bít tết", price: 99000 }, { id: "d", name: "Cơm bò", price: 75000 }];
  const inStore = [{ items: [{ name: "Cafe sữa", qty: 500 }, { name: "Bít tết", qty: 300 }] }];
  const remote = remoteSalesDocs({ ledgerRows: [{ status: "OK", items: [{ name: "Cơm gà", qty: 6 }, { name: "Cơm bò", qty: 4 }, { name: "Cafe sữa", qty: 3 }] }] });
  assert.deepEqual(topSellerIds(remote, items), ["a", "d", "b"]);
  assert.notDeepEqual(topSellerIds(inStore, items, { minItems: 2 }), ["a", "d", "b"]);
});
