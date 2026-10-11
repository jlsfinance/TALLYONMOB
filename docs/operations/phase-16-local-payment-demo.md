# Phase 16 — Local Payment Demo

The temporary mock checkout now stores demo payment records in browser `localStorage`, not in Supabase. This prevents test clicks from creating payment rows in the production `tallysync` project.

Enable it in `tally-web-dashboard/.env.local`:

```env
VITE_MOCK_PAYMENTS=true
```

The mode remains restricted to non-production Vite builds. It records the selected plan, current price, coupon, discount, final amount, mock transaction ID, and timestamp locally for the signed-in browser user. Reloading the page keeps the demo history; clearing site storage removes it.

The real Razorpay path remains unchanged when the mock flag is disabled or when the build mode is production. No card, wallet, gateway request, Supabase payment insert, license activation, or PC-app change is performed by the temporary demo.

Validation passed with the dashboard production build, diff checks, and a static guard confirming that the mock branch does not call the Supabase `payments` table.
