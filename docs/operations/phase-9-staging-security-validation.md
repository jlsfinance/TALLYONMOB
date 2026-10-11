# Phase 9 Staging Security Validation Plan

## Scope

Migration under test:

`tally-sync-backend/migrations/20261011_security_hardening_staging.sql`

This is a staging-only rehearsal. It has **not** been applied to production.

## Preconditions

- Restore a current Supabase backup into an isolated staging project.
- Record the staging project ID and migration history.
- Create at least two authenticated test users in different companies, one company admin, one company viewer, and an anonymous client.
- Run baseline dashboard and sync smoke tests before migration.

## Required checks after migration

1. Anonymous reads/writes to companies, licenses, trials, payments, devices, sync tables and admin views fail.
2. User A cannot read or write User B’s company rows.
3. A company viewer cannot write sync rows unless the existing `can_sync`/role rule allows it.
4. A user can read only their own license, trial and payment rows.
5. Missing-policy tables (`sync_logs`, `outstanding`, `voucher_entries`, `sync_idempotency`) enforce company membership.
6. Admin RPCs cannot be called by anonymous or ordinary authenticated users.
7. Authenticated trial activation still works only through its intended contract and remains idempotent.
8. Sync authorization helper functions still execute in authenticated RLS evaluation.
9. Admin views are unavailable to browser roles and available only through the trusted backend/service role.
10. Dashboard login, company selection, device management, and sync health pages still work through approved server routes.
11. Supabase security advisor no longer reports anonymous admin-view exposure or missing policies for the four targeted tables.
12. Rollback/forward-repair rehearsal completes and row counts remain unchanged.

## Deliberate hold points

- Do not apply this migration to production from this branch.
- Do not enable public paid activation.
- Do not remove any additional broad policy until its dashboard/API caller is mapped and tested.
- Do not grant browser access to admin views merely to restore a failing UI; add an authenticated backend admin route instead.

## Current automated evidence

- `npm test` passes: 24 tests passed, 1 opt-in live integration test skipped.
- Phase 9 static migration safety checks pass.
- The migration contains no table drops, truncation, deletes, or data updates.

## Promotion gate

Promotion to a production-apply branch requires staging test artifacts, backup/restore proof, dashboard/sync smoke results, negative-access results, advisor re-check, and explicit production approval.
