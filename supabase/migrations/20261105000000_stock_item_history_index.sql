-- Stock item history is always filtered by company_id + stock_item_name.
-- Without this index Postgres scans every entry row (190k+ for large companies).
create index if not exists idx_voucher_stock_entries_company_item
  on public.voucher_stock_entries (company_id, stock_item_name);
