# TallyLink SaaS Licensing System — Architecture Doc

## 🏗️ System Architecture

```
┌──────────────────────┐
│   Windows App        │
│   (TallyLink.exe)    │
│                      │
│   ┌────────────────┐ │        ┌─────────────────────────┐
│   │ LicenseService │─┼──POST──▶ Edge Function            │
│   │ (HTTP Client)  │ │        │ /validate-license        │
│   └────────────────┘ │        │ (Authenticates + Checks) │
│                      │        └──────────┬──────────────┘
│   ┌────────────────┐ │                   │ service_role
│   │ AuthService    │ │                   ▼
│   │ (Supabase Auth)│ │        ┌─────────────────────────┐
│   └────────────────┘ │        │ Supabase PostgreSQL      │
│                      │        │                          │
│   ┌────────────────┐ │        │ ┌──────────────────────┐ │
│   │ SyncManager    │─┼─RLS───▶ │ licenses (RLS)       │ │
│   │ (Data Sync)    │ │        │ │ license_audit_log    │ │
│   └────────────────┘ │        │ │ companies, sales...  │ │
└──────────────────────┘        │ └──────────────────────┘ │
                                └─────────────────────────┘
         ┌──────────────┐                │
         │ Razorpay      │──POST──▶ Edge Function
         │ (Payment)     │         /razorpay-webhook
         └──────────────┘

         ┌──────────────┐                │
         │ Admin Panel   │──POST──▶ Edge Function
         │ (Web/Postman) │         /admin-license
         └──────────────┘
```

## 📊 Database Tables

### `licenses`
| Column              | Type          | Description                       |
|---------------------|---------------|-----------------------------------|
| id                  | uuid (PK)     | Auto-generated                    |
| user_id             | uuid (FK)     | References auth.users             |
| tally_serial        | text          | Bound Tally serial (one-time)     |
| plan                | text          | 'trial' or 'pro'                  |
| trial_start         | timestamptz   | When trial started                |
| trial_end           | timestamptz   | When trial expires                |
| subscription_end    | timestamptz   | When Pro subscription expires     |
| status              | text          | 'active', 'expired', 'blocked'   |
| razorpay_order_id   | text          | Last payment order ID             |
| razorpay_payment_id | text          | Last payment ID                   |
| last_payment_at     | timestamptz   | Last successful payment           |
| login_attempts      | int           | Total login count                 |
| last_login_at       | timestamptz   | Last successful login             |
| last_login_ip       | text          | Last login IP                     |

### `license_audit_log`
| Column     | Type        | Description                |
|------------|-------------|----------------------------|
| id         | uuid (PK)   | Auto-generated             |
| user_id    | uuid (FK)   | Who triggered the action   |
| action     | text        | Action name                |
| details    | jsonb       | Action details             |
| ip_address | text        | Client IP                  |
| created_at | timestamptz | When                       |

## 🔒 RLS Policies

| Table              | Policy                     | Access       |
|--------------------|----------------------------|-------------|
| licenses           | users_read_own_license     | SELECT only own row |
| licenses           | No INSERT/UPDATE/DELETE    | Blocked for users |
| license_audit_log  | No user policies           | Service role only |

## 🔧 Edge Functions

### 1. `validate-license` (POST)
**JWT: Disabled** (handles its own auth)

Request:
```json
{ "email": "...", "password": "...", "tallySerial": "..." }
```

Flow:
1. Authenticate via Supabase Auth
2. Fetch license record
3. Bind serial (if first time)
4. Check serial match
5. Check blocked status
6. Check plan expiry (trial/pro)
7. Update login metadata
8. Return status + auth tokens

Success Response:
```json
{ "status": "active", "plan": "trial", "daysRemaining": 5, "access_token": "...", "refresh_token": "..." }
```

Error Responses:
```json
{ "error": "AUTH_FAILED" }
{ "error": "LICENSE_MISMATCH" }
{ "error": "TRIAL_EXPIRED" }
{ "error": "SUBSCRIPTION_EXPIRED" }
{ "error": "LICENSE_BLOCKED" }
```

### 2. `razorpay-webhook` (POST)
**JWT: Disabled** (webhook, uses signature verification)

- Verifies X-Razorpay-Signature with HMAC-SHA256
- Handles `payment.captured` event
- Finds user by email in payment notes
- Upgrades plan to 'pro'
- Extends subscription if already active
- Plan durations: monthly(30), quarterly(90), half_yearly(180), yearly(365)

### 3. `admin-license` (POST)
**JWT: Disabled** (validates admin email from Bearer token)

Admin actions:
| Action               | Params                    |
|----------------------|---------------------------|
| extend_trial         | target_email, days        |
| extend_subscription  | target_email, days        |
| reset_serial         | target_email              |
| block                | target_email              |
| reactivate           | target_email              |
| downgrade            | target_email              |
| list_all             | (none)                    |
| get_audit_log        | target_email/target_user_id |

## 🔐 Security Architecture

1. **Windows app NEVER has service_role key**
2. **Windows app calls Edge Functions via HTTPS**
3. **Edge Functions use service_role to bypass RLS**
4. **Users cannot modify license fields via direct DB**
5. **Tally serial bound once, cannot be changed without admin**
6. **All actions logged in audit table**
7. **Admin access restricted to whitelisted emails**
8. **Razorpay webhook verified via HMAC signature**

## 🔑 Environment Variables Required

Set in Supabase Dashboard → Edge Functions → Secrets:
- `RAZORPAY_WEBHOOK_SECRET` — From Razorpay Dashboard → Webhooks

## 📱 Razorpay Setup

1. Create Razorpay account
2. Dashboard → Settings → Webhooks
3. Add webhook URL: `https://lcsehcwocqvxrrgbmhcz.supabase.co/functions/v1/razorpay-webhook`
4. Select event: `payment.captured`
5. Copy webhook secret → Set as Supabase Edge Function secret

## 🛡️ Best Practices for Scaling

1. **Rate limiting**: Add rate limiting to Edge Functions (use Deno's built-in)
2. **Caching**: Cache license checks in Windows app (valid for 1 hour)
3. **Offline grace**: Allow app to work offline for 24h with cached license
4. **Webhook idempotency**: Use `razorpay_payment_id` to prevent duplicate processing
5. **Token rotation**: Auth tokens auto-refresh via existing AuthService
6. **Monitoring**: Review `license_audit_log` regularly for suspicious activity
