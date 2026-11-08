## 3.1.9

- Persist voucher batches and their child data before advancing a durable sync checkpoint; retry incomplete batches first after restart.
- Keep company cloud identity stable when the Tally data path changes.
- Reconcile deletions with both legacy and company-scoped voucher IDs after independent Tally snapshot checks.
- Read record totals, last successful sync and history from Supabase; show the current company name and accurate upload stages.
- Fix the Buy/Extend button layout and route purchases to the project's subscription page.
- Share authoritative licence/trial decisions with the web app, retry transient verification failures, and distinguish unavailable verification from expiry.
- Package only public client keys and remove private tokens from the installer configuration.

Build the self-contained Windows x64 installer with `./installer/build-release.ps1`. The installer and app version are 3.1.9. The currently published download URL stays on its existing release until this installer is published separately.

Subscription backend/web changes include a 30-day signup trial, consistent admin extension/revocation, persisted checkout quotes, captured-payment verification, and idempotent activation. Real online checkout requires configured Razorpay keys, webhook and a deployed backend; placeholder credentials keep it disabled. See `../tally-sync-backend/SUBSCRIPTION_SETUP.md`.
