# Phase 1 — Canonical licensing model preflight

**Branch:** `phase/1-canonical-model-preflight`  
**Parent:** `phase/0-audit` (`4e114c0`)  
**Status:** **PREPARED, NOT APPLIED**

## Objective

Define the evidence and reversible migration sequence needed to establish one authoritative license contract while preserving every existing license, payment, trial, transfer, device, and sync record.

## Current evidence

- Checked-in licensing SQL consistently creates and updates `public.user_licenses`.
- The validation Edge Function reads `user_licenses` and invokes licensing RPCs.
- Dependent source migrations reference `user_licenses` for payments/trials/transfers and admin views.
- The supplied blueprint warned of a possible `licenses` versus `user_licenses` split; source review cannot prove that no legacy `licenses` table or deployed caller exists.
- Supabase project `tallysync` reported zero rows for the inspected public tables through the schema inspection endpoint. This may represent an empty/staging-like project or an incomplete row-stat response; it must not be treated as proof that production has no data.
- The deployed migration history differs from the repository migration directory. Reconciliation is mandatory before applying any file.

## Canonical decision proposal

Treat `user_licenses` as the **provisional source-code candidate**, not the approved production authority, until the following read-only checks are run against the authorized production project and an isolated restore:

1. List both `licenses` and `user_licenses` if present, including columns, primary keys, unique constraints, RLS, grants, triggers, and row counts.
2. Identify every foreign key referencing either table.
3. Search deployed functions/views/policies and application versions for both table names.
4. Reconcile license IDs, user/account ownership, status, expiry, plan, serial, payment, trial, transfer, device, and sync references.
5. Produce a conflict report without deleting or overwriting any row.

## Reversible migration sequence

### A. Expand

- Add only compatible columns/indexes/compatibility views after staging restore validation.
- Keep any legacy table and callers intact.
- Do not change production RLS/grants in the same migration as data reconciliation.

### B. Reconcile

- Build a deterministic source-to-candidate mapping.
- Classify rows as `matched`, `candidate_only`, `legacy_only`, `conflicting`, or `invalid`.
- Preserve source IDs and original values.
- Store migration version, source ID, candidate ID, outcome, and conflict reason in a restricted review artifact.

### C. Validate

Compare before/after totals by status and plan, active/trial/expired/suspended counts, payment and trial relationships, ownership, serial uniqueness, device relationships, transfer history, and sync/audit references.

### D. Switch

Switch reads/writes only behind a controlled feature flag after staging and pilot validation. If dual-write is temporarily unavoidable, use a transaction and mismatch monitoring with a defined removal date.

### E. Contract

Deprecate legacy callers only after deployed usage evidence and rollback readiness. Any table removal requires a separate approved migration and is explicitly out of this branch.

## Phase 1 release blockers

- Gate 0 backup restore proof is not complete.
- Production versus staging project identity has not been independently confirmed.
- Owner approval of the canonical table and serial-transfer policy is pending.
- No migration, backfill, grant change, RLS change, or paid activation is authorized from this branch.

## Next action after prerequisites

Create `phase/1-canonical-model-dry-run` from this branch only after the isolated restore exists. That branch may add a transaction-safe, report-only dry-run script and tests. A separate implementation branch must be created for any additive schema change, followed by staging validation and a new commit.
