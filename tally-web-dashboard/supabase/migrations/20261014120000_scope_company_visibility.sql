-- Prevent authenticated users from discovering other customers' company names.
-- The previous companies_all_auth policy used USING (true), so the browser could
-- download every company row even though downstream data queries were scoped.

DROP POLICY IF EXISTS "companies_all_auth" ON public.companies;
DROP POLICY IF EXISTS "companies_select_auth" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_auth" ON public.companies;
DROP POLICY IF EXISTS "companies_update_auth" ON public.companies;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_own_or_admin" ON public.companies
    FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()::text
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
        OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'super_admin')
    );

CREATE POLICY "companies_insert_own" ON public.companies
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid()::text);

CREATE POLICY "companies_update_own_or_admin" ON public.companies
    FOR UPDATE TO authenticated
    USING (
        owner_id = auth.uid()::text
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
        OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'super_admin')
    )
    WITH CHECK (
        owner_id = auth.uid()::text
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
        OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'super_admin')
    );

CREATE POLICY "companies_delete_own_or_admin" ON public.companies
    FOR DELETE TO authenticated
    USING (
        owner_id = auth.uid()::text
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
        OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'super_admin')
    );
