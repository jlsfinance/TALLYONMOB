-- ============================================================================
-- FIX: desktop app ka sync fail ho raha tha (Supabase error 42501)
--
-- Karan: sync tables par RLS enabled hai lekin authenticated user ke liye
--        INSERT/UPDATE policy hai hi nahi. Isliye app company register kar leta
--        hai par har row (ledger/voucher/sale/stock...) 403 se reject ho jati hai.
--        SELECT policies hone se app ko lagta hai "Cloud Connected" hai.
--
-- Fix: har sync table par ek hi policy jo user ki apni companies tak limited hai.
--      Sirf apni company ka data -> doosre user ka data nahi dikhega/likh paoge.
--
-- Kaise chalayein: Supabase Dashboard -> SQL Editor -> ye poora file paste -> Run.
-- Dobara chalana safe hai (idempotent).
-- ============================================================================

DO $$
DECLARE
  t text;
  -- Tables jo desktop app upload karta hai (SyncManager / ApiClient)
  tables text[] := ARRAY[
    'ledgers', 'vouchers', 'sales', 'sales_items', 'purchases', 'purchase_items',
    'stock_items', 'ledger_groups', 'cost_centres', 'godowns', 'stock_groups',
    'stock_categories', 'currencies', 'voucher_types', 'units', 'budgets',
    'bill_allocations', 'bank_allocations',
    'voucher_ledger_entries', 'voucher_stock_entries',
    'sync_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Table exist na kare to skip (price_lists / debit_credit_notes / sync_metadata
    -- is project me nahi hain)
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip (missing table): %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_owner_all ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY sync_owner_all ON public.%I
        FOR ALL TO authenticated
        USING  (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
        WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
    $f$, t);
  END LOOP;
END $$;

-- companies: insert/update apne owner ki hi
DROP POLICY IF EXISTS sync_owner_companies ON public.companies;
CREATE POLICY sync_owner_companies ON public.companies
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Grants (RLS policies ke saath dono chahiye)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Verify: policies dikhni chahiye
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname IN ('sync_owner_all', 'sync_owner_companies')
ORDER BY tablename;
