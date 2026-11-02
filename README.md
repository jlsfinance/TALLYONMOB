# SYNCORA — Tally → Cloud Sync Platform

Tally ERP data (ledgers, vouchers, stock) ko locally se cloud me sync karta hai, aur usko web dashboard + Windows connector + Android app se accessible banata hai.

> Purana naam **LiveKeeping / TallyLink**; code me kahin-kahin purane naam milenge. Product ka current naam **SYNCORA** hai.

---

## 1. Architecture

```
Tally ERP (localhost:9000, XML/HTTP)
        │
        ▼
SYNCORA Connector (C# WPF, Windows)
  • Tally XML reader          • SQLite offline queue
  • license check har cycle   • retry + resume
        │  HTTPS + user JWT
        ▼
Supabase (Postgres + Auth + RLS + Storage + Edge Functions)
        │
        ├── Web Dashboard   (React + Vite + PWA)      → browser / installable
        ├── Android App     (Capacitor wrapper)       → Play Store (closed → production)
        └── Edge Functions  (Deno) + Telegram / web push
```

**License enforcement ka core rule:** license ka sach sirf server jaanta hai. Connector har sync cycle se pehle `validate_user_license` RPC call karta hai; client-side koi flag/date trust nahi hoti.

---

## 2. Repo layout

| Path | Kya hai | Status |
|---|---|---|
| `tally-windows-sync/` | Windows connector (C# WPF + WebView2) | **active** |
| `tally-web-dashboard/` | Web app (React/Vite, `/license` page, PWA) + `android/` Capacitor project | **active** |
| `tally-sync-backend/` | Node/Express REST API | active (secondary) |
| `supabase/` | `migrations/` (source of truth) + `functions/` (Edge Functions) | **active** |
| `.github/workflows/` | `android-release.yml`, `release.yml` | active |
| `docs/` | Design notes, audits, progress logs | reference |
| `BillBookApp-android/`, `tally-mobile-app/`, `telegram-miniapp-site/`, `customer-leads/`, `telegram-mcp/`, `awesome-claude-skills/` | Side projects / experiments | legacy — README se independent |
| `*.BAK-*`, `*-build/`, `*-tests/`, `backups/`, `.snapshots/` | Purane build snapshots aur test scratch | cleanup candidates, kuch bhi delete se pehle confirm karo |

`tallysyncapp/`, `tally_mobile_app/`, `tally-sync-node/` purane attempts hain — naye kaam ke liye use na karo.

---

## 3. License & trial model

**Plans** → `subscription_plans` (`free`, `monthly`, `quarterly`, `yearly`, `enterprise`, `trial`). Trial ka `is_trial = true`, `duration_days = 30`.

**Trial (server-side only).** `auth.users` par trigger `on_auth_user_created` → `handle_new_user()`:
- `user_profiles` row banata hai,
- trial plan milta hai to `user_licenses` + `trial_history` bhi bana deta hai,
- poora trial block `EXCEPTION` me wrapped hai — trial fail ho to bhi signup nahi rukta.

Email signup aur Google OAuth dono isi trigger se cover hote hain. Client trial grant nahi karta (pehle karta tha, hata diya). Dobara trial na mile iske liye `trial_history` check hota hai; `check_trial_eligibility(p_email, p_mobile, p_device_id, p_tally_serial, p_company_gst)` optional duplicate checks deta hai.

**Enforcement.** Connector `validate_user_license` RPC se status leta hai aur in states par blocking overlay dikhata hai:

| State | Behaviour |
|---|---|
| `active` | sync chalta hai |
| trial/paid expired | sync block, **queue delete nahi hoti** |
| `suspended` / `revoked` | sync block + support contact |
| no license | block + Buy Licence |
| network fail | block + "Refresh License Status" (see §9) |

Admin operations `user_profiles.is_admin` par depend karte hain (hardcoded email nahi). `guard_license_updates` trigger user ke apne license writes ko rokta hai; sirf `service_role`/admin badal sakta hai.

---

## 4. Setup

### Prerequisites
- Node.js 18+ (is repo par 24.x tested)
- .NET 8 SDK + Visual Studio 2022 (WPF/WebView2)
- JDK 21 + Android SDK (AAB build ke liye)
- Supabase project access (`pfqmqpboomwtxgyfqnsn` = production)
- Tally ERP `localhost:9000` par XML/HTTP enabled

### Web dashboard
```bash
cd tally-web-dashboard
cp .env.example .env          # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev                   # http://localhost:3000
npm run build                 # dist/ (+ PWA service worker)
```

### Backend
```bash
cd tally-sync-backend
cp .env.example .env
npm install
npm start                     # node src/index.js
```

### Windows connector
```bash
cd tally-windows-sync
dotnet build
dotnet run
```
Publish folder: `publish/syncora-connector-<version>/SyncoraConnector.exe`. Build se pehle `SyncoraConnector.exe` process band karo (file lock).

### Config
- Backend/connector secrets `appsettings.json` me (gitignored); template `appsettings.template.json`.
- Keystore + Play service account `.secrets/` me — **kabhi commit na karo**.

---

## 5. Database / migrations

Supabase CLI v3 linked project use karta hai. **`supabase db push` mat use karo** — remote migration history out-of-sync hai.

```bash
# read-only query
npx supabase@latest db query --linked --read-only -o csv "select 1"

# migration apply (write — confirmation ke saath)
npx supabase@latest db query --linked --yes -f supabase/migrations/<file>.sql
```

Naya migration likhne ka tareeka: `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql`, phir upar wale command se apply. Sab changes idempotent likho (`IF NOT EXISTS`, `CREATE OR REPLACE`).

Core tables: `user_profiles`, `companies`, `company_users`, `ledgers`, `vouchers`, `stock_items`, `user_licenses`, `subscription_plans`, `trial_history`, `sync_queue_logs`.

### RLS notes
- Sab kuch `company_users` membership se scope hota hai; user sirf apni companies dekhta hai.
- Voucher id **company-scoped** hai (`md5(company_id || tally_guid)`). Pehle global `md5(tally_guid)` tha → do companies ke same GUID par `23505`/`42501` aata tha. Naya insert karte waqt isi scoped id ko follow karo.

---

## 6. Release process

### Connector (Windows)
1. `tally-windows-sync/TallySyncApp.csproj` → `<Version>` bump
2. `SyncoraConnector.exe` kill (file lock)
3. `dotnet publish` (ya `tally-windows-sync/create_release.ps1`)
4. `publish/syncora-connector-<version>/` verify → users ko distribute

### Web
`npm run build` → `dist/` (Vercel/hosting par deploy).

### Android (Play Store)
```bash
cd tally-web-dashboard
npm run build
node node_modules/@capacitor/cli/bin/capacitor sync     # npx cap sync is repo me fail hota hai
cd android
./gradlew.bat bundleRelease                            # signed AAB
```
- Verdict: `android/app/build.gradle` → `versionCode` +1 (Play par har upload par zaroori), `versionName` bhi badlo.
- Signing: `android/key.properties` → `.secrets/syncora-upload.jks` (upload key).
- Output: `android/app/build/outputs/bundle/release/app-release.aab`
- Package: `com.syncoraa.app`; Play tracks: `internal`, `alpha` (closed testing), `beta`, `production`.

### Play Console upload (CLI)
Service account: `.secrets/play-service-account.json` (Play Console me release permission chahiye).
```bash
node tally-web-dashboard/android/scripts/upload-play.mjs   # ya neeche wala temp script
```
Manual API call karte waqt do gotchas:
1. Upload URL me `/upload/` hona chahiye:
   `POST https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/<pkg>/edits/<editId>/bundles?uploadType=media`
   (`/upload/` ke bina Google AAB ko JSON samajh kar `Invalid JSON payload` deta hai.)
2. Flow: `edits` insert → bundle upload → `PUT tracks/<track>` → `edits/<id>:commit`.

---

## 7. Environment variables

| Where | Key | Notes |
|---|---|---|
| Web | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | public, RLS protected |
| Backend | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server only |
| Edge Functions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Supabase khud inject karta hai; extra: `TELEGRAM_BOT_TOKEN`, `WEB_PUSH_*`, `REMINDER_WORKER_SECRET` |
| Connector | `appsettings.json` | API base, Supabase URL/key |

Edge Function secrets: `npx supabase@latest secrets list` / `secrets set KEY=value`.

---

## 8. Edge Functions

| Function | Kaam |
|---|---|
| `reminder-delivery` | payment/reminder notifications |
| `desktop-telegram-notify` | desktop alerts → Telegram |
| `telegram-miniapp` | Telegram mini app backend |
| `tg-probe` | Telegram connectivity debug |

(`auto-trial-on-signup` delete ho chuka hai — trial ab `handle_new_user()` trigger deta hai. Us endpoint unauthenticated tha, koi bhi `user_id` bhej kar trial le sakta tha.)

---

## 9. Troubleshooting

| Symptom | Wajah / Fix |
|---|---|
| Connector: **"Licence Verification Failed — connect to the internet"** | Ye license problem nahi hoti, zyadatar `pfqmqpboomwtxgyfqnsn.supabase.co:443` tak TCP fail. Log dekho: `%LOCALAPPDATA%\TallySync\Logs\sync.log`. Network aane par **Refresh License Status**. Hotspot/VPN par ye common hai. |
| Log me `validate_user_license HTTP 401` | Session/token expired. Connector se logout → login. License se related nahi. |
| Google sign-in (connector) kuch nahi karta | PC OAuth fragment (`#access_token=`) capture abhi implement nahi hai — email/password use karo. |
| `npx cap sync` → "could not determine executable" | `node node_modules/@capacitor/cli/bin/capacitor sync` use karo. |
| `cap sync` → "web assets directory (.\www) must contain index.html" | Galat directory se chala rahe ho ya purana `capacitor.config.json` pada hai. `webDir` = `dist`. |
| Vouchers 0 / `42501` | Company-scoped voucher id wala §5 note dekho. |
| Connector build fail (file lock) | `Stop-Process -Name SyncoraConnector -Force` |
| `db push` migration error | `db query -f` se apply karo (§5). |

---

## 10. Security rules

- `.secrets/`, `key.properties`, `.env`, `appsettings.json` — **kabhi commit nahi**. `.env.example` / `appsettings.template.json` hi commit hote hain.
- Service role key sirf server/Edge Functions me; client me sirf anon key.
- License/trial/is_admin jaise decisions server par hote hain; client sirf dikhata hai.
- Naya admin banane ke liye `user_profiles.is_admin = true` (SQL), koi hardcoded email nahi.

---

## 11. Contact

Admin: **Lavneet Rathi** · +91 94138 21007 · support@tallyonmobile.com
