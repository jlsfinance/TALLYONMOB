-- Close cross-user company leak: rows with owner_id IS NULL were visible to
-- every authenticated user via the sync_owner_* policies (user-reported: every
-- account saw ARVIND RATHI / Hira Keshav). Two steps:
-- 1) Claim the two orphan companies (created 2026-10-13 via desktop-first sync,
--    where TallyLink's SyncOwnerId was empty) and assign them to their real owner.
-- 2) Recreate every sync_owner_all policy WITHOUT the "OR owner_id IS NULL"
--    escape hatch, and drop the NULL-hole select policy on companies.
-- Kept: sync_owner_companies_insert still permits NULL owner so the
-- desktop-first sync flow (no signed-in owner) does not break; such rows are
-- simply invisible to everyone until ownership is claimed.

-- 1) Claim orphans (lovnee main account = active tester on this machine)
UPDATE public.companies
SET owner_id = '9c198011-a538-4ef1-91d1-ba29e20bf585'
WHERE owner_id IS NULL;

-- 2) All sync_owner_all policies: same expression, minus the NULL hole
DO $$
DECLARE
  r record;
  new_expr text := 'company_id IN (SELECT c.id FROM public.companies c WHERE c.owner_id = auth.uid())';
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'sync_owner_all' AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP POLICY sync_owner_all ON %I.%I', r.sch, r.tbl);
    EXECUTE format(
      'CREATE POLICY sync_owner_all ON %I.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      r.sch, r.tbl, new_expr, new_expr
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS sync_owner_companies_select ON public.companies;
