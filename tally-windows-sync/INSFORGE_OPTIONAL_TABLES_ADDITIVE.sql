-- If previous run failed with "current transaction is aborted", run: ROLLBACK;
-- InsForge optional tables stabilization (additive, non-destructive)
-- Date: 2026-03-04
-- Purpose: prevent 404 for app_settings / pending_transactions / recurring_invoices and enable AI entry queue.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) app_settings (used by landing/admin settings)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    company_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.app_settings ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE IF EXISTS public.app_settings ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.app_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_app_settings_company_id ON public.app_settings(company_id);

-- ---------------------------------------------------------------------------
-- 2) pending_transactions (AI/web queue -> desktop sync)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pending_transactions (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::TEXT,
    company_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    transaction_type TEXT,
    voucher_data JSONB,
    created_by TEXT,
    sync_api_key TEXT,
    tally_voucher_number TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS voucher_data JSONB;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS sync_api_key TEXT;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS tally_voucher_number TEXT;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pending_transactions_company_status ON public.pending_transactions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_transactions_created_at ON public.pending_transactions(created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) recurring_invoices (used by recurring module)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recurring_invoices (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::TEXT,
    company_id TEXT NOT NULL,
    party_id TEXT,
    party_name TEXT,
    amount NUMERIC DEFAULT 0,
    frequency TEXT,
    start_date DATE DEFAULT CURRENT_DATE,
    next_invoice_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    status TEXT DEFAULT 'active',
    items JSONB DEFAULT '[]'::JSONB,
    total_generated INTEGER DEFAULT 0,
    last_generated TIMESTAMPTZ,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS party_id TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS party_name TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS frequency TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS next_invoice_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::JSONB;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS total_generated INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS last_generated TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_company_status ON public.recurring_invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_next_date ON public.recurring_invoices(next_invoice_date);

-- ---------------------------------------------------------------------------
-- 4) Automation persistence tables (bank/invoice/gst modules)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bank_ledger_mappings (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::TEXT,
    company_id TEXT NOT NULL,
    owner_id UUID,
    created_by TEXT,
    normalized_keyword TEXT NOT NULL,
    ledger_name TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    confidence NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS normalized_keyword TEXT;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS ledger_name TEXT;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS confidence NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_ledger_mappings_unique
    ON public.bank_ledger_mappings (company_id, COALESCE(created_by, ''), normalized_keyword);
CREATE INDEX IF NOT EXISTS idx_bank_ledger_mappings_company_owner
    ON public.bank_ledger_mappings (company_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_bank_ledger_mappings_created_at
    ON public.bank_ledger_mappings (created_at DESC);

CREATE TABLE IF NOT EXISTS public.imported_invoices (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::TEXT,
    company_id TEXT NOT NULL,
    owner_id UUID,
    created_by TEXT,
    source TEXT DEFAULT 'invoice_import',
    party_name TEXT,
    gstin TEXT,
    invoice_number TEXT,
    invoice_date DATE,
    hsn_code TEXT,
    taxable_value NUMERIC DEFAULT 0,
    cgst NUMERIC DEFAULT 0,
    sgst NUMERIC DEFAULT 0,
    igst NUMERIC DEFAULT 0,
    total_tax NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    invoice_type TEXT DEFAULT 'B2C',
    status TEXT DEFAULT 'draft',
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'invoice_import';
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS party_name TEXT;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS taxable_value NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS cgst NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS sgst NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS igst NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS total_tax NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'B2C';
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS raw_payload JSONB;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_imported_invoices_company_date
    ON public.imported_invoices (company_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_imported_invoices_company_owner
    ON public.imported_invoices (company_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_imported_invoices_invoice_number
    ON public.imported_invoices (company_id, invoice_number);

CREATE TABLE IF NOT EXISTS public.gst_automation_runs (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::TEXT,
    company_id TEXT NOT NULL,
    owner_id UUID,
    created_by TEXT,
    source_mode TEXT DEFAULT 'local',
    invoice_count INTEGER DEFAULT 0,
    result_json JSONB,
    validation_errors JSONB DEFAULT '[]'::JSONB,
    validation_warnings JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS source_mode TEXT DEFAULT 'local';
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS invoice_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS result_json JSONB;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS validation_errors JSONB DEFAULT '[]'::JSONB;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS validation_warnings JSONB DEFAULT '[]'::JSONB;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_gst_runs_company_created_at
    ON public.gst_automation_runs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gst_runs_company_owner
    ON public.gst_automation_runs (company_id, owner_id);
CREATE TABLE IF NOT EXISTS public.sync_history (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::TEXT,
    company_id TEXT NOT NULL,
    owner_id UUID,
    created_by TEXT,
    sync_type TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    ledgers_synced INTEGER DEFAULT 0,
    vouchers_synced INTEGER DEFAULT 0,
    sales_synced INTEGER DEFAULT 0,
    purchases_synced INTEGER DEFAULT 0,
    stock_synced INTEGER DEFAULT 0,
    total_records INTEGER DEFAULT 0,
    voucher_ids JSONB DEFAULT '[]'::JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS sync_type TEXT DEFAULT 'manual';
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running';
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS ledgers_synced INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS vouchers_synced INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS sales_synced INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS purchases_synced INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS stock_synced INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS total_records INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS voucher_ids JSONB DEFAULT '[]'::JSONB;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sync_history_company_started
    ON public.sync_history (company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_history_company_status
    ON public.sync_history (company_id, status);
-- ---------------------------------------------------------------------------
-- 4) Access grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pending_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bank_ledger_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imported_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gst_automation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_history TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Core dashboard permissions + RLS policies (fixes 401 on AI/GST pages)
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_ledger_entries ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_stock_entries ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.app_settings ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.pending_transactions ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.recurring_invoices ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.imported_invoices ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.gst_automation_runs ADD COLUMN IF NOT EXISTS owner_id UUID;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ledgers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voucher_ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voucher_stock_entries TO authenticated;

ALTER TABLE IF EXISTS public.ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.voucher_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.voucher_stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pending_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bank_ledger_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.imported_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gst_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ledgers',
    'vouchers',
    'stock_items',
    'voucher_ledger_entries',
    'voucher_stock_entries',
    'app_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);

    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL)', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL)', t, t);
    EXECUTE format('CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL) WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL)', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL)', t, t);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS pending_transactions_select ON public.pending_transactions;
DROP POLICY IF EXISTS pending_transactions_insert ON public.pending_transactions;
DROP POLICY IF EXISTS pending_transactions_update ON public.pending_transactions;
DROP POLICY IF EXISTS pending_transactions_delete ON public.pending_transactions;

CREATE POLICY pending_transactions_select ON public.pending_transactions
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR owner_id IS NULL
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY pending_transactions_insert ON public.pending_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() OR owner_id IS NULL)
    AND (NULLIF(created_by, '') IS NULL OR NULLIF(created_by, '') = auth.uid()::TEXT)
  );

CREATE POLICY pending_transactions_update ON public.pending_transactions
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY pending_transactions_delete ON public.pending_transactions
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS recurring_invoices_select ON public.recurring_invoices;
DROP POLICY IF EXISTS recurring_invoices_insert ON public.recurring_invoices;
DROP POLICY IF EXISTS recurring_invoices_update ON public.recurring_invoices;
DROP POLICY IF EXISTS recurring_invoices_delete ON public.recurring_invoices;

CREATE POLICY recurring_invoices_select ON public.recurring_invoices
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR owner_id IS NULL
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY recurring_invoices_insert ON public.recurring_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() OR owner_id IS NULL)
    AND (NULLIF(created_by, '') IS NULL OR NULLIF(created_by, '') = auth.uid()::TEXT)
  );

CREATE POLICY recurring_invoices_update ON public.recurring_invoices
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY recurring_invoices_delete ON public.recurring_invoices
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS bank_ledger_mappings_select ON public.bank_ledger_mappings;
DROP POLICY IF EXISTS bank_ledger_mappings_insert ON public.bank_ledger_mappings;
DROP POLICY IF EXISTS bank_ledger_mappings_update ON public.bank_ledger_mappings;
DROP POLICY IF EXISTS bank_ledger_mappings_delete ON public.bank_ledger_mappings;

CREATE POLICY bank_ledger_mappings_select ON public.bank_ledger_mappings
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY bank_ledger_mappings_insert ON public.bank_ledger_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() OR owner_id IS NULL)
    AND (NULLIF(created_by, '') IS NULL OR NULLIF(created_by, '') = auth.uid()::TEXT)
  );

CREATE POLICY bank_ledger_mappings_update ON public.bank_ledger_mappings
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY bank_ledger_mappings_delete ON public.bank_ledger_mappings
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS imported_invoices_select ON public.imported_invoices;
DROP POLICY IF EXISTS imported_invoices_insert ON public.imported_invoices;
DROP POLICY IF EXISTS imported_invoices_update ON public.imported_invoices;
DROP POLICY IF EXISTS imported_invoices_delete ON public.imported_invoices;

CREATE POLICY imported_invoices_select ON public.imported_invoices
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY imported_invoices_insert ON public.imported_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() OR owner_id IS NULL)
    AND (NULLIF(created_by, '') IS NULL OR NULLIF(created_by, '') = auth.uid()::TEXT)
  );

CREATE POLICY imported_invoices_update ON public.imported_invoices
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY imported_invoices_delete ON public.imported_invoices
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS gst_automation_runs_select ON public.gst_automation_runs;
DROP POLICY IF EXISTS gst_automation_runs_insert ON public.gst_automation_runs;
DROP POLICY IF EXISTS gst_automation_runs_update ON public.gst_automation_runs;
DROP POLICY IF EXISTS gst_automation_runs_delete ON public.gst_automation_runs;

CREATE POLICY gst_automation_runs_select ON public.gst_automation_runs
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY gst_automation_runs_insert ON public.gst_automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() OR owner_id IS NULL)
    AND (NULLIF(created_by, '') IS NULL OR NULLIF(created_by, '') = auth.uid()::TEXT)
  );

CREATE POLICY gst_automation_runs_update ON public.gst_automation_runs
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY gst_automation_runs_delete ON public.gst_automation_runs
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS sync_history_select ON public.sync_history;
DROP POLICY IF EXISTS sync_history_insert ON public.sync_history;
DROP POLICY IF EXISTS sync_history_update ON public.sync_history;
DROP POLICY IF EXISTS sync_history_delete ON public.sync_history;

CREATE POLICY sync_history_select ON public.sync_history
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR owner_id IS NULL
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY sync_history_insert ON public.sync_history
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() OR owner_id IS NULL)
    AND (NULLIF(created_by, '') IS NULL OR NULLIF(created_by, '') = auth.uid()::TEXT)
  );

CREATE POLICY sync_history_update ON public.sync_history
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );

CREATE POLICY sync_history_delete ON public.sync_history
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR NULLIF(created_by, '') = auth.uid()::TEXT
  );
-- ---------------------------------------------------------------------------
-- 6) Optional backfill for missing owner/HSN/tax values
-- ---------------------------------------------------------------------------

UPDATE public.pending_transactions
SET owner_id = created_by::UUID
WHERE owner_id IS NULL
  AND created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.recurring_invoices
SET owner_id = created_by::UUID
WHERE owner_id IS NULL
  AND created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.bank_ledger_mappings
SET owner_id = created_by::UUID
WHERE owner_id IS NULL
  AND created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.imported_invoices
SET owner_id = created_by::UUID
WHERE owner_id IS NULL
  AND created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.gst_automation_runs
SET owner_id = created_by::UUID
WHERE owner_id IS NULL
  AND created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.pending_transactions
SET
  status = 'pending',
  retry_count = 0,
  error_message = NULL,
  updated_at = NOW()
WHERE status = 'failed'
  AND COALESCE(retry_count, 0) >= 3
  AND (
    COALESCE(error_message, '') ILIKE '%voucher date is missing%'
    OR COALESCE(error_message, '') ILIKE '%retry 3/3%'
  );

UPDATE public.imported_invoices
SET
  total_tax = COALESCE(cgst, 0) + COALESCE(sgst, 0) + COALESCE(igst, 0),
  total_amount = COALESCE(taxable_value, 0) + (COALESCE(cgst, 0) + COALESCE(sgst, 0) + COALESCE(igst, 0))
WHERE COALESCE(total_tax, 0) = 0
   OR COALESCE(total_amount, 0) = 0;

UPDATE public.voucher_stock_entries vse
SET
  hsn_code = COALESCE(NULLIF(vse.hsn_code, ''), si.hsn_code),
  tax_rate = CASE
    WHEN COALESCE(vse.tax_rate, 0) = 0 THEN COALESCE(si.gst_rate, 0)
    ELSE vse.tax_rate
  END
FROM public.stock_items si
WHERE vse.company_id = si.company_id
  AND LOWER(TRIM(COALESCE(vse.stock_item_name, ''))) = LOWER(TRIM(COALESCE(si.name, '')))
  AND (
    COALESCE(NULLIF(vse.hsn_code, ''), '') = ''
    OR COALESCE(vse.tax_rate, 0) = 0
  );

-- Force PostgREST schema cache refresh.
NOTIFY pgrst, 'reload schema';