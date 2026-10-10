# Phase 12 stock schema reconciliation

**Project:** `tallysync` (`pfqmqpboomwtxgyfqnsn`)
**Migration:** `20261010_phase12_complete_stock_source_fields.sql` / Supabase migration `phase12_complete_stock_source_fields`
**Canonical master relation:** `public.stock_items` (used by the Windows sync client and dashboard)
**Line relation:** `public.voucher_stock_entries`
**Policy:** Add columns/indexes only. Do not rename, copy, update, or delete existing stock data. The old `public.stock` relation and any historical `tally_stock` implementation are not dropped or rewritten.

## Before/after reconciliation — 2026-10-10

Exact row counts were read using `COUNT(*)` against the connected database before and after executing DDL. Counts remained unchanged.

| Relation | Before | After | Result |
|---|---:|---:|---|
| `public.stock_items` | 2,954 | 2,954 | Match |
| `public.voucher_stock_entries` | 23,935 | 23,935 | Match |
| `public.stock` (legacy relation) | 0 | 0 | Untouched |

### Per-company counts

| Relation | Company ID | Before | After | Result |
|---|---|---:|---:|---|
| `stock_items` | `96d808e7-61de-3c85-643c-4a17e29f83ac` | 2,316 | 2,316 | Match |
| `stock_items` | `2cd7618a-3dd0-1ec9-8387-4450b8542eb7` | 16 | 16 | Match |
| `stock_items` | `93a38b13-f2e8-695c-d0a1-16f881f9b1f9` | 7 | 7 | Match |
| `stock_items` | `2b9a2439-d910-dd79-60e0-34a558f7e040` | 44 | 44 | Match |
| `stock_items` | `2b2daf94-4ee4-c223-fdd7-0a22ce10974b` | 4 | 4 | Match |
| `stock_items` | `9538f524-2866-fa1b-2d5b-5c9490e83cb0` | 567 | 567 | Match |
| `voucher_stock_entries` | `2b2daf94-4ee4-c223-fdd7-0a22ce10974b` | 9,761 | 9,761 | Match |
| `voucher_stock_entries` | `2b9a2439-d910-dd79-60e0-34a558f7e040` | 4,640 | 4,640 | Match |
| `voucher_stock_entries` | `2cd7618a-3dd0-1ec9-8387-4450b8542eb7` | 16 | 16 | Match |
| `voucher_stock_entries` | `93a38b13-f2e8-695c-d0a1-16f881f9b1f9` | 16 | 16 | Match |
| `voucher_stock_entries` | `96d808e7-61de-3c85-643c-4a17e29f83ac` | 9,502 | 9,502 | Match |

### New live columns verified

- `public.stock_items`: `alias`, `stock_category`, `additional_unit`, `alternate_unit_conversion`, `alternate_units`, `inward_quantity`, `inward_value`, `outward_quantity`, `outward_value`, `gst_applicable`, `taxability`, `gst_details`, and `raw_data` (existing value columns remain in place).
- `public.voucher_stock_entries`: billed/actual quantity and unit, godown, batch, cost centre, taxability, CGST/SGST/IGST/cess rates and amounts, `gst_details`, and `raw_data`.
- `public.stock` was not changed. The migration added fields only to the canonical application table and voucher-line table. It contains no `DELETE`, `TRUNCATE`, `DROP`, data-copy, or row-update statement.

## Functional reconciliation still required

The live database has existing production rows, but this environment has no live Tally connection or test-company voucher sample for source-to-cloud comparison. Before declaring Phase 12 fully accepted, run a Tally test voucher with GST, non-base quantity/unit, and (when present) godown/batch/cost-centre allocation; compare Tally source fields against `voucher_stock_entries` and `stock_items`. Do not infer a passing source-value reconciliation from schema/build checks alone.
