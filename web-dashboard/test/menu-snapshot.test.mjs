import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, chunkThumbs, usableSnapshot } from "../menu-snapshot.js";

test("dashboard: dựng bản chụp menu + ảnh, chia nhóm, hợp lệ", () => {
  const img = (n) => `data:image/jpeg;base64,${"A".repeat(n)}`;
  const thumbs = Object.fromEntries(Array.from({ length: 52 }, (_, i) => [`menu_${i}`, img(13_000)]));
  const r = buildSnapshot({ items: [{ id: "a", name: "Cà phê", price: 25000, updatedAt: { toMillis: () => 9 } }], cats: [], combos: [], hidden: ["x"], thumbs, thumbsVer: 7, now: 1, by: "WEB:test" });
  assert.ok(usableSnapshot(r.data));
  assert.equal(r.data.items[0].updatedAt, 9);
  assert.equal(r.data.thumbsParts, Object.keys(r.thumbDocs).length);
  assert.equal(r.data.thumbsVer, 7);
  assert.ok(chunkThumbs(thumbs).length >= 2);
});
