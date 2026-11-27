-- Migration: Unified RBAC membership, role permissions, granular RLS, and audit RPCs.
-- Idempotent and re-runnable.
-- Fixes:
--   1. Single membership source of truth (company_users + team_invitations + user_roles).
--   2. Server-side permission resolution per company & role (no TOM-SUPER license shortcut).
--   3. Granular RLS policies for Viewer vs Accountant vs Manager vs Owner vs Suspended.
--   4. Atomic SECURITY DEFINER RPCs for invite, resend, role change, suspend, remove,
--      bulk actions, company access grant/revoke, default company, role CRUD, and audit logging.

BEGIN;

-- ============================================================================
-- 1. SCHEMA UNIFICATION & COLUMN SAFETY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    display_name text,
    description text,
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_system boolean NOT NULL DEFAULT false,
    color text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'user_roles' AND indexdef ILIKE '%(name)%'
    ) THEN
        CREATE UNIQUE INDEX idx_user_roles_name_unique ON public.user_roles (name);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.company_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'viewer',
    status text NOT NULL DEFAULT 'active',
    is_default boolean NOT NULL DEFAULT false,
    can_sync boolean NOT NULL DEFAULT false,
    invited_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS can_sync boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS invited_by uuid;
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.company_users'::regclass AND conname = 'company_users_status_check'
    ) THEN
        ALTER TABLE public.company_users
            ADD CONSTRAINT company_users_status_check
            CHECK (status IN ('active', 'suspended', 'inactive'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'company_users'
          AND indexdef ILIKE '%(company_id, user_id)%'
    ) THEN
        CREATE UNIQUE INDEX idx_company_users_company_user_unique
            ON public.company_users (company_id, user_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.team_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id text NOT NULL,
    email text NOT NULL,
    full_name text,
    role text NOT NULL DEFAULT 'viewer',
    invited_by uuid,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    resent_at timestamptz,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer';
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS invited_by uuid;
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS resent_at timestamptz;
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.team_invitations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_team_invitations_company_status
    ON public.team_invitations (company_id, status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email_status
    ON public.team_invitations (lower(email), status);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id text,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    entity_name text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_name text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
    ON public.activity_logs (company_id, created_at DESC);

-- ============================================================================
-- 2. CANONICAL ROLE PERMISSION DEFINITIONS & SEEDING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.default_role_permissions(p_role text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE lower(regexp_replace(trim(coalesce(p_role, '')), '[\s-]+', '_', 'g'))
        WHEN 'owner' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true, 'Approve', true),
            'Ledgers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true),
            'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', true),
            'Settings', jsonb_build_object('View', true, 'Edit', true, 'Manage Users', true),
            'GST', jsonb_build_object('View', true, 'File', true, 'Export', true),
            'Tally', jsonb_build_object('Sync', true, 'Configure', true),
            'Stock', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true),
            'Billing', jsonb_build_object('View', true, 'Edit', true, 'Manage', true)
        )
        WHEN 'super_admin' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true, 'Approve', true),
            'Ledgers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true),
            'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', true),
            'Settings', jsonb_build_object('View', true, 'Edit', true, 'Manage Users', true),
            'GST', jsonb_build_object('View', true, 'File', true, 'Export', true),
            'Tally', jsonb_build_object('Sync', true, 'Configure', true),
            'Stock', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true),
            'Billing', jsonb_build_object('View', true, 'Edit', true, 'Manage', true)
        )
        WHEN 'admin' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true, 'Approve', true),
            'Ledgers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true),
            'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', true),
            'Settings', jsonb_build_object('View', true, 'Edit', true, 'Manage Users', true),
            'GST', jsonb_build_object('View', true, 'File', true, 'Export', true),
            'Tally', jsonb_build_object('Sync', true, 'Configure', true),
            'Stock', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', true),
            'Billing', jsonb_build_object('View', true, 'Edit', true, 'Manage', true)
        )
        WHEN 'manager' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false, 'Approve', true),
            'Ledgers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false),
            'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', true),
            'Settings', jsonb_build_object('View', true, 'Edit', false, 'Manage Users', false),
            'GST', jsonb_build_object('View', true, 'File', false, 'Export', true),
            'Tally', jsonb_build_object('Sync', true, 'Configure', false),
            'Stock', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false),
            'Billing', jsonb_build_object('View', true, 'Edit', true, 'Manage', false)
        )
        WHEN 'accountant' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false, 'Approve', false),
            'Ledgers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false),
            'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', false),
            'Settings', jsonb_build_object('View', false, 'Edit', false, 'Manage Users', false),
            'GST', jsonb_build_object('View', true, 'File', true, 'Export', true),
            'Tally', jsonb_build_object('Sync', true, 'Configure', false),
            'Stock', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false),
            'Billing', jsonb_build_object('View', true, 'Edit', false, 'Manage', false)
        )
        WHEN 'editor' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false, 'Approve', false),
            'Ledgers', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false),
            'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', false),
            'Settings', jsonb_build_object('View', false, 'Edit', false, 'Manage Users', false),
            'GST', jsonb_build_object('View', true, 'File', false, 'Export', true),
            'Tally', jsonb_build_object('Sync', true, 'Configure', false),
            'Stock', jsonb_build_object('View', true, 'Create', true, 'Edit', true, 'Delete', false),
            'Billing', jsonb_build_object('View', true, 'Edit', false, 'Manage', false)
        )
        WHEN 'sales' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', true, 'Edit', false, 'Delete', false, 'Approve', false),
            'Ledgers', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false),
            'Reports', jsonb_build_object('View', true, 'Export', false, 'Share', false),
            'Settings', jsonb_build_object('View', false, 'Edit', false, 'Manage Users', false),
            'GST', jsonb_build_object('View', true, 'File', false, 'Export', false),
            'Tally', jsonb_build_object('Sync', false, 'Configure', false),
            'Stock', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false),
            'Billing', jsonb_build_object('View', true, 'Edit', false, 'Manage', false)
        )
        WHEN 'viewer' THEN jsonb_build_object(
            'Vouchers', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false, 'Approve', false),
            'Ledgers', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false),
            'Reports', jsonb_build_object('View', true, 'Export', false, 'Share', false),
            'Settings', jsonb_build_object('View', false, 'Edit', false, 'Manage Users', false),
            'GST', jsonb_build_object('View', true, 'File', false, 'Export', false),
            'Tally', jsonb_build_object('Sync', false, 'Configure', false),
            'Stock', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false),
            'Billing', jsonb_build_object('View', true, 'Edit', false, 'Manage', false)
        )
        ELSE '{}'::jsonb
    END;
$$;

INSERT INTO public.user_roles (name, display_name, description, permissions, is_system, color)
VALUES
    ('owner', 'Owner', 'Company owner with full access across all modules and team management', public.default_role_permissions('owner'), true, 'text-amber-400'),
    ('super_admin', 'Super Admin', 'Platform main administrator with full SaaS & RBAC control', public.default_role_permissions('super_admin'), true, 'text-red-400'),
    ('admin', 'Company Admin', 'Company administrator with full operational and user management access inside assigned company only', public.default_role_permissions('admin'), true, 'text-orange-400'),
    ('manager', 'Manager', 'Operational manager with voucher approval, reports, and stock access', public.default_role_permissions('manager'), true, 'text-yellow-400'),
    ('accountant', 'Accountant', 'Accounting access for vouchers, ledgers, GST filing, and report exports', public.default_role_permissions('accountant'), true, 'text-cyan-400'),
    ('sales', 'Sales', 'Sales access to view data and create invoices/vouchers without delete or export', public.default_role_permissions('sales'), true, 'text-emerald-400'),
    ('viewer', 'Viewer', 'Read-only access to view vouchers, ledgers, reports, and stock', public.default_role_permissions('viewer'), true, 'text-zinc-400')
ON CONFLICT (name) DO UPDATE SET
    display_name = CASE
        WHEN public.user_roles.name = 'admin' AND (public.user_roles.display_name IS NULL OR public.user_roles.display_name IN ('', 'Admin'))
            THEN 'Company Admin'
        ELSE coalesce(nullif(public.user_roles.display_name, ''), excluded.display_name)
    END,
    description = coalesce(nullif(public.user_roles.description, ''), excluded.description),
    is_system = true,
    color = coalesce(nullif(public.user_roles.color, ''), excluded.color),
    permissions = CASE
        WHEN public.user_roles.permissions IS NULL
             OR jsonb_typeof(public.user_roles.permissions) <> 'object'
             OR public.user_roles.permissions = '{}'::jsonb
            THEN excluded.permissions
        ELSE public.user_roles.permissions
    END,
    updated_at = now();

-- Backfill existing company owners into company_users so membership is unified.
INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, is_default)
SELECT c.id, c.owner_id, 'owner', 'active', true, false
FROM public.companies c
WHERE c.owner_id IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;

-- ============================================================================
-- 3. SERVER-SIDE PERMISSION HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_user_id IS NULL THEN false
        ELSE EXISTS (
            SELECT 1 FROM public.user_profiles up
            WHERE up.id = p_user_id AND up.is_admin = true
        ) OR EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = p_user_id AND lower(coalesce(u.email, '')) = 'lovneetrathi@gmail.com'
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_membership(p_company_id text, p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_admin boolean := false;
    v_is_owner boolean := false;
    v_cu record;
    v_role_perms jsonb;
    v_role_key text;
BEGIN
    IF p_user_id IS NULL OR p_company_id IS NULL OR trim(p_company_id) = '' THEN
        RETURN jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_owner', false,
            'role', 'none',
            'status', 'none',
            'permissions', '{}'::jsonb
        );
    END IF;

    v_is_admin := public.is_platform_admin(p_user_id);
    IF v_is_admin THEN
        RETURN jsonb_build_object(
            'is_admin', true,
            'is_super_admin', true,
            'is_owner', EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id AND c.owner_id = p_user_id),
            'role', 'super_admin',
            'status', 'active',
            'permissions', public.default_role_permissions('super_admin')
        );
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.companies c WHERE c.id = p_company_id AND c.owner_id = p_user_id
    ) INTO v_is_owner;

    IF v_is_owner THEN
        RETURN jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_owner', true,
            'role', 'owner',
            'status', 'active',
            'permissions', public.default_role_permissions('owner')
        );
    END IF;

    SELECT cu.role, cu.status
    INTO v_cu
    FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = p_user_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_owner', false,
            'role', 'none',
            'status', 'none',
            'permissions', '{}'::jsonb
        );
    END IF;

    IF coalesce(v_cu.status, 'active') <> 'active' THEN
        RETURN jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_owner', false,
            'role', coalesce(v_cu.role, 'viewer'),
            'status', coalesce(v_cu.status, 'suspended'),
            'permissions', '{}'::jsonb
        );
    END IF;

    v_role_key := lower(regexp_replace(trim(coalesce(v_cu.role, 'viewer')), '[\s-]+', '_', 'g'));

    SELECT ur.permissions
    INTO v_role_perms
    FROM public.user_roles ur
    WHERE lower(regexp_replace(trim(ur.name), '[\s-]+', '_', 'g')) = v_role_key
       OR lower(regexp_replace(trim(coalesce(ur.display_name, '')), '[\s-]+', '_', 'g')) = v_role_key
       OR ur.id::text = coalesce(v_cu.role, '')
    LIMIT 1;

    IF v_role_perms IS NULL
       OR jsonb_typeof(v_role_perms) <> 'object'
       OR v_role_perms = '{}'::jsonb THEN
        v_role_perms := public.default_role_permissions(v_role_key);
    END IF;

    RETURN jsonb_build_object(
        'is_admin', false,
        'is_super_admin', false,
        'is_owner', false,
        'role', coalesce(v_cu.role, 'viewer'),
        'status', 'active',
        'permissions', coalesce(v_role_perms, '{}'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_company_permission(
    p_company_id text,
    p_category text,
    p_action text,
    p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_membership jsonb;
BEGIN
    IF p_user_id IS NULL OR p_company_id IS NULL OR trim(p_company_id) = '' THEN
        RETURN false;
    END IF;

    v_membership := public.get_user_company_membership(p_company_id, p_user_id);

    IF coalesce((v_membership->>'is_admin')::boolean, false)
       OR coalesce((v_membership->>'is_owner')::boolean, false) THEN
        RETURN true;
    END IF;

    IF coalesce(v_membership->>'status', 'none') <> 'active' THEN
        RETURN false;
    END IF;

    RETURN coalesce((v_membership->'permissions'->p_category->>p_action)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_can_access_company(p_company_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL OR p_company_id IS NULL THEN false
        WHEN public.is_platform_admin(auth.uid()) THEN true
        WHEN EXISTS (
            SELECT 1 FROM public.companies c
            WHERE c.id = p_company_id AND c.owner_id = auth.uid()
        ) THEN true
        WHEN EXISTS (
            SELECT 1 FROM public.company_users cu
            WHERE cu.company_id = p_company_id
              AND cu.user_id = auth.uid()
              AND coalesce(cu.status, 'active') = 'active'
        ) THEN true
        ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_can_write_company(p_company_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        public.user_has_company_permission(p_company_id, 'Vouchers', 'Create')
        OR public.user_has_company_permission(p_company_id, 'Vouchers', 'Edit')
        OR public.user_has_company_permission(p_company_id, 'Ledgers', 'Edit')
        OR public.user_has_company_permission(p_company_id, 'Settings', 'Edit');
$$;

-- ============================================================================
-- 4. GRANULAR RLS POLICIES (ROLE + PERMISSION AWARE)
-- ============================================================================

DO $$
DECLARE
    v_tbl text;
    v_pol record;
BEGIN
    -- companies
    IF to_regclass('public.companies') IS NOT NULL THEN
        ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS rbac_companies_select ON public.companies;
        DROP POLICY IF EXISTS rbac_companies_update ON public.companies;
        DROP POLICY IF EXISTS rbac_companies_delete ON public.companies;
        CREATE POLICY rbac_companies_select ON public.companies
            FOR SELECT TO authenticated
            USING (public.sync_user_can_access_company(id));
        CREATE POLICY rbac_companies_update ON public.companies
            FOR UPDATE TO authenticated
            USING (owner_id = auth.uid() OR public.user_has_company_permission(id, 'Settings', 'Edit'))
            WITH CHECK (owner_id = auth.uid() OR public.user_has_company_permission(id, 'Settings', 'Edit'));
        CREATE POLICY rbac_companies_delete ON public.companies
            FOR DELETE TO authenticated
            USING (owner_id = auth.uid() OR public.is_platform_admin(auth.uid()));
    END IF;

    -- Voucher & billing tables
    FOREACH v_tbl IN ARRAY ARRAY[
        'vouchers', 'voucher_ledger_entries', 'voucher_stock_entries',
        'sales', 'sales_items', 'purchases', 'purchase_items'
    ] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
            -- Remove broad owner/member FOR ALL policies that bypass per-action role checks
            FOR v_pol IN
                SELECT policyname FROM pg_policies
                WHERE schemaname = 'public' AND tablename = v_tbl
                  AND policyname NOT LIKE 'subscription_%'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_tbl);
            END LOOP;

            EXECUTE format(
                'CREATE POLICY rbac_vouchers_select ON public.%I FOR SELECT TO authenticated USING (public.user_has_company_permission(company_id, ''Vouchers'', ''View''))',
                v_tbl
            );
            EXECUTE format(
                'CREATE POLICY rbac_vouchers_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_has_company_permission(company_id, ''Vouchers'', ''Create''))',
                v_tbl
            );
            EXECUTE format(
                'CREATE POLICY rbac_vouchers_update ON public.%I FOR UPDATE TO authenticated USING (public.user_has_company_permission(company_id, ''Vouchers'', ''Edit'')) WITH CHECK (public.user_has_company_permission(company_id, ''Vouchers'', ''Edit''))',
                v_tbl
            );
            EXECUTE format(
                'CREATE POLICY rbac_vouchers_delete ON public.%I FOR DELETE TO authenticated USING (public.user_has_company_permission(company_id, ''Vouchers'', ''Delete''))',
                v_tbl
            );
        END IF;
    END LOOP;

    -- pending_transactions: distinguish Create vs Edit vs Delete
    IF to_regclass('public.pending_transactions') IS NOT NULL THEN
        ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;
        FOR v_pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'pending_transactions'
              AND policyname NOT LIKE 'subscription_%'
              AND policyname NOT ILIKE '%service_role%'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.pending_transactions', v_pol.policyname);
        END LOOP;

        CREATE POLICY rbac_pending_tx_select ON public.pending_transactions
            FOR SELECT TO authenticated
            USING (public.user_has_company_permission(company_id, 'Vouchers', 'View'));

        CREATE POLICY rbac_pending_tx_insert ON public.pending_transactions
            FOR INSERT TO authenticated
            WITH CHECK (
                CASE
                    WHEN transaction_type = 'VOUCHER_DELETE'
                        THEN public.user_has_company_permission(company_id, 'Vouchers', 'Delete')
                    WHEN transaction_type = 'VOUCHER_EDIT'
                        THEN public.user_has_company_permission(company_id, 'Vouchers', 'Edit')
                    ELSE public.user_has_company_permission(company_id, 'Vouchers', 'Create')
                END
            );

        CREATE POLICY rbac_pending_tx_update ON public.pending_transactions
            FOR UPDATE TO authenticated
            USING (
                CASE
                    WHEN transaction_type = 'VOUCHER_DELETE'
                        THEN public.user_has_company_permission(company_id, 'Vouchers', 'Delete')
                    ELSE public.user_has_company_permission(company_id, 'Vouchers', 'Edit')
                END
            )
            WITH CHECK (
                CASE
                    WHEN transaction_type = 'VOUCHER_DELETE'
                        THEN public.user_has_company_permission(company_id, 'Vouchers', 'Delete')
                    ELSE public.user_has_company_permission(company_id, 'Vouchers', 'Edit')
                END
            );

        CREATE POLICY rbac_pending_tx_delete ON public.pending_transactions
            FOR DELETE TO authenticated
            USING (public.user_has_company_permission(company_id, 'Vouchers', 'Delete'));
    END IF;

    -- ledgers
    IF to_regclass('public.ledgers') IS NOT NULL THEN
        ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
        FOR v_pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'ledgers'
              AND policyname NOT LIKE 'subscription_%'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.ledgers', v_pol.policyname);
        END LOOP;
        CREATE POLICY rbac_ledgers_select ON public.ledgers
            FOR SELECT TO authenticated
            USING (public.user_has_company_permission(company_id, 'Ledgers', 'View'));
        CREATE POLICY rbac_ledgers_insert ON public.ledgers
            FOR INSERT TO authenticated
            WITH CHECK (public.user_has_company_permission(company_id, 'Ledgers', 'Create'));
        CREATE POLICY rbac_ledgers_update ON public.ledgers
            FOR UPDATE TO authenticated
            USING (public.user_has_company_permission(company_id, 'Ledgers', 'Edit'))
            WITH CHECK (public.user_has_company_permission(company_id, 'Ledgers', 'Edit'));
        CREATE POLICY rbac_ledgers_delete ON public.ledgers
            FOR DELETE TO authenticated
            USING (public.user_has_company_permission(company_id, 'Ledgers', 'Delete'));
    END IF;

    -- stock_items
    IF to_regclass('public.stock_items') IS NOT NULL THEN
        ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
        FOR v_pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'stock_items'
              AND policyname NOT LIKE 'subscription_%'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.stock_items', v_pol.policyname);
        END LOOP;
        CREATE POLICY rbac_stock_select ON public.stock_items
            FOR SELECT TO authenticated
            USING (public.user_has_company_permission(company_id, 'Stock', 'View'));
        CREATE POLICY rbac_stock_insert ON public.stock_items
            FOR INSERT TO authenticated
            WITH CHECK (public.user_has_company_permission(company_id, 'Stock', 'Create'));
        CREATE POLICY rbac_stock_update ON public.stock_items
            FOR UPDATE TO authenticated
            USING (public.user_has_company_permission(company_id, 'Stock', 'Edit'))
            WITH CHECK (public.user_has_company_permission(company_id, 'Stock', 'Edit'));
        CREATE POLICY rbac_stock_delete ON public.stock_items
            FOR DELETE TO authenticated
            USING (public.user_has_company_permission(company_id, 'Stock', 'Delete'));
    END IF;

    -- Tighten 003_tighten_remaining_rls.sql tables: read for active members, write only for write-permitted roles
    FOREACH v_tbl IN ARRAY ARRAY['payslips', 'employees', 'notifications', 'data_chunks', 'embedding_jobs'] LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
            FOR v_pol IN
                SELECT policyname FROM pg_policies
                WHERE schemaname = 'public' AND tablename = v_tbl
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_tbl);
            END LOOP;
            EXECUTE format(
                'CREATE POLICY rbac_company_read ON public.%I FOR SELECT TO authenticated USING (public.sync_user_can_access_company(company_id))',
                v_tbl
            );
            EXECUTE format(
                'CREATE POLICY rbac_company_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.sync_user_can_write_company(company_id))',
                v_tbl
            );
            EXECUTE format(
                'CREATE POLICY rbac_company_update ON public.%I FOR UPDATE TO authenticated USING (public.sync_user_can_write_company(company_id)) WITH CHECK (public.sync_user_can_write_company(company_id))',
                v_tbl
            );
            EXECUTE format(
                'CREATE POLICY rbac_company_delete ON public.%I FOR DELETE TO authenticated USING (public.sync_user_can_write_company(company_id))',
                v_tbl
            );
        END IF;
    END LOOP;
END $$;

-- company_users RLS: read-only to clients; all writes must pass SECURITY DEFINER RPCs
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    v_pol record;
BEGIN
    FOR v_pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'company_users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_users', v_pol.policyname);
    END LOOP;
END $$;

CREATE POLICY rbac_company_users_select ON public.company_users
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.sync_user_can_access_company(company_id));

-- team_invitations RLS: read-only to clients; all writes must pass SECURITY DEFINER RPCs
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    v_pol record;
BEGIN
    FOR v_pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'team_invitations'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_invitations', v_pol.policyname);
    END LOOP;
END $$;

CREATE POLICY rbac_team_invitations_select ON public.team_invitations
    FOR SELECT TO authenticated
    USING (
        public.user_has_company_permission(company_id, 'Settings', 'Manage Users')
        OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.company_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_users TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_invitations TO authenticated;

-- user_roles RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_auth_read ON public.user_roles;
DROP POLICY IF EXISTS rbac_user_roles_read ON public.user_roles;
DROP POLICY IF EXISTS rbac_user_roles_admin_write ON public.user_roles;

CREATE POLICY rbac_user_roles_read ON public.user_roles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY rbac_user_roles_admin_write ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_platform_admin(auth.uid()))
    WITH CHECK (public.is_platform_admin(auth.uid()));

-- activity_logs RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rbac_activity_logs_select ON public.activity_logs;
DROP POLICY IF EXISTS rbac_activity_logs_insert ON public.activity_logs;

CREATE POLICY rbac_activity_logs_select ON public.activity_logs
    FOR SELECT TO authenticated
    USING (
        public.is_platform_admin(auth.uid())
        OR user_id = auth.uid()
        OR (company_id IS NOT NULL AND public.user_has_company_permission(company_id, 'Settings', 'Manage Users'))
    );

CREATE POLICY rbac_activity_logs_insert ON public.activity_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (company_id IS NULL OR public.sync_user_can_access_company(company_id))
    );

-- ============================================================================
-- 5. INTERNAL AUDIT HELPER & AUTHORITATIVE RBAC RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public._write_rbac_audit_log(
    p_company_id text,
    p_action text,
    p_entity_type text,
    p_entity_id text,
    p_entity_name text,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email text;
    v_entity_uuid uuid;
    v_details jsonb := coalesce(p_details, '{}'::jsonb);
BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
    IF p_entity_id IS NOT NULL AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_entity_uuid := p_entity_id::uuid;
    ELSE
        v_entity_uuid := NULL;
        IF p_entity_id IS NOT NULL AND trim(p_entity_id) <> '' THEN
            v_details := v_details || jsonb_build_object('entity_ref', p_entity_id);
        END IF;
    END IF;
    INSERT INTO public.activity_logs (
        company_id, user_id, user_email, action, entity_type, entity_id, entity_name, details, created_at
    ) VALUES (
        p_company_id,
        auth.uid(),
        coalesce(v_email, auth.jwt() ->> 'email'),
        p_action,
        p_entity_type,
        v_entity_uuid,
        p_entity_name,
        v_details,
        now()
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'RBAC audit log failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_get_my_permissions(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
    END IF;
    RETURN public.get_user_company_membership(p_company_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_email text;
    v_inv record;
    v_count integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('accepted', 0);
    END IF;

    SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id = v_uid;
    IF v_email IS NULL OR v_email = '' THEN
        RETURN jsonb_build_object('accepted', 0);
    END IF;

    FOR v_inv IN
        SELECT * FROM public.team_invitations
        WHERE lower(trim(email)) = v_email AND status = 'pending'
    LOOP
        INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, invited_by, created_at, updated_at)
        VALUES (
            v_inv.company_id,
            v_uid,
            v_inv.role,
            'active',
            lower(v_inv.role) IN ('owner', 'admin', 'super_admin'),
            v_inv.invited_by,
            now(),
            now()
        )
        ON CONFLICT (company_id, user_id) DO UPDATE SET
            role = excluded.role,
            status = 'active',
            updated_at = now();

        UPDATE public.team_invitations
        SET status = 'accepted', accepted_at = now(), updated_at = now()
        WHERE id = v_inv.id;

        PERFORM public._write_rbac_audit_log(
            v_inv.company_id,
            'rbac_invite_accepted',
            'rbac',
            v_uid::text,
            v_email,
            jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role)
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('accepted', v_count);
END;
$$;

-- Auto-accept pending invitations when a new user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_plan public.subscription_plans;
    v_start timestamptz := now();
    v_end timestamptz;
    v_license_id uuid;
    v_inv record;
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (id) DO NOTHING;

    -- Auto-claim pending team invitations only on real signup (skip pre-created auth.admin.inviteUserByEmail shells)
    IF NEW.invited_at IS NULL THEN
        BEGIN
            FOR v_inv IN
                SELECT * FROM public.team_invitations
                WHERE lower(trim(email)) = lower(trim(coalesce(NEW.email, '')))
                  AND status = 'pending'
            LOOP
                INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, invited_by, created_at, updated_at)
                VALUES (
                    v_inv.company_id,
                    NEW.id,
                    v_inv.role,
                    'active',
                    lower(v_inv.role) IN ('owner', 'admin', 'super_admin'),
                    v_inv.invited_by,
                    now(),
                    now()
                )
                ON CONFLICT (company_id, user_id) DO UPDATE SET
                    role = excluded.role,
                    status = 'active',
                    updated_at = now();

                UPDATE public.team_invitations
                SET status = 'accepted', accepted_at = now(), updated_at = now()
                WHERE id = v_inv.id;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'auto invitation claim failed for %: %', NEW.id, SQLERRM;
        END;
    END IF;

    -- Trial must never block or fail signup (Google OAuth included).
    BEGIN
        SELECT * INTO v_plan
        FROM public.subscription_plans
        WHERE slug = 'trial' AND is_trial AND is_active
        LIMIT 1;

        IF FOUND
           AND NOT EXISTS (SELECT 1 FROM public.user_licenses WHERE user_id = NEW.id)
           AND NOT EXISTS (SELECT 1 FROM public.trial_history WHERE user_id = NEW.id)
        THEN
            v_end := v_start + (v_plan.duration_days || ' days')::interval;

            INSERT INTO public.user_licenses
                (user_id, license_key, plan_id, status, activation_date, expiry_date)
            VALUES
                (NEW.id, public.generate_license_key('trial'), v_plan.id, 'active', v_start, v_end)
            RETURNING id INTO v_license_id;

            INSERT INTO public.trial_history
                (user_id, email, trial_start, trial_end, trial_used, status, license_id)
            VALUES
                (NEW.id, NEW.email, v_start, v_end, true, 'completed', v_license_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'auto trial failed for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rbac_list_overview(p_company_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_admin boolean := public.is_platform_admin(auth.uid());
    v_users jsonb := '[]'::jsonb;
    v_invitations jsonb := '[]'::jsonb;
    v_roles jsonb := '[]'::jsonb;
    v_companies jsonb := '[]'::jsonb;
    v_logs jsonb := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
    END IF;

    IF p_company_id IS NULL THEN
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NOT public.sync_user_can_access_company(p_company_id) THEN
            RAISE EXCEPTION 'Not authorized for this company' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Active & suspended company members built strictly from company_users + companies.owner_id
    WITH scoped_members AS (
        SELECT
            cu.company_id,
            cu.user_id,
            cu.role,
            coalesce(cu.status, 'active') AS status,
            coalesce(cu.is_default, false) AS is_default,
            (c.owner_id = cu.user_id) AS is_owner,
            c.name AS company_name,
            cu.created_at
        FROM public.company_users cu
        JOIN public.companies c ON c.id = cu.company_id
        WHERE p_company_id IS NULL OR cu.company_id = p_company_id

        UNION ALL

        SELECT
            c.id AS company_id,
            c.owner_id AS user_id,
            'owner'::text AS role,
            'active'::text AS status,
            false AS is_default,
            true AS is_owner,
            c.name AS company_name,
            c.created_at
        FROM public.companies c
        WHERE c.owner_id IS NOT NULL
          AND (p_company_id IS NULL OR c.id = p_company_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.company_users cu2
              WHERE cu2.company_id = c.id AND cu2.user_id = c.owner_id
          )
    ),
    user_agg AS (
        SELECT
            sm.user_id,
            u.email,
            coalesce(nullif(up.full_name, ''), u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, ''), '@', 1), sm.user_id::text) AS name,
            u.last_sign_in_at,
            u.created_at AS user_created_at,
            (SELECT max(al.created_at) FROM public.activity_logs al WHERE al.user_id = sm.user_id) AS last_activity_at,
            CASE
                WHEN u.banned_until > now() OR coalesce(up.is_active, true) = false THEN 'suspended'
                WHEN bool_or(sm.status = 'active') THEN 'active'
                WHEN bool_or(sm.status = 'suspended') THEN 'suspended'
                ELSE 'inactive'
            END AS status,
            (ARRAY_AGG(
                CASE
                    WHEN sm.is_owner THEN 'Owner'
                    ELSE coalesce(ur.display_name, initcap(replace(sm.role, '_', ' ')))
                END
                ORDER BY sm.is_owner DESC, sm.is_default DESC, sm.created_at ASC
            ))[1] AS primary_role,
            (ARRAY_AGG(sm.role ORDER BY sm.is_owner DESC, sm.is_default DESC, sm.created_at ASC))[1] AS primary_role_key,
            jsonb_agg(
                jsonb_build_object(
                    'company_id', sm.company_id,
                    'company_name', sm.company_name,
                    'role', sm.role,
                    'role_label', CASE WHEN sm.is_owner THEN 'Owner' ELSE coalesce(ur.display_name, initcap(replace(sm.role, '_', ' '))) END,
                    'status', sm.status,
                    'is_default', sm.is_default,
                    'is_owner', sm.is_owner
                )
                ORDER BY sm.company_name
            ) AS memberships
        FROM scoped_members sm
        JOIN auth.users u ON u.id = sm.user_id
        LEFT JOIN public.user_profiles up ON up.id = sm.user_id
        LEFT JOIN public.user_roles ur
            ON lower(regexp_replace(ur.name, '[\s-]+', '_', 'g')) = lower(regexp_replace(sm.role, '[\s-]+', '_', 'g'))
        GROUP BY sm.user_id, u.email, up.full_name, up.is_active, u.raw_user_meta_data, u.last_sign_in_at, u.created_at, u.banned_until
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', ua.user_id,
            'name', ua.name,
            'email', coalesce(ua.email, ''),
            'role', ua.primary_role,
            'roleKey', ua.primary_role_key,
            'status', ua.status,
            'lastLogin', ua.last_sign_in_at,
            'lastActive', coalesce(ua.last_activity_at, ua.last_sign_in_at),
            'createdAt', ua.user_created_at,
            'memberships', ua.memberships
        )
        ORDER BY ua.name
    ), '[]'::jsonb)
    INTO v_users
    FROM user_agg ua;

    -- Pending invitations (only visible to platform admin or managers of the company)
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', ti.id,
            'company_id', ti.company_id,
            'company_name', c.name,
            'email', ti.email,
            'full_name', coalesce(nullif(ti.full_name, ''), split_part(ti.email, '@', 1)),
            'role', ti.role,
            'role_label', coalesce(ur.display_name, initcap(replace(ti.role, '_', ' '))),
            'status', 'invited',
            'resent_at', ti.resent_at,
            'created_at', ti.created_at
        )
        ORDER BY ti.created_at DESC
    ), '[]'::jsonb)
    INTO v_invitations
    FROM public.team_invitations ti
    JOIN public.companies c ON c.id = ti.company_id
    LEFT JOIN public.user_roles ur
        ON lower(regexp_replace(ur.name, '[\s-]+', '_', 'g')) = lower(regexp_replace(ti.role, '[\s-]+', '_', 'g'))
    WHERE ti.status = 'pending'
      AND (p_company_id IS NULL OR ti.company_id = p_company_id)
      AND (v_is_admin OR public.user_has_company_permission(ti.company_id, 'Settings', 'Manage Users'));

    -- Roles with real member counts
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', ur.id,
            'name', ur.name,
            'display_name', coalesce(ur.display_name, initcap(replace(ur.name, '_', ' '))),
            'description', coalesce(ur.description, ''),
            'color', coalesce(ur.color, 'text-purple-400'),
            'permissions', ur.permissions,
            'is_system', ur.is_system,
            'user_count', (
                SELECT count(DISTINCT cu.user_id)
                FROM public.company_users cu
                WHERE (p_company_id IS NULL OR cu.company_id = p_company_id)
                  AND lower(regexp_replace(cu.role, '[\s-]+', '_', 'g')) = lower(regexp_replace(ur.name, '[\s-]+', '_', 'g'))
            )
        )
        ORDER BY ur.is_system DESC, ur.name ASC
    ), '[]'::jsonb)
    INTO v_roles
    FROM public.user_roles ur;

    -- Companies with real member counts
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'owner_id', c.owner_id,
            'user_count', (
                SELECT count(DISTINCT cu.user_id)
                FROM public.company_users cu
                WHERE cu.company_id = c.id AND coalesce(cu.status, 'active') = 'active'
            )
        )
        ORDER BY c.name ASC
    ), '[]'::jsonb)
    INTO v_companies
    FROM public.companies c
    WHERE (p_company_id IS NULL AND v_is_admin) OR c.id = p_company_id;

    -- Real activity logs (RBAC + access events)
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', al.id,
            'company_id', al.company_id,
            'user_id', al.user_id,
            'user_email', al.user_email,
            'action', al.action,
            'entity_type', al.entity_type,
            'entity_id', al.entity_id,
            'entity_name', al.entity_name,
            'details', al.details,
            'ip_address', al.ip_address,
            'user_agent', al.user_agent,
            'created_at', al.created_at
        )
        ORDER BY al.created_at DESC
    ), '[]'::jsonb)
    INTO v_logs
    FROM (
        SELECT *
        FROM public.activity_logs al
        WHERE (p_company_id IS NULL AND v_is_admin) OR al.company_id = p_company_id
        ORDER BY al.created_at DESC
        LIMIT 100
    ) al;

    RETURN jsonb_build_object(
        'users', v_users,
        'invitations', v_invitations,
        'roles', v_roles,
        'companies', v_companies,
        'logs', v_logs
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_invite_member(
    p_company_ids text[],
    p_email text,
    p_role text,
    p_full_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email text := lower(trim(coalesce(p_email, '')));
    v_role_key text := lower(regexp_replace(trim(coalesce(p_role, '')), '[\s-]+', '_', 'g'));
    v_is_admin boolean := public.is_platform_admin(auth.uid());
    v_target_user_id uuid;
    v_cid text;
    v_inv_id uuid;
    v_added_count integer := 0;
    v_invited_count integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
    END IF;
    IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Please enter a valid email address';
    END IF;
    IF p_company_ids IS NULL OR cardinality(p_company_ids) = 0 THEN
        RAISE EXCEPTION 'Select at least one company';
    END IF;
    IF v_role_key = '' OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE lower(regexp_replace(ur.name, '[\s-]+', '_', 'g')) = v_role_key
           OR lower(regexp_replace(coalesce(ur.display_name, ''), '[\s-]+', '_', 'g')) = v_role_key
    ) THEN
        RAISE EXCEPTION 'Invalid role selected';
    END IF;

    IF v_role_key IN ('owner', 'super_admin') AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Only platform admin can assign owner or super admin role' USING ERRCODE = '42501';
    END IF;

    -- Verify Manage Users permission on EVERY requested company
    FOREACH v_cid IN ARRAY p_company_ids LOOP
        IF NOT public.user_has_company_permission(v_cid, 'Settings', 'Manage Users') THEN
            RAISE EXCEPTION 'Not authorized to manage users for company %', v_cid USING ERRCODE = '42501';
        END IF;
    END LOOP;

    SELECT u.id INTO v_target_user_id
    FROM auth.users u
    WHERE lower(trim(u.email)) = v_email
      AND (u.email_confirmed_at IS NOT NULL OR u.last_sign_in_at IS NOT NULL OR u.invited_at IS NULL)
    LIMIT 1;

    FOREACH v_cid IN ARRAY p_company_ids LOOP
        IF v_target_user_id IS NOT NULL THEN
            INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, invited_by, created_at, updated_at)
            VALUES (
                v_cid,
                v_target_user_id,
                v_role_key,
                'active',
                v_role_key IN ('owner', 'admin', 'super_admin'),
                auth.uid(),
                now(),
                now()
            )
            ON CONFLICT (company_id, user_id) DO UPDATE SET
                role = excluded.role,
                status = 'active',
                can_sync = excluded.can_sync,
                invited_by = excluded.invited_by,
                updated_at = now();

            UPDATE public.team_invitations
            SET status = 'accepted', accepted_at = now(), updated_at = now()
            WHERE company_id = v_cid AND lower(trim(email)) = v_email AND status = 'pending';

            PERFORM public._write_rbac_audit_log(
                v_cid,
                'rbac_user_invited',
                'rbac',
                v_target_user_id::text,
                v_email,
                jsonb_build_object('role', v_role_key, 'mode', 'direct_add')
            );
            v_added_count := v_added_count + 1;
        ELSE
            SELECT id INTO v_inv_id
            FROM public.team_invitations
            WHERE company_id = v_cid AND lower(trim(email)) = v_email AND status = 'pending'
            LIMIT 1;

            IF v_inv_id IS NOT NULL THEN
                UPDATE public.team_invitations
                SET role = v_role_key,
                    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
                    invited_by = auth.uid(),
                    updated_at = now()
                WHERE id = v_inv_id;
            ELSE
                INSERT INTO public.team_invitations (company_id, email, full_name, role, invited_by, status, created_at, updated_at)
                VALUES (v_cid, v_email, nullif(trim(p_full_name), ''), v_role_key, auth.uid(), 'pending', now(), now())
                RETURNING id INTO v_inv_id;
            END IF;

            PERFORM public._write_rbac_audit_log(
                v_cid,
                'rbac_user_invited',
                'rbac',
                v_inv_id::text,
                v_email,
                jsonb_build_object('role', v_role_key, 'mode', 'pending_invitation')
            );
            v_invited_count := v_invited_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'status', CASE WHEN v_added_count > 0 THEN 'added' ELSE 'invited' END,
        'added_count', v_added_count,
        'invited_count', v_invited_count,
        'invitation_id', v_inv_id,
        'email', v_email,
        'role', v_role_key,
        'email_sent', false
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_resend_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv public.team_invitations;
BEGIN
    SELECT * INTO v_inv FROM public.team_invitations WHERE id = p_invitation_id;
    IF NOT FOUND OR v_inv.status <> 'pending' THEN
        RAISE EXCEPTION 'Pending invitation not found';
    END IF;
    IF NOT public.user_has_company_permission(v_inv.company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', v_inv.id,
        'company_id', v_inv.company_id,
        'email', v_inv.email,
        'role', v_inv.role,
        'email_sent', false
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_update_member_role(
    p_company_id text,
    p_user_id uuid,
    p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role_key text := lower(regexp_replace(trim(coalesce(p_role, '')), '[\s-]+', '_', 'g'));
    v_is_admin boolean := public.is_platform_admin(auth.uid());
    v_owner_id uuid;
    v_old_role text;
BEGIN
    IF NOT public.user_has_company_permission(p_company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    IF v_role_key = '' OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE lower(regexp_replace(ur.name, '[\s-]+', '_', 'g')) = v_role_key
           OR lower(regexp_replace(coalesce(ur.display_name, ''), '[\s-]+', '_', 'g')) = v_role_key
    ) THEN
        RAISE EXCEPTION 'Invalid role';
    END IF;

    IF v_role_key IN ('owner', 'super_admin') AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Only platform admin can assign owner or super admin role' USING ERRCODE = '42501';
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
    IF v_owner_id = p_user_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Cannot change company owner role' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_admin(p_user_id) AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Cannot change platform super admin role' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_old_role FROM public.company_users
    WHERE company_id = p_company_id AND user_id = p_user_id;

    UPDATE public.company_users
    SET role = v_role_key,
        can_sync = v_role_key IN ('owner', 'admin', 'super_admin'),
        updated_at = now()
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company membership not found';
    END IF;

    PERFORM public._write_rbac_audit_log(
        p_company_id,
        'rbac_role_changed',
        'rbac',
        p_user_id::text,
        p_user_id::text,
        jsonb_build_object('old_role', v_old_role, 'new_role', v_role_key)
    );

    RETURN jsonb_build_object('success', true, 'role', v_role_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_update_member_status(
    p_company_id text,
    p_user_id uuid,
    p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_id uuid;
    v_old_status text;
BEGIN
    IF NOT public.user_has_company_permission(p_company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('active', 'suspended', 'inactive') THEN
        RAISE EXCEPTION 'Invalid status';
    END IF;

    IF p_user_id = auth.uid() AND p_status <> 'active' THEN
        RAISE EXCEPTION 'You cannot suspend your own access';
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
    IF v_owner_id = p_user_id AND p_status <> 'active' THEN
        RAISE EXCEPTION 'Cannot suspend company owner' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_admin(p_user_id) AND NOT public.is_platform_admin(auth.uid()) AND p_status <> 'active' THEN
        RAISE EXCEPTION 'Cannot suspend platform super admin' USING ERRCODE = '42501';
    END IF;

    SELECT status INTO v_old_status FROM public.company_users
    WHERE company_id = p_company_id AND user_id = p_user_id;

    UPDATE public.company_users
    SET status = p_status, updated_at = now()
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company membership not found';
    END IF;

    PERFORM public._write_rbac_audit_log(
        p_company_id,
        CASE WHEN p_status = 'suspended' THEN 'rbac_user_suspended' ELSE 'rbac_user_unsuspended' END,
        'rbac',
        p_user_id::text,
        p_user_id::text,
        jsonb_build_object('old_status', v_old_status, 'new_status', p_status)
    );

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_remove_member(
    p_company_id text,
    p_user_id uuid DEFAULT NULL,
    p_invitation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_id uuid;
    v_inv public.team_invitations;
BEGIN
    IF NOT public.user_has_company_permission(p_company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    IF p_invitation_id IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.team_invitations
        WHERE id = p_invitation_id AND company_id = p_company_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invitation not found';
        END IF;
        UPDATE public.team_invitations
        SET status = 'revoked', updated_at = now()
        WHERE id = p_invitation_id;

        PERFORM public._write_rbac_audit_log(
            p_company_id,
            'rbac_user_removed',
            'rbac',
            p_invitation_id::text,
            v_inv.email,
            jsonb_build_object('kind', 'invitation_revoked')
        );
        RETURN jsonb_build_object('success', true);
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id or invitation_id required';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot remove your own membership';
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
    IF v_owner_id = p_user_id THEN
        RAISE EXCEPTION 'Cannot remove company owner' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_admin(p_user_id) AND NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cannot remove platform super admin' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.company_users
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company membership not found';
    END IF;

    PERFORM public._write_rbac_audit_log(
        p_company_id,
        'rbac_user_removed',
        'rbac',
        p_user_id::text,
        p_user_id::text,
        jsonb_build_object('kind', 'member_removed')
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_bulk_member_action(
    p_company_id text,
    p_user_ids uuid[],
    p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_id uuid;
    v_uid uuid;
    v_affected integer := 0;
BEGIN
    IF NOT public.user_has_company_permission(p_company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    IF p_action NOT IN ('suspend', 'activate', 'remove') THEN
        RAISE EXCEPTION 'Invalid bulk action';
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;

    FOREACH v_uid IN ARRAY coalesce(p_user_ids, ARRAY[]::uuid[]) LOOP
        CONTINUE WHEN v_uid = auth.uid() OR v_uid = v_owner_id OR (public.is_platform_admin(v_uid) AND NOT public.is_platform_admin(auth.uid()));

        IF p_action = 'remove' THEN
            DELETE FROM public.company_users WHERE company_id = p_company_id AND user_id = v_uid;
        ELSE
            UPDATE public.company_users
            SET status = CASE WHEN p_action = 'suspend' THEN 'suspended' ELSE 'active' END,
                updated_at = now()
            WHERE company_id = p_company_id AND user_id = v_uid;
        END IF;

        IF FOUND THEN
            v_affected := v_affected + 1;
        END IF;
    END LOOP;

    PERFORM public._write_rbac_audit_log(
        p_company_id,
        'rbac_bulk_action',
        'rbac',
        p_company_id,
        p_action,
        jsonb_build_object('action', p_action, 'affected', v_affected, 'requested_count', coalesce(cardinality(p_user_ids), 0))
    );

    RETURN jsonb_build_object('success', true, 'affected', v_affected);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_set_company_access(
    p_user_id uuid,
    p_company_id text,
    p_grant boolean,
    p_role text DEFAULT 'viewer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role_key text := lower(regexp_replace(trim(coalesce(p_role, 'viewer')), '[\s-]+', '_', 'g'));
    v_is_admin boolean := public.is_platform_admin(auth.uid());
    v_owner_id uuid;
BEGIN
    IF NOT public.user_has_company_permission(p_company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
    IF NOT p_grant AND v_owner_id = p_user_id THEN
        RAISE EXCEPTION 'Cannot revoke access from company owner' USING ERRCODE = '42501';
    END IF;
    IF NOT p_grant AND public.is_platform_admin(p_user_id) AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Cannot revoke access from platform super admin' USING ERRCODE = '42501';
    END IF;

    IF p_grant THEN
        IF v_role_key IN ('owner', 'super_admin') AND NOT v_is_admin THEN
            v_role_key := 'viewer';
        END IF;
        INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, invited_by, created_at, updated_at)
        VALUES (p_company_id, p_user_id, v_role_key, 'active', v_role_key IN ('owner', 'admin', 'super_admin'), auth.uid(), now(), now())
        ON CONFLICT (company_id, user_id) DO UPDATE SET
            status = 'active',
            updated_at = now();
    ELSE
        DELETE FROM public.company_users WHERE company_id = p_company_id AND user_id = p_user_id;
    END IF;

    PERFORM public._write_rbac_audit_log(
        p_company_id,
        CASE WHEN p_grant THEN 'rbac_company_access_granted' ELSE 'rbac_company_access_revoked' END,
        'rbac',
        p_user_id::text,
        p_company_id,
        jsonb_build_object('grant', p_grant, 'role', v_role_key)
    );

    RETURN jsonb_build_object('success', true, 'granted', p_grant);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_set_default_company(
    p_user_id uuid,
    p_company_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
    END IF;

    IF p_user_id <> auth.uid()
       AND NOT public.is_platform_admin(auth.uid())
       AND NOT public.user_has_company_permission(p_company_id, 'Settings', 'Manage Users') THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.company_users cu
        WHERE cu.user_id = p_user_id AND cu.company_id = p_company_id AND coalesce(cu.status, 'active') = 'active'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.companies c WHERE c.id = p_company_id AND c.owner_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User does not have active access to this company';
    END IF;

    -- Ensure owner row exists if needed
    INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, is_default)
    SELECT c.id, c.owner_id, 'owner', 'active', true, false
    FROM public.companies c
    WHERE c.id = p_company_id AND c.owner_id = p_user_id
    ON CONFLICT (company_id, user_id) DO NOTHING;

    UPDATE public.company_users
    SET is_default = (company_id = p_company_id),
        updated_at = now()
    WHERE user_id = p_user_id;

    PERFORM public._write_rbac_audit_log(
        p_company_id,
        'rbac_default_company_changed',
        'rbac',
        p_user_id::text,
        p_company_id,
        jsonb_build_object('default_company_id', p_company_id)
    );

    RETURN jsonb_build_object('success', true, 'default_company_id', p_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_save_role(
    p_role_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_display_name text DEFAULT NULL,
    p_permissions jsonb DEFAULT '{}'::jsonb,
    p_description text DEFAULT NULL,
    p_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role public.user_roles;
    v_slug text;
    v_display text;
BEGIN
    IF NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only platform admin can modify role definitions' USING ERRCODE = '42501';
    END IF;

    IF p_role_id IS NULL THEN
        v_display := trim(coalesce(p_display_name, p_name, ''));
        IF v_display = '' THEN
            RAISE EXCEPTION 'Role name is required';
        END IF;
        v_slug := lower(regexp_replace(v_display, '[^a-zA-Z0-9]+', '_', 'g'));
        v_slug := trim(both '_' from v_slug);
        IF v_slug = '' THEN
            RAISE EXCEPTION 'Invalid role name';
        END IF;

        INSERT INTO public.user_roles (name, display_name, description, permissions, is_system, color, created_at, updated_at)
        VALUES (
            v_slug,
            v_display,
            coalesce(p_description, ''),
            coalesce(p_permissions, '{}'::jsonb),
            false,
            coalesce(nullif(p_color, ''), 'text-purple-400'),
            now(),
            now()
        )
        RETURNING * INTO v_role;

        PERFORM public._write_rbac_audit_log(
            NULL,
            'rbac_role_created',
            'rbac',
            v_role.id::text,
            v_role.display_name,
            jsonb_build_object('name', v_role.name)
        );
    ELSE
        UPDATE public.user_roles
        SET display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
            description = coalesce(p_description, description),
            permissions = coalesce(p_permissions, permissions),
            color = coalesce(nullif(p_color, ''), color),
            updated_at = now()
        WHERE id = p_role_id
        RETURNING * INTO v_role;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Role not found';
        END IF;

        PERFORM public._write_rbac_audit_log(
            NULL,
            'rbac_role_updated',
            'rbac',
            v_role.id::text,
            coalesce(v_role.display_name, v_role.name),
            jsonb_build_object('name', v_role.name, 'permissions', v_role.permissions)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'role', jsonb_build_object(
            'id', v_role.id,
            'name', v_role.name,
            'display_name', v_role.display_name,
            'description', v_role.description,
            'color', v_role.color,
            'permissions', v_role.permissions,
            'is_system', v_role.is_system
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_delete_role(p_role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role public.user_roles;
BEGIN
    IF NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only platform admin can delete roles' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_role FROM public.user_roles WHERE id = p_role_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found';
    END IF;
    IF v_role.is_system THEN
        RAISE EXCEPTION 'System roles cannot be deleted';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.company_users cu
        WHERE lower(regexp_replace(cu.role, '[\s-]+', '_', 'g')) = lower(regexp_replace(v_role.name, '[\s-]+', '_', 'g'))
    ) THEN
        RAISE EXCEPTION 'Reassign users from this role before deleting it';
    END IF;

    DELETE FROM public.user_roles WHERE id = p_role_id;

    PERFORM public._write_rbac_audit_log(
        NULL,
        'rbac_role_deleted',
        'rbac',
        v_role.id::text,
        coalesce(v_role.display_name, v_role.name),
        jsonb_build_object('name', v_role.name)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Guard user_profiles.is_admin so no Company Admin or regular user can self-escalate to Super Admin
CREATE OR REPLACE FUNCTION public.guard_user_profiles_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF coalesce(NEW.is_admin, false) = true
           AND auth.role() <> 'service_role'
           AND NOT public.is_platform_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Only Super Admin can grant Super Admin privilege' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
       AND auth.role() <> 'service_role'
       AND NOT public.is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only Super Admin can change Super Admin privilege' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.user_profiles') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_guard_user_profiles_is_admin ON public.user_profiles;
        CREATE TRIGGER trg_guard_user_profiles_is_admin
            BEFORE INSERT OR UPDATE ON public.user_profiles
            FOR EACH ROW
            EXECUTE FUNCTION public.guard_user_profiles_is_admin();
    END IF;
END $$;

-- Defense-in-depth triggers on company_users & team_invitations so owner/Super Admin protection,
-- anti-self-escalation, and anti-self-suspension hold even if table grants are ever widened.
CREATE OR REPLACE FUNCTION public.guard_company_users_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role_key text;
    v_is_target_owner boolean;
    v_is_target_super boolean;
BEGIN
    IF auth.role() = 'service_role' OR public.is_platform_admin(auth.uid()) THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.user_id = auth.uid() THEN
            RAISE EXCEPTION 'Cannot remove your own company membership' USING ERRCODE = '42501';
        END IF;
        SELECT EXISTS (
            SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id AND c.owner_id = OLD.user_id
        ) INTO v_is_target_owner;
        v_is_target_super := public.is_platform_admin(OLD.user_id);
        IF v_is_target_owner OR v_is_target_super THEN
            RAISE EXCEPTION 'Cannot remove company owner or platform super admin' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    v_role_key := lower(regexp_replace(trim(coalesce(NEW.role, 'viewer')), '[\s-]+', '_', 'g'));
    SELECT EXISTS (
        SELECT 1 FROM public.companies c WHERE c.id = NEW.company_id AND c.owner_id = NEW.user_id
    ) INTO v_is_target_owner;
    v_is_target_super := public.is_platform_admin(NEW.user_id);

    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role) THEN
        IF v_role_key IN ('owner', 'super_admin') THEN
            IF NOT (v_role_key = 'owner' AND (v_is_target_owner OR public.is_platform_admin(NEW.invited_by))) THEN
                RAISE EXCEPTION 'Only platform admin can assign owner or super admin role' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (NEW.role IS DISTINCT FROM OLD.role OR coalesce(NEW.status, 'active') IS DISTINCT FROM coalesce(OLD.status, 'active'))
           AND (v_is_target_owner OR v_is_target_super) THEN
            RAISE EXCEPTION 'Cannot modify company owner or platform super admin membership' USING ERRCODE = '42501';
        END IF;
        IF NEW.user_id = auth.uid() AND coalesce(NEW.status, 'active') <> 'active' THEN
            RAISE EXCEPTION 'Cannot suspend your own company membership' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_team_invitations_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role_key text;
BEGIN
    IF auth.role() = 'service_role' OR public.is_platform_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    v_role_key := lower(regexp_replace(trim(coalesce(NEW.role, 'viewer')), '[\s-]+', '_', 'g'));
    IF v_role_key IN ('owner', 'super_admin') THEN
        RAISE EXCEPTION 'Only platform admin can assign owner or super admin role' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.company_users') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_guard_company_users_mutations ON public.company_users;
        CREATE TRIGGER trg_guard_company_users_mutations
            BEFORE INSERT OR UPDATE OR DELETE ON public.company_users
            FOR EACH ROW
            EXECUTE FUNCTION public.guard_company_users_mutations();
    END IF;

    IF to_regclass('public.team_invitations') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_guard_team_invitations_mutations ON public.team_invitations;
        CREATE TRIGGER trg_guard_team_invitations_mutations
            BEFORE INSERT OR UPDATE ON public.team_invitations
            FOR EACH ROW
            EXECUTE FUNCTION public.guard_team_invitations_mutations();
    END IF;
END $$;

-- ============================================================================
-- 6. GRANTS
-- ============================================================================

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_company_membership(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_company_membership(text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_company_permission(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_company_permission(text, text, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_user_can_access_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_can_access_company(text) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_user_can_write_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_can_write_company(text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_get_my_permissions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_get_my_permissions(text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_pending_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_pending_invitations() TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_list_overview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_list_overview(text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_invite_member(text[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_invite_member(text[], text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_resend_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_resend_invitation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_update_member_role(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_update_member_role(text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_update_member_status(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_update_member_status(text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_remove_member(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_remove_member(text, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_bulk_member_action(text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_bulk_member_action(text, uuid[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_set_company_access(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_set_company_access(uuid, text, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_set_default_company(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_set_default_company(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_save_role(uuid, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_save_role(uuid, text, text, jsonb, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rbac_delete_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_delete_role(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
