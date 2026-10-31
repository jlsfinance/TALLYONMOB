-- Nightly bloat reclaim. Full resyncs delete-all + re-insert, so files grow
-- without shrinking (autovacuum reuses space but never returns it to disk).
-- VACUUM FULL rewrites the table, so it cannot run inside a transaction ->
-- one pg_cron job per table, staggered. Times are UTC (2 AM IST = 20:30 UTC).

select cron.schedule('vacuum_vouchers', '30 20 * * *', 'VACUUM (FULL, ANALYZE) vouchers');
select cron.schedule('vacuum_voucher_stock_entries', '32 20 * * *', 'VACUUM (FULL, ANALYZE) voucher_stock_entries');
select cron.schedule('vacuum_voucher_ledger_entries', '34 20 * * *', 'VACUUM (FULL, ANALYZE) voucher_ledger_entries');
select cron.schedule('vacuum_sales', '36 20 * * *', 'VACUUM (FULL, ANALYZE) sales');
select cron.schedule('vacuum_sales_items', '38 20 * * *', 'VACUUM (FULL, ANALYZE) sales_items');
select cron.schedule('vacuum_bill_allocations', '40 20 * * *', 'VACUUM (FULL, ANALYZE) bill_allocations');
select cron.schedule('vacuum_bank_allocations', '42 20 * * *', 'VACUUM (FULL, ANALYZE) bank_allocations');
