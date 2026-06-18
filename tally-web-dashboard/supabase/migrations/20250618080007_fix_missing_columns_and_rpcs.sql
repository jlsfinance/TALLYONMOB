-- ============================================================
-- Fix missing columns & RPC functions
-- Adds columns that InsForge tables are missing but code expects
-- ============================================================

-- 1. user_licenses: add plan_slug column (code references it)
DO $$ BEGIN
    ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS plan_slug TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Ensure all expected columns exist
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS plan_id UUID; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS license_key TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS activation_date TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS tally_serial TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS company_gst TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS company_pan TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. payments: add columns SubscriptionPage expects
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_slug TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_code TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS final_amount NUMERIC(10,2); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id UUID; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. trial_history: ensure all expected columns exist
DO $$ BEGIN ALTER TABLE trial_history ADD COLUMN IF NOT EXISTS user_id UUID; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trial_history ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT true; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trial_history ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trial_history ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trial_history ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trial_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. Drop and recreate all admin RPC functions with correct column references
DO $$ BEGIN DROP FUNCTION IF EXISTS get_admin_users(); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS extend_license(UUID, INTEGER); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS assign_license(TEXT, TEXT, INTEGER); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS update_license_status(UUID, TEXT); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS get_admin_stats(); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- get_admin_users: join with subscription_plans to get plan info
CREATE OR REPLACE FUNCTION get_admin_users()
RETURNS TABLE(
    id UUID,
    user_id UUID,
    user_email TEXT,
    license_key TEXT,
    plan_id UUID,
    plan_slug TEXT,
    plan_name TEXT,
    status TEXT,
    activation_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    tally_serial TEXT,
    company_gst TEXT,
    company_pan TEXT,
    auto_renew BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        ul.id,
        ul.user_id,
        u.email::TEXT AS user_email,
        ul.license_key,
        ul.plan_id,
        COALESCE(ul.plan_slug, sp.slug) AS plan_slug,
        sp.name AS plan_name,
        ul.status,
        ul.activation_date,
        ul.expiry_date,
        ul.tally_serial,
        ul.company_gst,
        ul.company_pan,
        ul.auto_renew,
        ul.created_at,
        ul.updated_at
    FROM user_licenses ul
    LEFT JOIN auth.users u ON ul.user_id = u.id
    LEFT JOIN subscription_plans sp ON ul.plan_id = sp.id
    ORDER BY ul.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- extend_license
CREATE OR REPLACE FUNCTION extend_license(p_license_id UUID, p_days INTEGER)
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_lic user_licenses%ROWTYPE;
    v_new_expiry TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_lic FROM user_licenses WHERE id = p_license_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'License not found');
    END IF;

    v_new_expiry := COALESCE(v_lic.expiry_date, now()) + (p_days || ' days')::INTERVAL;

    UPDATE user_licenses
    SET expiry_date = v_new_expiry,
        updated_at = now()
    WHERE id = p_license_id;

    RETURN jsonb_build_object('success', true, 'message', 'License extended by ' || p_days || ' days', 'expiry_date', v_new_expiry);
END;
$$ LANGUAGE plpgsql;

-- assign_license (no plan_slug column needed)
CREATE OR REPLACE FUNCTION assign_license(
    p_email TEXT,
    p_plan_slug TEXT,
    p_duration_days INTEGER DEFAULT 30
)
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID;
    v_plan_id UUID;
    v_license_key TEXT;
    v_expiry TIMESTAMPTZ;
    v_lic_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found with email: ' || p_email);
    END IF;

    SELECT id INTO v_plan_id FROM subscription_plans WHERE slug = p_plan_slug;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Plan not found: ' || p_plan_slug);
    END IF;

    v_license_key := 'TOM-' || TO_CHAR(now(), 'YYYY') || '-' ||
        UPPER(SUBSTRING(MD5(random()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 8));

    v_expiry := now() + (p_duration_days || ' days')::INTERVAL;

    INSERT INTO user_licenses (user_id, license_key, plan_id, status, expiry_date, activation_date)
    VALUES (v_user_id, v_license_key, v_plan_id, 'active', v_expiry, now())
    RETURNING id INTO v_lic_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'License assigned successfully',
        'license_id', v_lic_id,
        'license_key', v_license_key,
        'expiry_date', v_expiry
    );
END;
$$ LANGUAGE plpgsql;

-- update_license_status
CREATE OR REPLACE FUNCTION update_license_status(
    p_license_id UUID,
    p_status TEXT
)
RETURNS JSONB SECURITY DEFINER AS $$
BEGIN
    IF p_status NOT IN ('active', 'expired', 'blocked', 'suspended', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status: ' || p_status);
    END IF;

    UPDATE user_licenses
    SET status = p_status,
        updated_at = now()
    WHERE id = p_license_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'License not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'License status updated to ' || p_status);
END;
$$ LANGUAGE plpgsql;

-- get_admin_stats
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_total_users BIGINT;
    v_active_users BIGINT;
    v_expired_users BIGINT;
    v_trial_users BIGINT;
    v_total_revenue NUMERIC;
    v_mrr NUMERIC;
    v_arr NUMERIC;
    v_total_licenses BIGINT;
    v_total_payments BIGINT;
    v_total_companies BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_total_users FROM auth.users;
    SELECT COUNT(*) INTO v_active_users FROM user_licenses WHERE status = 'active' AND expiry_date > now();
    SELECT COUNT(*) INTO v_expired_users FROM user_licenses WHERE status = 'expired' OR expiry_date <= now();
    SELECT COUNT(*) INTO v_trial_users FROM trial_history;
    SELECT COUNT(*) INTO v_total_licenses FROM user_licenses;
    SELECT COUNT(*) INTO v_total_payments FROM payments;
    SELECT COUNT(*) INTO v_total_companies FROM companies;

    SELECT COALESCE(SUM(COALESCE(final_amount, total_amount, amount, 0)), 0) INTO v_total_revenue
    FROM payments WHERE status = 'paid';

    SELECT COALESCE(SUM(COALESCE(final_amount, total_amount, amount, 0)), 0) INTO v_mrr
    FROM payments WHERE status = 'paid' AND created_at >= date_trunc('month', now());

    SELECT COALESCE(SUM(COALESCE(final_amount, total_amount, amount, 0)), 0) INTO v_arr
    FROM payments WHERE status = 'paid' AND created_at >= date_trunc('year', now());

    RETURN jsonb_build_object(
        'total_users', v_total_users,
        'active_users', v_active_users,
        'expired_users', v_expired_users,
        'trial_users', v_trial_users,
        'total_revenue', v_total_revenue,
        'mrr', v_mrr,
        'arr', v_arr,
        'total_licenses', v_total_licenses,
        'total_payments', v_total_payments,
        'total_companies', v_total_companies
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION get_admin_users() TO authenticated;
    GRANT EXECUTE ON FUNCTION extend_license(UUID, INTEGER) TO authenticated;
    GRANT EXECUTE ON FUNCTION assign_license(TEXT, TEXT, INTEGER) TO authenticated;
    GRANT EXECUTE ON FUNCTION update_license_status(UUID, TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. Ensure RLS allows authenticated users to read user_licenses and trial_history
DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_user_licenses" ON user_licenses;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "auth_all_user_licenses" ON user_licenses
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_trial_history" ON trial_history;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "auth_all_trial_history" ON trial_history
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "auth_all_payments" ON payments;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "auth_all_payments" ON payments
        FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Enable RLS on all three tables
DO $$ BEGIN EXECUTE 'ALTER TABLE user_licenses ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE trial_history ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN EXECUTE 'ALTER TABLE payments ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
