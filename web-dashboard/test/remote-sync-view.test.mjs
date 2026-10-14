import test from "node:test";
import assert from "node:assert/strict";
import { ACK_TIMEOUT_MS, COOLDOWN_MS, canRequestSync, syncCommandStatus } from "../remote-sync-view.js";

test("chống bấm liên tục: chỉ cho gửi sau thời gian chờ", () => {
  assert.equal(canRequestSync(undefined, 1000), true);
  assert.equal(canRequestSync(1000, 1000 + COOLDOWN_MS - 1), false);
  assert.equal(canRequestSync(1000, 1000 + COOLDOWN_MS), true);
});

test("trạng thái: đã gửi, đã nhận, quá hạn", () => {
  const t = 1_000_000;
  assert.equal(syncCommandStatus(null, t, t + 1000).state, "sent");
  const ack = { receivedFor: t, receivedAt: t + 3000, device: "23049PCD8G" };
  const received = syncCommandStatus(ack, t, t + 5000);
  assert.equal(received.state, "received");
  assert.match(received.text, /23049PCD8G/);
  assert.equal(syncCommandStatus(null, t, t + ACK_TIMEOUT_MS).state, "timeout");
});

test("xác nhận của lệnh cũ không được tính cho lệnh mới", () => {
  const t = 2_000_000;
  const old = { receivedFor: t - 90_000, receivedAt: t - 87_000 };
  assert.equal(syncCommandStatus(old, t, t + 1000).state, "sent");
  assert.equal(syncCommandStatus(old, t, t + ACK_TIMEOUT_MS + 1).state, "timeout");
});
