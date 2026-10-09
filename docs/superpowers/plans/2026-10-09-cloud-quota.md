# Cloud quota implementation

Approved specification: 12,000 writes/day target, 16,000 hard ceiling across updated devices on the same Firebase project/account/store. Prioritize sales; dashboard one minute (five minutes after 12k), backups one hour (three hours after 12k), defer optional work at 14k. Keep local data and outbox on every rejection. Standard Firestore free quota is project-wide: external/old clients are not observable by this ledger.

1. Test and implement Pacific-day quota policy, cadence, metadata overhead and shared atomic compare-and-set ledger. Each business commit includes its counter update; failed compare-and-set retries only after rereading. Unknown server response never implies acknowledgement.
2. Route media through the guarded writer. Persist 429 suspension until Pacific reset and stop background retry churn. Cache only confirmed unchanged payloads; root/config/dashboard timestamps do not trigger writes.
3. Exclude Cloud metadata from business invalidation; debounce catalog 30 seconds, finance 60 seconds, backup one hour. Back up only changed business revisions. Shared ledger controls dashboard/backup publisher and cadence.
4. Show current observed quota and pause in Cloud screen. Run local policy/HTTP tests and Android CI. Review the full quota diff, resolve findings, publish signed candidate APK.

Review focus: CAS contention, first document create race, cancellation/unknown receipts, daily reset/DST, metadata counts, UID/project isolation, multiple-device publisher handover, backup partial failure preserves the other valid slot, disabled Cloud remains disabled, no acknowledgement of deferred records.

Ruling: per-task category budgets are soft allocations except optional dashboard/backup/media limits; unused capacity can support sales up to 16k. Counter writes are included in the total and system tally. Counter covers updated clients sharing a UID, not actual project-wide Firebase Usage.

Verification ledger: policy/CAS/HTTP/lifecycle/cancellation suite passed 33/33 locally. Fresh reviewer found (1) older matching backup slot incorrectly suppressing newest snapshot, (2) stage wrappers causing deferred work to retry, (3) dashboard deferral without scheduled delivery. All addressed; reversion and nested deferral regressions passed. Existing combo queue acknowledgement moved behind server-confirmed backup; sync completion preserves the current enabled setting.

Android CI build 284 found Kotlin local function name `add` shadowing ListBuilder.add in logical backup hashing. Renamed the digest feeder to `feed`; the isolated compiler reproduction confirms the cause. Rebuild required before APK delivery.
