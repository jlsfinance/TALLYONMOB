# SYNCORA Telegram reporting bot

This function uses a dedicated Telegram bot so the existing SYNCORA notification bot and Mini App can keep their current webhooks and account links. It answers incoming private chats using the Telegram Bot API and rule-based Hindi/Hinglish questions. It has no paid AI dependency or scheduled sends.

## Demo with sample data

1. Create a dedicated bot with [@BotFather](https://t.me/BotFather) and set `TELEGRAM_REPORT_BOT_TOKEN` in your test project's Edge Function secrets.
2. Set `TELEGRAM_REPORT_WEBHOOK_SECRET` to a random value using letters, digits, underscores, or hyphens. Keep `TELEGRAM_REPORT_DEMO_MODE=true`. Demo mode needs no SYNCORA migration or company data.
3. Deploy with `supabase functions deploy telegram-report-bot --project-ref <test-project-ref> --no-verify-jwt`. The webhook requires Telegram's secret header. Dashboard linking uses a verified SYNCORA access token.
4. Use Telegram's [setWebhook](https://core.telegram.org/bots/api#setwebhook) method with the URL `https://<test-project-ref>.supabase.co/functions/v1/telegram-report-bot`, the same `secret_token`, and `allowed_updates: ["message"]`. Send `/start`, `Aaj ki sales`, `Balance Sharma Traders`, and `Last sync` in a private chat.

## Connect to SYNCORA data

Apply the Telegram report migration to an authorized SYNCORA test project and deploy the dashboard branch against that project. Set `TELEGRAM_REPORT_DASHBOARD_ORIGIN` to the dashboard's HTTPS origin. Set `TELEGRAM_REPORT_DEMO_MODE=false` only after the database and dashboard are ready.

In a signed-in dashboard, open **Settings → Telegram Bot**, generate a link command, and paste it into the dedicated bot's private chat. The command expires in ten minutes and can be used once. Test with two distinct accounts, including cross-company access denial, expired codes, revoked links, and matching report totals for the same company and date. Financial access in this pilot requires company ownership. Linking here does not affect the existing Telegram notifications or Mini App.
