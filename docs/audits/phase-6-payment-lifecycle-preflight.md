# Phase 6 — Payment and Subscription Lifecycle Preflight

**Branch:** `phase/6-payment-lifecycle-preflight`  
**Base:** `phase/5-trial-abuse-preflight`  
**Date:** 2026-10-11  
**Priority:** P1; paid activation must remain disabled until the payment authority is secured.

## Verified current implementation

The dashboard payment service in `tally-web-dashboard/src/lib/licensing.ts` creates a row in `payments`, but it does not create a gateway order. It accepts a client-supplied `amount`, calculates GST in the browser, generates an invoice number from the current timestamp, and stores a pending payment directly through Supabase.

`paymentService.markPaid()` is also client-callable. It directly changes a payment to `paid` and then calls the client-side `licenseService.createLicense()` method, which directly inserts an active `user_licenses` row. No signed gateway webhook, gateway signature verification, order/amount/account verification, event ID, or idempotent event record is present in the reviewed flow.

The repository contains payment tables and payment-link features, but no verified payment gateway webhook Edge Function or server-side order-creation contract for subscription activation. The existing payments table has a `gateway_transaction_id` field, but no uniqueness constraint was evidenced for it and the status check does not include `chargeback` or `expired`.

Pricing is inconsistent across source artifacts: the primary SaaS licensing migration defines ₹299 monthly, ₹799 quarterly, ₹1,499 half-yearly, ₹2,999 yearly and ₹9,999 lifetime, while a later price migration references a different column model and values. These values must not be published or trusted until a product/finance owner approves the canonical price catalog.

## Acceptance criteria status

| Criterion | Status | Evidence / gap |
|---|---|---|
| Client sends plan ID, not arbitrary amount | **Fail** | `paymentService.create()` accepts and uses `params.amount` |
| Server creates gateway order | **Not evidenced** | No verified order-creation function found |
| Signed webhook is authoritative | **Fail** | No verified webhook handler; client `markPaid()` is authoritative today |
| Amount/currency/account verification | **Fail** | No gateway order or signature verification path |
| Webhook events are idempotent | **Fail** | No event ID storage or unique event key evidenced |
| License activation is server-side | **Fail** | `markPaid()` calls client-side license insertion |
| State transitions are constrained | **Fail** | Client can set paid; refund/chargeback transitions are not defined |
| Support can reconcile paid orders | **Not evidenced** | No gateway-to-local reconciliation report/workflow found |
| Price catalog is canonical | **Fail** | Conflicting pricing migrations/source values |

## Required implementation gate

The implementation branch must first define the approved gateway and canonical commercial catalog. It should then add a server-only order creation function that loads the plan price from `subscription_plans`, persists the expected amount/currency/account/plan, and returns only a gateway checkout payload. A webhook function must verify the gateway signature, persist a unique event ID, reject unknown or mismatched orders, and apply an explicit payment/license state transition transactionally. The browser success callback must never activate access.

The client-side `markPaid()` and direct paid-license creation paths must be removed or restricted to server-only code. Refund, chargeback, cancellation, renewal failure and grace-period behavior require an explicit business decision before production activation.

No payment activation or payment migration should be applied to production from this preflight branch.
