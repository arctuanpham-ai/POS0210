import test from "node:test";
import assert from "node:assert/strict";
import { CACHEABLE_SOURCES, createMemoryCache, decodeValue, encodeValue, isCacheableSource, packDocs, queryKey, snapshotFrom } from "../read-cache.js";

class FakeTs { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); } }
const mkTs = (s, n) => new FakeTs(s, n);

test("Timestamp được mã hoá rồi giải mã lại đúng kiểu", () => {
  const src = { a: 1, at: new FakeTs(100, 5_000_000), nested: [{ t: new FakeTs(7, 0) }], s: "x" };
  const back = decodeValue(JSON.parse(JSON.stringify(encodeValue(src))), mkTs);
  assert.ok(back.at instanceof FakeTs);
  assert.equal(back.at.toMillis(), 100005);
  assert.ok(back.nested[0].t instanceof FakeTs);
  assert.equal(back.s, "x");
});

test("khóa truy vấn ổn định và khác nhau khi đổi điều kiện", () => {
  const q = (n) => ({ _query: { path: { segments: ["purchases"] }, filters: [{ value: { integerValue: String(n) } }], limit: 800 } });
  assert.equal(queryKey(q(1)), queryKey(q(1)));
  assert.notEqual(queryKey(q(1)), queryKey(q(2)));
  assert.equal(queryKey({}), null);
  assert.equal(queryKey(null), null);
});

test("snapshot giả có docs, size, empty, forEach, ref, data", () => {
  const docs = [{ id: "a", ref: { path: "x/a" }, data: () => ({ n: 1, at: new FakeTs(3, 0) }) }];
  const snap = snapshotFrom(packDocs(docs), { makeTimestamp: mkTs, makeRef: (p) => ({ path: p }) });
  assert.equal(snap.size, 1);
  assert.equal(snap.empty, false);
  assert.equal(snap.docs[0].id, "a");
  assert.equal(snap.docs[0].ref.path, "x/a");
  assert.equal(snap.docs[0].data().at.toMillis(), 3000);
  assert.equal(snap.docs[0].get("n"), 1);
  let seen = 0; snap.forEach(() => { seen += 1; }); assert.equal(seen, 1);
  assert.equal(snapshotFrom([], { makeTimestamp: mkTs, makeRef: () => null }).empty, true);
});

test("bộ nhớ tạm hết hạn sau TTL nhưng getAny vẫn trả bản cũ; clear xoá hết", () => {
  let t = 0;
  const c = createMemoryCache({ ttlMs: 1000, now: () => t });
  c.set("k", [1]);
  assert.deepEqual(c.get("k"), [1]);
  t = 1500;
  assert.equal(c.get("k"), null);
  assert.deepEqual(c.getAny("k"), [1]);
  c.clear();
  assert.equal(c.getAny("k"), null);
});

test("chỉ cache các nguồn nặng, không cache cấu hình hay đơn online", () => {
  for (const s of ["purchases", "reimbursements", "financialMovements", "expenseRules", "sessions", "foodAppLedger"]) assert.ok(isCacheableSource(s), s);
  for (const s of ["config", "online_orders", "online_limits", "menu", "tableStatus"]) assert.ok(!isCacheableSource(s), s);
  assert.ok(CACHEABLE_SOURCES.size >= 8);
});
