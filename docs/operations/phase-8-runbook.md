# Phase 8 Operations Runbook

## Safe telemetry contract

Every actionable request should carry `x-correlation-id`. Record only:

- operation name
- environment and app version
- duration
- safe error code
- batch size and outcome
- retry count
- license/device state category
- sync run ID or safe source identifier

Never record passwords, access tokens, service keys, raw serials, payment secrets, complete accounting payloads, request/response bodies, or stack traces in normal production logs.

## Initial alerts

| Alert | Starting threshold | Severity | Owner/action |
|---|---:|---|---|
| Sync server errors | 5% of eligible runs over 10 minutes | High | On-call: inspect correlation IDs and readiness |
| Sync partial batches | 1% of eligible batches over 15 minutes | High | Sync owner: inspect failed-row quarantine |
| License validation failures | 10 failures in 10 minutes | Medium | Entitlements owner: check Supabase and license function |
| Database unavailable | 3 consecutive readiness failures | Critical | Platform owner: check Supabase status/connection saturation |
| Device revocation errors | 5 errors in 10 minutes | Medium | Security owner: inspect control-plane policies |
| Retry queue age | Oldest pending item over 30 minutes | High | Sync owner: replay only after idempotency check |
| Client version drift | Unsupported version above 5% of active devices | Medium | Release owner: publish upgrade guidance |

Each deployed alert must link to this runbook and name a real owner before being enabled.

## Incident procedure

1. Capture the affected `x-correlation-id`, UTC time range, app version, company-safe identifier, and error code.
2. Check `/health/readiness` and the protected `/metrics` endpoint.
3. Confirm whether the problem is process, database, entitlement, device, Tally connectivity, or a permanent data error.
4. For retryable failures, allow the bounded retry policy to finish; do not manually loop requests.
5. For terminal row failures, use the quarantine/review path and replay only with the existing idempotency key.
6. If release integrity is suspected, stop distribution, verify `SHA256SUMS.txt` and signature, then roll back to the previous stable release.
7. Record impact, root cause, correlation IDs, remediation, and follow-up owner.

## Release safety gate

A release is not approved unless the Windows PR build passes, Squirrel produces the setup executable, signing verification passes in CI, `SHA256SUMS.txt` is published, and no unsigned executable is renamed as an installer.
