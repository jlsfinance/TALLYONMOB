-- InsForge companies RLS fix for desktop sync
-- Use this in InsForge SQL editor for your backend.
-- Date: 2026-03-01

BEGIN;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Remove old/legacy policies safely
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;
DROP POLICY IF EXISTS "companies_delete" ON public.companies;
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can create companies" ON public.companies;
DROP POLICY IF EXISTS "Users can update their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can delete their own companies" ON public.companies;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.companies;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.companies;

-- Canonical owner_id-based policies for desktop + web
CREATE POLICY "companies_select" ON public.companies
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "companies_update" ON public.companies
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "companies_delete" ON public.companies
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.companies FROM anon;

-- Optional: backfill orphaned rows (run only if needed)
-- UPDATE public.companies
-- SET owner_id = 'YOUR-USER-UUID-HERE'
-- WHERE owner_id IS NULL;

COMMIT;
