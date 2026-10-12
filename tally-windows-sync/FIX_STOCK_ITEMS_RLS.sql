-- Repair stock_items RLS after the sync-stabilization migration.
-- Run this in the Supabase/InsForge SQL editor as a database administrator.
-- This does not disable RLS or grant access to anon users.

BEGIN;

ALTER TABLE IF EXISTS public.stock_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS public.stock_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    policy_name TEXT;
BEGIN
    IF to_regclass('public.stock_items') IS NULL THEN
        RAISE EXCEPTION 'public.stock_items does not exist';
    END IF;

    -- Remove stale/duplicate policies, including policies created by older fixes.
    FOR policy_name IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'stock_items'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.stock_items', policy_name);
    END LOOP;
END $$;

CREATE POLICY stock_items_select_authenticated
    ON public.stock_items FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY stock_items_insert_authenticated
    ON public.stock_items FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY stock_items_update_authenticated
    ON public.stock_items FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY stock_items_delete_authenticated
    ON public.stock_items FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_items FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Optional verification after signing in as the affected user:
-- SELECT auth.uid();
-- SELECT id, owner_id, company_id FROM public.stock_items LIMIT 5;
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'stock_items';
