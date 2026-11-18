# SYNCORA WhatsApp Bot

The bot responds only to incoming customer messages. It uses the official Meta Cloud API, deterministic Hindi/Hinglish report commands, and the existing SYNCORA data model. It has no paid AI provider, outbound reminders, or marketing templates.

## Meta test setup

1. Use a [Meta developer app with WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started). In API Setup, select the test number and verify a test recipient.
2. Use a test Supabase project with the SYNCORA schema. Apply the WhatsApp migration to that project. Keep `WHATSAPP_DEMO_MODE=true` to use sample figures and disable account linking.
3. Configure these values in Supabase Edge Function secrets.

| Secret | Value |
| --- | --- |
| `WHATSAPP_APP_SECRET` | Meta app secret used to verify incoming webhook signatures |
| `WHATSAPP_VERIFY_TOKEN` | Random value set here and entered in Meta's webhook setup |
| `WHATSAPP_ACCESS_TOKEN` | Cloud API access token for the sending number |
| `WHATSAPP_PHONE_NUMBER_ID` | Test or business number ID from Meta API Setup |
| `WHATSAPP_GRAPH_VERSION` | Graph API version shown in Meta API Setup, including the leading `v` |
| `WHATSAPP_PHONE_KEY` | Stable random secret of at least 32 characters used to hash phone identifiers. Rotating it requires relinking accounts. |
| `WHATSAPP_DASHBOARD_ORIGIN` | HTTPS origin of the SYNCORA dashboard for this project, without a path |
| `WHATSAPP_DEMO_MODE` | `true` for sample data. Use `false` only after deploying and verifying the dashboard pairing page and database migration. |

4. Deploy with `supabase functions deploy whatsapp-bot --project-ref <test-project-ref> --no-verify-jwt`. Meta webhooks authenticate with an HMAC signature, and the account-link endpoint validates the signed-in user's Supabase token.
5. In Meta's WhatsApp configuration, use `https://<test-project-ref>.supabase.co/functions/v1/whatsapp-bot` as the callback, enter the matching verify token, and subscribe to `messages`. Send `HELP`, `Aaj ki sales`, and `Last sync` from the verified recipient.

## Before enabling business data

Test with two separate SYNCORA accounts and companies in the same test project. Send `LINK` from WhatsApp and enter the full number with country code and the ten-minute code at **Settings → WhatsApp Bot**. Confirm that a wrong phone or expired code fails, a company from another account cannot be selected, and `UNLINK` disables report access. Compare sales and purchase totals against the dashboard for the same company and date. Only synced vouchers are included.

The first release gives financial and sync data to company owners. Shared memberships, invoice-level due dates, open-ended AI questions, and automatic sends are outside this pilot.
