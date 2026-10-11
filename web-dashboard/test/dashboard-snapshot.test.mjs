import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSnapshotHash, shouldMarkSnapshotStale } from "../dashboard-snapshot.js";

test("canonical dashboard hash ignores property order", () => {
  assert.equal(canonicalSnapshotHash({ revenueToday: 20000, openTables: 2 }), canonicalSnapshotHash({ openTables: 2, revenueToday: 20000 }));
});

test("marks a dashboard snapshot stale after fifteen minutes", () => {
  assert.equal(shouldMarkSnapshotStale(1000, 901000), false);
  assert.equal(shouldMarkSnapshotStale(1000, 901001), true);
});
