# TALLYONMOB Tally Integration Phases

## Phase 1 — Sync client reliability (current branch)

The Node connector now reads all connection credentials from environment variables, uses a stable device identity, persists outbound batches locally, resumes after a Tally or network failure, retries with exponential backoff, and sends device/idempotency metadata to the sync API. Automated tests cover persistence, deduplication, retry scheduling, permanent failure, and compaction behavior.

**Validation gate:** Node syntax checks and `npm test` must pass before merge/push.

## Phase 2 — Backend sync control plane

Add device registration/revocation, per-company device access, sync run progress, server-side idempotency records, conflict records, retry visibility, and health endpoints. Apply the additive Supabase migration before enabling these endpoints.

## Phase 3 — Incremental sync and performance

Complete Alter ID checkpoints for every data type, resumable chunk processing, compression, large-company pagination, and sync progress reporting in the dashboard.

## Phase 4 — Windows service and diagnostics

Move the connector to a resilient Windows background service with startup recovery, Tally port/company diagnostics, structured logs, and a user-facing retry/error panel.

## Phase 5 — Dashboard and multi-company operations

Modernize company selection with accurate relative sync status, add device management, sync health, audit trail, and per-company/per-device controls.
