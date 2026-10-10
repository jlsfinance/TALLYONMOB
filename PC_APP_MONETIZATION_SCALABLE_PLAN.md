# TallyLink PC App — Monetization, Serial Binding & Scalable Sync Plan

**Repository:** `jlsfinance/TALLYONMOB`  
**Working branch:** `feature/web-dashboard-full-pagination`  
**Audit date:** 10 October 2026  
**Status:** Planning only — इस document के आधार पर अलग-अलग phases में implementation होगी।

---

## 1. Executive summary

TallyLink में licensing का basic foundation पहले से मौजूद है, लेकिन इसे बड़े user base के लिए सुरक्षित, scalable और commercially reliable बनाने के लिए **serial binding, device binding, subscription entitlements, payment webhooks, sync quotas और observability** को एक consistent control-plane में लाना होगा।

Recommended product model:

> **One account → one or more companies → plan-based sync entitlements → controlled Tally serial binding → limited registered Windows devices.**

Serial number को अकेले security boundary नहीं बनाना चाहिए। सही model होगा:

```text
Authenticated account
        +
Active subscription/trial
        +
Bound Tally serial
        +
Registered device(s)
        +
Server-side entitlement check
        =
Allowed sync session
```

---

## 2. Audit finding — क्या अभी serial number माँगा जा रहा है?

### Short answer: हाँ, मौजूदा PC app Tally serial number ले रहा है और validate कर रहा है।

लेकिन यह user से सामान्य text field में manually नहीं माँगता। App Tally से serial अपने-आप पढ़ता है:

- `tally-windows-sync/Services/TallyConnector.cs`
- Tally XML में `SVSERIALNUMBER`/serial field पढ़ी जाती है।
- Value local settings में `TallySettings.SerialNumber` के रूप में रखी जाती है।
- First run पर serial capture होती है।
- अगली बार mismatch मिलने पर warning आती है।
- Current UI में user mismatch पर serial update करने की अनुमति दे सकता है।

### Existing license validation

`LicenseService.cs` में PC app:

- `validate-license` Supabase Edge Function call करता है।
- Authenticated user/session भेजता है।
- Tally serial भेजता है।
- Active, trial, expired, suspended, no-license और serial mismatch responses handle करता है।
- `MainViewModel.StartSync()` से पहले `IsLicenseValid` और serial check देखे जाते हैं।

### Existing database foundation

Repository में पहले से ये structures मौजूद हैं:

- `subscription_plans`
- `user_licenses`
- `trial_history`
- `payments`
- `coupons`
- `license_transfers`
- `sync_devices`
- `sync_runs`
- `sync_conflicts`
- `validate-license` Edge Function
- `validate_user_license` और `bind_tally_serial` database functions

इसका मतलब है कि system को zero से बनाना नहीं है; मुख्य काम **consolidation, security hardening और production enforcement** है।

### Owner/admin को user की serial confirm करने की जरूरत

Business owner की जरूरत यह है कि वह किसी user की Tally serial binding confirm कर सके। यह feature बनेगा, लेकिन पूरी serial key को सामान्य list/API/UI में खुला दिखाना सुरक्षित नहीं होगा। Recommended confirmation flow:

1. Admin panel में user, company और device के साथ **masked serial** दिखे, जैसे `TLY-****-4821`।
2. User को app में स्पष्ट consent और **“Verify my Tally serial”** action दिखे।
3. Admin masked value के साथ binding status, first-bound time, last validation और device status देख सके।
4. Full serial की जरूरत होने पर केवल authorized support/admin action से temporary reveal हो, reason मांगा जाए और audit log बने।
5. Normal exports, analytics, logs और error messages में raw serial कभी न आए।
6. Confirmation के लिए user से app में दिख रही serial का consented confirmation लिया जाए; किसी दूसरे user की raw serial बिना authorization share नहीं की जाएगी।

इस requirement को **Phase 1: Serial binding hardening** का explicit deliverable माना जाए: `Serial Binding & Admin Visibility`। Test/demo के लिए production serial की जगह dummy value जैसे `TEST-TALLY-0001` इस्तेमाल की जाएगी।

---

## 3. Important gaps और risks

### P0 — Serial/license data model consistency

PC के `ApiClient.UpdateUserTallySerialAsync()` में update target `licenses` table दिख रहा है, जबकि main licensing migration `user_licenses` table पर आधारित है। यह production में अलग-अलग environments में serial save न होने या गलत table update होने का कारण बन सकता है।

**Action:** एक canonical table चुनें: `user_licenses`। पुराने `licenses` table को migrate/deprecate करें।

### P0 — User-driven serial replacement अभी बहुत permissive है

Mismatch पर PC app user को serial update करने देता है। Commercial product में यह automatic नहीं होना चाहिए। Serial transfer/replacement के लिए:

- server-side transfer request
- cooldown/rate limit
- admin approval या verified self-service flow
- audit log

जरूरी होंगे।

### P0 — Device fingerprint column है, लेकिन complete device registration flow नहीं है

`user_licenses.device_fingerprint` मौजूद है और `sync_devices` table भी मौजूद है, लेकिन Windows app के लिए robust:

- device ID generation
- registration
- revoke
- device limit enforcement
- heartbeat
- reinstall/recovery flow

अभी complete end-to-end नहीं दिखता।

### P0 — License check client-side state पर निर्भर है

`IsLicenseValid` memory/UI state में है। Sync API/server को भी entitlement enforce करना होगा, ताकि modified client old token या bypassed UI से unlimited sync न कर सके।

### P1 — Edge Function में client application के अंदर fixed Supabase anon key है

Anon key secret नहीं होती, लेकिन endpoint/config को binary में hard-code करने से rotation, environment separation और abuse control मुश्किल होते हैं। Future version में config/versioned endpoint और server-side rate limits जोड़ें।

### P1 — Trial abuse controls incomplete हो सकते हैं

Trial history में email, mobile, device, serial, GST/PAN और IP fields हैं, लेकिन trial eligibility को multiple signals के साथ consistently enforce करना होगा। केवल email-based trial पर्याप्त नहीं होगा।

### P1 — Payment gateway webhook-driven नहीं दिखता

`payments` और plans मौजूद हैं, लेकिन paid subscription को reliable बनाने के लिए payment provider webhook को source of truth बनाना होगा। Browser/client से सीधे license activate नहीं होना चाहिए।

### P1 — Plan features अभी mostly metadata हैं

`features` JSON मौजूद है, लेकिन sync frequency, company count, device count, retention, monthly records और support entitlements को server-side quota checks में बदलना बाकी है।

---

## 4. Recommended commercial model

### Starter / Trial

- 7-day trial
- 1 company
- 1 Windows device
- limited sync frequency
- basic dashboard
- read-only grace period after expiry

### Basic

- monthly/quarterly/yearly billing
- 1–2 companies
- 1 registered Tally serial
- 1–2 Windows devices
- standard sync interval
- core dashboard and reports

### Pro

- multiple companies
- 2–5 registered devices
- faster sync interval
- advanced reports, exports, alerts
- priority support
- controlled serial transfer

### Business / Dealer

- multiple users and companies
- dealer/reseller management
- higher quotas
- central admin and audit logs
- custom support/SLA
- optional white-label later

> Existing plan prices (`₹299 monthly`, `₹799 quarterly`, `₹1,499 half-yearly`, `₹2,999 yearly`, `₹9,999 lifetime`) को launch से पहले market validation, GST handling, gateway fees और support cost के आधार पर review करना होगा। Lifetime plan को unlimited cloud cost के कारण carefully cap करना चाहिए।

---

## 5. Phased implementation roadmap

## Phase 0 — Inventory, contract और environment lock

**Goal:** आगे का work गलत table/old endpoint पर न बने।

### Tasks

- `licenses` और `user_licenses` tables का production schema compare करना।
- सभी environments में canonical Supabase project confirm करना।
- `validate_user_license`, `bind_tally_serial` और `validate-license` के actual deployed versions verify करना।
- Existing users, licenses, plans और payments का backup/export लेना।
- API contracts लिखना:
  - validate license
  - register device
  - heartbeat
  - revoke device
  - request serial transfer
  - entitlement check
- Secrets को repository/client code से अलग रखना।

### Exit criteria

- एक canonical license table।
- एक canonical user/company ownership model।
- हर endpoint का request/response contract।
- rollback और data migration plan।

---

## Phase 1 — Serial binding hardening

**Goal:** एक paid account को unauthorized Tally installation पर freely move न किया जा सके।

इस phase में admin को user की serial binding **confirm करने का सुरक्षित तरीका** भी मिलेगा; इसका अर्थ raw serial को सभी admins या सभी screens पर खोल देना नहीं है।

### Tasks

- `user_licenses.tally_serial` को normalized form में store करना।
- Serial hash और masked display value रखें; raw serial केवल जरूरत के secure server operation में उपयोग करें।
- First activation केवल server transaction से हो।
- Mismatch पर PC app केवल block + transfer request दिखाए।
- Self-service transfer policy define करें:
  - free transfer count, जैसे 1 per 30 days
  - hardware replacement proof/OTP
  - admin override
  - audit log
- Existing local `TallySettings.SerialNumber` को cache मानें, authority नहीं।
- Serial change पर सभी active device sessions invalidate करने का विकल्प।

### Acceptance criteria

- User local JSON edit करके दूसरे serial पर sync नहीं कर सकता।
- Old serial और new serial दोनों का audit trail रहता है।
- Concurrent activation race condition में केवल एक binding succeed होती है।

---

## Phase 2 — Windows device registration and binding

**Goal:** serial के साथ actual PC device भी control करना।

### Device identity

- Install पर cryptographically random installation ID generate करें।
- Windows Credential Manager/DPAPI में private device secret रखें।
- Raw hardware identifiers को primary identity न बनाएं; privacy और hardware-change समस्याएं होती हैं।
- Server record:
  - `device_id`
  - `license_id`
  - `company_id`
  - masked device name
  - app version
  - platform
  - last seen
  - status: active/revoked

### Tasks

- `POST /device/register`
- `POST /device/heartbeat`
- `POST /device/revoke`
- dashboard में active devices list
- revoke और re-register flow
- device limit per plan
- uninstall/reinstall recovery via verified account flow

### Acceptance criteria

- Free plan का second device server-side reject हो।
- Revoked device अगले heartbeat/sync पर block हो।
- Device name/OS/app version support में दिखे।
- Offline grace period documented और enforced हो।

---

## Phase 3 — Server-side sync entitlement enforcement

**Goal:** client UI bypass होने पर भी sync limits लागू रहें।

### Entitlements

हर sync request से पहले server verify करे:

- account authenticated है?
- license active/trial valid है?
- Tally serial bound है?
- device active है?
- company user के account में है?
- plan में यह feature enabled है?
- quota exceeded तो नहीं?
- app version supported है?

### Quotas

- max companies
- max devices
- sync interval minimum
- daily/monthly record limit
- storage/data retention
- API calls
- conflict/support limits

### Acceptance criteria

- All sync writes server-side entitlement middleware से गुजरें।
- Client में केवल UX gate हो; security decision server का हो।
- Rate limit और idempotency लागू हो।
- Failed entitlement checks meaningful error codes दें।

---

## Phase 4 — Payments and subscription lifecycle

**Goal:** payment के बाद license automatically और safely activate/renew हो।

### Flow

```text
User selects plan
  → server creates order/payment intent
  → gateway checkout
  → gateway webhook verifies payment
  → server creates/extends license
  → entitlement cache updated
  → PC/dashboard sees active plan
```

### Tasks

- Razorpay/Stripe जैसे gateway में से एक चुनना।
- `payments` table में gateway order ID और payment ID uniqueness।
- Signed webhook verification।
- Idempotent webhook handler।
- Failed, refunded, chargeback, cancelled और expired states।
- GST invoice number और invoice URL।
- Auto-renewal केवल explicit consent के बाद।
- Renewal reminders: email/WhatsApp/push।
- Coupon validation server-side।

### Acceptance criteria

- Client सीधे `user_licenses` को active नहीं कर सकता।
- Same webhook दो बार आने पर duplicate days/payment/license नहीं बनती।
- Refund पर entitlement policy predictable है।
- Payment receipt और invoice user dashboard में दिखते हैं।

---

## Phase 5 — Download, onboarding और activation funnel

**Goal:** ज्यादा लोग safely download करके first sync तक पहुँचें।

### Download experience

- Public landing/download page।
- Windows installer और version manifest।
- SHA-256 checksum और signed installer।
- Latest stable / beta channels।
- Release notes।
- Smart deep link: download → install → login → Tally detect → serial bind → trial start → first sync.

### PC onboarding

1. Install app
2. Login/create account
3. Tally connection diagnostics
4. Company detect
5. Serial preview: masked serial दिखाएँ
6. Accept binding terms
7. Trial/plan eligibility check
8. Device registration
9. First sync wizard
10. Dashboard link and support

### Growth metrics

- download to install
- install to login
- login to Tally connected
- Tally connected to first sync
- trial to paid conversion
- failed activation reason
- churn and renewal rate

---

## Phase 6 — Scale, operations और support

**Goal:** हजारों users/devices के बाद भी reliable operation।

### Tasks

- Background jobs for expiry, reminders, cleanup और aggregation।
- Queue-based sync और retry policy।
- Observability:
  - activation errors
  - license mismatch
  - sync latency
  - failed batches
  - webhook failures
  - device churn
- Admin console:
  - license search
  - user/company/device view
  - serial transfer approval
  - revoke/reactivate
  - payment history
  - audit log
- Data protection:
  - least-privilege RLS
  - no service role in client
  - secret rotation
  - PII masking
  - export/delete policy
- Disaster recovery and restore drills.

### Scale targets

पहले launch में targets define करें, उदाहरण:

- 99.5% successful sync completion
- license validation p95 < 500 ms
- webhook processing p95 < 2 s
- duplicate sync write rate = 0
- support-visible error correlation ID = 100%

---

## 6. Suggested database additions

Implementation के समय migration में निम्न entities जोड़ने/सुधारने पर विचार करें:

- `license_entitlements`
- `license_activation_events`
- `device_registrations`
- `serial_transfer_requests`
- `payment_orders`
- `payment_webhook_events`
- `usage_counters`
- `sync_rate_limits`
- `app_releases`
- `support_cases`

Existing `sync_devices` को reuse किया जा सकता है, लेकिन उसे `license_id`/`user_id` और strict ownership rules से जोड़ना होगा। नई table तभी बनाएं जब current control-plane schema पर्याप्त न हो।

---

## 7. Security rules — non-negotiable

- Client में service-role key कभी नहीं।
- License active करने का अधिकार केवल server/webhook/admin service को।
- Raw Tally serial को logs, analytics और UI में expose न करें।
- Serial को authorization का अकेला factor न बनाएं।
- Device private secret को DPAPI/Credential Manager में रखें।
- Every transfer/revoke/renew action audit करें।
- Rate limit login, license validation, activation और webhook endpoints।
- Offline mode को limited grace period तक रखें; unlimited offline sync नहीं।
- Terms, privacy policy, refund policy और GST invoice flow को code behavior से align करें।

---

## 8. Recommended implementation order

सबसे पहले ये तीन काम करने चाहिए:

1. **Canonical licensing audit/migration** — `licenses` vs `user_licenses` inconsistency ठीक करना।
2. **Serial transfer + device registration** — automatic overwrite हटाकर controlled binding बनाना।
3. **Server-side entitlement middleware** — actual sync writes को plan/device/license checks के पीछे रखना।

Payment gateway और public growth page इसके बाद जोड़ें। अगर payment पहले जोड़ दिया और entitlement enforcement बाद में किया, तो paid users की access inconsistent होगी और support load बढ़ेगा।

---

## 9. Definition of done for commercial launch

Commercial public launch तभी करें जब:

- trial, paid, expired और refunded states tested हों।
- serial mismatch और transfer flow tested हो।
- device revoke अगले sync पर लागू हो।
- payment webhook idempotency tested हो।
- server-side sync limits verified हों।
- installer signed और checksum-published हो।
- logs में raw password, anon token, raw serial या payment secrets न हों।
- backup/restore और rollback documented हो।
- support/admin workflow available हो।
- staging environment में at least one full purchase-to-sync rehearsal complete हो।

---

## 10. Immediate next step

**Phase 0** से शुरुआत करें: production schema और deployed functions की read-only audit, फिर `user_licenses` को canonical बनाकर migration तैयार करें। इसके बाद ही paid activation या public distribution को enable करें।
