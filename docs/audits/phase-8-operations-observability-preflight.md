# Phase 8 — Operations, Observability, and Scale Preflight

**Branch:** `phase/8-operations-observability-preflight`  
**Base:** `phase/7-installer-onboarding-hardening`  
**Date:** 2026-10-11  
**Priority:** P1

## Verified current state

The sync backend already has useful foundations: entitlement failures carry correlation IDs, the sync route returns `x-correlation-id`, device and sync health endpoints exist, and sync idempotency/checkpoint work is present. The Windows client also records structured-looking diagnostic events and has bounded pending-transaction retry logic.

However, there is no central metrics registry, durable telemetry contract, alert configuration, service-level dashboard, or runbook ownership model evidenced in the repository. Most backend routes still log raw exception messages, and the Windows client contains debug logging that writes request payload previews, company identifiers, voucher content, response bodies, and stack traces. These logs can expose sensitive accounting data and should not be treated as production telemetry.

Correlation IDs are not consistently propagated across all routes and client requests. Many routes return raw `error.message` values rather than stable error codes. The backend has a generic `/health` response and company sync health routes, but readiness, dependency health, database saturation, queue age, and version/build metadata are not exposed as a consistent operational contract.

The GitHub release workflow publishes artifacts and can fall back to copying the unsigned published executable as `TallyLinkSetup.exe`. It does not fail closed when signing or Squirrel packaging is unavailable, does not publish a SHA-256 manifest, and the Windows build is not a normal pull-request gate. The workflow also contains a best-effort deployment update that can patch a download URL through a legacy InsForge/Supabase path.

Payment webhook metrics are not currently relevant because payment implementation remains intentionally paused, but the future telemetry contract must reserve event processing state and reconciliation mismatch metrics without enabling payment activation.

## Acceptance criteria status

| Criterion | Status | Evidence / gap |
|---|---|---|
| Structured telemetry with safe fields | **Partial** | Correlation IDs exist in sync path; raw payload/debug logs remain |
| No sensitive data in logs | **Fail** | Windows logs include payload previews, response bodies, company IDs and stack traces |
| Dashboards and alerts with owners | **Not evidenced** | No central metric/alert/runbook configuration found |
| Bounded retries and jitter | **Partial** | Several bounded retry paths exist; policy is not unified across services |
| Dead-letter/review path | **Partial** | Quarantine logging exists for failed rows; no durable operator queue/dashboard evidenced |
| Health/readiness contract | **Partial** | Generic and company health endpoints exist; dependency/readiness semantics are inconsistent |
| Correlation coverage | **Partial** | Entitlement path is covered; all routes/client operations are not |
| Release artifact integrity | **Fail** | Unsigned fallback executable and no SHA-256 manifest in release workflow |
| PR Windows build gate | **Partial** | PC build is manual workflow dispatch rather than normal PR validation |

## Required implementation gate

The implementation branch should introduce a small safe telemetry contract with correlation ID, environment, app version, operation, stable error code, duration, bounded batch outcome, retry count, and state category. Raw serials, tokens, passwords, payment secrets, full accounting payloads, response bodies, and stack traces must be removed from normal production logs or redacted before recording.

A readiness endpoint and health response should distinguish process health, database dependency health, sync-control-plane health, and degraded-but-serving state. Metrics should be emitted for sync completion, latency, partial batches, idempotency conflicts, quota denials, device errors, license validation, database failures, and client versions. Every alert needs an owner, threshold, severity, runbook, and escalation path.

The release workflow should fail closed if signing or packaging fails, publish SHA-256 checksums and release metadata, and run the Windows build on pull requests or a required protected branch check. Payment metrics should remain dormant until payment is explicitly resumed.

No production observability migration or release publication should be performed from this preflight branch.
