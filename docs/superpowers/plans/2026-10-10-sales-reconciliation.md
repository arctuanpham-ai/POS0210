# Sales reconciliation implementation plan

Goal: investigate Build 285 without touching live data; show complete item statistics and three-level bill reconciliation.
Architecture: additive nullable order snapshots; read-only reporting using unique session membership; transactional validation at order creation. Existing Room, local-first payment, Bluetooth and cloud background workflows remain authoritative.
Spec: user incident report dated 10/10/2026; continue PR #2.

Constraints: no local reset, no historical amount/detail rewriting, no fabricated LIVE data. Unknown historical categories/combos stay unknown. Do not identify the restaurant incident's root cause without real data.

- [ ] Run the original eight Room tests on API 35 and retain per-test logs.
- [ ] Reproduce duplicate PAID session JOIN, cross-scope TEST leak, post-payment batch insertion, and unrecorded gift discount. Check assertions fail before changing code.
- [ ] Replace report JOIN multiplication with EXISTS membership and require LIVE session. Expose item ID, line ID, snapshot prices/categories/kinds/components for reports.
- [ ] Add nullable category ID/name and combo component JSON to new order rows; migration 27→28 only adds columns, never infers old categories. Test migration retains original orders, bills, payments and amounts.
- [ ] Validate all cart IDs atomically against local database; abort entire send with visible message on missing/inactive entry, retain cart. Save snapshots inside order creation transaction. Reject closed/missing sessions. Cancel queries require OPEN session.
- [ ] Persist exact applied discounts/surcharges, including gifts and loyalty discounts, for NEW payment commits only. Existing unexplained adjustments produce warnings.
- [ ] Add pure report aggregation and reconciliation: stable IDs plus historical group/kind; preserve snapshot names, count signed quantities, show gross values and explicit gift value; combo components show quantity only with revenue assigned solely to parent combo.
- [ ] Reconcile details→subtotal, recorded adjustments→bill total, valid payment→bill total; flag duplicate bills, scope/link corruption, missing rows/payments and unsupported adjustments. Never repair underlying data.
- [ ] Add THỐNG KÊ MÓN with all rows, group summaries, time/category filters; retain Top 8 using stable IDs. Add reconciliation alerts and related bill details.
- [ ] Expand Room/JVM cases for mixed payments, batches/tables, cancellations, gifts/discounts/combos, renamed/hidden/moved menu, signed adjustments, midnight, TEST/LIVE and malformed links. Add restore validation checks; report external cloud/printer limitations honestly.
- [ ] Run all unit and connected Android tests, build signed upgrade APK, inspect certificate/version, publish QA APK and evidence. Do not merge failed QA.

Review focus: historical unknown snapshots; combo revenue double counting; overlapping invalid scopes; payment commit race; additive migration and old backup schema acceptance.
