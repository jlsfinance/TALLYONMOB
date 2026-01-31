-- ============================================
-- LIVEKEEPING TALLY SYNC - COMPLETE DATABASE SCHEMA
-- Production-Grade PostgreSQL Schema for Supabase
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. COMPANIES TABLE
-- Master table for multi-company support
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,                          -- Tally Company GUID
    name TEXT NOT NULL,
    formal_name TEXT,                             -- Full registered name
    address TEXT,
    email TEXT,
    phone TEXT,
    financial_year_start DATE,
    financial_year_end DATE,
    currency_symbol TEXT DEFAULT '₹',
    sync_api_key TEXT UNIQUE,                     -- Unique API key per company
    sync_api_key_hash TEXT,                       -- SHA-256 hash for verification
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. USERS TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',                     -- 'admin', 'user', 'viewer'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. COMPANY_USERS (Junction Table)
-- Links users to companies with role-based access
-- ============================================
CREATE TABLE IF NOT EXISTS company_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'viewer',                   -- 'owner', 'admin', 'editor', 'viewer'
    can_sync BOOLEAN DEFAULT false,               -- Only owner/admin can sync
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, user_id)
);

-- ============================================
-- 4. LEDGERS TABLE
-- All Tally ledgers (parties, banks, expenses, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS ledgers (
    id TEXT PRIMARY KEY,                          -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    alias TEXT,
    parent_group TEXT,                            -- Ledger Group (Sundry Debtors, Cash-in-Hand, etc.)
    ledger_group TEXT,                            -- Alternate: Primary group name
    opening_balance DECIMAL(18, 2) DEFAULT 0,
    closing_balance DECIMAL(18, 2) DEFAULT 0,
    credit_period INTEGER,                        -- Days
    credit_limit DECIMAL(18, 2),
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,                                   -- GST Number
    pan TEXT,                                     -- PAN Number
    is_revenue BOOLEAN DEFAULT false,
    is_deemed_positive BOOLEAN DEFAULT false,
    master_id TEXT,                               -- Tally Master ID for tracking changes
    alter_id TEXT,                                -- Tally Alter ID for incremental sync
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB,                               -- Store full Tally response
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. VOUCHERS TABLE
-- All Tally vouchers (payments, receipts, journals, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,                          -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    voucher_number TEXT,
    voucher_type TEXT NOT NULL,                   -- Sales, Purchase, Payment, Receipt, Journal, Contra
    vch_date DATE NOT NULL,
    reference_number TEXT,
    reference_date DATE,
    party_ledger_id TEXT,                         -- FK to ledgers
    party_ledger_name TEXT,
    amount DECIMAL(18, 2) DEFAULT 0,
    is_invoice BOOLEAN DEFAULT false,
    is_accounting_voucher BOOLEAN DEFAULT true,
    is_cancelled BOOLEAN DEFAULT false,
    narration TEXT,
    guid TEXT,                                    -- Original GUID for reference
    master_id TEXT,
    alter_id TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. VOUCHER_ENTRIES TABLE (Line items)
-- Individual debit/credit entries in vouchers
-- ============================================
CREATE TABLE IF NOT EXISTS voucher_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    ledger_id TEXT,
    ledger_name TEXT NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    is_debit BOOLEAN NOT NULL,                    -- true = Debit, false = Credit
    cost_centre TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. SALES TABLE
-- Sales invoices with item details
-- ============================================
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,                          -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
    invoice_number TEXT,
    invoice_date DATE NOT NULL,
    party_ledger_id TEXT,
    party_ledger_name TEXT NOT NULL,
    party_gstin TEXT,
    place_of_supply TEXT,
    gross_amount DECIMAL(18, 2) DEFAULT 0,
    discount_amount DECIMAL(18, 2) DEFAULT 0,
    taxable_amount DECIMAL(18, 2) DEFAULT 0,
    cgst_amount DECIMAL(18, 2) DEFAULT 0,
    sgst_amount DECIMAL(18, 2) DEFAULT 0,
    igst_amount DECIMAL(18, 2) DEFAULT 0,
    cess_amount DECIMAL(18, 2) DEFAULT 0,
    round_off DECIMAL(18, 2) DEFAULT 0,
    net_amount DECIMAL(18, 2) DEFAULT 0,
    is_cancelled BOOLEAN DEFAULT false,
    narration TEXT,
    master_id TEXT,
    alter_id TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. SALES_ITEMS TABLE
-- Line items in sales invoices
-- ============================================
CREATE TABLE IF NOT EXISTS sales_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stock_item_id TEXT,
    stock_item_name TEXT NOT NULL,
    quantity DECIMAL(18, 4) DEFAULT 0,
    unit TEXT,
    rate DECIMAL(18, 4) DEFAULT 0,
    discount_percent DECIMAL(8, 2) DEFAULT 0,
    amount DECIMAL(18, 2) DEFAULT 0,
    tax_rate DECIMAL(8, 2) DEFAULT 0,
    hsn_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. PURCHASES TABLE
-- Purchase invoices with item details
-- ============================================
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,                          -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
    invoice_number TEXT,
    invoice_date DATE NOT NULL,
    party_ledger_id TEXT,
    party_ledger_name TEXT NOT NULL,
    party_gstin TEXT,
    gross_amount DECIMAL(18, 2) DEFAULT 0,
    discount_amount DECIMAL(18, 2) DEFAULT 0,
    taxable_amount DECIMAL(18, 2) DEFAULT 0,
    cgst_amount DECIMAL(18, 2) DEFAULT 0,
    sgst_amount DECIMAL(18, 2) DEFAULT 0,
    igst_amount DECIMAL(18, 2) DEFAULT 0,
    cess_amount DECIMAL(18, 2) DEFAULT 0,
    round_off DECIMAL(18, 2) DEFAULT 0,
    net_amount DECIMAL(18, 2) DEFAULT 0,
    is_cancelled BOOLEAN DEFAULT false,
    narration TEXT,
    master_id TEXT,
    alter_id TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. PURCHASE_ITEMS TABLE
-- Line items in purchase invoices
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stock_item_id TEXT,
    stock_item_name TEXT NOT NULL,
    quantity DECIMAL(18, 4) DEFAULT 0,
    unit TEXT,
    rate DECIMAL(18, 4) DEFAULT 0,
    discount_percent DECIMAL(8, 2) DEFAULT 0,
    amount DECIMAL(18, 2) DEFAULT 0,
    tax_rate DECIMAL(8, 2) DEFAULT 0,
    hsn_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. STOCK TABLE
-- Stock items with current quantities
-- ============================================
CREATE TABLE IF NOT EXISTS stock (
    id TEXT PRIMARY KEY,                          -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    alias TEXT,
    stock_group TEXT,
    stock_category TEXT,
    base_unit TEXT,
    alternate_units TEXT,                         -- JSON array of alternate units
    opening_balance DECIMAL(18, 4) DEFAULT 0,
    opening_value DECIMAL(18, 2) DEFAULT 0,
    inward_quantity DECIMAL(18, 4) DEFAULT 0,
    inward_value DECIMAL(18, 2) DEFAULT 0,
    outward_quantity DECIMAL(18, 4) DEFAULT 0,
    outward_value DECIMAL(18, 2) DEFAULT 0,
    closing_balance DECIMAL(18, 4) DEFAULT 0,
    closing_value DECIMAL(18, 2) DEFAULT 0,
    gst_applicable TEXT,
    hsn_code TEXT,
    taxability TEXT,
    gst_rate DECIMAL(8, 2) DEFAULT 0,
    master_id TEXT,
    alter_id TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. STOCK_GROUPS TABLE
-- Stock group hierarchy
-- ============================================
CREATE TABLE IF NOT EXISTS stock_groups (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_group TEXT,
    is_addable BOOLEAN DEFAULT true,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. LEDGER_GROUPS TABLE
-- Ledger group hierarchy
-- ============================================
CREATE TABLE IF NOT EXISTS ledger_groups (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_group TEXT,
    is_revenue BOOLEAN DEFAULT false,
    is_deemed_positive BOOLEAN DEFAULT false,
    affects_gross_profit BOOLEAN DEFAULT false,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 14. SYNC_LOGS TABLE
-- Track all sync operations for debugging
-- ============================================
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL,                      -- 'full', 'incremental', 'manual'
    data_type TEXT NOT NULL,                      -- 'ledgers', 'vouchers', 'sales', etc.
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running',                -- 'running', 'success', 'failed', 'partial'
    error_message TEXT,
    metadata JSONB,                               -- Additional info
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 15. SYNC_STATE TABLE
-- Track incremental sync timestamps
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_master_id TEXT,                          -- Last processed Tally Master ID
    last_alter_id TEXT,                           -- Last processed Tally Alter ID
    is_initial_sync_complete BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, data_type)
);

-- ============================================
-- 16. OUTSTANDING TABLE
-- Party-wise outstanding summary
-- ============================================
CREATE TABLE IF NOT EXISTS outstanding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    ledger_id TEXT REFERENCES ledgers(id) ON DELETE CASCADE,
    ledger_name TEXT NOT NULL,
    receivable_amount DECIMAL(18, 2) DEFAULT 0,   -- What they owe us
    payable_amount DECIMAL(18, 2) DEFAULT 0,      -- What we owe them
    net_balance DECIMAL(18, 2) DEFAULT 0,         -- receivable - payable
    as_of_date DATE NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Companies
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_companies_sync_key ON companies(sync_api_key);

-- Ledgers
CREATE INDEX IF NOT EXISTS idx_ledgers_company ON ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_parent_group ON ledgers(company_id, parent_group);
CREATE INDEX IF NOT EXISTS idx_ledgers_name ON ledgers(company_id, name);
CREATE INDEX IF NOT EXISTS idx_ledgers_alter_id ON ledgers(alter_id);

-- Vouchers
CREATE INDEX IF NOT EXISTS idx_vouchers_company ON vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(company_id, vch_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(company_id, voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_party ON vouchers(company_id, party_ledger_name);
CREATE INDEX IF NOT EXISTS idx_vouchers_alter_id ON vouchers(alter_id);

-- Voucher Entries
CREATE INDEX IF NOT EXISTS idx_voucher_entries_voucher ON voucher_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_entries_ledger ON voucher_entries(ledger_name);

-- Sales
CREATE INDEX IF NOT EXISTS idx_sales_company ON sales(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_party ON sales(company_id, party_ledger_name);

-- Sales Items
CREATE INDEX IF NOT EXISTS idx_sales_items_sale ON sales_items(sale_id);

-- Purchases
CREATE INDEX IF NOT EXISTS idx_purchases_company ON purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchases_party ON purchases(company_id, party_ledger_name);

-- Purchase Items
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- Stock
CREATE INDEX IF NOT EXISTS idx_stock_company ON stock(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_group ON stock(company_id, stock_group);

-- Sync Logs
CREATE INDEX IF NOT EXISTS idx_sync_logs_company ON sync_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- Sync State
CREATE INDEX IF NOT EXISTS idx_sync_state_company ON sync_state(company_id, data_type);

-- Outstanding
CREATE INDEX IF NOT EXISTS idx_outstanding_company ON outstanding(company_id);
CREATE INDEX IF NOT EXISTS idx_outstanding_ledger ON outstanding(ledger_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE outstanding ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can only view/update their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Company Users: Users can view their company memberships
CREATE POLICY "Users can view own company memberships" ON company_users
    FOR SELECT USING (user_id = auth.uid());

-- Companies: Users can view companies they belong to
CREATE POLICY "Users can view their companies" ON companies
    FOR SELECT USING (
        id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

-- Data Tables: Users can view data from their companies
CREATE POLICY "Users can view company ledgers" ON ledgers
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view company vouchers" ON vouchers
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view company sales" ON sales
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view company purchases" ON purchases
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view company stock" ON stock
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

-- Note: Service Role Key bypasses RLS, so sync operations work fine.

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update 'updated_at' timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ledgers_updated_at BEFORE UPDATE ON ledgers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vouchers_updated_at BEFORE UPDATE ON vouchers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Dashboard Summary View
CREATE OR REPLACE VIEW v_company_summary AS
SELECT 
    c.id as company_id,
    c.name as company_name,
    (SELECT COUNT(*) FROM ledgers WHERE company_id = c.id) as total_ledgers,
    (SELECT COUNT(*) FROM vouchers WHERE company_id = c.id) as total_vouchers,
    (SELECT COALESCE(SUM(net_amount), 0) FROM sales WHERE company_id = c.id) as total_sales,
    (SELECT COALESCE(SUM(net_amount), 0) FROM purchases WHERE company_id = c.id) as total_purchases,
    c.last_sync_at
FROM companies c
WHERE c.is_active = true;

-- Ledger Balances View
CREATE OR REPLACE VIEW v_ledger_balances AS
SELECT 
    l.id,
    l.company_id,
    l.name,
    l.parent_group,
    l.opening_balance,
    l.closing_balance,
    CASE 
        WHEN l.closing_balance >= 0 THEN 'Debit'
        ELSE 'Credit'
    END as balance_type,
    ABS(l.closing_balance) as absolute_balance
FROM ledgers l
ORDER BY ABS(l.closing_balance) DESC;

-- ============================================
-- END OF SCHEMA
-- ============================================
