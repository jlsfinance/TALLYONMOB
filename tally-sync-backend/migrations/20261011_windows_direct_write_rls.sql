-- Phase 4: close direct Windows-client Supabase write paths.
-- The sync backend continues to use the service role and is not restricted by
-- these policies. Authenticated desktop requests are limited to an active
-- company membership with sync permission (or owner/admin role).

CREATE OR REPLACE FUNCTION public.sync_user_can_access_company(p_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id::text = p_company_id
      AND (c.owner_id = auth.uid() OR c.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.company_id::text = p_company_id
      AND cu.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_user_can_write_company(p_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id::text = p_company_id
      AND (c.owner_id = auth.uid() OR c.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.company_id::text = p_company_id
      AND cu.user_id = auth.uid()
      AND (cu.can_sync IS TRUE OR cu.role IN ('owner', 'admin'))
  );
$$;

DO $migration$
DECLARE
  target_table TEXT;
  policy_row RECORD;
  target_tables CONSTANT TEXT[] := ARRAY[
    'ledgers', 'vouchers', 'sales', 'purchases', 'stock_items',
    'ledger_groups', 'stock_groups', 'voucher_ledger_entries',
    'voucher_stock_entries', 'bill_allocations', 'bank_allocations',
    'deleted_records', 'pending_transactions', 'sync_history',
    'sync_metadata', 'sync_state'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF to_regclass(format('public.%s', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    -- Remove legacy broad FOR ALL policies before installing the scoped set.
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.sync_user_can_access_company(company_id::text))',
      target_table || '_company_select', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.sync_user_can_write_company(company_id::text))',
      target_table || '_company_insert', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.sync_user_can_write_company(company_id::text)) WITH CHECK (public.sync_user_can_write_company(company_id::text))',
      target_table || '_company_update', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.sync_user_can_write_company(company_id::text))',
      target_table || '_company_delete', target_table
    );
  END LOOP;
END
$migration$;

-- The desktop client must never mutate license state directly. License binding
-- remains an Edge Function/backend operation; service-role workers are exempt.
DO $migration$
DECLARE
  target_table TEXT;
  policy_row RECORD;
  target_tables CONSTANT TEXT[] := ARRAY['licenses', 'user_licenses'];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF to_regclass(format('public.%s', target_table)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, target_table);
    END LOOP;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', target_table);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', target_table);
  END LOOP;
END
$migration$;
