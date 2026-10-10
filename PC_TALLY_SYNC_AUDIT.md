# TallyonMOB PC Sync Audit

**Audit date:** 2026-10-10  
**Scope:** `tally-windows-sync` (Windows/Tally connector), `tally-sync-backend`, Supabase schema/migrations, and dashboard-facing tables.  
**Method:** Static code and schema audit. No live Tally company was connected during this audit, so actual row-loss counts still require a controlled read-only sync run.

## 1. Executive summary

The current PC sync is **not a true complete-company replication**. It has a good foundation—streaming XML, adaptive batches, retry queue, deterministic IDs, schema capability checks—but there are several paths where records or fields can be missed without the final summary clearly reporting them.

### Highest-risk findings

1. **Incremental vouchers only look back three months.** Any voucher edited in Tally more than three months ago is not picked up by normal incremental sync, even if its `ALTERID` is newer than the saved cursor.
2. **First sync is hard-limited to two years for vouchers.** Older vouchers are never fetched by the first sync path.
3. **Delete detection is deliberately disabled.** Deleted Tally masters/vouchers can remain in the cloud indefinitely.
4. **The local no-change signature cache is process-memory only.** After PC app restart it resets; during one process lifetime, a weak identity fallback can incorrectly suppress a changed record when the record has no `alter_id`/`updated_at`.
5. **There are two stock representations:** `stock_items` and `tally_stock`. The Windows sync path uploads to `stock_items`, while the richer `tally_stock` table exists in the schema. Any dashboard/report still reading `tally_stock` will look incomplete or stale.
6. **The sync summary counts attempted/fetched rows, not verified database rows.** A failed upload, partial row fallback, or missing optional table can be under-reported.
7. **Nested voucher data is uploaded separately, but child-table failures do not fail the parent voucher sync.** This can leave a voucher visible while its ledger/stock/bill details are missing.
8. **Master data is normally fetched only during force-resync.** New/changed groups, units, godowns, voucher types, cost centres, etc. can remain stale between force-resyncs.

## 2. How the current sync works

### A. PC app orchestration

`SyncManager` performs roughly this flow:

1. Load settings and restore only a local `LastSyncTime` state file.
2. Connect to Tally and cloud.
3. Resolve the active company and cloud company UUID.
4. Read local/cloud sync cursor information and in-memory caches.
5. On `forceResync`, fetch master collections.
6. Fetch modified ledgers and stock items using `ALTERID > lastAlterId`.
7. Fetch vouchers using a scout request (`MASTERID + ALTERID`) followed by full-detail requests in batches.
8. Upload each data type in configured batches, normally clamped to **100–500 records**; default is 100.
9. Upload voucher child rows to `voucher_ledger_entries` and `voucher_stock_entries`.
10. Derive and upload `sales`, `sales_items`, `purchases`, `purchase_items`, bill allocations, bank allocations and debit/credit notes.
11. Write logs/queue status and show a summary.

### B. Voucher fetch batching

The voucher fetch has a useful two-phase design:

- Scout phase fetches only `MASTERID` and `ALTERID`.
- Full phase fetches selected voucher IDs in batches.
- Default full-fetch batch is 100; adaptive logic can reduce to 50 or 25 after Tally failures.
- There is a 500 ms/1.5 sec breathing delay between Tally batches.

This is safer than requesting the entire XML response at once, but it does **not** fix the date-window issue described below.

### C. Cloud upload batching

The PC app chunks data before sending it. The API client:

- Adds/normalizes `company_id`.
- Optionally adds `owner_id` if the target table supports it.
- Removes columns that are not present in the target table.
- Converts non-UUID Tally IDs to deterministic UUIDs.
- Uses PostgREST upsert with `on_conflict`.
- Queues failed batches locally for retry.

The backend also supports batches, checkpoints, idempotency keys and sync-run telemetry, but the Windows client path does not consistently use the backend checkpoint contract for every collection.

## 3. What is currently fetched from Tally

### Company

Captured:

- Name, GUID/ID
- GST registration fields
- Address/state
- Phone/email
- Financial year start/end
- Books-from date in the model
- Currency symbol

Risk: company identity is initially resolved by name and then existing cloud UUID is reused. This prevents a common FK break, but duplicate company names are still a data-integrity risk.

### Ledgers / parties

Captured into the `Ledger` model:

- Name, parent/group
- Opening and closing balance
- Address, phone, email
- GSTIN/PAN
- Master ID and Alter ID

The Tally fetch also requests several fields such as ledger contact/mobile/state/registration type, but the model/upload mapping does not retain all of them. The cloud `ledgers` table is comparatively narrow.

Potentially missing or not persisted consistently:

- Alias
- Country of residence
- GST registration type
- Separate mobile/contact values when not mapped to phone
- Full address lines/structured address
- Ledger GUID as a dedicated cloud field
- Cost-centre balances/allocations
- Ledger bill-wise opening/closing details unless present in voucher bill allocations

### Vouchers

Captured at voucher header level:

- Master ID, Alter ID, GUID
- Date, voucher type, voucher number
- Party name/GSTIN/address/state/place of supply
- Narration
- Invoice/accounting flags
- Total/amount fallback values

Captured from lines:

- Ledger name, amount, debit/credit direction
- Bill allocations: bill name/type/amount/credit period
- Bank allocations: favouring/transaction/instrument/date/amount/bank
- Inventory item name, quantity, unit, rate, amount, discount, HSN, tax rate, taxability

Important limitation: raw XML is not retained end-to-end. A reduced `raw_data` snapshot is retained in some paths, but many Tally fields that are not explicitly parsed are discarded.

Likely missing or incomplete voucher fields:

- Reference number and reference date in the normal Tally parser path
- Order number/date and delivery note references
- Due date/payment terms beyond bill credit period
- Transport/eway bill/vehicle/dispatch fields unless another extractor handles them
- Voucher alteration metadata beyond IDs
- Full GST breakup per line in the canonical voucher child table
- Godown/batch/actual quantity/rate details beyond the selected quantity/rate
- Cost centre allocations
- Payroll/job-work/production-specific allocations
- Cancellation/optional/post-dated nuances when not included in the selected header fields
- Full multi-ledger tax allocation semantics in derived sales/purchase tables

### Stock items

Captured:

- Name, GUID/ID
- Parent stock group
- Base/additional unit
- Opening/closing balance and values
- Opening/closing rate
- HSN
- GST rate
- Master ID/Alter ID

The upload maps these into `stock_items` as `unit`, `opening_stock`, `current_stock`, `opening_value`, `closing_value`, `stock_group`, `hsn_code`, and `gst_rate`.

Intentionally removed before upload:

- Alias
- Stock category
- Inward quantity/value
- Outward quantity/value

This is a material loss because the schema has fields for richer stock movement in `tally_stock`, but the active upload path targets `stock_items` and drops those fields.

### Master collections

The code has fetchers/models for:

- Ledger groups
- Cost centres
- Godowns
- Stock groups
- Stock categories
- Currencies
- Voucher types
- Units
- Budgets/budget allocations
- Bank allocations
- Bill allocations
- GST details
- Price lists
- Debit/credit notes

However, these master collections are normally run only on `forceResync`, not every incremental sync. Also, some fetchers use generic Tally collection/report XML paths and should be validated against real companies because their error handling returns an empty list on failure.

## 4. Exact data-loss and stale-data scenarios

### 4.1 Older financial years are not fully synced

The voucher incremental method sets:

- First sync: `DateTime.Today.AddYears(-2)` and at most eight three-month chunks.
- Normal incremental: `DateTime.Today.AddMonths(-3)` and at most three one-month chunks.

Therefore:

- A company with more than two years of voucher history will have an incomplete first sync.
- A voucher from an older FY edited today may have a new Alter ID but will not be found because its voucher date is outside the three-month scan window.
- A user selecting a previous FY in the dashboard cannot see complete data unless that FY happened to be within the initial two-year window and the sync was already complete.

### 4.2 Deletes are not propagated

The delete detection block is commented out and explicitly marked disabled for performance. The database has a `deleted_records` table, but the current normal sync does not populate it from Tally deletions.

Effect: deleting or removing a voucher, ledger, or stock item in Tally does not automatically remove/soft-delete the cloud row.

### 4.3 Master data can be stale

The code comment says master data runs only during force-resync. A newly created unit, godown, voucher type, stock group, ledger group or cost centre may not appear in the dashboard until a force-resync.

### 4.4 Parent/child split can create partial records

The parent voucher upload is attempted first. Child rows are uploaded afterward. If child-table upload fails, the voucher may still show in History/Sales, but:

- SKU History/Customers/Suppliers can be empty or incomplete.
- Bill-wise/customer drill-down can miss rows.
- Sales/purchase item reports can disagree with voucher totals.

The child upload result is logged, but it is not always reflected as a failed overall voucher sync.

### 4.5 The no-change filter is not a durable checkpoint

`_uploadedRecordSignatures` is an in-memory `HashSet`. It is lost on restart. More importantly, its fallback stable key can be only `name` for some objects, and its version can be a hash of serialized data. This is not a substitute for a durable `(company, entity, alter_id)` checkpoint.

### 4.6 Empty/invalid Tally values can be converted into believable wrong values

Examples:

- Invalid voucher date is normalized to today in the safety layer.
- Missing amount becomes `0` or falls back to `total_amount`/`grand_total`.
- Missing GST becomes `0`.
- Missing quantity/rate becomes `0`.
- Missing HSN becomes blank.

These defaults prevent crashes but can make bad data appear valid unless a data-quality flag is stored and shown.

### 4.7 Stock table ambiguity

Schema contains both:

- `stock_items`: compact dashboard master table
- `tally_stock`: richer stock table with alias/category/inward/outward/taxability/raw data

The active Windows upload call uses `UploadListAsync("stock_items", ...)`. The API's legacy mapping can map a generic `stock` type to `stock_items`. No equivalent active upload to `tally_stock` was found in the main path.

This can explain cases where the dashboard expects movement/category/taxability fields but receives only the compact master row.

## 5. Field matrix: present, partial, missing

| Domain | Present in Tally fetch/model | Persisted in active path | Main gap |
|---|---|---|---|
| Company identity | Yes | Yes | Duplicate-name collision risk |
| Company FY/books dates | Yes/model | Partly | Must verify company table columns and actual parser values |
| Ledger name/group | Yes | Yes | Group hierarchy can be stale |
| Ledger balances | Yes | Yes | No explicit balance snapshot/as-on date |
| Ledger contact/GST | Yes | Partly | Several fetched fields are discarded |
| Voucher header | Yes | Yes | Some reference/transport/GST metadata missing |
| Voucher ledger lines | Yes | Separate child table | Child failure can be silent/partial |
| Voucher inventory lines | Yes | Separate child table | Godown/batch/cost-centre details missing |
| Bill allocations | Parsed | Optional separate table | Depends on child upload/table/RLS |
| Bank allocations | Parsed | Optional separate table | Same partial-sync risk |
| Sales/Purchases | Derived | Yes | Depends on voucher upload and type matching |
| Sales/Purchase items | Derived | Yes | No explicit failure propagation |
| Stock master | Yes | Yes to `stock_items` | Rich movement fields discarded |
| Stock movement | Partly available from voucher lines | Voucher stock entries only | No authoritative opening/inward/outward reconciliation |
| GST line detail | Partial tax rate/HSN | Partial | Detailed GST table is not clearly populated in normal path |
| Units | Fetcher exists | Force-resync only | Can be stale |
| Godowns | Fetcher exists | Force-resync only | Voucher godown allocations not parsed into child rows |
| Cost centres | Fetcher exists | Force-resync only | Voucher cost-centre allocations not persisted consistently |
| Voucher types | Fetcher exists | Force-resync only | Can be stale |
| Deletes | Schema support exists | Not active | Deleted records remain |
| Sync cursor | Alter ID model exists | Mixed/local flow | No single durable cursor contract across all modules |

## 6. Batch-size answer: does data go in 100-100 pieces?

**Mostly yes for upload, but not uniformly for extraction.**

- Windows upload batch defaults to 100 and is clamped to a minimum of 100 and maximum of 500.
- On repeated failures, the effective upload batch can reduce to 75, 50 or 25.
- Voucher full-detail extraction uses an adaptive default of 100, then 50/25 after failures.
- Master fetches such as ledgers and stock use collection requests and are not consistently paged into 100-record Tally requests.
- The backend `MAX_SYNC_BATCH_SIZE` applies only when the backend route receives a collection; it is separate from the Windows Tally extraction batch.

So the correct statement is: **large voucher uploads are chunked, but the entire PC sync is not guaranteed to be a strict 100-record pipeline from Tally through cloud.**

## 7. Reliability issues in reporting

The final summary currently adds fetched/scheduled counts such as `finalVouchers.Count`, `finalStockItems.Count`, etc. It does not always subtract:

- Rows removed by schema-column pruning
- Duplicate IDs removed inside a batch
- Rows rejected in row-level fallback
- Child rows skipped because a table is missing
- Records queued but not yet uploaded
- Records whose upload succeeded for parent but failed for children

A production-grade summary must report, per module:

- Tally discovered
- Parsed successfully
- Rejected during parse
- Sent
- Accepted by cloud
- Failed permanently
- Queued for retry
- Skipped as duplicate
- Deleted/marked deleted
- Fields missing by quality category

## 8. Recommended fix plan

### P0 — Prevent silent incompleteness

1. Replace the three-month incremental voucher window with an AlterID-first scan that is not constrained by voucher date. If Tally requires date chunking for performance, maintain a durable per-module scan cursor and cover every date range until the AlterID frontier is verified.
2. Add a full historical import mode by FY/date range. The user must be able to sync FY 2024-25, FY 2025-26, etc. independently.
3. Make parent/child sync atomic at the module level, or mark a voucher `sync_status = partial` until all required children succeed.
4. Add a reconciliation pass: compare Tally scout counts/ID ranges with cloud accepted IDs and report missing IDs.
5. Persist per-module cursors durably in one schema contract. Do not rely on only the Windows local state file or process-memory signatures.
6. Add explicit delete detection using Tally ID-only collections and populate `deleted_records` / `is_deleted`.

### P1 — Stop field loss

1. Choose one canonical stock table. Recommended: keep `stock_items` for dashboard master data and add/maintain separate normalized stock movement tables; do not silently drop `tally_stock` fields.
2. Persist alias, stock category, inward/outward quantities and values, taxability, alternate units and raw source metadata.
3. Add normalized tables for voucher allocations:
   - `voucher_cost_centres`
   - `voucher_godown_entries`
   - `voucher_batch_entries`
   - detailed `gst_details`
   - transport/eway fields where available
4. Retain the original Tally XML or a versioned normalized source snapshot for audit/debugging.
5. Store data-quality flags instead of silently converting invalid dates/amounts/GST/quantities to believable defaults.

### P1 — Make 100-record processing real and observable

1. Use a single `ChunkedSyncRunner` for every module: Tally fetch, parse, upload, verify.
2. Make chunk size configurable per module, default 100, with maximum 100 unless an explicit safe-mode override is enabled.
3. After every chunk, write checkpoint:
   - module
   - FY/date range
   - first/last Alter ID
   - first/last source ID
   - discovered/accepted/rejected counts
   - payload hash
4. Retry only failed chunks; never re-run an entire company by default.
5. Split a failed 100-row batch automatically into 50, then 25, then row-level quarantine.
6. Do not mark a queue item completed when `sales`/`purchases` parent succeeded but item/child uploads failed.

### P2 — Master and schema consistency

1. Run lightweight master AlterID sync on every normal sync, not only force-resync.
2. Add unique constraints/indexes for `(company_id, master_id)` and `(company_id, alter_id)` where appropriate, while preserving stable UUID IDs.
3. Verify all RLS policies are company/owner scoped. Current broad `TO authenticated USING (true)` policies are a security concern for multi-company data.
4. Remove unused/duplicate legacy mapping paths after the canonical table contract is finalized.
5. Fix garbled UTF-8 log strings so operational failures are readable.

## 9. Read-only validation plan on an actual Tally company

Run against a copied/test company or read-only window:

1. Record Tally Statistics counts for ledgers, vouchers, sales, purchases and stock.
2. Export ID-only lists for each module: GUID, MASTERID, ALTERID.
3. Run PC full sync in 100-record mode.
4. Compare:
   - Tally source ID set vs cloud ID set
   - Tally count vs accepted count
   - parent voucher IDs vs child voucher IDs
   - stock master names vs voucher stock-entry names
5. Modify one old voucher outside the last three months and run incremental sync; verify whether it arrives. Current code is expected to miss it.
6. Delete a test voucher/ledger/stock item and run incremental sync; current code is expected to leave the cloud row.
7. Add a new unit/group/voucher type and run normal sync; current code may not upload it until force-resync.
8. Force one invalid row/table failure and verify it is quarantined and visible in the sync report.
9. Verify FY 2024-25 and FY 2025-26 dashboard totals against Tally reports.
10. Restart the PC app and confirm the cursor resumes without re-uploading or skipping records.

## 10. Final conclusion

The PC app **does use batching**, and its voucher extraction is safer than a single massive Tally XML request. But it is not yet safe to claim that all Tally data is synchronized completely.

The most urgent correction is the **incremental voucher date window**. The second is **end-to-end reconciliation and partial-child failure reporting**. The third is **canonicalizing stock storage and restoring dropped movement/master fields**. Until those are addressed, the dashboard can legitimately show missing history, wrong FY totals, incomplete SKU Customers/Suppliers tabs, stale masters, and balances that differ from Tally.
