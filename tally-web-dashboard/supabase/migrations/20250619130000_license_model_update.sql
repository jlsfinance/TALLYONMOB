-- ============================================================
-- LICENSE MODEL UPDATE: One License = One Email + One Tally Serial + Unlimited Companies
-- Admin (lovneetrathi@gmail.com) is exempt from all restrictions
-- ============================================================

-- Add mobile column to user_licenses if not exists
DO $$ BEGIN
    ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS mobile TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ============================================================
-- 1. validate_user_license: now accepts p_tally_serial parameter
--    - Checks license active, not expired
--    - Checks tally_serial matches (if license has one bound)
--    - Returns tally_mismatch error if serial doesn't match
-- ============================================================
DROP FUNCTION IF EXISTS validate_user_license(UUID, TEXT);
DROP FUNCTION IF EXISTS validate_user_license(UUID);
CREATE OR REPLACE FUNCTION validate_user_license(
    p_user_id UUID,
    p_tally_serial TEXT DEFAULT NULL
)
RETURNS TABLE(
    valid BOOLEAN,
    status TEXT,
    plan_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_left INTEGER,
    tally_serial_bound TEXT,
    email_bound TEXT,
    mobile_bound TEXT
) AS $$
DECLARE
    lic RECORD;
    plan RECORD;
BEGIN
    -- Find active license for this user
    SELECT * INTO lic FROM user_licenses
    WHERE user_id = p_user_id AND status IN ('active','suspended')
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'no_license'::TEXT, 'None'::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- Check expiry
    IF lic.expiry_date < now() THEN
        UPDATE user_licenses SET status = 'expired' WHERE id = lic.id;
        RETURN QUERY SELECT false, 'expired'::TEXT, 'Expired'::TEXT, lic.expiry_date, 0, lic.tally_serial, lic.email, lic.mobile;
        RETURN;
    END IF;

    -- Check suspended
    IF lic.status = 'suspended' THEN
        RETURN QUERY SELECT false, 'suspended'::TEXT, 'Suspended'::TEXT, lic.expiry_date, 0, lic.tally_serial, lic.email, lic.mobile;
        RETURN;
    END IF;

    -- Check tally_serial match (if license has one bound)
    IF lic.tally_serial IS NOT NULL AND lic.tally_serial != '' THEN
        IF p_tally_serial IS NOT NULL AND p_tally_serial != '' THEN
            IF lic.tally_serial != p_tally_serial THEN
                RETURN QUERY SELECT false, 'tally_mismatch'::TEXT, 'License Mismatch'::TEXT, lic.expiry_date, 0, lic.tally_serial, lic.email, lic.mobile;
                RETURN;
            END IF;
        END IF;
    END IF;

    -- Get plan name
    SELECT name INTO plan FROM subscription_plans WHERE id = lic.plan_id;

    RETURN QUERY SELECT
        true,
        lic.status,
        COALESCE(plan.name, 'Unknown'),
        lic.expiry_date,
        EXTRACT(DAY FROM lic.expiry_date - now())::INTEGER,
        lic.tally_serial,
        lic.email,
        lic.mobile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. bind_tally_serial: binds a tally_serial to an existing license
--    - Only works if license has no tally_serial yet (first activation)
--    - Admin can override with admin_override parameter
-- ============================================================
CREATE OR REPLACE FUNCTION bind_tally_serial(
    p_user_id UUID,
    p_tally_serial TEXT,
    p_admin_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    lic RECORD;
BEGIN
    SELECT * INTO lic FROM user_licenses
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'No active license found');
    END IF;

    -- License already has a different tally_serial bound
    IF lic.tally_serial IS NOT NULL AND lic.tally_serial != '' AND lic.tally_serial != p_tally_serial THEN
        IF NOT p_admin_override THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'tally_mismatch',
                'message', 'This license is already linked to another Tally Serial Number (' || lic.tally_serial || '). Contact support to transfer.',
                'bound_serial', lic.tally_serial
            );
        END IF;
    END IF;

    -- Bind or confirm same serial
    UPDATE user_licenses SET tally_serial = p_tally_serial, updated_at = now() WHERE id = lic.id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'License linked to Tally Serial: ' || p_tally_serial,
        'license_key', lic.license_key,
        'tally_serial', p_tally_serial
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. transfer_tally_serial: admin can transfer license to new tally serial
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_tally_serial(
    p_license_id UUID,
    p_new_tally_serial TEXT,
    p_admin_id UUID,
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
    lic RECORD;
    admin_email TEXT;
BEGIN
    -- Verify admin
    SELECT email INTO admin_email FROM auth.users WHERE id = p_admin_id;
    IF admin_email != 'lovneetrathi@gmail.com' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Only super admin can transfer licenses');
    END IF;

    SELECT * INTO lic FROM user_licenses WHERE id = p_license_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'License not found');
    END IF;

    -- Log the transfer
    INSERT INTO activity_logs (user_id, actor_email, action, entity_type, entity_id, entity_name, details)
    VALUES (p_admin_id, admin_email, 'tally_serial_transferred', 'license', p_license_id, lic.license_key, jsonb_build_object(
        'old_serial', lic.tally_serial,
        'new_serial', p_new_tally_serial,
        'reason', p_reason
    ));

    UPDATE user_licenses SET tally_serial = p_new_tally_serial, updated_at = now() WHERE id = p_license_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'License transferred from ' || COALESCE(lic.tally_serial, 'none') || ' to ' || p_new_tally_serial
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. assign_license: updated with mobile + tally_serial support
-- ============================================================
DROP FUNCTION IF EXISTS assign_license(TEXT, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION assign_license(
    p_email TEXT,
    p_plan_slug TEXT,
    p_duration_days INTEGER DEFAULT 30,
    p_mobile TEXT DEFAULT NULL,
    p_tally_serial TEXT DEFAULT NULL
)
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID;
    v_plan RECORD;
    v_license_key TEXT;
    v_expiry TIMESTAMPTZ;
    v_lic_id UUID;
BEGIN
    -- Find user by email
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found with email: ' || p_email);
    END IF;

    -- Find plan
    SELECT * INTO v_plan FROM subscription_plans WHERE slug = p_plan_slug;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Plan not found: ' || p_plan_slug);
    END IF;

    -- Generate license key: SYNCORA-YYYY-XXXXXXXX
    v_license_key := 'SYNCORA-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
        UPPER(SUBSTRING(MD5(random()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 8));

    v_expiry := now() + (p_duration_days || ' days')::INTERVAL;

    INSERT INTO user_licenses (user_id, license_key, plan_id, status, expiry_date, activation_date, email, mobile, tally_serial)
    VALUES (v_user_id, v_license_key, v_plan.id, 'active', v_expiry, now(), p_email, p_mobile, p_tally_serial)
    RETURNING id INTO v_lic_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'License assigned: ' || v_license_key,
        'license_id', v_lic_id,
        'license_key', v_license_key,
        'expiry_date', v_expiry,
        'plan', v_plan.name,
        'email', p_email,
        'tally_serial', p_tally_serial
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Admin functions (drop + recreate to change signatures)
-- ============================================================

-- get_admin_users: drop old version first
DROP FUNCTION IF EXISTS get_admin_users();
CREATE OR REPLACE FUNCTION get_admin_users()
RETURNS SETOF user_licenses AS $$
BEGIN
    RETURN QUERY SELECT * FROM user_licenses ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- extend_license
CREATE OR REPLACE FUNCTION extend_license(
    p_license_id UUID,
    p_days INTEGER
)
RETURNS JSONB AS $$
DECLARE
    lic RECORD;
    new_expiry TIMESTAMPTZ;
BEGIN
    SELECT * INTO lic FROM user_licenses WHERE id = p_license_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'License not found');
    END IF;

    new_expiry := lic.expiry_date + (p_days || ' days')::INTERVAL;
    UPDATE user_licenses SET expiry_date = new_expiry, updated_at = now() WHERE id = p_license_id;

    RETURN jsonb_build_object('success', true, 'new_expiry', new_expiry, 'days_added', p_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- update_license_status
CREATE OR REPLACE FUNCTION update_license_status(
    p_license_id UUID,
    p_status TEXT
)
RETURNS JSONB AS $$
BEGIN
    UPDATE user_licenses SET status = p_status, updated_at = now() WHERE id = p_license_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Status updated to ' || p_status);
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'License not found');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
