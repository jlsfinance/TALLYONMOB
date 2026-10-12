-- Repair stock_items RLS after the sync-stabilization migration.
-- Run this in the Supabase/InsForge SQL editor as a database administrator.
-- This does not disable RLS or grant access to anon users.

BEGIN;

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

ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    policy_name TEXT;
BEGIN
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
