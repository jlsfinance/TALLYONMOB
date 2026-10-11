# Phase 15 — Release Gates and Rollout

**Branch:** `phase/15-rollout-rollback-readiness`  
**Production mutations:** none

## Gate status

| Gate | Required evidence | Current status |
|---|---|---|
| A — Audit | Environment, schema/function inventory, sync write map, restore proof, canonical license decision | Partial: inventories and reports exist; isolated restore proof and canonical licensing decision are pending |
| B — Migration | Dry run, conflict record, reconciliation, staging migration/rollback rehearsal, approved plan | Blocked: Supabase staging branch was not created; production apply is prohibited |
| C — Serial and devices | Binding/transfer, quota/revoke, audit and leakage tests | Code-level tests and security review pass; live lifecycle tests remain pending |
| D — Sync enforcement | Protected write inventory, bypass tests, ownership/quota, idempotency/retry | Code-level suite passes; live cross-account test remains pending |
| E — Payments | Gateway sandbox, signature/idempotency, refund/chargeback/cancellation, reconciliation | Blocked by design: only non-production mock demo mode exists; real payment gateway is not enabled |
| F — Public release | Signed installer, clean-machine onboarding, purchase-to-sync, monitoring, restore/rollback approval, product-owner policy sign-off | Not ready |

## Rollout stages

1. Local development with dummy serials, test accounts, and the non-production mock payment flag.
2. Isolated staging database and payment sandbox.
3. Internal pilot with support coverage.
4. Small production cohort only after all relevant gates pass.
5. Gradual expansion with error-rate and reconciliation monitoring.

A failed gate pauses rollout. No gate may be bypassed to meet a release date.

## Current release decision

The repository is ready for continued local development and code review. It is **not approved for production RLS migration or public paid launch** because database recovery proof, staging authorization tests, real payment lifecycle evidence, and policy approvals are incomplete.
