# Phase 9 — Security Review, Test Matrix, and Release Gates Preflight

**Branch:** `phase/9-security-review-preflight`  
**Base:** `phase/8-operations-observability-hardening`  
**Date:** 2026-10-11  
**Priority:** P0/P1

## Verified positive controls

- No production Supabase service-role key was found in the Windows client source audited for the prior phases.
- Server-side sync entitlement checks, device token hashing/revocation, company-scoped Windows direct-write RLS, atomic trial activation, correlation IDs, safe logging changes, and release checksum/fail-closed workflow are present in the recent phase branches.
- Payment activation remains intentionally incomplete/paused, which is safer than enabling an unverified payment path.

## Critical findings

### 1. Historical RLS migrations contain broad authenticated access

Several dashboard migrations create policies such as `FOR ALL TO authenticated USING (true) WITH CHECK (true)` for business, license, payment, company, and sync tables. Other migrations grant broad write privileges to the `authenticated` role. These historical policies may remain active in the deployed database even though newer backend paths enforce company and entitlement checks.

This means the repository cannot yet prove that every direct dashboard/API write is ownership-scoped. A production-safe fix requires an applied policy inventory and a staged, table-by-table RLS repair; do not blindly delete old policies in production.

### 2. Anonymous access appears in sensitive historical policies

The audited migration history contains anonymous SELECT grants/policies for license-related data and anonymous insert policies for notification/device-related tables. The exact deployed state must be verified through Supabase MCP before deciding the additive repair. Raw serials, license records, payments, and device identifiers must never be anonymously readable.

### 3. Payment security gate is not complete

Payment service and routes exist, but the blueprint’s required evidence is not complete: signed webhook verification, event uniqueness, order/account/amount/currency reconciliation, legal state transitions, refund/chargeback handling, and reconciliation alerts were not proven as a complete end-to-end flow. Public paid activation must remain disabled.

### 4. Full release gate evidence is incomplete

The repository still lacks recorded evidence for a clean-machine onboarding test, signed installer verification, staging backup restore, migration rollback/forward-repair rehearsal, simulated alert firing, and full purchase-to-sync rehearsal. These are release gates, not optional documentation.

### 5. Secret and identifier scan needs a controlled baseline

The repository contains many legacy test/config references and generated/build artifacts. A final scan must distinguish documentation/test placeholders from real credentials and must separately review raw serials and payloads in logs, support exports, crash reports, and generated files. No production mutation should be approved based only on a filename scan.

## Gate status

| Gate | Status | Reason |
|---|---|---|
| A — Audit | **Partial** | Inventory evidence exists; restore proof and complete deployed function inventory remain incomplete |
| B — Migration | **Blocked** | Broad historical RLS policies need deployed-state inventory and staged repair plan |
| C — Serial/devices | **Partial** | Core enforcement exists; transfer/recovery and full negative matrix evidence incomplete |
| D — Sync enforcement | **Partial** | Server path tests pass; historical direct dashboard policy bypass requires deployed RLS verification |
| E — Payments | **Blocked** | Payment implementation/evidence intentionally incomplete |
| F — Public release | **Blocked** | Clean-machine, signed artifact, restore/rollback and end-to-end rehearsal evidence incomplete |

## Recommended next actions

1. Use Supabase MCP read-only inspection to inventory the exact deployed policies, grants, functions, and migration history for sensitive tables.
2. Create a staging-only additive RLS repair migration that replaces broad policies with verified owner/company/admin policies. Include negative tests for cross-account reads/writes and anonymous access.
3. Keep payment activation disabled until a gateway sandbox and signed webhook contract are implemented and tested.
4. Build a release-gate evidence checklist with explicit pass/fail artifacts: backup restore, clean install, signature/checksum, alert simulation, rollback rehearsal, and purchase-to-sync rehearsal.
5. Run a controlled serial/secret leakage scan over source, logs, exports, and build artifacts, then record false-positive exclusions.
6. Apply no production migration until the deployed-state inventory and staging repair tests are reviewed.

## Decision

This preflight branch is documentation-only. The safest next implementation branch is a staging RLS repair and negative-access test branch, but it must begin with the actual deployed Supabase policy inventory. Payment work should not resume before Gates B–D are proven.
