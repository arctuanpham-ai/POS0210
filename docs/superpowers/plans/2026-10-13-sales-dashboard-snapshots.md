# Sales Dashboard Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a Spark-safe Web view of live provisional sales, 3/7-day finalized revenue, and item statistics from Android-written snapshots.

**Architecture:** Android Room remains the only business-data source. A pure snapshot composer derives `dashboard/current` and `dashboardDaily/{YYYY-MM-DD}` from Local snapshots; FirebaseCloudSync publishes only changed payloads on the existing throttled sync path. The Web Dashboard reads one current document plus 3 or 7 daily documents only when opened or manually refreshed.

**Tech Stack:** Kotlin/Room/Firestore/WorkManager; static ES modules with Firebase Web SDK.

**Spec:** `docs/superpowers/specs/2026-10-13-sales-dashboard-snapshots-design.md`

## Global Constraints

- Firebase Spark only; no Cloud Functions, Blaze, Storage or Web realtime listeners.
- Do not write, mutate, delete, reset or migrate sales bills, order items, payments or historical sales data.
- Only bill status `PAID` contributes to finalized revenue and item statistics.
- Provisional open-table amount must remain distinct from finalized revenue.
- Android writes snapshot data no more than once per 10 minutes and only for a changed fingerprint.
- Web reads only on opening the Dashboard or **Làm mới**; at most 1 current document plus 3 or 7 daily documents.
- Keep the Web work on `main`; keep Android work on `qa/report-v106`. Do not merge `qa/report-v106` into `main`.
- Do not modify production Firestore Rules.

## Review Focus

- A table open with items but no payment must increase only `provisionalOpenTotal`, never `revenueToday`. Test in Task 1.
- A canceled batch/item must not add to a live-table provisional total. Test in Task 1.
- Payments just before/after local midnight must belong to the correct `dateKey`. Test in Task 1.
- Retrying a daily backfill must update the same date document, not create another document. Test in Task 2.
- A stale/missing daily document must show unavailable data in Web rather than zero revenue. Test in Task 3.

---

### Task 1: Pure Android snapshot composition

**Files:**
- Create: `app/src/main/java/vn/ecohome/pos0210/cloud/DashboardSalesSnapshot.kt`
- Create: `app/src/test/java/vn/ecohome/pos0210/cloud/DashboardSalesSnapshotTest.kt`

**Interfaces:**
- Consumes: immutable Local snapshot rows for tables, sessions, batches, items and paid bills.
- Produces: `CurrentDashboardSnapshot`, `DailySalesSnapshot`, `LiveTableSnapshot` and `DashboardSalesSnapshot.composeCurrent(...)` / `composeDaily(dateKey, ...)`.
- Used by: Task 2 publisher.

- [ ] **Step 1: Write failing unit tests for current and daily composition**

Cover open-table provisional total, canceled-batch exclusion, paid-only revenue, average bill, grouped item quantity/revenue and midnight date boundary.

- [ ] **Step 2: Run the focused test before implementation**

Run: `gradle --no-daemon :app:testDebugUnitTest --tests '*DashboardSalesSnapshotTest'`

Expected: FAIL because the snapshot composer does not exist.

- [ ] **Step 3: Implement immutable snapshot models and composition**

Implement:
- `data class LiveTableSnapshot(id: String, name: String, openedAt: Long?, currentTotal: Long, serviceStatus: String)`
- `data class CurrentDashboardSnapshot(...)`
- `data class DailyItemSnapshot(itemId: String, name: String, qty: Double, revenue: Long)`
- `data class DailySalesSnapshot(dateKey: String, revenue: Long, paidBills: Int, averageBill: Long, items: List<DailyItemSnapshot>, finalized: Boolean)`

The daily composer must consume only `PAID` bills and order items joined to those paid bill sessions; sort items by revenue descending and cap at 50.

- [ ] **Step 4: Run the focused test**

Run: `gradle --no-daemon :app:testDebugUnitTest --tests '*DashboardSalesSnapshotTest'`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: compose sales dashboard snapshots locally`

### Task 2: Android snapshot publishing, throttle and 7-day backfill

**Files:**
- Modify: `app/src/main/java/vn/ecohome/pos0210/cloud/FirebaseCloudSync.kt`
- Modify: `app/src/main/java/vn/ecohome/pos0210/data/PosDao.kt`
- Modify: `app/src/main/java/vn/ecohome/pos0210/PosViewModel.kt`
- Test: `app/src/test/java/vn/ecohome/pos0210/cloud/DashboardSalesSnapshotTest.kt`

**Interfaces:**
- Consumes: Task 1 composer and read-only DAO snapshot queries.
- Produces: Firestore payloads for `dashboard/current` and `dashboardDaily/{YYYY-MM-DD}`.
- Used by: Task 3 Web reader.

- [ ] **Step 1: Extend tests with idempotent daily document and unchanged fingerprint cases**

Assert a daily payload uses `dateKey` as its only document ID; rerun with equal business fields performs no write; a change in `updatedAt` alone is ignored by the fingerprint.

- [ ] **Step 2: Run the focused test before implementation**

Run: `gradle --no-daemon :app:testDebugUnitTest --tests '*DashboardSalesSnapshotTest'`

Expected: FAIL on the new publisher/fingerprint assertions.

- [ ] **Step 3: Add read-only DAO queries required by the composer**

Expose only snapshot reads needed to join paid bills, sessions, batches and items for today and the previous six local-calendar days. Do not add schema changes or mutation queries.

- [ ] **Step 4: Publish the two snapshot document shapes from `FirebaseCloudSync`**

Replace the Web-facing dependency on per-table/order mirrors with:
- `dashboard/current` containing only active `liveTables`, `provisionalOpenTotal`, today finalized values and existing finance fields.
- `dashboardDaily/{dateKey}` upserts for today plus missing/unfinalized days in the last seven days.

Use the existing write fingerprint acknowledgement and a persisted 10-minute gate. Backfill is max seven date IDs and uses set/upsert, never generated IDs. Finalize the prior local day once after midnight.

- [ ] **Step 5: Wire cloud status copy in `PosViewModel`**

Show the existing Cloud screen's snapshot timestamp/error, preserving the current auth/session behavior and never changing sales data.

- [ ] **Step 6: Run Android verification**

Run: `gradle --no-daemon testDebugUnitTest :app:assembleDebug --stacktrace`

Expected: all unit tests pass and APK assembles; inspect the diff to confirm no Room entity/schema/migration or sales mutation changed.

- [ ] **Step 7: Commit**

Commit message: `feat: publish bounded sales dashboard snapshots`

### Task 3: Web Dashboard snapshot-only view

**Files:**
- Modify: `web-dashboard/app.js`
- Modify: `web-dashboard/index.html`
- Modify: `web-dashboard/styles.css`
- Create: `web-dashboard/sales-snapshot-view.test.mjs`

**Interfaces:**
- Consumes: `dashboard/current` and `dashboardDaily/{YYYY-MM-DD}` contract from Task 2.
- Produces: manual-refresh Web panels for live provisional sales, 3/7-day outcomes, chart and item statistics.

- [ ] **Step 1: Write failing browser-independent rendering/data tests**

Test document selection for 3 versus 7 days, aggregation of daily revenue/item rows, and display state for absent/stale daily data.

- [ ] **Step 2: Run the Web test before implementation**

Run: `node --test web-dashboard/sales-snapshot-view.test.mjs`

Expected: FAIL because snapshot aggregation/view helpers do not exist.

- [ ] **Step 3: Change `refreshDashboard()` to read only snapshot documents**

Read `dashboard/current` and date-keyed daily documents with `getDoc`; remove Web reads of `tableStatus`, sessions, batches, items, bills and payments for this view. Keep expense receipts and finance metadata in their existing restricted 7-day flow.

- [ ] **Step 4: Render the live and historical panels**

At the top show:
- Bàn đang phục vụ
- Tổng tạm tính bàn mở
- Doanh thu hôm nay đã chốt
- Bill hôm nay đã thanh toán
- active `liveTables` with open time, status and provisional total.

Add a 3 ngày / 7 ngày selector, daily-revenue bar chart, total revenue/bills/average bill, and an item table showing name, quantity, revenue and contribution. Missing daily documents must say unavailable; never silently report zero.

- [ ] **Step 5: Run Web test and static validation**

Run: `node --test web-dashboard/sales-snapshot-view.test.mjs`

Expected: PASS. Manually verify the page still has no `onSnapshot` import/use and that refresh reads no historical bill/order collections.

- [ ] **Step 6: Commit on `main`**

Commit message: `feat: show bounded sales snapshots on dashboard`

### Task 4: End-to-end smoke verification without production sales mutation

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-sales-dashboard-snapshots-design.md` only if test evidence requires a clarified contract.

**Interfaces:**
- Consumes: Android build from Task 2 and deployed Web from Task 3.
- Produces: an evidence checklist, not test sales records.

- [ ] **Step 1: Verify the Android build/signature gate**

Use the successful CI APK and verify it is an in-place update with the existing signing certificate. Do not uninstall, clear data or install an older APK after upgrade.

- [ ] **Step 2: Verify one naturally active table**

During normal service only: open existing Dashboard, press Android **Đồng bộ realtime ngay**, then Web **Làm mới**. Confirm the same open-table count and provisional total are visible, while finalized revenue remains unchanged until payment confirmation.

- [ ] **Step 3: Verify daily historical snapshot**

After normal confirmed sales data exists, check 3-day and 7-day views against the Android Local report. Confirm each day is one Firestore document and the item totals equal the corresponding paid-only local figures.

- [ ] **Step 4: Record pass/fail evidence**

Record document timestamps, read count expectation and any error trace. Do not alter Rules or inject test sales into production.

- [ ] **Step 5: Commit only documentation evidence if changed**

Commit message: `docs: record dashboard snapshot verification`
