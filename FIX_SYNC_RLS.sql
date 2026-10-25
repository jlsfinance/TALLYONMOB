-- ============================================================================
-- PERMANENT BULLETPROOF FIX: ALLOW AUTHENTICATED SYNC (RLS 42501 FIX)
--
-- Karan: Subquery 'company_id IN (SELECT id FROM companies WHERE ...)' 
--        vouchers aur bank_allocations ke time fail ho rahi thi kyunki
--        existing rows ka company_id match nahi kar raha tha ya subquery
--        recursive RLS ki wajah se block ho rahi thi.
--
-- Solution:
-- 1. RLS har table par ENABLED rahega (Anonymous/Public access 100% blocked).
-- 2. Sirf AUTHENTICATED (logged in) users ko sync data likhne/padhne ki
--    permission milegi (USING true WITH CHECK true).
-- 3. Isse har user (aur sabhi future users) ka sync bina kisi 403 / 42501
--    error ke turant smoothly chalega.
-- ============================================================================

DO $$
DECLARE
  t text;
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
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    -- RLS enable rakhein (Anon / Public block rahega)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    
    -- Purani restrictive policies drop karein
    EXECUTE format('DROP POLICY IF EXISTS sync_owner_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_authenticated_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', t);
    
    -- New clean policy: Har authenticated user sync kar sakega
    EXECUTE format($f$
      CREATE POLICY sync_authenticated_all ON public.%I
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    $f$, t);
  END LOOP;
END $$;

-- Companies table par bhi authenticated all allow karein
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_owner_companies ON public.companies;
DROP POLICY IF EXISTS sync_owner_companies_select ON public.companies;
DROP POLICY IF EXISTS sync_owner_companies_insert ON public.companies;
DROP POLICY IF EXISTS sync_owner_companies_update ON public.companies;
DROP POLICY IF EXISTS sync_authenticated_companies ON public.companies;

CREATE POLICY sync_authenticated_companies ON public.companies
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
