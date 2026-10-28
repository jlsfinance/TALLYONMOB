# Reports module audit and implementation gaps

This is an initial source-code audit, not an accounting validation against Tally or a production readiness assessment.

## Existing application

- React/Vite dashboard routes already include Day Book, ledger details and statement, inventory, Profit & Loss, Balance Sheet, GST, ageing and report builder. Authentication and selected company are supplied by the existing auth context; React Query is used by Day Book.
- Day Book queries the selected company's non-deleted vouchers for one date; its current view and export do not cover the requested full double-entry report or all date/export options.
- The report builder queries selected-company vouchers, ledgers or stock items with a configurable row limit; saved definitions are stored locally. It is not a server-paginated reporting engine or per-user database favourites.
- Windows SyncManager uses voucher ALTERID for incremental synchronization and uploads voucher ledger/stock entries and separate sales/purchases records. Reconciliation can mark vouchers deleted. These are potential report sources, not proof that every company has complete data.

## Accuracy gaps that must be resolved before exposing financial statements as complete

- ProfitLossPage reads current ledger balances and stock items; its date-range state does not restrict the source ledger query to period movements. It uses absolute balances and can fall back to quantity multiplied by rate for stock. Neither historical period figures nor the configured valuation method are established by this implementation.
- BalanceSheetPage reads current ledger balances, categorizes groups with name matching and applies absolute values. Its financial-year selector does not reconstruct ledger balances as of the selected date. Stock can be derived from quantity and rate. These results must not be represented as a verified as-of balance sheet.
- Voucher ledger/stock entry coverage, deletion and cancellation semantics, return linkage, source deduplication, unit conversions, stock valuation and opening-balance dates must be verified against the actual live schema and matching Tally data before implementing financial totals.
- Existing source schemas and migrations differ in places. Verify the deployed schema, row-level policies, role model and company membership rather than relying on checked-in SQL as evidence of live authorization.
- App-created document ownership, quotation lifecycle, e-way bill/e-invoice integration and retry states require separate verification. Missing integrations must be explicitly unavailable; no inferred status should be presented as verified.
- Database-persisted favourites require a migration with user-scoped RLS and a uniqueness constraint; browser localStorage alone does not meet the requirement.
- Tally reconciliation evidence for Day Book, ledger, trial balance, balance sheet, P&L, sales, stock and outstanding balances has not yet been obtained.

## Implementation dependency order

1. Inspect the live company-scoped schema, RLS, available source columns, sync completeness and report permissions without altering production data.
2. Verify Tally extract mappings and compare representative voucher, ledger, stock and return records with Tally; identify any missing fields and stable source identifiers.
3. Define a company-isolated report registry, period and freshness metadata, server-side paginated data access and decimal-safe accounting services; add migrations only after their security and data requirements are established.
4. Implement database-backed favourites, responsive report navigation and truthful unavailable states for reports whose dependencies are missing.
5. Implement and reconcile each report family against Tally, including drill-down and complete filtered exports; validate authorization for both report queries and exports.
6. Test cache invalidation, mobile and desktop navigation, large data sets, offline/error states and company isolation. Do not label reports production-ready until comparisons pass.

## Scope discrepancy

The prompt enumerates 34 named reports across Accounting (5), My Entries (7), Financial (3), Top (6), Sales (8) and Stock (5), plus Favourites. It also refers to 39 report options. Clarify the remaining five when the reference screenshots are available.

## Reference screenshots reviewed

The seven supplied screens show the seven requested categories, a two-column report hub with a vertically scrollable category rail, search and analysis actions, and one existing bottom navigation. Photo 1 duplicates the stock list shown in Photo 7. The screenshots confirm the same 34 distinct named options enumerated in the prompt; no additional five report names are visible. The crowns shown for certain entries are reference-app premium markers and must not be copied unless supported by this app's actual entitlements.

## Additional source findings

- The existing stock analysis function in `StockPage.tsx` is a placeholder. Current-stock snapshots alone do not establish historical movement, valuation or inactive-item reports.
- `DayBookPage.tsx` selects a single date and voucher rows and uses a client-side export; it cannot yet substitute for the requested full, filtered accounting-entry report.
- The app's existing mobile navigation has Home, Vouchers, Parties and Sales. A Reports entry should be integrated into that navigation, not added as a second fixed bar.
