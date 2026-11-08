Subscription payments and licensing

The web app and Windows connector share the server subscription decision. Signup grants a 30-day trial. The latest licence controls access, including revocation; an older active row cannot restore access. Expired/revoked users retain saved data but authenticated business writes require a valid subscription.

Run the backend with `npm start`. Local web development proxies `/api/v1/subscriptions` to port 5000. In a hosted web build set `VITE_SUBSCRIPTION_API_URL` to the backend origin, or reverse-proxy that path to the backend. Deploying the static web build alone does not deploy this Node API.

Required backend environment variables (server only):

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the existing authoritative project.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Placeholder values disable checkout.
- `SUBSCRIPTION_RETURN_URL`: the web app's `/subscription` URL. Production requires HTTPS. For local test mode use `http://127.0.0.1:3011/subscription`.

In the Razorpay dashboard subscribe `payment_link.paid` to the publicly reachable HTTPS URL `/api/v1/subscriptions/webhook`. The webhook secret must match the server value. Do not paste secret keys into client code or commit `.env`.

Apply the three `20261108` monetisation/activation/checkout migrations before deploying the new clients. These migrations have been applied to the connected project during this change. Rollback-only integration tests are in `supabase/tests/monetisation_reliability.sql`.

Checkout uses a server-side plan/coupon quote and stores a fixed price/duration. Browser amounts and user IDs are ignored. Coupon capacity is reserved for 30 minutes and consumed once upon verified payment. Zero-value checkout requires administrator activation. Prices are the final INR amounts; no additional GST charge is added by this checkout.

Payment activation requires the exact raw webhook signature, a matching saved checkout, a fully captured payment confirmed through the gateway API, matching amount/currency/order, and a single database transaction. Duplicate webhooks and status polling cannot grant a second licence. Retrying the same checkout recovers a gateway create timeout using its reference ID. No card credentials are stored.

Users can return to the subscription page to reconcile a paid checkout even when the webhook was delayed. Paid validity extends from the later of now or current active trial/paid expiry. Suspended or revoked accounts require administrator review. Refund/dispute handling is manual: revoke access through License Management when appropriate.

Before accepting real payments, configure real test keys and the public webhook, then perform a Razorpay sandbox checkout and webhook retry test. Switch to live keys only after that succeeds. The checked-in environment currently contains placeholders; no real payment was made during verification.

Checks: `node node_modules/jest/bin/jest.js src/services/subscriptionPayments.test.js src/routes/subscriptionRoutes.test.js --runInBand`; Windows tests via `dotnet test tally-windows-sync/Tests/TallySyncApp.Tests.csproj`; web via `npm run build`.
