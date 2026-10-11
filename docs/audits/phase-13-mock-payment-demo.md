# Phase 13 — Mock Payment Demo Mode

**Branch:** `phase/13-mock-payment-demo`  
**Base:** `phase/12-payment-safety-preflight`  
**Real charges:** never made by this mode

## How to enable locally

In `tally-web-dashboard/.env.local` set:

```env
VITE_MOCK_PAYMENTS=true
```

Then restart the Vite dev server. Select any paid plan, change the coupon/details, and click **Buy Now**. The page calculates the current plan price and discount, records a completed payment with `payment_method: mock`, shows the selected plan and final amount, and reloads the subscription page.

## Safety behavior

The mock branch runs only when both conditions are true:

```text
VITE_MOCK_PAYMENTS=true
Vite mode is not production
```

A production build (`MODE=production`) always uses the real Razorpay path and never the mock path, even if the flag is accidentally present. The UI displays a clear “Demo mode” notice when the mock path is active.

The mock payment ID is generated locally with a `mock_pay_` prefix. No Razorpay request, card entry, wallet charge, or external payment is performed.

## Validation

- Dashboard production build passed.
- `git diff --check` passed.
- Static checks confirmed the production-mode guard, mock payment method, and no-real-charge notice.

## Scope limitation

This mode records a demo payment row only. It is not a production payment implementation and does not add signed webhooks, gateway reconciliation, refunds, chargebacks, or server-authoritative paid-license activation. It must not be enabled in a production build.
