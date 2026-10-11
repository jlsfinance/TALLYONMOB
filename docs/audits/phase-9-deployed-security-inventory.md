# Phase 9 — Deployed Supabase Security Inventory

**Project:** `tallysync` (`pfqmqpboomwtxgyfqnsn`)  
**Inspection:** read-only Supabase MCP queries and security advisors  
**Branch:** `phase/9-security-review-preflight`  
**Date:** 2026-10-11

## Confirmed production findings

The deployed policy inventory confirms the historical concern is active, not only present in source migrations:

- `public.companies` has anonymous INSERT, SELECT and UPDATE grants/policies, including `companies_select_anon` with `qual = true` and `companies_update_anon` with `qual = true`.
- `public.companies` also has `companies_all_auth` with `qual = true` and `with_check = true`, which is broader than owner/company-scoped access.
- `public.payments` has broad authenticated/public policies such as `auth_all`, `auth_all_payments`, and `pay_auth_all` with unrestricted authenticated access.
- `public.trial_history` has broad authenticated/public policies including `auth_all_trial_history` and `th_auth_all` with unrestricted access.
- `public.license_transfers` has `lt_auth_all` with unrestricted authenticated access.
- `public.user_roles`, `public.user_profiles`, `public.app_settings`, `public.notifications`, and other tables also contain broad `*_all_auth` policies.
- The role grants inventory shows `anon` table privileges on sensitive sync/business tables. RLS should still constrain access, but these grants are unnecessarily broad and increase blast radius if a policy is permissive or missing.

## Supabase security advisor results

The production security advisor reported:

- **3 ERROR** findings for admin views exposed to `anon` and potentially exposing `auth.users`: `admin_dashboard_stats`, `admin_recent_payments`, `admin_expiring_licenses`.
- **6 ERROR** findings for `SECURITY DEFINER` views: `v_company_summary`, `v_ledger_balances`, `v_user_companies`, and the three admin views.
- **5 INFO** findings for RLS-enabled tables without policies: `outstanding`, `sync_idempotency`, `sync_logs`, `user_licenses`, `voucher_entries`.
- **22 WARN** findings for functions with mutable `search_path`, including licensing, serial transfer, admin and sync authorization functions.
- **14 WARN** findings for `SECURITY DEFINER` functions executable by `anon`, including `activate_trial`, `assign_license`, `bind_tally_serial`, `extend_license`, `get_admin_stats`, `get_admin_users`, `transfer_tally_serial`, `update_license_status`, and `validate_user_license`.
- **15 WARN** findings for `SECURITY DEFINER` functions executable by `authenticated` users, including admin/license mutation functions and sync authorization functions.
- **1 WARN** finding because leaked-password protection is disabled in Supabase Auth.

## Applied migration evidence

The deployed migration history includes the Phase 2/3 device security, Windows direct-write RLS, and atomic trial activation migrations. No production payment lifecycle migration was applied, matching the current payment hold.

## Decision and safe next action

This is a **P0 security gate failure** for public release. Do not apply a broad automatic “drop all old policies” migration. The next implementation must be staged and table-specific:

1. Protect admin views and revoke anonymous access.
2. Remove anonymous access to companies, license, payment, trial, device and sync data.
3. Replace unrestricted authenticated policies with ownership/company/role-scoped policies.
4. Add explicit policies for RLS-enabled tables currently without policies.
5. Revoke unnecessary `anon` table privileges and unsafe `EXECUTE` grants on privileged functions.
6. Pin `search_path` for security-sensitive functions.
7. Enable leaked-password protection through the Supabase Auth project setting.
8. Run negative tests with anonymous, cross-company and non-admin authenticated identities in staging before any production apply.

No production mutation was performed during this inspection.
