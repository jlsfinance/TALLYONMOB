-- Enable RLS
ALTER TABLE IF EXISTS companies ENABLE ROW LEVEL SECURITY;

-- Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ledgers Table
CREATE TABLE IF NOT EXISTS ledgers (
    id TEXT PRIMARY KEY, -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    ledger_group TEXT,
    opening_balance DECIMAL(15, 2),
    current_balance DECIMAL(15, 2),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB -- For any additional fields from Tally
);

-- Vouchers Table
CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY, -- Tally GUID
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    voucher_number TEXT,
    voucher_type TEXT,
    vch_date DATE,
    amount DECIMAL(15, 2),
    narration TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB
);

-- Sales Table
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vch_number TEXT,
    party_ledger TEXT,
    amount DECIMAL(15, 2),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB
);

-- Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vch_number TEXT,
    party_ledger TEXT,
    amount DECIMAL(15, 2),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB
);

-- Stock Items Table
CREATE TABLE IF NOT EXISTS stock (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    closing_stock DECIMAL(15, 2),
    closing_value DECIMAL(15, 2),
    base_unit TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ledgers_company ON ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_company ON vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(vch_date);
CREATE INDEX IF NOT EXISTS idx_stock_company ON stock(company_id);

-- Enable RLS Policies (Example: Service role only or authenticated access)
-- Note: Sync App uses Service Role, so RLS doesn't block it.
