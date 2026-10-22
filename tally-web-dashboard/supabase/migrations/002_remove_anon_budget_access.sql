-- Migration: 002_remove_anon_budget_access
-- Remove anonymous INSERT/UPDATE on budgets. Require authentication + company match.

-- Step 0: Drop the permissive auth_all policy (allows ALL authenticated users ALL access)
DROP POLICY IF EXISTS auth_all ON public.budgets;

-- Step 1: Drop anon policies
DROP POLICY IF EXISTS budgets_insert_anon ON public.budgets;
DROP POLICY IF EXISTS budgets_update_anon ON public.budgets;

-- Step 2: Add authenticated-only policies with company isolation
CREATE POLICY budgets_select_auth ON public.budgets
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY budgets_insert_auth ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY budgets_update_auth ON public.budgets
  FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY budgets_delete_auth ON public.budgets
  FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
