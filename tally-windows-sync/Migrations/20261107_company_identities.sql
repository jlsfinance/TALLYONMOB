-- ============================================================
-- SYNCORA Stage B: Company Identity Registry (ADDITIVE ONLY)
-- Schema: public
-- No existing tables modified. No data moved or deleted.
-- Target project: pfqmqpboomwtxgyfqnsn.supabase.co
-- ============================================================

-- 1. Create company_identities table (infrastructure only)
CREATE TABLE IF NOT EXISTS public.company_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_company_id TEXT NOT NULL,
    tally_guid TEXT,
    data_path TEXT,
    source_id TEXT NOT NULL,
    owner_id UUID NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deactivated_at TIMESTAMPTZ,
    CONSTRAINT company_identities_supabase_company_id_fkey
        FOREIGN KEY (supabase_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
    CONSTRAINT company_identities_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES auth.users(id),
    CONSTRAINT company_identities_owner_tally_path_source_key
        UNIQUE (owner_id, tally_guid, data_path, source_id),
    CONSTRAINT company_identities_owner_source_guid_key
        UNIQUE (owner_id, source_id, tally_guid),
    CONSTRAINT company_identities_has_identifier
        CHECK (tally_guid IS NOT NULL OR data_path IS NOT NULL)
);

-- 2. Indexes (minimal; no redundant partial UNIQUE index)
CREATE INDEX IF NOT EXISTS public.company_identities_company_id_idx
    ON public.company_identities(supabase_company_id);
CREATE INDEX IF NOT EXISTS public.company_identities_active_owner_idx
    ON public.company_identities(is_active, owner_id);

-- 3. RLS (SELECT only for authenticated owners)
ALTER TABLE public.company_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_identities_select_owner ON public.company_identities
    FOR SELECT
    TO authenticated
    USING (owner_id = auth.uid());

-- 4. Privileges (SELECT only for authenticated; nothing for PUBLIC/anon/authenticated beyond SELECT)
REVOKE ALL ON public.company_identities FROM PUBLIC;
REVOKE ALL ON public.company_identities FROM anon;
REVOKE ALL ON public.company_identities FROM authenticated;
GRANT SELECT ON public.company_identities TO authenticated;
