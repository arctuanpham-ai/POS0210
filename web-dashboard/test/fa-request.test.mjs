import test from "node:test";
import assert from "node:assert/strict";
import { nextCheckAt, requestView, newRequest, hm } from "../fa-request.js";

const vn = (s) => Date.parse(`${s}+07:00`);
test("giờ kiểm tra kế tiếp: 7h, 14h, 18h rồi sang 7h hôm sau", () => {
  assert.equal(nextCheckAt(vn("2026-11-06T06:00:00")), vn("2026-11-06T07:00:00"));
  assert.equal(nextCheckAt(vn("2026-11-06T07:00:00")), vn("2026-11-06T07:00:00"));
  assert.equal(nextCheckAt(vn("2026-11-06T12:10:00")), vn("2026-11-06T14:00:00"));
  assert.equal(nextCheckAt(vn("2026-11-06T18:01:00")), vn("2026-11-07T07:00:00"));
});
test("trạng thái hiển thị", () => {
  const at = vn("2026-11-06T12:10:00");
  assert.equal(requestView(null).kind, "none");
  const p = requestView({ status: "pending", requestedAt: at }, vn("2026-11-06T12:20:00"));
  assert.equal(p.kind, "pending"); assert.equal(p.overdue, false); assert.match(p.title, /14:00 06\/11/);
  const late = requestView({ status: "pending", requestedAt: at }, vn("2026-11-06T15:00:00"));
  assert.equal(late.overdue, true); assert.equal(late.tone, "warn"); assert.match(late.detail, /Chrome/);
  assert.equal(requestView({ status: "nochange", requestedAt: at, finishedAt: at + 1 }).tone, "ok");
  const f = requestView({ status: "failed", requestedAt: at, finishedAt: at, reason: "Chưa đăng nhập Grab", details: { GRAB: { ok: false, note: "cần đăng nhập" } } });
  assert.equal(f.tone, "bad"); assert.match(f.title, /Chưa đăng nhập Grab/); assert.match(f.detail, /GrabFood: cần đăng nhập/);
  assert.equal(requestView({ status: "running", startedAt: at }, at + 10 * 60_000).busy, true);
  assert.equal(requestView({ status: "running", startedAt: at }, at + 60 * 60_000).tone, "warn");
});
test("không cho bấm dồn khi đang chờ", () => {
  const now = vn("2026-11-06T12:10:00");
  assert.equal(newRequest({ now, by: "T", current: { status: "pending", requestedAt: now - 60_000 } }), null);
  assert.equal(newRequest({ now, by: "T", current: { status: "done", requestedAt: now - 99999 } }).status, "pending");
  assert.ok(newRequest({ now: vn("2026-11-06T16:00:00"), current: { status: "pending", requestedAt: now } }), "quá hạn thì cho yêu cầu lại");
  assert.match(hm(now), /12:10 06\/11/);
});
