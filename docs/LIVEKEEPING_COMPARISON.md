# LiveKeeping vs SYNCORA: first increment

**Review date:** 14 October 2026  
**Implementation branch:** `feature/livekeeping-inspired-landing-page`  
**Public-facing brand:** SYNCORA. Existing repository paths and technical identifiers remain unchanged.
**First increment:** replace the unauthenticated web landing page with an accessible, mobile-first product overview. No API, authentication, database, Tally sync, billing, or deployment settings are changed.

## Public reference observations

The public homepage presents LiveKeeping as TallyPrime/Tally.ERP 9 access on mobile and web. Visible navigation includes Features, Pricing, Testimonial, FAQs, Connector, Partner with Us, and Login. The homepage organizes its pitch around sales and outstanding visibility, business reports, security, connector setup, feature cards, reviews, plan cards, FAQs, a trial CTA, and a demo-phone form. The demo form was not submitted.

Core public workflows reviewed:

- The [Connector page](https://www.livekeeping.com/connect-livekeeping-to-tally) outlines downloading a Windows connector, signing in and syncing a company, then using the mobile or web app. Its public tutorial and FAQ discuss installation, computer availability, sync timing, multi-company setup, and safety.
- The [Payment Reminder page](https://www.livekeeping.com/features/payment-reminders) describes WhatsApp/SMS/email channels, amount and bill-link autofill, instant or scheduled/repeating delivery, bulk reminders, and a five-step flow from receivables to preview/send.
- The [e-Invoice page](https://www.livekeeping.com/features/e-invoices) describes invoice-based and bulk creation, IRN/QR generation, cancellation within the stated 24-hour window, PDF sharing, and a setup path via a GSP and a company setting.
- The [e-Way Bills page](https://www.livekeeping.com/features/e-way-bills) describes creation from vouchers, Part B/validity updates, a GSP setup, PDF/QR output, and live vehicle/toll tracking.
- The [Pricing page](https://www.livekeeping.com/pricing) has one-year/three-year toggles, Growth/Pro/Pro Plus plans, a feature comparison, and purchase links. Its prices and marketing claims are LiveKeeping's displayed offer and are not copied into SYNCORA.

These are observations about public marketing pages and visible controls, not independent verification of LiveKeeping's private APIs, signed-in product, or backend implementation.

REA captured the public pages using empty browser storage and no login. For the reference Payment Reminder page, a 390×844 screenshot shows a stacked mobile layout; the top announcement text runs beyond the visible edge and the lower trust strip is partly obscured by the floating WhatsApp control. This is a visual observation, not a DOM-width assertion. SYNCORA's replacement page was rendered and interaction-tested locally at 390×844 and 1440×1100; at 390px there was no horizontal overflow, the menu opened/closed and navigated to the Features section, and the FAQ accordion expanded.

At the inspected desktop viewport, the reference page declared `width=device-width, initial-scale=1.0`. The Payment Reminder page's document width exceeded its client width in the earlier browser inspection; this is a viewport-specific observation, not an inference about the product's full responsive behavior.

## Feature comparison and priority

| Product area | LiveKeeping public evidence | SYNCORA repository evidence | Assessment / priority |
| --- | --- | --- | --- |
| Public product landing and navigation | Homepage links to features, pricing, testimonials, FAQs, connector instructions, login, trial, download, and demo actions. | Existing unauthenticated route rendered `src/pages/LandingPage.tsx`; it contained a feature grid, flow, FAQ, and plan cards but also unverified scale/security metrics and plan copy that conflicted with the actual `/pricing` page. | **Implemented first:** replace the landing surface with source-aligned capabilities, links to existing routes, accessible FAQ, and responsive navigation. Signed-in root redirect remains unchanged. |
| Tally connector onboarding | Public page outlines downloading a Windows connector, selecting/syncing a company, then using mobile/web. | Windows sync projects, incremental-sync notes, and dashboard Tally Sync screen exist. The web screen checks local Tally connectivity and supports exporting selected vouchers. Sync docs have inconsistent cadence descriptions (15 minutes/manual in `INCREMENTAL_SYNC.md` versus 5 minutes in `ARCHITECTURE.md`). | **Partial; high value.** Landing page adds a high-level, source-aligned 3-step overview. A dedicated public setup guide, consistent diagnostics, and confirmed cadence remain open. |
| Mobile and web access | Reference explicitly promotes both mobile and web. | Repository contains a React dashboard and Android/mobile app work. Auth context and protected routes gate company workspaces. | **Present in repository.** Mobile release parity/availability need separate build/release verification; the new page avoids unverified app-store or download claims. |
| Dashboard, reports, ledger, outstanding and inventory | Reference advertises 35+ reports, ledger statements, ageing, stock reports, and business totals. | Dashboard, report, ledger, ageing, stock, sales, purchase and voucher screens/routes are present. | **Present, breadth not independently counted.** Landing links to current workspaces and avoids repeating the unverified “35+ reports” number. |
| Vouchers and accounting entries | Reference says users can create/share vouchers, quotations and ledgers from mobile; tiers distinguish read-only from entry creation. | Voucher listing/detail, create/edit voucher pages, invoice pages, and Tally export screen are present in the web app. | **Present in code;** plan entitlement behavior should be verified against live licensing. |
| Payment reminders | Reference describes scheduled/repeating reminders across WhatsApp, SMS and email, with bill links, bulk actions and preview. | `PaymentRemindersPage.tsx` reads outstanding ledgers, offers templates, supports multi-select, and opens WhatsApp/email/share intents. It does not implement unattended schedule delivery; email is a `mailto:` action, and SMS sending is absent from this screen. | **Partial; high value.** A persisted schedule/worker and supported delivery providers are needed. Market only the current share-based workflow until then. |
| E-way bill / e-invoice compliance | Public pages claim voucher-based e-way bill creation, GSP setup, IRN/QR issuance, PDF sharing and live tracking. | `EWayBillPage.tsx` builds a timestamp-derived local reference and explicitly comments that production would call the GST API. The screen title mentions e-invoice, but inspected code does not establish official IRN issuance, PDF signing or vehicle tracking. | **Critical production gap.** Do not claim statutory issuance. Needs a verified gateway/provider, credential handling, status reconciliation, and compliance review. |
| Data backup and restore | Reference describes scheduled backups, dated logs, and emailing a backup. | `DataBackupRestorePage.tsx` seeds example history in constants, simulates progress with random timers, exports a sample JSON placeholder, handles restore with a toast and a comment that a real restore is not yet implemented, and says data is stored locally in the browser. | **Demo-only prototype; high priority.** Implement real scoped export, durable backup storage, restore preview/commit, audit trail and recovery tests before making backup assurances. |
| Pricing and plans | Public reference shows three plans, term toggles, comparisons, and purchase links. | `/pricing` owns SYNCORA's current plan catalog and subscription actions. The former landing page separately declared Starter/Professional/Enterprise prices/features that did not match `/pricing`. | **Existing page retained.** New landing page links to `/pricing`; no billing behavior or plan data was changed. |
| Reviews and trust badges | Reference homepage displays review scores and security certification badges. | No verified current review feed or certification evidence was found in the landing-page source. | **Not copied.** Avoid third-party ratings/certification claims without first-party evidence. |

## Recommended next implementation order

1. **Statutory GST workflows (e-way bills and e-invoices):** largest trust/compliance risk because the visible SYNCORA implementation is currently a local demo reference, not a verified government/GSP transaction. First select an authorized provider and define credentials, cancellation, retries and audit requirements; only then implement.
2. **Scheduled payment reminders:** highest repeated user value after compliance. Add explicit customer opt-in, timezone/repeat rules, durable jobs, delivery-provider integration, stop-on-payment behavior, and delivery logs; do not present a schedule toggle without a working backend worker.
3. **Real backup/restore:** protect accounting records with a tested export format, durable storage, restore preview, safe merge/replace semantics, access controls and recovery drills. The current screen is demonstrative only.
4. **Connector onboarding and diagnostics:** resolve the contradictory cadence in repository docs; provide a public Windows setup guide, connection checks, last-sync/health/errors and recovery steps without changing the existing sync contract.
5. **Plan/catalog hygiene:** retain `/pricing` as the single source of truth; verify feature entitlements against license behavior before advertising plan-level distinctions.

## Repository boundary audit

- `AGENTS.md` and `tally-web-dashboard/AGENTS.md` were reviewed. Dashboard instructions emphasize preserving the backend contract and consulting current SDK docs before changing backend integration code. No backend integration code changed.
- `ARCHITECTURE.md`, `INCREMENTAL_SYNC.md`, `tally-sync-backend/src/routes/syncRoutes.js`, and `src/pages/TallySyncPage.tsx` were reviewed. They describe Tally XML/local connectivity, Windows-to-cloud sync, incremental/upsert behavior, and selected voucher export. No sync route, payload, cadence, or Tally XML contract changed.
- Dashboard auth uses the existing Supabase client/session, company loading, `company_users` role lookup, and protected routes. `tally-sync-backend/src/middleware/auth.js` validates Supabase bearer tokens for user requests and sync credentials for sync routes. No auth calls, redirects, or credential handling changed; feature links still point to existing protected routes.
- `tally-sync-backend/supabase_schema_complete.sql` defines companies, memberships, ledgers, vouchers and sync state, with RLS enabled for accounting tables. No live database was queried or changed; no schema or migration is part of this increment. No Firebase or Supabase records were accessed.
- `tally-web-dashboard/vercel.json` retains the existing SPA/API routes. `firebase.json` only points to Firestore rules/indexes. Neither deployment setting changed; nothing was deployed. Preview used a dummy loopback-only Supabase URL and never reached a configured backend.

## REA and evidence boundary

`npx rea-agents setup` completed and installed the REA reverse-engineering skill plus a Codex MCP registration; `rea doctor --client codex --json` reported that registration aligned. REA was also enabled for this workspace and used to collect public-page evidence. The browser scenarios used empty cookie/local/session storage, disabled request/response-body capture, did not submit the demo form or visit checkout, and did not retrieve script sources. Evidence supports claims about rendered public pages and visible controls only; it does not establish private APIs, authenticated behavior, or backend implementation.

Evidence IDs: homepage DOM/title/visible structure `ev_b409b02e41b13974dcdf52c6f805cbc21ac355816d847de6b273c3395cf15436` (target listing `ev_88a8ed6793f513631ccf8f771cd59522071ebf04c02a1d3d768a0b2ef737c9f7`); connector setup `ev_a7cac8c94da68f13b0bb5b52e932048b591ceab45d28a96d603b1158da7cd4ed`; payment reminders, 390×844 mobile capture `ev_5fe3d792b3b9798eb18a8ba33d93e4012dcbba655d21900b13dfea31f1612cec`; e-invoices `ev_5262f79407a42a52a161374c43b65345e8831714d14efe7e41041eac6cf19340`; e-way bills `ev_198ae95cd46e319557271416e1eac5422bf80414c5614cf235b410037aaf20cc`; pricing `ev_2ce7eea81e8ff984fac72bd8b5027173f7cbf50df64dca412280019e80587b5a`.

The landing-page implementation does not reuse LiveKeeping's proprietary source, images, or exact copy. It is an original presentation of SYNCORA's own existing routes and capabilities.

## Evidence sources

- [LiveKeeping homepage](https://www.livekeeping.com/) — public navigation, product pitch, feature outline, trial/demo calls to action and trust claims.
- [LiveKeeping pricing](https://www.livekeeping.com/pricing) — visible plan cards, billing-term toggle, comparison grid and purchase links.
- [LiveKeeping connector setup](https://www.livekeeping.com/connect-livekeeping-to-tally) — public setup description and connector FAQ.
- [LiveKeeping payment reminders](https://www.livekeeping.com/features/payment-reminders) — public channels, scheduling, bulk and step-by-step reminder flow.
- [LiveKeeping e-invoices](https://www.livekeeping.com/features/e-invoices) — public claims about IRNs, QR codes, GSP setup and voucher-linked issuance.
- [LiveKeeping e-way bills](https://www.livekeeping.com/features/e-way-bills) — public claims about GSP setup, voucher-linked bills and vehicle tracking.
- Repository evidence: `tally-web-dashboard/src/pages/LandingPage.tsx`, `PricingPage.tsx`, `PaymentRemindersPage.tsx`, `EWayBillPage.tsx`, `DataBackupRestorePage.tsx`, `TallySyncPage.tsx`, `src/contexts/AuthContext.jsx`, `src/lib/insforge.js`, `tally-sync-backend/src/routes/syncRoutes.js`, `tally-sync-backend/src/middleware/auth.js`, `tally-sync-backend/supabase_schema_complete.sql`, `ARCHITECTURE.md`, and `INCREMENTAL_SYNC.md`.
