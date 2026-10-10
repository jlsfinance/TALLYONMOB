# Phase 0 — Read-only inventory and environment lock

**Repository:** `jlsfinance/TALLYONMOB`  
**Base branch:** `feature/web-dashboard-full-pagination`  
**Audit branch:** `phase/0-audit`  
**Audit timestamp:** 2026-10-10 (session date)  
**Scope:** source, local build/test metadata, Supabase/Vercel read-only inspection.  

## Safety statement

This audit made no production database writes, migrations, deletes, updates, deployments, or account/security changes. Raw serials, tokens, passwords, payment payloads, and environment values are intentionally excluded from this artifact.

## Repository lock

| Item | Evidence |
|---|---|
| Repository | `https://github.com/jlsfinance/TALLYONMOB` |
| Base commit | `9ddddb7e6e389b54f749af0aba6886682c2a7783` |
| Base branch | `feature/web-dashboard-full-pagination` |
| Current audit branch | `phase/0-audit` |
| Latest base commit | `add consent-based serial confirmation requirement` |
| Working tree at audit start | Clean |
| Dashboard package | `tally-web-dashboard`, version `2.2.0` |
| Dashboard framework | Vite + React + TypeScript |
| PC app target | .NET 9 Windows WPF, `win-x64`, self-contained |
| Supabase migrations in source | 19 files |
| Supabase Edge Function source trees | 4 (`send-sync-notification`, `sync-reminder`, `track-activity`, `validate-license`) |
| Local dashboard test command | `npm test` |
| Local release check command | `npm run check:all` |

## Local verification

`cd tally-web-dashboard && npm test` passed on the audit branch:

- Supabase pagination tests: 8 passed, 0 failed.
- Phase 5 business insight logic checks: passed.
- Dependency installation reported 36 npm audit findings (1 low, 9 moderate, 23 high, 3 critical). This is recorded for Phase 6/release hardening and was not auto-fixed because forced dependency changes are outside the Phase 0 scope.

A full `check:all` build was not used as a Phase 0 acceptance gate because it may require additional platform/runtime setup beyond the focused baseline tests. It must be run before the first production release candidate.

## Source call-graph inventory (static)

| Area | Source evidence | Phase 0 observation |
|---|---|---|
| License model | `tally-web-dashboard/supabase/migrations/20250617080002_saas_licensing_system.sql` and follow-up migrations | `user_licenses` is the dominant licensing table in checked-in SQL. This is not by itself proof of production authority. |
| License validation | `tally-web-dashboard/supabase/functions/validate-license/index.ts` | Edge Function calls the license validation path and can call `bind_tally_serial`. |
| License RPCs | `validate_user_license`, `bind_tally_serial`, `transfer_tally_serial`, `assign_license`, `update_license_status`, `extend_license` | All require review of execute grants and authorization before any paid activation work. |
| Device/sync control plane | `tally-sync-backend/migrations/20261009_sync_control_plane.sql`, dashboard migrations | `sync_devices`, `sync_runs`, `sync_idempotency`, and `sync_conflicts` are present in the source/deployed schema inventory. |
| PC client | `tally-windows-sync/` | Client licensing and sync callers require a separate write-path review before Phase 4. |
| Dashboard | `tally-web-dashboard/src/` | Existing pagination work is retained as the base; licensing changes remain separate. |

## Supabase read-only inspection

**Project:** `tallysync`  
**Project ref:** `pfqmqpboomwtxgyfqnsn`  
**Region:** `ap-south-1`  
**Database:** PostgreSQL 17, status reported as `ACTIVE_HEALTHY`  
**Applied migration count reported by Supabase:** 15

The deployed migration history includes control-plane and delete/source-field migrations through Phase 12. The repository contains 19 source migrations, so source-to-deployed migration reconciliation remains a required gate before applying any new migration.

The deployed public schema reports RLS enabled on the inspected tables, including companies, user profiles, sync state, sync devices/runs, and sync idempotency/conflict tables. The complete verbose schema response was obtained read-only from the Supabase MCP and is not copied here to avoid turning the audit into a data dump.

### Supabase security findings (observed read-only)

Supabase advisors reported the following release-blocking review items:

1. **Exposed auth users:** three public admin views may expose `auth.users` data to `anon`: `admin_dashboard_stats`, `admin_recent_payments`, and `admin_expiring_licenses`.
2. **RLS enabled without policies:** `outstanding`, `sync_idempotency`, `sync_logs`, and `voucher_entries` were reported without policies.
3. **Security-definer views:** six public views were reported as `SECURITY DEFINER`, including the three admin views above and `v_company_summary`, `v_ledger_balances`, and `v_user_companies`.
4. **Mutable function search path:** 22 public functions were reported, including licensing functions such as `validate_user_license`, `bind_tally_serial`, and `transfer_tally_serial`.
5. **Anon-executable security-definer functions:** 11 functions were reported callable by `anon`; the set includes licensing/admin functions such as `assign_license`, `bind_tally_serial`, `transfer_tally_serial`, `update_license_status`, and `validate_user_license`.
6. **Authenticated-executable security-definer functions:** 12 functions were reported callable by `authenticated`; this includes the licensing functions and the destructive `delete_company_data` RPC.
7. **Password protection:** leaked-password protection is reported disabled.
8. **Extension placement:** the `vector` extension is reported in the public schema.

These are findings only. No remediation was applied in Phase 0. Any fix must be additive/reversible, tested in an isolated environment, and separately committed in a security phase.

## Vercel read-only inspection

**Project:** `tallyonmob`  
**Project ID:** `prj_M7pj46JdqtbjPtiXhb7AllP8fm6E`  
**Framework:** Vite  
**Node:** 24.x  
**Latest deployment:** `READY`  
**Latest deployment commit:** `9ddddb7e6e389b54f749af0aba6886682c2a7783`  
**Latest deployment branch:** `feature/web-dashboard-full-pagination`  
**Production/custom domain shown:** `tallyonmob.vercel.app`  
**SSO protection:** enabled for non-custom deployment domains.

The latest deployment is a preview-style deployment (`target: null`) according to the Vercel MCP response. Production target status and the exact deployment promotion policy require explicit verification before publishing any phase branch.

## Environment and secret handling

The repository tracks `tally-mobile-app/.env`, containing Supabase variable names and values. Values were not printed or copied. This should be treated as a repository hygiene finding: rotate/revoke any credential that was ever committed, remove secrets from Git history where appropriate, and keep only safe `.env.example` files tracked. Supabase anon keys are publishable by design, but URLs/keys must still be environment-scoped and access-controlled through RLS/functions.

The checked-in `.agent/mcp_config.json` contains only placeholder Context7/shadcn entries; it does not configure Supabase or Vercel MCP. Session-level Supabase and Vercel connectors were available and were used only for the read-only inspection above.

## Phase 0 acceptance matrix

| Criterion | Status | Evidence / blocker |
|---|---|---|
| Production schema/data unchanged by audit | PASS for this session | Only read-only MCP operations were used. |
| Exact source commit/branch recorded | PASS | This document. |
| All license/sync write paths inventoried | PARTIAL | Static paths inventoried; older deployed/client versions still require runtime log/export review. |
| Migration state understood | PARTIAL | Source has 19 files; deployed project reports 15 migrations. Reconciliation is pending. |
| Staging backup restore succeeds | BLOCKED | No isolated restore target/approved backup storage was provided or created. Do not claim recoverability yet. |
| `licenses` vs `user_licenses` mapped | PARTIAL | Source strongly uses `user_licenses`; production authority and any legacy `licenses` data require a controlled schema/data query and owner sign-off. |
| RLS policies/grants reviewed | PARTIAL / RELEASE BLOCKER | Advisors identify exposed functions/views and policy gaps. Remediation requires a separate phase and staging proof. |
| No secrets/raw serials exposed in audit artifact | PASS | Values intentionally redacted/omitted. |
| Owner approves canonical model/migration plan | PENDING | Required before Phase 1 migration work. |

## Gate 0 decision

**Gate 0 is not passed.** The repository is safely locked and the audit evidence is committed, but Phase 1 migrations and paid activation must not start until:

1. A consistent backup is exported to approved secure storage.
2. That backup is restored to an isolated staging Supabase project and validated.
3. Source/deployed migration history is reconciled.
4. Supabase security advisor findings are triaged with an approved remediation plan.
5. The canonical licensing table and transfer policy are approved by the owner.

## Next branch plan

The next safe branch should be created from this commit as `phase/0-backup-restore-proof` only after an isolated staging project and approved backup destination are available. No production migration or paid activation should be performed on the current branch.
