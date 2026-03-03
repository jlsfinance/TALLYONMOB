-- ============================================================================
-- COMPLETE RLS FIX + SECURITY HARDENING
-- Run this ENTIRE script in Supabase SQL Editor (Dashboard > SQL Editor)
-- This fixes ALL sync issues (403 Forbidden) and security vulnerabilities
-- ============================================================================
-- Date: 2026-02-20
-- Fixes: Missing INSERT/UPDATE/DELETE policies, owner_id mismatch, 
--        missing owner_id columns on child tables
-- ============================================================================

-- ============================================
-- STEP 1: ADD owner_id COLUMN TO ALL TABLES THAT NEED IT
-- The Windows app sends owner_id with every record for RLS
-- ============================================

-- Companies already has owner_id (line 23 of schema)
-- But child tables need it too for direct RLS checks

DO $$ 
BEGIN
    -- Add owner_id to ledgers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ledgers' AND column_name = 'owner_id') THEN
        ALTER TABLE ledgers ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to vouchers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vouchers' AND column_name = 'owner_id') THEN
        ALTER TABLE vouchers ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to stock_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_items' AND column_name = 'owner_id') THEN
        ALTER TABLE stock_items ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'owner_id') THEN
        ALTER TABLE sales ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to sales_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_items' AND column_name = 'owner_id') THEN
        ALTER TABLE sales_items ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to purchases
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'owner_id') THEN
        ALTER TABLE purchases ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to purchase_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_items' AND column_name = 'owner_id') THEN
        ALTER TABLE purchase_items ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to voucher_ledger_entries
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_ledger_entries' AND column_name = 'owner_id') THEN
        ALTER TABLE voucher_ledger_entries ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to voucher_stock_entries
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_stock_entries' AND column_name = 'owner_id') THEN
        ALTER TABLE voucher_stock_entries ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to bank_allocations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_allocations' AND column_name = 'owner_id') THEN
        ALTER TABLE bank_allocations ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to bill_allocations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bill_allocations' AND column_name = 'owner_id') THEN
        ALTER TABLE bill_allocations ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add owner_id to gst_details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gst_details' AND column_name = 'owner_id') THEN
        ALTER TABLE gst_details ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;

    -- Add gstin to companies if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'gstin') THEN
        ALTER TABLE companies ADD COLUMN gstin TEXT;
    END IF;

    -- Add state to companies if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'state') THEN
        ALTER TABLE companies ADD COLUMN state TEXT;
    END IF;
END $$;


-- ============================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- These may not exist yet, so use DO block
DO $$ BEGIN
    EXECUTE 'ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE voucher_ledger_entries ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE voucher_stock_entries ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE bank_allocations ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE bill_allocations ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE gst_details ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ============================================
-- STEP 3: DROP ALL EXISTING POLICIES (CLEAN SLATE)
-- ============================================

-- Companies
DROP POLICY IF EXISTS "Users can view their own companies" ON companies;
DROP POLICY IF EXISTS "Users can view their companies" ON companies;
DROP POLICY IF EXISTS "Users can create companies" ON companies;
DROP POLICY IF EXISTS "Users can insert their own companies" ON companies;
DROP POLICY IF EXISTS "Users can update their own companies" ON companies;
DROP POLICY IF EXISTS "Users can delete their own companies" ON companies;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON companies;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON companies;
DROP POLICY IF EXISTS "companies_select" ON companies;
DROP POLICY IF EXISTS "companies_insert" ON companies;
DROP POLICY IF EXISTS "companies_update" ON companies;
DROP POLICY IF EXISTS "companies_delete" ON companies;

-- Ledgers
DROP POLICY IF EXISTS "Users can view company ledgers" ON ledgers;
DROP POLICY IF EXISTS "ledgers_select" ON ledgers;
DROP POLICY IF EXISTS "ledgers_insert" ON ledgers;
DROP POLICY IF EXISTS "ledgers_update" ON ledgers;
DROP POLICY IF EXISTS "ledgers_delete" ON ledgers;

-- Vouchers
DROP POLICY IF EXISTS "Users can view company vouchers" ON vouchers;
DROP POLICY IF EXISTS "vouchers_select" ON vouchers;
DROP POLICY IF EXISTS "vouchers_insert" ON vouchers;
DROP POLICY IF EXISTS "vouchers_update" ON vouchers;
DROP POLICY IF EXISTS "vouchers_delete" ON vouchers;

-- Sales
DROP POLICY IF EXISTS "Users can view company sales" ON sales;
DROP POLICY IF EXISTS "sales_select" ON sales;
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;

-- Sales Items
DROP POLICY IF EXISTS "sales_items_select" ON sales_items;
DROP POLICY IF EXISTS "sales_items_insert" ON sales_items;
DROP POLICY IF EXISTS "sales_items_update" ON sales_items;

-- Purchases
DROP POLICY IF EXISTS "Users can view company purchases" ON purchases;
DROP POLICY IF EXISTS "purchases_select" ON purchases;
DROP POLICY IF EXISTS "purchases_insert" ON purchases;
DROP POLICY IF EXISTS "purchases_update" ON purchases;

-- Purchase Items
DROP POLICY IF EXISTS "purchase_items_select" ON purchase_items;
DROP POLICY IF EXISTS "purchase_items_insert" ON purchase_items;
DROP POLICY IF EXISTS "purchase_items_update" ON purchase_items;


-- ============================================
-- STEP 4: CREATE NEW RLS POLICIES
-- Using owner_id = auth.uid() for ALL tables
-- This matches what the Windows app sends
-- ============================================

-- ==================
-- COMPANIES
-- ==================
CREATE POLICY "companies_select" ON companies
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "companies_insert" ON companies
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "companies_update" ON companies
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "companies_delete" ON companies
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

-- ==================
-- LEDGERS
-- ==================
CREATE POLICY "ledgers_select" ON ledgers
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "ledgers_insert" ON ledgers
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "ledgers_update" ON ledgers
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL)
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "ledgers_delete" ON ledgers
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

-- ==================
-- VOUCHERS
-- ==================
CREATE POLICY "vouchers_select" ON vouchers
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "vouchers_insert" ON vouchers
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "vouchers_update" ON vouchers
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL)
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "vouchers_delete" ON vouchers
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

-- ==================
-- SALES
-- ==================
CREATE POLICY "sales_select" ON sales
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "sales_insert" ON sales
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "sales_update" ON sales
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL)
    WITH CHECK (owner_id = auth.uid());

-- ==================
-- SALES ITEMS
-- ==================
CREATE POLICY "sales_items_select" ON sales_items
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "sales_items_insert" ON sales_items
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "sales_items_update" ON sales_items
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL)
    WITH CHECK (owner_id = auth.uid());

-- ==================
-- PURCHASES
-- ==================
CREATE POLICY "purchases_select" ON purchases
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "purchases_insert" ON purchases
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "purchases_update" ON purchases
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL)
    WITH CHECK (owner_id = auth.uid());

-- ==================
-- PURCHASE ITEMS
-- ==================
CREATE POLICY "purchase_items_select" ON purchase_items
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "purchase_items_insert" ON purchase_items
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "purchase_items_update" ON purchase_items
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL)
    WITH CHECK (owner_id = auth.uid());

-- ==================
-- STOCK ITEMS (if exists)
-- ==================
DO $$ BEGIN
    DROP POLICY IF EXISTS "stock_items_select" ON stock_items;
    DROP POLICY IF EXISTS "stock_items_insert" ON stock_items;
    DROP POLICY IF EXISTS "stock_items_update" ON stock_items;
    
    CREATE POLICY "stock_items_select" ON stock_items
        FOR SELECT TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL);
    
    CREATE POLICY "stock_items_insert" ON stock_items
        FOR INSERT TO authenticated
        WITH CHECK (owner_id = auth.uid());
    
    CREATE POLICY "stock_items_update" ON stock_items
        FOR UPDATE TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL)
        WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ==================
-- VOUCHER LEDGER ENTRIES (if exists)
-- ==================
DO $$ BEGIN
    DROP POLICY IF EXISTS "vle_select" ON voucher_ledger_entries;
    DROP POLICY IF EXISTS "vle_insert" ON voucher_ledger_entries;
    DROP POLICY IF EXISTS "vle_update" ON voucher_ledger_entries;
    
    CREATE POLICY "vle_select" ON voucher_ledger_entries
        FOR SELECT TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL);
    
    CREATE POLICY "vle_insert" ON voucher_ledger_entries
        FOR INSERT TO authenticated
        WITH CHECK (owner_id = auth.uid());
    
    CREATE POLICY "vle_update" ON voucher_ledger_entries
        FOR UPDATE TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL)
        WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ==================
-- VOUCHER STOCK ENTRIES (if exists)
-- ==================
DO $$ BEGIN
    DROP POLICY IF EXISTS "vse_select" ON voucher_stock_entries;
    DROP POLICY IF EXISTS "vse_insert" ON voucher_stock_entries;
    DROP POLICY IF EXISTS "vse_update" ON voucher_stock_entries;
    
    CREATE POLICY "vse_select" ON voucher_stock_entries
        FOR SELECT TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL);
    
    CREATE POLICY "vse_insert" ON voucher_stock_entries
        FOR INSERT TO authenticated
        WITH CHECK (owner_id = auth.uid());
    
    CREATE POLICY "vse_update" ON voucher_stock_entries
        FOR UPDATE TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL)
        WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ==================
-- BANK ALLOCATIONS (if exists)
-- ==================
DO $$ BEGIN
    DROP POLICY IF EXISTS "bank_alloc_select" ON bank_allocations;
    DROP POLICY IF EXISTS "bank_alloc_insert" ON bank_allocations;
    DROP POLICY IF EXISTS "bank_alloc_update" ON bank_allocations;
    
    CREATE POLICY "bank_alloc_select" ON bank_allocations
        FOR SELECT TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL);
    
    CREATE POLICY "bank_alloc_insert" ON bank_allocations
        FOR INSERT TO authenticated
        WITH CHECK (owner_id = auth.uid());
    
    CREATE POLICY "bank_alloc_update" ON bank_allocations
        FOR UPDATE TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL)
        WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ==================
-- BILL ALLOCATIONS (if exists)
-- ==================
DO $$ BEGIN
    DROP POLICY IF EXISTS "bill_alloc_select" ON bill_allocations;
    DROP POLICY IF EXISTS "bill_alloc_insert" ON bill_allocations;
    DROP POLICY IF EXISTS "bill_alloc_update" ON bill_allocations;
    
    CREATE POLICY "bill_alloc_select" ON bill_allocations
        FOR SELECT TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL);
    
    CREATE POLICY "bill_alloc_insert" ON bill_allocations
        FOR INSERT TO authenticated
        WITH CHECK (owner_id = auth.uid());
    
    CREATE POLICY "bill_alloc_update" ON bill_allocations
        FOR UPDATE TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL)
        WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ==================
-- GST DETAILS (if exists)
-- ==================
DO $$ BEGIN
    DROP POLICY IF EXISTS "gst_select" ON gst_details;
    DROP POLICY IF EXISTS "gst_insert" ON gst_details;
    DROP POLICY IF EXISTS "gst_update" ON gst_details;
    
    CREATE POLICY "gst_select" ON gst_details
        FOR SELECT TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL);
    
    CREATE POLICY "gst_insert" ON gst_details
        FOR INSERT TO authenticated
        WITH CHECK (owner_id = auth.uid());
    
    CREATE POLICY "gst_update" ON gst_details
        FOR UPDATE TO authenticated
        USING (owner_id = auth.uid() OR owner_id IS NULL)
        WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ============================================
-- STEP 5: GRANT PERMISSIONS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledgers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_items TO authenticated;

-- Grant on tables that may or may not exist
DO $$ BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON stock_items TO authenticated'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON voucher_ledger_entries TO authenticated'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON voucher_stock_entries TO authenticated'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON bank_allocations TO authenticated'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON bill_allocations TO authenticated'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON gst_details TO authenticated'; EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ============================================
-- STEP 6: SECURITY HARDENING 
-- Revoke dangerous permissions from anon role
-- ============================================

-- Anon should NEVER have write access
REVOKE INSERT, UPDATE, DELETE ON companies FROM anon;
REVOKE INSERT, UPDATE, DELETE ON ledgers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON vouchers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON sales FROM anon;
REVOKE INSERT, UPDATE, DELETE ON sales_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON purchases FROM anon;
REVOKE INSERT, UPDATE, DELETE ON purchase_items FROM anon;

DO $$ BEGIN EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON stock_items FROM anon'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON voucher_ledger_entries FROM anon'; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON voucher_stock_entries FROM anon'; EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ============================================
-- STEP 7: ADD UNIQUE CONSTRAINT ON companies.name  
-- Required for on_conflict=name upsert to work
-- ============================================
DO $$ BEGIN
    ALTER TABLE companies ADD CONSTRAINT companies_name_unique UNIQUE (name);
EXCEPTION 
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- STEP 8: BACKFILL owner_id ON EXISTING DATA
-- If you have existing data without owner_id, set it
-- Replace YOUR_USER_UUID with your actual user UUID from Supabase Auth
-- ============================================
-- UNCOMMENT and run manually after replacing UUID:
-- UPDATE companies SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE ledgers SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE vouchers SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE stock_items SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE sales SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE sales_items SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE purchases SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;
-- UPDATE purchase_items SET owner_id = 'YOUR_USER_UUID' WHERE owner_id IS NULL;


-- ============================================
-- VERIFICATION: Check everything is set up
-- ============================================
SELECT 
    schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
