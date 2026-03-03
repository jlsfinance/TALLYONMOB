-- If previous run failed with "current transaction is aborted", run: ROLLBACK;
-- InsForge sync stabilization migration (additive, non-destructive)
-- Date: 2026-03-01
-- Purpose: align backend schema with desktop sync payloads and RLS expectations.


-- ---------------------------------------------------------------------------
-- 1) Missing compatibility tables
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2) Add missing columns on existing tables (compatibility aliases)
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS parent TEXT;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS ledger_type TEXT;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS current_balance NUMERIC;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS parent_group TEXT;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS ledger_group TEXT;
ALTER TABLE IF EXISTS public.ledgers ADD COLUMN IF NOT EXISTS closing_balance NUMERIC;

ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS voucher_date DATE;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS party_name TEXT;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS total_amount NUMERIC;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS grand_total NUMERIC;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS vch_date TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS party_ledger_name TEXT;
ALTER TABLE IF EXISTS public.vouchers ADD COLUMN IF NOT EXISTS amount NUMERIC;

-- Stock item compatibility aliases used by older reports/UI filters
ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS opening_balance NUMERIC;
ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS closing_balance NUMERIC;
ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS base_unit TEXT;

ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.sales_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.purchases ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.purchase_items ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Add owner_id to all known sync target tables (safe additive)
ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_ledger_entries ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_stock_entries ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.bill_allocations ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.bank_allocations ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.ledger_groups ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.cost_centres ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.godowns ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.stock_groups ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.stock_categories ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.currencies ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.voucher_types ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.units ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.budgets ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.budget_allocations ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.gst_details ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.price_lists ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.debit_credit_notes ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.sync_history ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.sync_metadata ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Optional compatibility backfill from legacy columns (non-destructive)
DO $$
BEGIN
    IF to_regclass('public.ledgers') IS NOT NULL THEN
        UPDATE public.ledgers
        SET parent = COALESCE(parent, parent_group),
            ledger_type = COALESCE(ledger_type, ledger_group),
            current_balance = COALESCE(current_balance, closing_balance)
        WHERE parent IS NULL
           OR ledger_type IS NULL
           OR current_balance IS NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.vouchers') IS NOT NULL THEN
        UPDATE public.vouchers
        SET voucher_date = COALESCE(voucher_date, vch_date::date),
            party_name = COALESCE(party_name, party_ledger_name),
            total_amount = COALESCE(total_amount, amount),
            grand_total = COALESCE(grand_total, total_amount, amount),
            is_deleted = COALESCE(is_deleted, FALSE)
        WHERE voucher_date IS NULL
           OR party_name IS NULL
           OR total_amount IS NULL
           OR grand_total IS NULL
           OR is_deleted IS NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.stock_items') IS NOT NULL THEN
        UPDATE public.stock_items
        SET opening_stock = COALESCE(opening_stock, opening_balance),
            current_stock = COALESCE(current_stock, closing_balance),
            opening_balance = COALESCE(opening_balance, opening_stock),
            closing_balance = COALESCE(closing_balance, current_stock),
            base_unit = COALESCE(base_unit, unit),
            unit = COALESCE(unit, base_unit)
        WHERE opening_stock IS NULL
           OR current_stock IS NULL
           OR opening_balance IS NULL
           OR closing_balance IS NULL
           OR base_unit IS NULL
           OR unit IS NULL;
    END IF;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    IF to_regclass('public.companies') IS NOT NULL THEN
        FOREACH t IN ARRAY ARRAY[
            'ledgers','vouchers','stock_items','sales','sales_items','purchases','purchase_items',
            'voucher_ledger_entries','voucher_stock_entries','bill_allocations','bank_allocations',
            'ledger_groups','cost_centres','godowns','stock_groups','stock_categories','currencies',
            'voucher_types','units','budgets','budget_allocations','gst_details','price_lists',
            'debit_credit_notes','sync_history','sync_metadata'
        ] LOOP
            IF to_regclass('public.' || t) IS NOT NULL
               AND EXISTS (
                   SELECT 1
                   FROM information_schema.columns c
                   WHERE c.table_schema = 'public'
                     AND c.table_name = t
                     AND c.column_name = 'company_id'
               )
               AND EXISTS (
                   SELECT 1
                   FROM information_schema.columns c
                   WHERE c.table_schema = 'public'
                     AND c.table_name = t
                     AND c.column_name = 'owner_id'
               )
            THEN
                EXECUTE format(
                    'UPDATE public.%I dst
                     SET owner_id = src.owner_id
                     FROM public.companies src
                     WHERE dst.company_id = src.id
                       AND dst.owner_id IS NULL
                       AND src.owner_id IS NOT NULL',
                    t
                );
            END IF;
        END LOOP;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.5) Add FK links for PostgREST relation queries (safe, NOT VALID)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    -- voucher_ledger_entries.voucher_id -> vouchers.id
    IF to_regclass('public.voucher_ledger_entries') IS NOT NULL
       AND to_regclass('public.vouchers') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'voucher_ledger_entries'
             AND c.column_name = 'voucher_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'voucher_ledger_entries'
             AND kcu.column_name = 'voucher_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.voucher_ledger_entries ADD CONSTRAINT fk_voucher_ledger_entries_voucher_id FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_voucher_ledger_entries_voucher_id: %', SQLERRM;
        END;
    END IF;

    -- voucher_stock_entries.voucher_id -> vouchers.id
    IF to_regclass('public.voucher_stock_entries') IS NOT NULL
       AND to_regclass('public.vouchers') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'voucher_stock_entries'
             AND c.column_name = 'voucher_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'voucher_stock_entries'
             AND kcu.column_name = 'voucher_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.voucher_stock_entries ADD CONSTRAINT fk_voucher_stock_entries_voucher_id FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_voucher_stock_entries_voucher_id: %', SQLERRM;
        END;
    END IF;

    -- sales.voucher_id -> vouchers.id
    IF to_regclass('public.sales') IS NOT NULL
       AND to_regclass('public.vouchers') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'sales'
             AND c.column_name = 'voucher_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'sales'
             AND kcu.column_name = 'voucher_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.sales ADD CONSTRAINT fk_sales_voucher_id FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_sales_voucher_id: %', SQLERRM;
        END;
    END IF;

    -- purchases.voucher_id -> vouchers.id
    IF to_regclass('public.purchases') IS NOT NULL
       AND to_regclass('public.vouchers') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'purchases'
             AND c.column_name = 'voucher_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'purchases'
             AND kcu.column_name = 'voucher_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.purchases ADD CONSTRAINT fk_purchases_voucher_id FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_purchases_voucher_id: %', SQLERRM;
        END;
    END IF;

    -- sales_items.sale_id -> sales.id
    IF to_regclass('public.sales_items') IS NOT NULL
       AND to_regclass('public.sales') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'sales_items'
             AND c.column_name = 'sale_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'sales_items'
             AND kcu.column_name = 'sale_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.sales_items ADD CONSTRAINT fk_sales_items_sale_id FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_sales_items_sale_id: %', SQLERRM;
        END;
    END IF;

    -- purchase_items.purchase_id -> purchases.id
    IF to_regclass('public.purchase_items') IS NOT NULL
       AND to_regclass('public.purchases') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'purchase_items'
             AND c.column_name = 'purchase_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'purchase_items'
             AND kcu.column_name = 'purchase_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.purchase_items ADD CONSTRAINT fk_purchase_items_purchase_id FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_purchase_items_purchase_id: %', SQLERRM;
        END;
    END IF;

    -- bill_allocations.voucher_id -> vouchers.id
    IF to_regclass('public.bill_allocations') IS NOT NULL
       AND to_regclass('public.vouchers') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'bill_allocations'
             AND c.column_name = 'voucher_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'bill_allocations'
             AND kcu.column_name = 'voucher_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.bill_allocations ADD CONSTRAINT fk_bill_allocations_voucher_id FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE SET NULL NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_bill_allocations_voucher_id: %', SQLERRM;
        END;
    END IF;

    -- bank_allocations.voucher_id -> vouchers.id
    IF to_regclass('public.bank_allocations') IS NOT NULL
       AND to_regclass('public.vouchers') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'bank_allocations'
             AND c.column_name = 'voucher_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = 'bank_allocations'
             AND kcu.column_name = 'voucher_id'
       )
    THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.bank_allocations ADD CONSTRAINT fk_bank_allocations_voucher_id FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE SET NULL NOT VALID';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping FK fk_bank_allocations_voucher_id: %', SQLERRM;
        END;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Indexes for sync performance
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'companies','ledgers','vouchers','stock_items','sales','sales_items','purchases','purchase_items',
        'voucher_ledger_entries','voucher_stock_entries','bill_allocations','bank_allocations',
        'ledger_groups','cost_centres','godowns','stock_groups','stock_categories','currencies',
        'voucher_types','units','budgets','budget_allocations','gst_details','price_lists',
        'debit_credit_notes','sync_history','sync_metadata'
    ] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name = t
                  AND c.column_name = 'company_id'
            ) THEN
                EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON public.%I (company_id)', t, t);
            END IF;

            IF EXISTS (
                SELECT 1
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name = t
                  AND c.column_name = 'owner_id'
            ) THEN
                EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_owner_id ON public.%I (owner_id)', t, t);
            END IF;
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['ledgers','vouchers','stock_items','sales','purchases'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = t
                 AND c.column_name = 'alter_id'
           ) THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_alter_id ON public.%I (alter_id)', t, t);
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['voucher_ledger_entries','voucher_stock_entries','bill_allocations','bank_allocations','sales','purchases'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = t
                 AND c.column_name = 'voucher_id'
           ) THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_voucher_id ON public.%I (voucher_id)', t, t);
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) RLS + grants for all synced tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'companies','ledgers','vouchers','stock_items','sales','sales_items','purchases','purchase_items',
        'voucher_ledger_entries','voucher_stock_entries','bill_allocations','bank_allocations',
        'ledger_groups','cost_centres','godowns','stock_groups','stock_categories','currencies',
        'voucher_types','units','budgets','budget_allocations','gst_details','price_lists',
        'debit_credit_notes','sync_history','sync_metadata'
    ] LOOP
        IF to_regclass('public.' || t) IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = t
                 AND c.column_name = 'owner_id'
           ) THEN

            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

            EXECUTE format('DROP POLICY IF EXISTS insforge_owner_select ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS insforge_owner_insert ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS insforge_owner_update ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS insforge_owner_delete ON public.%I', t);

            EXECUTE format(
                'CREATE POLICY insforge_owner_select ON public.%I FOR SELECT TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL)',
                t
            );

            EXECUTE format(
                'CREATE POLICY insforge_owner_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid())',
                t
            );

            EXECUTE format(
                'CREATE POLICY insforge_owner_update ON public.%I FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL) WITH CHECK (owner_id = auth.uid())',
                t
            );

            EXECUTE format(
                'CREATE POLICY insforge_owner_delete ON public.%I FOR DELETE TO authenticated USING (owner_id = auth.uid())',
                t
            );

            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
        END IF;
    END LOOP;
END $$;

-- Force PostgREST/InsForge schema cache refresh.
-- If your environment does not support this notify channel, ignore harmless warning.
NOTIFY pgrst, 'reload schema';



