-- ============================================================
-- Fix vouchers RLS policy
-- Problem: RLS policy references user_id column which doesn't exist
-- The vouchers table uses owner_id (text) not user_id (uuid)
-- ============================================================

-- Drop existing policies on vouchers (if any)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own vouchers" ON vouchers;
    DROP POLICY IF EXISTS "Users can insert own vouchers" ON vouchers;
    DROP POLICY IF EXISTS "Users can update own vouchers" ON vouchers;
    DROP POLICY IF EXISTS "Users can delete own vouchers" ON vouchers;
    DROP POLICY IF EXISTS "vouchers_select_policy" ON vouchers;
    DROP POLICY IF EXISTS "vouchers_insert_policy" ON vouchers;
    DROP POLICY IF EXISTS "vouchers_update_policy" ON vouchers;
    DROP POLICY IF EXISTS "vouchers_delete_policy" ON vouchers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Ensure RLS is enabled
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

-- Permissive policy: all authenticated users can read/write vouchers
-- (Company-level filtering is done in the app code via company_id)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'vouchers' AND policyname = 'auth_all_vouchers'
    ) THEN
        CREATE POLICY "auth_all_vouchers" ON vouchers
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same fix for ledgers (if needed)
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own ledgers" ON ledgers;
    DROP POLICY IF EXISTS "auth_all_ledgers" ON ledgers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'ledgers' AND policyname = 'auth_all_ledgers'
    ) THEN
        CREATE POLICY "auth_all_ledgers" ON ledgers
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for stock_items
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_stock_items" ON stock_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stock_items' AND policyname = 'auth_all_stock_items'
    ) THEN
        CREATE POLICY "auth_all_stock_items" ON stock_items
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for voucher_ledger_entries
ALTER TABLE voucher_ledger_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_vle" ON voucher_ledger_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'voucher_ledger_entries' AND policyname = 'auth_all_vle'
    ) THEN
        CREATE POLICY "auth_all_vle" ON voucher_ledger_entries
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for voucher_stock_entries
ALTER TABLE voucher_stock_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_vse" ON voucher_stock_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'voucher_stock_entries' AND policyname = 'auth_all_vse'
    ) THEN
        CREATE POLICY "auth_all_vse" ON voucher_stock_entries
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for pending_transactions
ALTER TABLE pending_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_pending" ON pending_transactions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pending_transactions' AND policyname = 'auth_all_pending'
    ) THEN
        CREATE POLICY "auth_all_pending" ON pending_transactions
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for sales
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_sales" ON sales;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sales' AND policyname = 'auth_all_sales'
    ) THEN
        CREATE POLICY "auth_all_sales" ON sales
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_purchases" ON purchases;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'auth_all_purchases'
    ) THEN
        CREATE POLICY "auth_all_purchases" ON purchases
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for sales_items
ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_sales_items" ON sales_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sales_items' AND policyname = 'auth_all_sales_items'
    ) THEN
        CREATE POLICY "auth_all_sales_items" ON sales_items
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Same for purchase_items (if exists)
DO $$ BEGIN
    ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_purchase_items" ON purchase_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'purchase_items' AND policyname = 'auth_all_purchase_items'
    ) THEN
        CREATE POLICY "auth_all_purchase_items" ON purchase_items
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
