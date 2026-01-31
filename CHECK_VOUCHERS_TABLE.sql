-- Run this in Supabase SQL Editor to check/create vouchers table

-- 1. Check if vouchers table exists and its structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vouchers'
ORDER BY ordinal_position;

-- 2. If table doesn't exist or needs to be recreated, use this:
/*
CREATE TABLE IF NOT EXISTS vouchers (
    voucher_id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    voucher_type TEXT NOT NULL,
    voucher_number TEXT,
    voucher_date DATE,
    party_name TEXT,
    narration TEXT,
    total_amount DECIMAL(15,2) DEFAULT 0,
    ledger_entries JSONB DEFAULT '[]',
    inventory_entries JSONB DEFAULT '[]',
    master_id TEXT,
    alter_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_vouchers_company ON vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);

-- Enable RLS
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated users" ON vouchers
    FOR ALL
    USING (true)
    WITH CHECK (true);
*/

-- 3. Check what vouchers exist (if any)
SELECT voucher_id, company_id, voucher_type, voucher_number, voucher_date, total_amount
FROM vouchers 
LIMIT 10;
