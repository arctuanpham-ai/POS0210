import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STAT_KEYS, STAT_EVENTS, decide, keysFor, vnDayKey, vnHour, HOUR_KEYS } from "../public/stats-core.js";

test("ngày và giờ theo giờ Việt Nam (UTC+7)", () => {
  const ms = Date.UTC(2026, 9, 20, 17, 30); // 00:30 ngày 21/10 giờ VN
  assert.equal(vnDayKey(ms), "20261021"); assert.equal(vnHour(ms), 0);
  assert.equal(vnDayKey(Date.UTC(2026, 9, 20, 16, 59)), "20261020");
});
test("lượt vào tính cả khung giờ, cấp khác chỉ một bộ đếm", () => {
  const ms = Date.UTC(2026, 9, 20, 7, 5); // 14:05 VN
  assert.deepEqual(keysFor("visit", ms), ["visit", "vh14"]);
  assert.deepEqual(keysFor("add", ms), ["add"]);
  assert.deepEqual(keysFor("xyz", ms), []);
});
test("mỗi cấp chỉ đếm 1 lần mỗi phiên, tải lại không tính thêm", () => {
  const t = Date.UTC(2026, 9, 20, 3);
  let a = decide("visit", t, {}, {}); assert.ok(a.count);
  let b = decide("visit", t, a.session, a.device); assert.ok(!b.count);
  let c = decide("add", t, b.session, b.device); assert.ok(c.count);
  let d = decide("add", t, c.session, c.device); assert.ok(!d.count);
});
test("sang ngày mới thì phiên đếm lại", () => {
  const t1 = Date.UTC(2026, 9, 20, 3), t2 = t1 + 24 * 3_600_000;
  const a = decide("menu", t1, {}, {}); const b = decide("menu", t2, a.session, a.device);
  assert.ok(b.count);
});
test("thiết bị chỉ đếm 1 lần mỗi ngày", () => {
  const t = Date.UTC(2026, 9, 20, 3);
  const a = decide("device", t, {}, {}); assert.ok(a.count);
  const b = decide("device", t + 3_600_000, a.session, a.device); assert.ok(!b.count);
  const c = decide("device", t + 24 * 3_600_000, b.session, b.device); assert.ok(c.count);
});
test("rules online_stats khai báo đủ mọi bộ đếm và chỉ chủ quán đọc", () => {
  const rules = readFileSync(new URL("../rules/online-orders.rules", import.meta.url), "utf8");
  const i = rules.indexOf("online_stats/{day}"); assert.ok(i > 0);
  const block = rules.slice(i, rules.indexOf("online_limits/{key}"));
  const fn = rules.slice(rules.indexOf("function statKeys()"), rules.indexOf("function statInc"));
  for (const k of STAT_KEYS) { assert.ok(rules.includes(`statInc('${k}')`), `thiếu statInc ${k}`); assert.ok(fn.includes(`'${k}'`), `thiếu ${k} trong statKeys`); }
  assert.equal((fn.match(/'[a-z0-9]+'/g) || []).length, STAT_KEYS.length);
  assert.match(block, /allow read: if isShopOwner\(\)/);
  assert.equal(STAT_KEYS.length, STAT_EVENTS.length + HOUR_KEYS.length);
  assert.ok(!/\?[^:\n]*:/.test(block.replace(/'[^']*'/g, "")), "không dùng toán tử ba ngôi");
});
