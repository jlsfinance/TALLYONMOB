# Phase 4 — Central Server-Side Entitlement Enforcement Preflight

**Branch:** `phase/4-entitlement-enforcement-preflight`  
**Base:** `phase/3-device-security-hardening`  
**Date:** 2026-10-11  
**Priority:** P0 / release blocker

## Scope

Phase 4 requires every protected sync write to be authorized server-side before any business-table write. The required checks are authenticated context, license/trial state, serial binding, company ownership/allowance, registered device, feature entitlement, quota/rate limits, supported app version, request integrity, and idempotency.

## Verified source and deployed facts

- `tally-sync-backend/src/index.js` mounts all sync mutations under `/api/v1/sync` with `validateSyncCredential`.
- The current credential middleware validates a global `SYNC_API_KEY` or company-scoped sync API key. It does **not** resolve a user license, trial, serial, feature, quota, or app-version entitlement.
- `phase/3-device-security-hardening` now verifies registered device state and `x-device-token` for all mutating sync routes except bootstrap registration and privileged revoke.
- `syncRoutes.js` mutating paths inventoried:
  - `POST /`
  - `POST /company`
  - `POST /batch`
  - `POST /sync/with-items`
  - `DELETE /sync/data/:companyId/:dataType`
  - `PUT /checkpoint/:companyId/:module`
  - `POST /conflicts/:id/resolve`
  - bootstrap/control paths: `POST /device/register`, `POST /device/:deviceId/revoke`
- `SyncService.syncCollection()` performs direct Supabase upserts into sync tables after route middleware. It transforms client records and forces `company_id`, but has no license or quota decision.
- `SyncControlService` records device/run/idempotency/conflict state, but idempotency lookup currently happens before a dedicated entitlement module exists. Route-level device proof occurs before the route handler.
- The Windows client uses company API-key/Bearer-style API access through `ApiClient`; its current sync contract has no verified server entitlement context or supported-version header.
- The existing `validate-license` Edge Function validates a Supabase user session and license/trial/serial state, but it is not called by the backend sync write path. Its fallback returns a feature-empty response and its auto-bind behavior is not sufficient as a write authorization boundary.
- Deployed Supabase schema inspection confirmed `companies`, `company_users`, `user_licenses`, `trial_history`, `subscription_plans`, and sync tables are present. `companies` carries `owner_id`, `user_id`, `is_active`, and API-key fields; `company_users` carries `role` and `can_sync`; `user_licenses` carries status, expiry, plan, and `tally_serial`.
- Existing desktop RLS migration contains broad `FOR ALL ... USING (true)` policies for multiple sync/business tables. These are not an acceptable substitute for backend entitlement checks because the sync backend uses service-role writes and direct client/RPC paths need separate classification.

## Write-path classification

| Path | Classification | Current authorization | Phase 4 gap | Required action |
|---|---|---|---|---|
| `POST /api/v1/sync` | Protected sync write | API key + active device/token | No license, serial, feature, quota, version, correlation contract | Shared entitlement middleware before idempotency/write |
| `POST /api/v1/sync/batch` | Protected sync write | API key + active device/token | Same gap; multi-table batch quota undefined | Authorize once, reserve quota, stable batch idempotency |
| `POST /api/v1/sync/sync/with-items` | Protected sync write | API key + active device/token | Same gap; child writes need one authorization context | Route inventory test + shared middleware |
| `DELETE /api/v1/sync/sync/data/...` | Destructive sync operation | API key + active device/token | No feature/role/quota/audit authorization | Explicit destructive feature and audit policy |
| `PUT /api/v1/sync/checkpoint/...` | Retry/resume write | API key + active device/token | No license continuity or concurrency reservation | Bind checkpoint to authorized device/run |
| `POST /api/v1/sync/conflicts/.../resolve` | Conflict administrative write | API key + active device/token | No company role/admin authorization | Require company admin/support capability |
| `POST /api/v1/sync/device/register` | Bootstrap/control operation | API key/company credential | Must define license/device allowance and bootstrap rules | Add explicit registration policy; never reactivate revoked devices |
| `POST /api/v1/sync/device/:id/revoke` | Administrative operation | Global key or dashboard owner/admin RLS | Backend/global and dashboard/RLS paths need unified audit | Add correlation/audit event |
| Windows `ApiClient` direct Supabase reads/writes | Client-side data path | Existing bearer/RLS | Direct client writes can bypass backend policy where broad RLS allows | Inventory every method; remove/deny protected direct writes |
| License Edge Function | License validation | Supabase JWT | Not a sync write boundary; feature response incomplete | Reuse server-side logic or move canonical check to trusted backend/RPC |

## Entitlement model decisions required in implementation

1. **License principal:** resolve the company owner (`companies.owner_id`) and/or an explicitly authorized `company_users` member. The API key alone must not be treated as a license identity.
2. **Company authorization:** require `companies.is_active = true` and `company_users.can_sync = true` or owner/admin policy for the requested company.
3. **License/trial:** active license with `expiry_date > now()` or an unexpired, non-abused trial. Suspended/blocked/expired states return stable machine codes.
4. **Serial:** compare the request’s Tally serial against the canonical bound serial; do not return the raw bound serial in errors.
5. **Feature:** sync requires an explicit `sync` entitlement; no UI-only feature gate is sufficient.
6. **Quota:** define a durable usage unit (records accepted), UTC reset boundary, failed/replayed-request behavior, concurrent reservation behavior, and admin override before adding enforcement.
7. **Version:** define `X-Sync-App-Version` and a server-configured minimum supported version. Do not silently reject old clients until the PC client rollout can send the header.
8. **Idempotency:** authenticate and authorize before returning a replayed response; duplicate requests must not consume quota twice.
9. **Errors:** return `{ success:false, error:<stable_code>, retryable:<boolean>, correlationId:<uuid> }` without stack traces, raw SQL, API keys, or serials.
10. **Audit:** record allow/deny, company, device, feature, usage unit, and correlation ID without storing raw device tokens.

## Release gate

Phase 4 is **not yet implementation-complete**. The current branch is an evidence/preflight branch. No production entitlement policy was invented or silently applied because the existing schema does not define quota units, version policy, or the canonical company-to-license principal. The next implementation branch must add one shared authorization module, route coverage tests, client contract updates, and an additive usage/audit migration before deployment.
