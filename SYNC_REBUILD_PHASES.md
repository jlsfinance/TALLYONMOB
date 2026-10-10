# TallyonMOB Sync Rebuild — Phase Plan

## Non-negotiable contract

- **No upload request may contain more than 100 rows.**
- Tally extraction, parsing, cloud upload and retry must work on low-end PCs.
- Every phase must be validated, committed and pushed to its own branch before the next phase starts.
- No destructive cleanup or schema migration will run without a before/after reconciliation report.

## Phase 8 — Sync foundation and low-end safety

**Branch:** `feature/phase-8-sync-foundation`

Scope:

- Hard cap Windows upload batches to 100.
- Add a central defensive cap in `ApiClient` so direct child/derived uploads are also split.
- Keep adaptive backoff below the cap: 75 → 50 → 25.
- Add repeatable static checks for the cap and build validation.

Acceptance:

- Configured batch values above 100 are clamped to 100.
- Voucher ledger/stock child uploads cannot send more than 100 rows per HTTP request.
- Windows project builds successfully.

## Phase 9 — Durable cursor and all-FY incremental scan

**Branch:** `feature/phase-9-durable-cursors`

Scope:

- Remove the normal incremental voucher dependency on a three-month date window.
- Persist per-company, per-module AlterID/date checkpoint.
- Resume after app restart without skipping or duplicating rows.
- Support explicit FY/date-range backfill.

Acceptance:

- A voucher older than three months but modified today is discovered.
- A failed chunk resumes from its checkpoint.
- Each HTTP request remains ≤100 rows.

## Phase 10 — Parent/child completeness and reconciliation

**Branch:** `feature/phase-10-sync-reconciliation`

Scope:

- Track discovered, parsed, sent, accepted, failed, queued and partial counts.
- Mark voucher sync as partial when child tables fail.
- Add parent-vs-child ID reconciliation.
- Split failed chunks 100 → 50 → 25 → row quarantine.

Acceptance:

- No successful summary can hide child upload failures.
- Quarantined rows are retryable and visible in the PC log.

## Phase 11 — Delete propagation

**Branch:** `feature/phase-11-delete-propagation`

Scope:

- Add low-memory ID-only deletion detection.
- Populate `deleted_records` and soft-delete target records.
- Keep deletes idempotent and company-scoped.

Acceptance:

- Test voucher/ledger/stock deletion in Tally is reflected in cloud after sync.
- Deleted rows do not silently reappear on retry.

## Phase 12 — Complete stock and voucher fields

**Branch:** `feature/phase-12-complete-source-fields`

Scope:

- Choose canonical stock model and remove `stock_items`/`tally_stock` ambiguity.
- Persist alias, category, inward/outward, taxability and alternate units.
- Add normalized godown, batch, cost-centre and GST detail mappings.
- Keep raw/source metadata for audit.

Acceptance:

- SKU Summary/History/Customers/Suppliers reconcile with Tally voucher lines.
- GST, quantity and rate values match source test vouchers.

## Phase 13 — Master-data incremental sync

**Branch:** `feature/phase-13-master-incremental-sync`

Scope:

- Sync ledger groups, stock groups, units, godowns, voucher types and cost centres incrementally.
- Run low-cost master AlterID checks on normal sync.
- Reserve full master refresh for explicit force-resync.

Acceptance:

- New master appears without force-resync.
- Master requests remain capped at 100 rows.

## Phase 14 — Low-end PC performance and release QA

**Branch:** `feature/phase-14-low-end-release-qa`

Scope:

- Bound memory during Tally XML parsing.
- Limit concurrent HTTP requests to one.
- Add configurable delay/backoff and disk queue protection.
- Add test harness for 256 MB/low CPU simulation where practical.
- Produce operator-facing sync diagnostics.

Acceptance:

- No request >100 rows.
- No unbounded in-memory list for a full company.
- Restart/retry/offline behavior is deterministic.
- Full reconciliation report is generated before release.
