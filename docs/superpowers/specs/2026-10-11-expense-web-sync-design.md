# POS0210 — Expense Web, Cloud Sync and COGS design

## Status and boundaries

This specification is approved in principle by the product owner on 2026-10-11. It is deliberately additive: no table, order, bill, payment, customer, promotion, or sale-report table is reset, deleted, or replaced.

The checked-out repository is Android source `alpha61-candidate31`; it does not contain the source-controlled Firebase Hosting dashboard, Firestore Security Rules, indexes, or Firebase usage access. The currently deployed static Web files are publicly retrievable and will be captured as the Web baseline, but their original build/deploy configuration is not in this repository. The attached `candidate35` APK is a later binary and cannot be treated as its editable source. Work requiring Console-only assets is marked **blocked**, not guessed.

## Existing-system findings

* Room already has `PurchaseEntity`, `PurchaseItemEntity`, `PurchaseCategoryEntity`, and `CostCodeEntity`.
* Existing cloud sync reads complete finance collections and mirrors complete local collections on each run. This is not acceptable for the target Spark budget.
* `syncDashboardNow` currently writes the dashboard and live order-related collections; Android dashboard viewing uses a Firestore snapshot listener.
* No source-controlled Firestore Rules/indexes exist, so server-side authorization cannot currently be verified or changed.

## Target data model

Cloud root remains `users/{uid}/stores/0210`.

### `expenseReceipts/{receiptId}`

One document is one receipt. The Web client creates a UUID once and saves it in its local draft before the first write. Retrying uses the same ID.

Required fields: `id`, `purchaseDate` (epoch ms), `enteredByUid`, `enteredByName`, `createdAt`, `updatedAt`, `updatedByUid`, `status` (`ACTIVE` or `CANCELLED`), `note`, `total`, `items`.

`items` is an array of compact maps: `id`, `materialId`, `materialCode`, `materialName`, `expenseGroup`, `subcategoryId`, `qty`, `unit`, `unitPrice`, `amount`. One document is used unless the Firestore 1 MiB limit would be reached; the UI rejects an oversized receipt before write.

### `materials/{materialId}`

Manager-maintained catalogue: `code`, `name`, `normalizedName`, `expenseGroup`, `subcategoryId`, `baseUnit`, `active`, `updatedAt`. It supports autocomplete, duplicate detection and COGS references. New staff proposals go to `materialProposals/{proposalId}`; they do not silently create canonical codes.

### `dashboard/current`

One compact document: current open-table summary and today revenue only, with `payloadHash`, `lastUpdatedAt` and `sourceDeviceId`. It is not a replacement for sale/order synchronisation.

## Web dashboard behavior — blocked until Web source is available

* Authentication is Firebase Auth; writer identity comes only from `request.auth.uid` and its approved profile, never a user-editable form field.
* Default time window is Vietnam-local today plus two preceding calendar days. Available windows are today, 3 days, and 7 days; requests outside 7 days are refused by UI.
* Web uses one range query per selected period, ordered by `purchaseDate desc`, then applies combined staff/group/material/receipt filters from cache. It uses no realtime listener.
* The receipt editor preserves a local draft keyed by receipt ID after network failure; it reports success only after the Firestore write resolves.
* Charts are computed from the loaded 3/7-day result: total, receipts, lines, group, material, staff, quantities by unit, weighted average price and price movement.
* Dashboard status and today revenue are fetched on page open and on an explicit `Làm mới` action only. A timestamp older than 15 minutes is visibly stale.

## Android additive migration and sync

Room will add new expense receipt/item/material/recipe tables and a dedicated `ExpenseSyncStateEntity`; it will not modify or delete legacy sales tables.

Expense pull is a dedicated path, independent of legacy finance mirror:

1. Read receipts where `(updatedAt > cursorUpdatedAt) OR (updatedAt == cursorUpdatedAt AND id > cursorId)`, in batches.
2. Validate document fields and totals, then upsert its receipt and items inside one Room transaction.
3. Advance cursor only after the transaction succeeds.
4. Preserve cancelled receipts as `CANCELLED`; never delete them during sync.
5. On initial restore, page from the oldest required cursor until complete. Repeated sync is idempotent.

The manual manager sync button calls this path. WorkManager runs a network-constrained periodic reconciliation nominally daily; Android scheduling is best-effort and a foreground/open-app catch-up is mandatory.

Dashboard snapshots are calculated from local data and written at most once every 10 minutes, only if a canonical payload hash differs from the latest sent hash. A reconnect sends only the newest state. This snapshot path does not write `sessions`, `orderBatches`, or `orderItems` and cannot replace their business sync.

## COGS model

`MaterialEntity` is the shared purchasable resource. `RecipeEntity` identifies a menu item; `RecipeLineEntity` maps material to quantity, base unit, yield/recovery and waste factors. COGS computes theoretical consumption from paid item quantities and recipe lines using purchase-weighted material price. It explicitly reports missing recipes, missing prices, incompatible units, and missing yield instead of inventing a result.

Purchases are cash-flow events. They are not automatically same-day COGS. Reporting labels remain distinct: purchase cost, theoretical COGS, actual material consumption where stock data exists, and gross profit.

## Security rules and indexes — blocked until Firebase project source/access exists

Rules must enforce authenticated store membership and role claims/profile checks on the server. Staff can create receipts and read 7 days; only managers can manage materials, cancel/edit others' receipts, export, or inspect sync status. Existing dashboard/revenue permissions are preserved, not widened.

Required indexes are expected to include receipt `purchaseDate desc`, and where server-side filtering is chosen, composite indexes beginning with `purchaseDate` plus staff/group. Final index file must be generated from actual query shapes and deployed only after owner approval.

## Budget and verification

Design target for the new expense module: <1,000 reads/day and <300 writes/day, excluding pre-existing POS consumption. A normal receipt is one receipt write; a changed dashboard snapshot is one write per 10 minutes maximum, zero when unchanged. Real consumption needs Firebase Usage/Console access and production measurements; it cannot be inferred from source.

Mandatory tests: multi-line receipt; concurrent writers; network retry with stable ID; edit/cancel; all date filters and aggregates; duplicate suppression; same-timestamp cursor boundary; offline-at-02:00 catch-up; unchanged snapshot; restore idempotence; shared-material COGS; migration and sale-table pre/post count checksum; Rules emulator tests once rules are available.

## Rollback

APK rollback is an ordinary install of the preceding signed build only after local backup. Cloud documents are additive and contain no destructive migration. If an expense sync defect is found, disable only the dedicated expense worker/setting; sales, order and payment database tables and flows continue untouched.
