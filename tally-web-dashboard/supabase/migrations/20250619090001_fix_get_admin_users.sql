-- Drop and recreate get_admin_users with email column
DROP FUNCTION IF EXISTS get_admin_users();

CREATE OR REPLACE FUNCTION get_admin_users()
RETURNS TABLE (
    out_id UUID,
    out_user_id UUID,
    out_email TEXT,
    out_license_key TEXT,
    out_status TEXT,
    out_expiry_date TIMESTAMPTZ,
    out_tally_serial TEXT,
    out_company_gst TEXT,
    out_plan_id UUID,
    out_created_at TIMESTAMPTZ,
    out_plan_name TEXT,
    out_plan_slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ul.id,
        ul.user_id,
        COALESCE(ul.email, u.email) AS email,
        ul.license_key,
        ul.status,
        ul.expiry_date,
        ul.tally_serial,
        ul.company_gst,
        ul.plan_id,
        ul.created_at,
        sp.name AS plan_name,
        sp.slug AS plan_slug
    FROM user_licenses ul
    LEFT JOIN auth.users u ON ul.user_id = u.id
    LEFT JOIN subscription_plans sp ON ul.plan_id = sp.id
    ORDER BY ul.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_admin_users() TO authenticated;
