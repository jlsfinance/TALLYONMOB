# Tallyonmob Professionalization — Roadmap & Execution Guide

**Maqsad:** App ko consistent, trustworthy aur polished banana—company setup se le kar Tally sync, invoices aur business reports tak.

**Roadmap rule:** Har phase shuru hote waqt status `In progress` karo; phase ke code, tests aur review complete hone par `Complete` karo. Roadmap update ko us phase ke code commit ke saath GitHub par push karo. GitHub local file edits ko khud se live-sync nahi karta—commit aur push ke baad hi update dikhega.

## GitHub aur branch ki current position

| Item | Current value |
|---|---|
| Repository | [jlsfinance/TALLYONMOB](https://github.com/jlsfinance/TALLYONMOB) |
| Default branch | `allok` |
| Current delivery branch | `feature/professional-roadmap-phases` |
| Current branch par | Phase 1 aur Phase 2 pushed hain; branch `allok` mein abhi merge nahi hui |
| Roadmap file | [`PROFESSIONAL_ROADMAP.md`](https://github.com/jlsfinance/TALLYONMOB/blob/feature/professional-roadmap-phases/PROFESSIONAL_ROADMAP.md) |

**Phase 3 ke liye base:** Abhi `feature/professional-roadmap-phases` use karo, kyunki Phase 1/2 us branch par hain aur default `allok` mein merge nahi hue. Agar baad mein ye changes `allok` mein merge ho jaate hain, to uske baad ke feature branches latest `allok` se banao. Har agla phase us branch se start ho jo usse pehle ke saare completed phases rakhta ho—stale `allok` se aisi branch mat banao jisme Phase 1/2 missing ho.

## Branch, commit aur GitHub update ka tareeqa

Har nayi phase ke liye alag feature branch aur clear commit rakho. Isse review/revert karna aasaan rahega. Current Phase 1/2 branch ka naam preserve karo; planned next branch names neeche har phase mein diye hain.

```bash
# Phase 3 ka current safe base: is task ki pushed branch
cd /home/ubuntu/TALLYONMOB
git fetch origin
git switch feature/professional-roadmap-phases
git pull --ff-only origin feature/professional-roadmap-phases
git switch -c feature/phase-3-guided-onboarding
```

Phase 4/5/6 shuru karte waqt unke section mein diya branch naam use karo, aur branch ko **latest branch containing previous phases** se base karo. Agar Phase 1/2 default mein merge ho chuke hon, latest `allok` lo; warna previous phase branch lo.

```bash
# Har phase ke end par
cd /home/ubuntu/TALLYONMOB/tally-web-dashboard
npx tsc --noEmit
npm run build
cd ..
git diff --check
git add <phase-ke-files> PROFESSIONAL_ROADMAP.md
git commit -m "feat: phase N <short-name>"
git push -u origin <phase-branch>   # us branch ka pehla push
git push                            # uske baad ke pushes
```

- Phase shuru hone par roadmap status aur scope push karo; implementation milestones par updates do; completion tabhi mark karo jab checks pass hon.
- Har phase ke code + roadmap update ko GitHub par push karo. Direct `allok` par kaam/push na karo; merge ke liye phase branch se reviewable PR banao.
- Database schema change ho to migration file aur rollback/impact review include karo. Company delete ya doosre destructive business action ko live customer data ke saath test mat karo.
- Real Tally machine par sync ka manual test alag se karo; mocked smoke test ko live-device verification mat samjho.

## Phase 1 — Core experience foundation

**Status:** Complete · **Branch:** `feature/professional-roadmap-phases` · **Delivery:** [`46a7ee7`](https://github.com/jlsfinance/TALLYONMOB/commit/46a7ee7), dashboard restore [`b448d76`](https://github.com/jlsfinance/TALLYONMOB/commit/b448d76)

### Kya deliver hua
- Light/dark/system theme switching aur initial page theme ko consistent kiya.
- Company selector polish retain ki; dashboard page aur shell spacing ko user feedback ke baad pre-redesign baseline par restore kiya.
- Company deletion ko owner-verified, atomic RPC ke peeche rakha; false success ke bajay clear result dene ka flow banaya.
- Database migration `20261010050343_delete_company_data_rpc` apply karke live function verify kiya. Migration apply se koi company delete nahi hui.

### Kaise implement hua
- Theme provider, initial page theme aur app-shell surface tokens aligned rakhe; dashboard content ko pre-redesign snapshot se restore kiya.
- Company cleanup ke liye allow-listed tables aur FK order ke saath database function use kiya; `companies.id` ke live `text` type ke saath match kiya.
- Company selector/Auth state ko successful deletion ke baad reset/refresh kiya.

### Completion checks
- `npx tsc --noEmit` pass.
- `npm run build` pass.
- Supabase metadata check: `delete_company_data(p_company_id text)`, authenticated execute allowed, anon execute denied.

## Phase 2 — Tally Sync Center

**Status:** Complete · **Branch:** `feature/professional-roadmap-phases` · **Delivery:** [`6a2c33d`](https://github.com/jlsfinance/TALLYONMOB/commit/6a2c33d)

### Kya deliver hua
- Ek hi connection state: checking, connected, offline ya not checked; retry aur last-check feedback.
- Tally port validation aur browser storage mein persistence.
- Voucher query error, genuinely empty list aur search-no-match ko alag states mein dikhaya.
- Voucher search, visible-items selection, single/batch export aur accessible batch progress.
- Partial success/failure summary, voucher-level errors, dark-mode-friendly responsive layout.
- Single aur batch exports dono configured port use karte hain; batch XML mein selected company context bhi jaata hai.
- Company switch/overlapping voucher requests ke liye stale response guard.

### Kaise implement hua
- `TallySyncPage.tsx` ko ek authoritative connection state aur separate voucher loading/error states par rakha.
- `tallyExportService.ts` mein optional port parameter add karke purana default port `9000` preserve kiya.
- Sync shuru karne se pehle connected state check ki; sync ke dauran port aur concurrent selection actions lock kiye.

### Completion checks
- `npx tsc --noEmit` pass.
- `npm run build` aur PWA build pass.
- Mocked batch-export smoke test: custom port, company XML context aur progress callback pass.
- Live Tally device par abhi manual verification baaki hai; operator Tally ko apne device par chala kar final end-to-end test kare.

## Phase 3 — Guided onboarding aur first sync

**Status:** Implemented · manual onboarding/Tally-device validation pending · **Branch:** `feature/stock-item-tabs-rebuild`.

### Kya banana hai
- First-time user ke liye short setup wizard: company select/create, Tally connection verify, first sync tak le jaana.
- Progress, next/back, skip-for-now aur baad mein resume karne ka option.
- Existing users ke liye wizard optional ho; unke normal dashboard workflow ko block na kare.
- Har step par simple Hindi/English-friendly hints, errors aur retry action.

### Kaise implement karna hai
1. Existing auth, company selection aur Tally connection flows ko pehle map karo; duplicate company/account record create na karo.
2. Wizard steps ko reusable UI components mein rakho; current company/AuthContext state ko single source of truth rakho.
3. Progress ko user/company ke scope mein persist karo; logout, company switch aur incomplete setup ka behavior define karo.
4. Tally connection ke liye Phase 2 ka shared behavior reuse karo. Real voucher export ko user ki explicit selection/confirmation ke bina auto-run mat karo.
5. Mobile layout, keyboard navigation, loading/error/skip/resume states test karo.

### Completion checks
- New user guided steps complete kar sake aur existing user skip/reopen kar sake.
- Refresh/session resume par duplicate company ya duplicate sync na bane.
- Tally offline, network error aur retry cases verify hon.
- TypeScript, production build, aur company/auth regression checks pass hon.

## Phase 4 — Branded invoice preview aur PDF/export

**Status:** Implemented · sample PDF/print validation pending · **Branch:** `feature/stock-item-tabs-rebuild`.

### Kya banana hai
- Company logo/name/contact/GSTIN ke saath polished invoice template aur A4 print/PDF preview.
- Invoice number/date, customer, line items, tax/discount, grand total, terms, payment details aur optional signature ko clear hierarchy mein dikhana.
- Download, print aur share actions; missing optional company branding ke liye clean fallback.
- Existing default/professional invoice template aur uski logic ko untouched rakhte hue naya Branded template selector se optional banana.

### Kaise implement karna hai
1. Pehle existing invoice preview, PDF/print utilities aur company profile fields inspect karo; naya duplicate renderer tabhi banao jab existing flow reuse na ho sake.
2. Data mapping ko current voucher/invoice schema se validate karo; total/tax calculations ko UI mein dobara calculate karke mismatch create na karo.
3. A4 page breaks, long customer/item names, multi-page invoices, empty logo, missing GSTIN aur zero-tax cases cover karo.
4. PDF mein user/company data hi dikhayein; debug data, secrets ya unrelated account information include na ho.

### Completion checks
- Screen preview, downloaded PDF aur printed page par amounts/fields match hon.
- Mobile par preview usable ho aur PDF paper layout A4 rahe.
- Sample invoices (taxable, non-taxable, many items, missing branding) validate hon.

## Phase 5 — Business insights aur report experience

**Status:** In progress · **Branch:** `feature/phase-5-business-insights` · **Base:** current branch containing Phase 1–4 work.

### Kya banana hai
- Selected financial year ke sales/purchase trends aur pichhle period se comparison.
- Receivables/payables ageing aur overdue follow-up actions.
- Top customers/suppliers aur inventory movement/low-stock signal—sirf jab source fields reliable hon.
- Dashboard insight card se related detailed report tak seedha navigation.

### Kaise implement karna hai
1. Existing report pages, voucher columns, financial-year rules aur aggregates inspect karo; pehle data definition likho.
2. Dashboard totals aur detailed report totals ko same date range, company ID, deletion status aur currency rules se calculate karo.
3. Queries ko selected company/FY tak limit karo; large transaction set ko unnecessary client memory mein load na karo.
4. Trend/insight unavailable ho to fabricated zero ya unsupported AI claim na dikhao; empty/error state show karo.

### Completion checks
- Dashboard aur reports ke totals selected company/FY par reconcile hon.
- No-data, large-data, loading, permission aur query-error cases clear hon.
- Keyboard, chart labels, mobile layout aur dark-mode contrast verify hon.

## Phase 6 — QA, accessibility aur release hardening

**Status:** Planned · **Branch:** `feature/phase-6-release-hardening` · **Base:** Phase 5 branch, ya latest `allok` jab pehle phases merge ho jaayen.

### Kya karna hai
- Theme/company switch/delete, Tally connection, voucher export, invoice PDF aur dashboard reports ke repeatable automated checks.
- Mobile/tablet/desktop, keyboard navigation, focus states, screen-reader labels, empty/error/retry paths ka audit.
- Performance, PWA/offline behavior, chunk/load errors aur release checklist.

### Kaise implement karna hai
1. Current test tooling inspect karo; pehle unit/integration test approach choose karo, phir hi dependencies add karo.
2. Business logic ko service/helper layer mein testable rakho; real Tally/production DB ko test mocks se replace karo.
3. Automated checks ko CI/build path mein include karo; known limitations aur required manual checks roadmap mein likho.

### Completion checks
- Core journeys repeatably pass hon; tests production customer data ya real invoices ko mutate na karein.
- TypeScript, build, automated checks aur final manual release checklist pass hon.
- Known issue, deployment dependency aur rollback note GitHub release/PR description mein ho.

## Delivery log

| Phase | Status | Branch | Commit / note |
|---|---|---|---|
| Phase 1 | Complete | `feature/professional-roadmap-phases` | [`46a7ee7`](https://github.com/jlsfinance/TALLYONMOB/commit/46a7ee7), dashboard restore [`b448d76`](https://github.com/jlsfinance/TALLYONMOB/commit/b448d76) |
| Phase 2 | Complete | `feature/professional-roadmap-phases` | [`6a2c33d`](https://github.com/jlsfinance/TALLYONMOB/commit/6a2c33d) |
| Phase 3 | Implemented; validation pending | `feature/stock-item-tabs-rebuild` | [`f981ea7`](https://github.com/jlsfinance/TALLYONMOB/commit/f981ea7) — guided company/connection/first-sync wizard integrated |
| Phase 4 | Implemented; validation pending | `feature/stock-item-tabs-rebuild` | [`e6c9e4f`](https://github.com/jlsfinance/TALLYONMOB/commit/e6c9e4f) — additive Branded preview/PDF template and selector integrated |
| Phase 5 | In progress | `feature/phase-5-business-insights` | Detailed design: `PHASE_5_BUSINESS_INSIGHTS_DESIGN.md`; implementation slices 5.1–5.5 pending |
| Phase 6 | Planned | `feature/phase-6-release-hardening` | Not started |
