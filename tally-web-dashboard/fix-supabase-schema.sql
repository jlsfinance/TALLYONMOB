-- Yeh saari missing columns check karke add kar dega.
-- Agar column exist karta hai toh kuch nahi karega (Error nahi ayega).

-- ==========================================
-- 1. VOUCHERS TABLE
-- ==========================================
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "voucher_id" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "voucher_type" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "voucher_number" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "vch_date" date;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "party_ledger_name" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "amount" numeric DEFAULT 0;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "narration" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "owner_id" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "invoice_number" text;
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "json_data" jsonb;

-- ==========================================
-- 2. VOUCHER_STOCK_ENTRIES TABLE
-- ==========================================
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "voucher_id" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "stock_item_name" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "quantity" numeric DEFAULT 0;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "rate" numeric DEFAULT 0;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "amount" numeric DEFAULT 0;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "hsn_code" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "discount_percent" numeric DEFAULT 0;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "tax_rate" numeric DEFAULT 0;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "is_inward" boolean DEFAULT true;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "voucher_type" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "vch_date" date;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "voucher_number" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "party_ledger_name" text;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false;
ALTER TABLE "voucher_stock_entries" ADD COLUMN IF NOT EXISTS "owner_id" text;

-- ==========================================
-- 3. VOUCHER_LEDGER_ENTRIES TABLE
-- ==========================================
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "voucher_id" text;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "amount" numeric DEFAULT 0;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "is_debit" boolean DEFAULT false;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "voucher_type" text;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "vch_date" date;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "voucher_number" text;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "party_ledger_name" text;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false;
ALTER TABLE "voucher_ledger_entries" ADD COLUMN IF NOT EXISTS "owner_id" text;

-- ==========================================
-- 4. RELOAD SCHEMA CACHE
-- Is se cache refresh ho jayega aur "Could not find column" error khatam ho jayega
-- ==========================================
NOTIFY pgrst, 'reload schema';
