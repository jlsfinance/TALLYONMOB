# Phase 14 — Full Test Matrix

**Branch:** `phase/14-full-test-matrix`  
**Base:** `phase/13-mock-payment-demo`  
**Production changes:** none

## Automated results

| Area | Result | Evidence |
|---|---:|---|
| Backend unit/contract/security tests | **31 passed** | `tally-sync-backend/npm test` |
| Opt-in live backend integration | **Skipped** | Credentials and test company ID are not configured |
| Payment readiness guard | **Passed** | Disabled mode passes; incomplete enabled mode fails; complete server-webhook test config passes |
| JavaScript syntax | **Passed** | All backend `src` and `test` files checked with `node --check` |
| Dashboard production build | **Passed** | `tally-web-dashboard/npm run build` |
| Mock payment production guard | **Passed** | Mock mode requires non-production Vite mode and explicit flag |
| Staging migration static safety | **Passed** | Staging marker present; destructive SQL patterns rejected |

## Database-level tests still pending

These require a separately isolated Supabase staging database and were not run against production:

- Anonymous access negative tests.
- Cross-company read/write isolation tests.
- Dashboard authenticated smoke test against staging.
- Windows sync and device lifecycle smoke test against staging.
- Backup/restore rehearsal and row-count comparison.
- Supabase security advisor re-check after the RLS rehearsal.

## Release interpretation

The code-level gates are green, but this is not a production-release approval. The missing database-level tests are high-value authorization and recovery gates. The RLS migration must remain on its staging branch until those tests can be run in an isolated database and their evidence is reviewed.
