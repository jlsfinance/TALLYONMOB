-- Schedule only after reminder-delivery is deployed and these Vault secrets exist:
-- reminder_project_url, reminder_service_role_key, reminder_worker_secret.
-- The worker also needs TELEGRAM_BOT_TOKEN and matching WEB_PUSH_* secrets.
-- Run as a database administrator. Do not put literal secrets in this file.
select cron.schedule(
  'tallylink-reminder-delivery', '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_project_url') || '/functions/v1/reminder-delivery',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_service_role_key'),
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
