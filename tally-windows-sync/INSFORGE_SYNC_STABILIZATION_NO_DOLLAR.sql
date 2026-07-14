-- InsForge sync stabilization (NO DO $$ fallback)
-- If previous run failed inside transaction, run this first:
-- ROLLBACK;

-- 1) Core compatibility tables
CREATE TABLE IF NOT EXISTS public.stock_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  owner_id UUID,
  name TEXT,
  unit TEXT,
  opening_stock NUMERIC,
  current_stock NUMERIC,
  opening_value NUMERIC,
  closing_value NUMERIC,
  rate NUMERIC,
  stock_group TEXT,
  hsn_code TEXT,
  gst_rate NUMERIC,
  master_id TEXT,
  alter_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voucher_ledger_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  owner_id UUID,
  ledger_name TEXT,
  amount NUMERIC,
  is_debit BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voucher_stock_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  owner_id UUID,
  stock_item_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  rate NUMERIC,
  amount NUMERIC,
  discount_percent NUMERIC,
  tax_rate NUMERIC,
  hsn_code TEXT,
  is_inward BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bill_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  voucher_id TEXT,
  owner_id UUID,
  ledger_name TEXT,
  bill_type TEXT,
  name TEXT,
  amount NUMERIC,
  bill_date DATE,
  due_date DATE,
  is_advance BOOLEAN DEFAULT FALSE,
  bill_credit_period TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bank_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  voucher_id TEXT,
  owner_id UUID,
  bank_name TEXT,
  instrument_number TEXT,
  instrument_date DATE,
  bank_party_name TEXT,
  transaction_type TEXT,
  ifsc_code TEXT,
  account_number TEXT,
  amount NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure core tables exist if missing
CREATE TABLE IF NOT EXISTS public.ledgers (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  name TEXT,
  alter_id TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vouchers (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  voucher_type TEXT,
  voucher_number TEXT,
  alter_id TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  voucher_id TEXT,
  alter_id TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_items (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  sale_id TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  voucher_id TEXT,
  alter_id TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  purchase_id TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Compatibility columns
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS parent TEXT;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS ledger_type TEXT;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS current_balance NUMERIC;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS voucher_date DATE;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS party_name TEXT;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS total_amount NUMERIC;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS grand_total NUMERIC;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.sales_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.purchases ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.purchase_items ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_ledger_entries ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_stock_entries ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.bill_allocations ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.bank_allocations ADD COLUMN IF NOT EXISTS owner_id UUID;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_ledgers_company_id ON public.ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_owner_id ON public.ledgers(owner_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_alter_id ON public.ledgers(alter_id);

CREATE INDEX IF NOT EXISTS idx_vouchers_company_id ON public.vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_owner_id ON public.vouchers(owner_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_alter_id ON public.vouchers(alter_id);

CREATE INDEX IF NOT EXISTS idx_stock_items_company_id ON public.stock_items(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_owner_id ON public.stock_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_alter_id ON public.stock_items(alter_id);

CREATE INDEX IF NOT EXISTS idx_sales_company_id ON public.sales(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_owner_id ON public.sales(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_voucher_id ON public.sales(voucher_id);
CREATE INDEX IF NOT EXISTS idx_sales_alter_id ON public.sales(alter_id);

CREATE INDEX IF NOT EXISTS idx_sales_items_company_id ON public.sales_items(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_owner_id ON public.sales_items(owner_id);

CREATE INDEX IF NOT EXISTS idx_purchases_company_id ON public.purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_purchases_owner_id ON public.purchases(owner_id);
CREATE INDEX IF NOT EXISTS idx_purchases_voucher_id ON public.purchases(voucher_id);
CREATE INDEX IF NOT EXISTS idx_purchases_alter_id ON public.purchases(alter_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_company_id ON public.purchase_items(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_owner_id ON public.purchase_items(owner_id);

CREATE INDEX IF NOT EXISTS idx_vle_company_id ON public.voucher_ledger_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_vle_owner_id ON public.voucher_ledger_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_vle_voucher_id ON public.voucher_ledger_entries(voucher_id);

CREATE INDEX IF NOT EXISTS idx_vse_company_id ON public.voucher_stock_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_vse_owner_id ON public.voucher_stock_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_vse_voucher_id ON public.voucher_stock_entries(voucher_id);

CREATE INDEX IF NOT EXISTS idx_bill_allocations_company_id ON public.bill_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_bill_allocations_owner_id ON public.bill_allocations(owner_id);
CREATE INDEX IF NOT EXISTS idx_bill_allocations_voucher_id ON public.bill_allocations(voucher_id);

CREATE INDEX IF NOT EXISTS idx_bank_allocations_company_id ON public.bank_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_allocations_owner_id ON public.bank_allocations(owner_id);
CREATE INDEX IF NOT EXISTS idx_bank_allocations_voucher_id ON public.bank_allocations(voucher_id);

-- 4) RLS + Policies (owner-based)
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_allocations ENABLE ROW LEVEL SECURITY;

-- ledgers
DROP POLICY IF EXISTS ledgers_select ON public.ledgers;
DROP POLICY IF EXISTS ledgers_insert ON public.ledgers;
DROP POLICY IF EXISTS ledgers_update ON public.ledgers;
DROP POLICY IF EXISTS ledgers_delete ON public.ledgers;
CREATE POLICY ledgers_select ON public.ledgers FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY ledgers_insert ON public.ledgers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY ledgers_update ON public.ledgers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY ledgers_delete ON public.ledgers FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- vouchers
DROP POLICY IF EXISTS vouchers_select ON public.vouchers;
DROP POLICY IF EXISTS vouchers_insert ON public.vouchers;
DROP POLICY IF EXISTS vouchers_update ON public.vouchers;
DROP POLICY IF EXISTS vouchers_delete ON public.vouchers;
CREATE POLICY vouchers_select ON public.vouchers FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY vouchers_insert ON public.vouchers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY vouchers_update ON public.vouchers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY vouchers_delete ON public.vouchers FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- stock_items
DROP POLICY IF EXISTS stock_items_select ON public.stock_items;
DROP POLICY IF EXISTS stock_items_insert ON public.stock_items;
DROP POLICY IF EXISTS stock_items_update ON public.stock_items;
DROP POLICY IF EXISTS stock_items_delete ON public.stock_items;
CREATE POLICY stock_items_select ON public.stock_items FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY stock_items_insert ON public.stock_items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY stock_items_update ON public.stock_items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY stock_items_delete ON public.stock_items FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- sales
DROP POLICY IF EXISTS sales_select ON public.sales;
DROP POLICY IF EXISTS sales_insert ON public.sales;
DROP POLICY IF EXISTS sales_update ON public.sales;
DROP POLICY IF EXISTS sales_delete ON public.sales;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY sales_delete ON public.sales FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- sales_items
DROP POLICY IF EXISTS sales_items_select ON public.sales_items;
DROP POLICY IF EXISTS sales_items_insert ON public.sales_items;
DROP POLICY IF EXISTS sales_items_update ON public.sales_items;
DROP POLICY IF EXISTS sales_items_delete ON public.sales_items;
CREATE POLICY sales_items_select ON public.sales_items FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY sales_items_insert ON public.sales_items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY sales_items_update ON public.sales_items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY sales_items_delete ON public.sales_items FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- purchases
DROP POLICY IF EXISTS purchases_select ON public.purchases;
DROP POLICY IF EXISTS purchases_insert ON public.purchases;
DROP POLICY IF EXISTS purchases_update ON public.purchases;
DROP POLICY IF EXISTS purchases_delete ON public.purchases;
CREATE POLICY purchases_select ON public.purchases FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY purchases_insert ON public.purchases FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY purchases_update ON public.purchases FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY purchases_delete ON public.purchases FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- purchase_items
DROP POLICY IF EXISTS purchase_items_select ON public.purchase_items;
DROP POLICY IF EXISTS purchase_items_insert ON public.purchase_items;
DROP POLICY IF EXISTS purchase_items_update ON public.purchase_items;
DROP POLICY IF EXISTS purchase_items_delete ON public.purchase_items;
CREATE POLICY purchase_items_select ON public.purchase_items FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY purchase_items_insert ON public.purchase_items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY purchase_items_update ON public.purchase_items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY purchase_items_delete ON public.purchase_items FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- voucher_ledger_entries
DROP POLICY IF EXISTS vle_select ON public.voucher_ledger_entries;
DROP POLICY IF EXISTS vle_insert ON public.voucher_ledger_entries;
DROP POLICY IF EXISTS vle_update ON public.voucher_ledger_entries;
DROP POLICY IF EXISTS vle_delete ON public.voucher_ledger_entries;
CREATE POLICY vle_select ON public.voucher_ledger_entries FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY vle_insert ON public.voucher_ledger_entries FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY vle_update ON public.voucher_ledger_entries FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY vle_delete ON public.voucher_ledger_entries FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- voucher_stock_entries
DROP POLICY IF EXISTS vse_select ON public.voucher_stock_entries;
DROP POLICY IF EXISTS vse_insert ON public.voucher_stock_entries;
DROP POLICY IF EXISTS vse_update ON public.voucher_stock_entries;
DROP POLICY IF EXISTS vse_delete ON public.voucher_stock_entries;
CREATE POLICY vse_select ON public.voucher_stock_entries FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY vse_insert ON public.voucher_stock_entries FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY vse_update ON public.voucher_stock_entries FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY vse_delete ON public.voucher_stock_entries FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- bill_allocations
DROP POLICY IF EXISTS bill_allocations_select ON public.bill_allocations;
DROP POLICY IF EXISTS bill_allocations_insert ON public.bill_allocations;
DROP POLICY IF EXISTS bill_allocations_update ON public.bill_allocations;
DROP POLICY IF EXISTS bill_allocations_delete ON public.bill_allocations;
CREATE POLICY bill_allocations_select ON public.bill_allocations FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY bill_allocations_insert ON public.bill_allocations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY bill_allocations_update ON public.bill_allocations FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY bill_allocations_delete ON public.bill_allocations FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- bank_allocations
DROP POLICY IF EXISTS bank_allocations_select ON public.bank_allocations;
DROP POLICY IF EXISTS bank_allocations_insert ON public.bank_allocations;
DROP POLICY IF EXISTS bank_allocations_update ON public.bank_allocations;
DROP POLICY IF EXISTS bank_allocations_delete ON public.bank_allocations;
CREATE POLICY bank_allocations_select ON public.bank_allocations FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY bank_allocations_insert ON public.bank_allocations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY bank_allocations_update ON public.bank_allocations FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY bank_allocations_delete ON public.bank_allocations FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledgers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_stock_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_allocations TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.ledgers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.vouchers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.stock_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.sales FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.sales_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.purchase_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.voucher_ledger_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.voucher_stock_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.bill_allocations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.bank_allocations FROM anon;
