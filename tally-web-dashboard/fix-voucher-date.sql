-- ==========================================
-- ADD MISSING VOUCHER_DATE FIELD
-- Setup script created vch_date, but previous implementations or APIs might be looking for voucher_date. 
-- Adding it to all tables to avoid "violates not-null constraint" error.
-- ==========================================

ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "ledgers" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "voucher_date" date;
ALTER TABLE "rest" ADD COLUMN IF NOT EXISTS "voucher_date" date;

NOTIFY pgrst, 'reload schema';
