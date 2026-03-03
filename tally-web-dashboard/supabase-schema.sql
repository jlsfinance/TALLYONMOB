-- Supabase Schema Translation from setup-collections.mjs

-- Create Extension for UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COMPANIES
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    formal_name TEXT,
    address TEXT,
    phone TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    financial_year_start TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. LEDGERS
CREATE TABLE IF NOT EXISTS ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    parent_group TEXT,
    parent TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    closing_balance NUMERIC,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledgers_company_id ON ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_parent ON ledgers(parent);

-- 3. VOUCHERS
CREATE TABLE IF NOT EXISTS vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    vch_date_dt TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vouchers_company_id ON vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_voucher_type ON vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_is_deleted ON vouchers(is_deleted);

-- 4. STOCK_ITEMS
CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    stock_item_name TEXT,
    unit TEXT,
    hsn_code TEXT,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_items_company_id ON stock_items(company_id);

-- 5. VOUCHER_LEDGER_ENTRIES
CREATE TABLE IF NOT EXISTS voucher_ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    stock_item_name TEXT,
    unit TEXT,
    hsn_code TEXT,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vle_company_id ON voucher_ledger_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_vle_voucher_id ON voucher_ledger_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vle_is_debit ON voucher_ledger_entries(is_debit);

-- 6. VOUCHER_STOCK_ENTRIES
CREATE TABLE IF NOT EXISTS voucher_stock_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    stock_item_name TEXT,
    unit TEXT,
    hsn_code TEXT,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vse_company_id ON voucher_stock_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_vse_voucher_id ON voucher_stock_entries(voucher_id);

-- 7. SALES
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    data_hash TEXT,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_company_id ON sales(company_id);

-- 8. PURCHASES
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_company_id ON purchases(company_id);

-- 9. LEDGER_GROUPS
CREATE TABLE IF NOT EXISTS ledger_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_company_id ON ledger_groups(company_id);

-- 10. COST_CENTRES
CREATE TABLE IF NOT EXISTS cost_centres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_centres_company_id ON cost_centres(company_id);

-- 11. STOCK_GROUPS
CREATE TABLE IF NOT EXISTS stock_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_groups_company_id ON stock_groups(company_id);

-- 12. STOCK_CATEGORIES
CREATE TABLE IF NOT EXISTS stock_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_categories_company_id ON stock_categories(company_id);

-- 13. VOUCHER_TYPES
CREATE TABLE IF NOT EXISTS voucher_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voucher_types_company_id ON voucher_types(company_id);

-- 14. PRICE_LISTS
CREATE TABLE IF NOT EXISTS price_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_lists_company_id ON price_lists(company_id);

-- 15. SYNC_HISTORY
CREATE TABLE IF NOT EXISTS sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    stock_item_name TEXT,
    unit TEXT,
    hsn_code TEXT,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. SALES_ITEMS
CREATE TABLE IF NOT EXISTS sales_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    voucher_number TEXT,
    party_ledger_name TEXT,
    narration TEXT,
    alter_id TEXT,
    voucher_id TEXT,
    data_hash TEXT,
    owner_id TEXT,
    json_data JSONB,
    stock_item_name TEXT,
    unit TEXT,
    hsn_code TEXT,
    amount NUMERIC,
    quantity NUMERIC,
    rate NUMERIC,
    discount_percent NUMERIC,
    tax_rate NUMERIC,
    is_deleted BOOLEAN DEFAULT false,
    is_debit BOOLEAN,
    is_inward BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. PENDING_TRANSACTIONS
CREATE TABLE IF NOT EXISTS pending_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    status TEXT,
    transaction_type TEXT,
    voucher_data JSONB,
    created_by TEXT,
    tally_voucher_number TEXT,
    error_message TEXT,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_company_id ON pending_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_transactions(status);

-- 18. BILL_ALLOCATIONS
CREATE TABLE IF NOT EXISTS bill_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 19. BANK_ALLOCATIONS
CREATE TABLE IF NOT EXISTS bank_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 20. REST
CREATE TABLE IF NOT EXISTS rest (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT,
    name TEXT,
    status TEXT,
    sync_api_key TEXT,
    voucher_type TEXT,
    vch_date TIMESTAMP WITH TIME ZONE,
    invoice_number TEXT,
    json_data JSONB,
    amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
