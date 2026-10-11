# Phase 12 — Payment Safety Preflight

**Branch:** `phase/12-payment-safety-preflight`  
**Base:** `phase/11-release-gate-automation`  
**Production payment activation:** disabled and unchanged

## Change

Added `scripts/verify-payment-readiness.js` and the npm command `npm run verify:payment-readiness`.

The guard is fail-closed:

- When `PAYMENTS_ENABLED` is not exactly `true`, it passes and reports that activation is disabled.
- When payments are enabled, it requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `PAYMENT_CATALOG_VERSION`.
- It also requires `PAYMENT_ACTIVATION_MODE=server_webhook`; client callbacks are rejected.
- It never prints secret values.

The CI backend quality workflow runs this guard before syntax and migration safety checks. This prevents an incomplete gateway configuration or client-authoritative activation mode from being treated as releasable.

## Validation

- Backend suite: **31 tests passed, 1 opt-in live integration test skipped**.
- Payment-disabled configuration passed.
- Enabled payment configuration without gateway secrets failed as expected.
- Complete server-webhook configuration passed using dummy non-secret placeholder values in the test process.
- JavaScript syntax and diff checks passed.

## Still intentionally blocked

This is a safety gate, not a payment implementation. No gateway order creation, signed webhook, pricing approval, refund/chargeback workflow, or payment migration was added. Payment activation remains disabled until the gateway, canonical price catalog, server-side order flow, webhook verification, idempotency, and accounting reconciliation are approved and implemented.
