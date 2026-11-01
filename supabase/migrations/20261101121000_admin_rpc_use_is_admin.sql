-- Update all admin RPC wrappers to use is_admin column instead of hardcoded email

-- guard_license_updates trigger
CREATE OR REPLACE FUNCTION public.guard_license_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        IF (NEW.expiry_date IS DISTINCT FROM OLD.expiry_date)
           OR (NEW.status IS DISTINCT FROM OLD.status)
           OR (NEW.plan_id IS DISTINCT FROM OLD.plan_id)
           OR (NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at) THEN
            RAISE EXCEPTION 'License fields are immutable for non-admin' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- assign_license
CREATE OR REPLACE FUNCTION public.assign_license(
    p_email TEXT,
    p_plan_slug TEXT,
    p_duration_days INTEGER DEFAULT 30,
    p_mobile TEXT DEFAULT NULL,
    p_tally_serial TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.assign_license_impl(p_email, p_plan_slug, p_duration_days, p_mobile, p_tally_serial);
END;
$$;

-- extend_license
CREATE OR REPLACE FUNCTION public.extend_license(
    p_license_id UUID,
    p_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.extend_license_impl(p_license_id, p_days);
END;
$$;

-- update_license_status
CREATE OR REPLACE FUNCTION public.update_license_status(
    p_license_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.update_license_status_impl(p_license_id, p_status);
END;
$$;

-- bind_tally_serial
CREATE OR REPLACE FUNCTION public.bind_tally_serial(
    p_user_id UUID,
    p_tally_serial TEXT,
    p_admin_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.bind_tally_serial_impl(p_user_id, p_tally_serial, p_admin_override);
END;
$$;

-- transfer_tally_serial
CREATE OR REPLACE FUNCTION public.transfer_tally_serial(
    p_license_id UUID,
    p_new_tally_serial TEXT,
    p_admin_id UUID,
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.transfer_tally_serial_impl(p_license_id, p_new_tally_serial, p_admin_id, p_reason);
END;
$$;

-- get_admin_users
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS SETOF public.user_licenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT * FROM public.get_admin_users_impl();
END;
$$;

-- get_admin_stats
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.get_admin_stats_impl();
END;
$$;

-- get_user_by_email
CREATE OR REPLACE FUNCTION public.get_user_by_email(
    p_email TEXT
)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT * FROM public.get_user_by_email_impl(p_email);
END;
$$;

-- admin_list_temporary_licenses
CREATE OR REPLACE FUNCTION public.admin_list_temporary_licenses(
    p_search TEXT DEFAULT '',
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    registered_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    account_status TEXT,
    company_names TEXT,
    company_count BIGINT,
    license_type TEXT,
    status TEXT,
    expiry TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    IF LENGTH(COALESCE(p_search, '')) > 120 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR p_offset IS NULL OR p_offset < 0 THEN
        RAISE EXCEPTION 'Invalid search or pagination';
    END IF;
    RETURN QUERY
    SELECT u.id, COALESCE(u.email, '')::text, COALESCE(p.full_name, '')::text,
           COALESCE(p.phone, u.phone, '')::text, u.created_at, u.last_sign_in_at,
           CASE WHEN u.banned_until > now() THEN 'BLOCKED' WHEN p.is_active = FALSE THEN 'INACTIVE' ELSE 'ACTIVE' END,
           COALESCE(c.names, '')::text, COALESCE(c.n, 0)::bigint,
           COALESCE(l.plan_slug, sp.slug, CASE WHEN t.user_id IS NOT NULL THEN 'trial' END)::text,
           CASE WHEN l.status = 'suspended' THEN 'SUSPENDED'
                WHEN l.status = 'cancelled' THEN 'REVOKED'
                WHEN l.status = 'active' AND (COALESCE(l.expiry_date,l.expires_at) IS NULL OR COALESCE(l.expiry_date,l.expires_at) > now()) THEN
                    CASE WHEN COALESCE(l.plan_slug,sp.slug,'') = 'trial' THEN 'TRIAL' ELSE 'ACTIVE' END
                WHEN l.id IS NOT NULL THEN 'EXPIRED'
                WHEN t.user_id IS NOT NULL AND COALESCE(t.trial_end,t.ended_at) > now() THEN 'TRIAL'
                WHEN t.user_id IS NOT NULL THEN 'EXPIRED'
                ELSE 'NONE' END,
           COALESCE(l.expiry_date,l.expires_at,t.trial_end,t.ended_at)
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON p.id = u.id
    LEFT JOIN LATERAL (
        SELECT string_agg(co.name, ', ' ORDER BY co.name) names, count(*) n
        FROM public.companies co WHERE co.owner_id = u.id
    ) c ON TRUE
    LEFT JOIN LATERAL (
        SELECT ul.* FROM public.user_licenses ul WHERE ul.user_id = u.id
        ORDER BY CASE WHEN ul.status = 'active' AND (COALESCE(ul.expiry_date,ul.expires_at) IS NULL OR COALESCE(ul.expiry_date,ul.expires_at) > now()) THEN 0 ELSE 1 END,
                 ul.created_at DESC, ul.id DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN public.subscription_plans sp ON sp.id = l.plan_id
    LEFT JOIN LATERAL (
        SELECT th.user_id, th.trial_end, th.ended_at FROM public.trial_history th WHERE th.user_id = u.id
        ORDER BY th.created_at DESC, th.id DESC LIMIT 1
    ) t ON TRUE
    WHERE COALESCE(u.email,'') ILIKE '%' || COALESCE(p_search,'') || '%'
       OR COALESCE(p.full_name,'') ILIKE '%' || COALESCE(p_search,'') || '%'
       OR COALESCE(c.names,'') ILIKE '%' || COALESCE(p_search,'') || '%'
    ORDER BY u.created_at DESC NULLS LAST, u.id
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- admin_payment_users
CREATE OR REPLACE FUNCTION public.admin_payment_users(
    p_user_ids UUID[]
)
RETURNS TABLE(user_id UUID, email TEXT, full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(CARDINALITY(p_user_ids), 0) > 1000 THEN
        RAISE EXCEPTION 'Too many user IDs';
    END IF;
    RETURN QUERY SELECT u.id, COALESCE(u.email, '')::text, COALESCE(p.full_name, '')::text
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON p.id = u.id
    WHERE u.id = ANY(COALESCE(p_user_ids, ARRAY[]::UUID[]));
END;
$$;

NOTIFY pgrst, 'reload schema';