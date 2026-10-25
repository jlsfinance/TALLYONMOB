-- ============================================================================
-- FIX: Supabase RLS 42501 (USING expression violation)
-- 
-- Karan: companies table me aapki company ka 'owner_id' NULL hai ya 
--        'lyricslelocom@gmail.com' ke user ID se match nahi kar raha.
--        Is wajah se child tables (bank_allocations, sales, sales_items)
--        ka check (owner_id = auth.uid()) fail ho raha hai.
-- ============================================================================

-- Step 1: lyricslelocom@gmail.com ke user ID se sabhi companies ko link karein
UPDATE public.companies
SET owner_id = (SELECT id FROM auth.users WHERE email = 'lyricslelocom@gmail.com')
WHERE owner_id IS NULL 
   OR owner_id NOT IN (SELECT id FROM auth.users);

-- Agar 'user_id' column bhi exist karta ho to use bhi sync karein
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'user_id') THEN
    UPDATE public.companies 
    SET user_id = owner_id
    WHERE user_id IS NULL;
  END IF;
END $$;

-- Step 2: Companies table ki policy ko update karein (taaki desktop app update kar sake)
DROP POLICY IF EXISTS sync_owner_companies ON public.companies;
CREATE POLICY sync_owner_companies ON public.companies
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid() OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid());

-- Step 3: Sabhi sync tables par policy update karein (owner_id ya NULL dono allow karein)
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

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_owner_all ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY sync_owner_all ON public.%I
        FOR ALL TO authenticated
        USING  (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid() OR owner_id IS NULL))
        WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid() OR owner_id IS NULL))
    $f$, t);
  END LOOP;
END $$;

-- Step 4: Verify check (dikhna chahiye company ka name aur owner_id)
SELECT id, name, owner_id FROM public.companies;
