# Reminder delivery

The linked Supabase project has the reminder queue, server worker, worker secrets, pg_net and a minute-based Cron job configured. Future reminders existing at setup time were backfilled; historical reminders were not. Queue RLS restricts clients and subscriptions are scoped to the signed-in owner and company.

The web client contains the public application-server key; the matching private key is held in Supabase secrets. The website must be built and deployed to make this client change available outside localhost. On each browser, select “Enable notifications on this device” and grant notification permission. Browser and operating-system support varies; this is browser Web Push, not native Capacitor push.

Telegram creation and due events were checked with a temporary reminder for the linked account and the test record was deleted. The service-worker push handler received a local synthetic test; a real device push has not yet been verified.

Delivery uses bounded retries. A partial failure across devices or a crash after a provider accepts a notification but before the job is marked sent can cause duplicates. Existing due reminders are paginated in the open app. Jobs can fail if a Telegram account is unlinked or no push device is registered; inspect reminder_delivery_jobs for status and retry details.

The SQL files here document the applied setup. Do not rerun schedule_draft.sql without first checking for an existing job of the same name. Private values are stored in Supabase Edge Function secrets and Vault, not in these files.
