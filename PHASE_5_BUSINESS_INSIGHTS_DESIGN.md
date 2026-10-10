# Phase 5 — Business Insights & Report Experience

**Status:** Design approved for implementation  
**Branch:** `feature/phase-5-business-insights`  
**Scope:** Selected company + selected Indian financial year ke basis par trustworthy business reports.  
**Principle:** Pehle deterministic accounting totals, phir insights. Unsupported AI/predictions ko authoritative business metric ke roop mein nahi dikhana.

## 1. Phase 5 ka objective

User ko ek aisa Business Insights workspace dena jahan woh selected company aur selected FY ke liye:

1. Sales aur purchase trend dekh sake.
2. Previous comparable period se comparison kar sake.
3. Receivables/payables ageing aur overdue parties par action le sake.
4. Top customers, suppliers aur inventory movement dekh sake.
5. Low-stock signals sirf reliable stock fields available hone par dekh sake.
6. Har card se source report ya voucher/ledger detail par directly ja sake.
7. Dashboard aur detailed reports ke totals reconcile kar sake.

## 2. Existing implementation audit

### 2.1 `BusinessInsightsPage.tsx`

- `vouchers`, `ledgers` aur `stock_items` ko company scope ke bina nahi, lekin **selected FY/date range ke bina all-time** load karta hai.
- Predictive revenue, anomaly detector aur 20+ KPI cards local arrays se calculate hote hain; inmein kuch metrics source fields ke reliable hone ko verify nahi karte.
- Page par `AI Business Insights` label deterministic calculations ko AI/forecasting ke roop mein present karta hai.
- Current stock value, COGS, DSO/DPO aur profit metrics ke liye definitions consistent nahi hain.
- Large companies mein all vouchers client memory mein load ho sakte hain.

### 2.2 `DashboardPage.tsx`

- FY range ka basic implementation already hai: `YYYY-04-01` se `YYYY+1-03-31`.
- Sales/purchase totals `grand_total` fallback `total_amount` se calculate hote hain.
- Company, deletion flag aur date filters use hote hain; Phase 5 mein isi behavior ko shared helper mein move karna hai.
- Existing dashboard FY selector aur Business Insights selector ko ek hi persisted selection model par lana hai.

### 2.3 `AgingReportPage.tsx`

- Receivable/payable report already available hai.
- Current implementation party names se vouchers match karta hai aur client-side knock-off karta hai.
- `is_deleted` filter, `grand_total` fallback aur ledger-id based matching ko harden karna hai.
- Phase 5 mein Business Insights card isi report ko open karega; duplicate ageing engine nahi banana hai.

### 2.4 `InventoryValuationPage.tsx`

- Current page static/demo arrays (`ITEMS`, `BATCHES`, `SALE_ALLOCATIONS`, etc.) use karta hai.
- Is data ko live business insight ke source ke roop mein use nahi karna hai.
- Phase 5 mein reliable `stock_items` + `voucher_stock_entries` data available hone tak live inventory signal ko `Unavailable` state dikhana hai; demo numbers kabhi production insight ke roop mein nahi dikhane.

## 3. Data contract — authoritative definitions

### 3.1 Common scope

Har Phase 5 query ko ye filters mandatory honge:

- `company_id = selectedCompany.id`
- `is_deleted = false` ya `is_deleted IS NULL` compatibility filter, jahan table mein field ho
- Voucher date `from <= voucher_date <= to`
- Selected FY: 1 April se agle saal 31 March tak
- Currency: current company ke stored INR amounts; automatic currency conversion nahi
- Amount: `abs(grand_total)` agar valid non-zero ho, warna `abs(total_amount)`
- Date: `voucher_date`; missing date rows ko trend/age calculation mein silently include nahi karna, balki data-quality count mein rakhna

### 3.2 Voucher type groups

| Business metric | Included voucher types | Excluded / separate |
|---|---|---|
| Sales | `Sales`, `Sales Invoice` | Credit Note separate adjustment |
| Purchases | `Purchase`, `Purchase Invoice` | Debit Note separate adjustment |
| Receipts | `Receipt` | Contra/Journal separate |
| Payments | `Payment` | Contra/Journal separate |
| Revenue trend | Sales less Credit Note only if source mapping is reliable | Receipt, Journal, Contra |
| Purchase trend | Purchase less Debit Note only if source mapping is reliable | Payment, Journal, Contra |

Voucher type matching case/whitespace normalized hoga. Unknown types ko totals mein force-fit nahi karna hai.

### 3.3 Receivables/payables

- **Receivable opening source:** `ledgers.opening_balance` for ledgers whose parent is `Sundry Debtors`.
- **Payable opening source:** `ledgers.opening_balance` for ledgers whose parent is `Sundry Creditors`.
- **Receivable additions:** Sales and debit notes.
- **Receivable reductions:** Receipts and credit notes.
- **Payable additions:** Purchases and credit notes.
- **Payable reductions:** Payments and debit notes.
- Party matching priority: `party_ledger_id` / ledger id, then exact normalized party name fallback.
- Ageing is calculated as-on selected date, not as a forecast.
- If voucher allocation cannot be reliably tied to a party, show an `Unallocated` warning and exclude it from party ranking rather than assigning it to a random party.

### 3.4 Inventory movement

Reliable only when `voucher_stock_entries` has usable rows with:

- `stock_item_id` or normalized `stock_item_name`
- `quantity`
- `is_inward` or voucher type fallback
- valid voucher date through the parent voucher

Definitions:

- Inward quantity: purchase/receipt stock entries or `is_inward = true`.
- Outward quantity: sales/delivery stock entries or `is_inward = false`.
- Current quantity: `stock_items.current_stock` when present; otherwise computed movement is labelled `estimated`.
- Stock value: `stock_items.closing_value` when present; otherwise `current_stock * rate` only if both fields are valid.
- Low-stock signal: only when a reorder/minimum level field exists and is numeric. Without a threshold, show `No reorder threshold configured`, not `0 low-stock items`.

## 4. Business Insights information architecture

### 4.1 Page header

- Title: `Business Insights`
- Subtitle: selected company name
- Controls:
  - Financial year selector: `FY 2025-26`
  - Compare toggle: `Previous FY` / `Previous comparable period`
  - Refresh
  - Export summary (CSV first; PDF later)
- Scope badge: `Company · FY · Last synced at`
- If data is stale or sync timestamp is missing, show a non-blocking stale-data banner.

### 4.2 KPI row

Four deterministic cards only:

1. **Sales** — selected FY sales amount and voucher count.
2. **Purchases** — selected FY purchases amount and voucher count.
3. **Receivables** — as-on FY end/current report date, linked to ageing report.
4. **Payables** — as-on FY end/current report date, linked to ageing report.

Each card shows:

- Current value
- Previous comparable value, only if available
- Absolute change and percentage change
- `No comparison data` when denominator is zero or previous data is unavailable
- Link to the relevant report

### 4.3 Sales/purchase trend

- Monthly FY chart with exactly 12 financial-year labels: Apr–Mar.
- Two series: Sales and Purchases.
- Missing months are represented as `No data`, not automatically as zero if the query failed.
- Tooltip includes amount and voucher count.
- Clicking a month navigates to vouchers filtered by company, date range and type.
- Summary below chart:
  - Highest sales month
  - Highest purchase month
  - Sales minus purchases for selected FY

### 4.4 Receivables/payables section

- Two compact cards with totals and overdue share.
- Age buckets: `0–30`, `31–60`, `61–90`, `91–120`, `120+`.
- Top five overdue parties with amount, oldest invoice date and age.
- Actions:
  - `View ageing report`
  - `Open ledger`
  - `Send reminder` only when phone is available; use existing reminder flow
- If ageing allocation is incomplete, show an explicit data-quality note.

### 4.5 Top parties

Tabs:

- Top customers by sales amount
- Top suppliers by purchase amount

Rows show:

- Rank
- Party name
- Amount
- Voucher count
- Share of total
- Last transaction date

Click behavior:

- Customer → ledger detail or filtered sales list
- Supplier → ledger detail or filtered purchase list

Party names missing or empty are grouped under `Unidentified party` and excluded from the top-five ranking unless the user opens a data-quality detail.

### 4.6 Inventory movement and low-stock

Only render this section as live when reliability checks pass:

- Items with movement in selected FY
- Inward quantity/value
- Outward quantity/value
- Current stock/value
- Movement direction
- Low-stock count only with configured reorder thresholds

Otherwise render an informative empty state:

> Inventory insights are unavailable because stock movement or reorder thresholds are not synced for this company.

Action: `Open Stock` and `Sync again`.

### 4.7 Data quality and freshness

A small collapsible panel must expose:

- Last sync time
- Voucher rows in scope
- Rows without voucher date
- Rows with unknown voucher type
- Unallocated party amount
- Stock rows missing quantity/rate/threshold
- Query partial-failure count

This prevents a polished chart from hiding incomplete source data.

## 5. Query and service architecture

### 5.1 New shared helpers

Create `src/lib/businessInsights.ts` with pure, testable functions:

- `getFinancialYearRange(startYear)`
- `getPreviousFinancialYearRange(startYear)`
- `normalizeVoucherType(value)`
- `getVoucherAmount(row)`
- `isIncludedVoucher(row, group)`
- `aggregateMonthlyTrend(rows, range)`
- `aggregateTopParties(rows, group)`
- `calculatePeriodComparison(current, previous)`
- `bucketAge(days)`
- `calculateAgeing(rows, ledgers, asOnDate, mode)`
- `getInventoryReliability(stockItems, stockEntries)`
- `aggregateInventoryMovement(stockItems, stockEntries, vouchers)`

Pure functions must not call Supabase and must never generate fabricated fallback numbers.

### 5.2 New data access module

Create `src/lib/businessInsightsApi.ts`:

- `fetchVoucherSummary(companyId, range)`
- `fetchVoucherTrend(companyId, range)`
- `fetchPartyBalances(companyId, asOnDate, mode)`
- `fetchTopParties(companyId, range, mode)`
- `fetchStockMovement(companyId, range)`
- `fetchBusinessInsightsSnapshot(companyId, range, comparisonRange)`

Query rules:

- Select only required columns.
- Use pagination/range for large tables.
- Never use unbounded `select('*')` in Phase 5 report queries.
- Return `{ data, error, meta }`, where `meta` contains row counts and data-quality flags.
- Abort or ignore stale requests after company/FY switch.
- Keep each section independently loadable so one failed report does not blank the whole page.

### 5.3 No database migration in first Phase 5 slice

Initial implementation will use existing tables and columns only. A database view/RPC may be considered later if query volume proves too high, but only with:

- migration file,
- explain/query impact review,
- RLS review,
- rollback plan,
- reconciliation against current dashboard totals.

## 6. Navigation contract

Use query parameters so report context survives back navigation:

- `/business-insights?fy=2025-26`
- `/vouchers?type=Sales&from=2025-04-01&to=2026-03-31`
- `/aging-report?type=receivable&asOn=2026-03-31`
- `/ledgers/:id?from=business-insights&fy=2025-26`
- `/stock?from=business-insights&fy=2025-26`

The selected FY must be scoped by company in local storage, for example:

`business_insights_fy_<companyId>`

No global FY value should leak between companies.

## 7. Implementation slices

### Slice 5.1 — Scope and correctness foundation

- Add shared FY/date/amount/type helpers.
- Add selected-company scoped FY state.
- Refactor Business Insights loading to selected FY.
- Remove all-time `select('*')` from the page.
- Add loading, empty, error and partial-data states.
- Reconcile Sales/Purchase cards against Dashboard for the same FY.

### Slice 5.2 — Trends and comparison

- Add monthly Apr–Mar sales/purchase chart.
- Add previous FY comparison.
- Add click-through voucher filters.
- Add chart labels, accessible table fallback and dark-mode contrast.

### Slice 5.3 — Ageing and actions

- Reuse/fix `AgingReportPage` calculation.
- Add receivable/payable summary cards and top overdue parties.
- Preserve as-on date and FY context in navigation.
- Add reminder action only for parties with a verified phone field.

### Slice 5.4 — Top parties and inventory reliability

- Add top customer/supplier tables with shares and counts.
- Replace static Inventory Valuation usage in insights with live-source reliability checks.
- Add low-stock only when reorder threshold is authoritative.
- Add stock navigation and unavailable state.

### Slice 5.5 — Reconciliation and hardening

- Compare Dashboard, Business Insights and detailed reports on identical fixtures.
- Add export with scope metadata.
- Add performance safeguards and stale-response protection.
- Update roadmap only after checks pass.

## 8. Tests and acceptance criteria

### Pure logic tests

- FY range around March/April boundary.
- Leap-year and inclusive end-date behavior.
- Amount fallback: valid grand total, zero grand total, invalid/null values.
- Voucher type case/whitespace normalization.
- Monthly Apr–Mar ordering.
- Comparison with zero/unknown previous period.
- Ageing allocation and oldest-first settlement.
- Unknown/missing party handling.
- Inventory reliability states.

### Integration/mock tests

- Company A data never appears after switching to Company B.
- FY change reloads all cards and charts.
- Stale request cannot overwrite a newer FY/company result.
- One failed section keeps other sections visible.
- Empty company shows clear no-data state, not zeros presented as facts.
- Query pagination handles more than one page.

### Manual checks

- Dashboard sales/purchase totals equal Business Insights for same FY.
- Ageing total equals linked Ageing Report as-on same date.
- Voucher click-through preserves company/type/date filters.
- Mobile chart has a table/list alternative.
- Keyboard focus and screen-reader labels exist for selectors, chart summaries and actions.
- Dark mode contrast is readable.
- Export contains company, FY, generated-at and source-status metadata.

## 9. Non-goals for Phase 5

- No automatic invoice/payment submission.
- No unsupported AI-generated financial advice.
- No automatic forecast presented as a committed business result.
- No stock reorder creation without user action.
- No mutation of vouchers, ledgers or production data from report views.
- No use of static demo inventory figures in live business reports.

## 10. Definition of done

Phase 5 will be marked **Complete** only when:

1. Business Insights is scoped to selected company and FY.
2. Dashboard and report totals reconcile on test fixtures.
3. Trends, comparisons, ageing, top parties and inventory states have clear source definitions.
4. No-data, partial-data, loading, permission and query-error states are visible and understandable.
5. Large data uses selected columns and pagination.
6. Links preserve report context and back navigation.
7. TypeScript, production build and automated tests pass.
8. Manual release checklist and known limitations are recorded in the roadmap.
