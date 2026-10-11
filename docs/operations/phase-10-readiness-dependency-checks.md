# Phase 10 — Readiness Dependency Checks

**Branch:** `phase/10-readiness-dependency-checks`  
**Base:** `phase/9-security-hardening-staging`  
**Production database:** unchanged

## Change

`GET /health/readiness` now checks two real backend dependencies through the service-role Supabase client:

- `companies` — database connectivity
- `sync_devices` — sync control-plane connectivity

Each check is bounded by a timeout (`READINESS_CHECK_TIMEOUT_MS`, default 1500 ms). The response exposes only safe status values and the existing correlation ID.

## Response behavior

- `200` and `healthy` only when process, database, and sync control plane are healthy.
- `503` and `unhealthy` when a configured dependency fails.
- `503` and `degraded` when dependency credentials are not configured.
- No database error details or credentials are returned to callers.

## Validation

- Backend suite: **28 passed, 1 opt-in live integration test skipped**.
- JavaScript syntax checks passed.
- Local endpoint test with dummy Supabase credentials returned `503` with:
  - `process: healthy`
  - `database: unhealthy`
  - `syncControlPlane: unhealthy`
- Response included version and correlation ID.
- Local test server was stopped after verification.

## Operational note

The endpoint now correctly prevents a load balancer from treating a process with unavailable database dependencies as ready. Production deployment should configure a short readiness timeout and monitor 503 readiness events.
