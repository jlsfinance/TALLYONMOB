-- ============================================================
-- SaaS Licensing & Admin Management System
-- TallyOnMobile / TallyLink Enterprise
-- ============================================================

-- 1. USER ROLES
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    permissions JSONB DEFAULT '[]',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO user_roles (name, display_name, permissions, is_system) VALUES
    ('super_admin', 'Super Admin', '["*"]', true),
    ('admin', 'Admin', '["users:read","users:write","companies:read","companies:write","licenses:read","licenses:write","coupons:read","coupons:write","payments:read","analytics:read","support:read","support:write"]', false),
    ('sales_manager', 'Sales Manager', '["users:read","companies:read","coupons:read","coupons:write","payments:read","analytics:read","leads:read","leads:write"]', false),
    ('support_agent', 'Support Agent', '["users:read","companies:read","licenses:read","support:read","support:write"]', false),
    ('account_manager', 'Account Manager', '["users:read","companies:read","licenses:read","payments:read","analytics:read"]', false);

-- 2. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    duration_days INTEGER NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    gst_percent NUMERIC(5,2) DEFAULT 18,
    features JSONB DEFAULT '[]',
    is_trial BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO subscription_plans (name, slug, duration_days, price, gst_percent, features, is_trial, sort_order) VALUES
    ('7-Day Trial', 'trial', 7, 0, 0, '["sync","reports","basic_features"]', true, 0),
    ('Monthly', 'monthly', 30, 299, 18, '["sync","reports","export","priority_support"]', false, 1),
    ('Quarterly', 'quarterly', 90, 799, 18, '["sync","reports","export","priority_support","analytics"]', false, 2),
    ('Half Yearly', 'half_yearly', 180, 1499, 18, '["sync","reports","export","priority_support","analytics","advanced_reports"]', false, 3),
    ('Yearly', 'yearly', 365, 2999, 18, '["sync","reports","export","priority_support","analytics","advanced_reports","api_access"]', false, 4),
    ('Lifetime', 'lifetime', 36500, 9999, 18, '["sync","reports","export","priority_support","analytics","advanced_reports","api_access","lifetime_updates"]', false, 5);

-- 3. USER LICENSES
CREATE TABLE IF NOT EXISTS user_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    license_key TEXT NOT NULL UNIQUE,
    plan_id UUID REFERENCES subscription_plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','blocked','suspended')),
    activation_date TIMESTAMPTZ DEFAULT now(),
    expiry_date TIMESTAMPTZ NOT NULL,
    activated_from_ip TEXT,
    device_fingerprint TEXT,
    tally_serial TEXT,
    company_gst TEXT,
    company_pan TEXT,
    auto_renew BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_user ON user_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON user_licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON user_licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON user_licenses(expiry_date);

-- 4. TRIAL HISTORY (Tamper-proof)
CREATE TABLE IF NOT EXISTS trial_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    mobile TEXT,
    device_id TEXT,
    device_fingerprint TEXT,
    tally_serial TEXT,
    company_gst TEXT,
    company_pan TEXT,
    company_name TEXT,
    ip_address TEXT,
    trial_start TIMESTAMPTZ NOT NULL,
    trial_end TIMESTAMPTZ NOT NULL,
    trial_used BOOLEAN DEFAULT true,
    license_id UUID REFERENCES user_licenses(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_email ON trial_history(email);
CREATE INDEX IF NOT EXISTS idx_trial_mobile ON trial_history(mobile);
CREATE INDEX IF NOT EXISTS idx_trial_device ON trial_history(device_id);
CREATE INDEX IF NOT EXISTS idx_trial_serial ON trial_history(tally_serial);
CREATE INDEX IF NOT EXISTS idx_trial_gst ON trial_history(company_gst);

-- 5. COUPONS
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('flat','percentage')),
    discount_value NUMERIC(10,2) NOT NULL,
    max_discount NUMERIC(10,2),
    min_order NUMERIC(10,2) DEFAULT 0,
    applicable_plans UUID[] DEFAULT '{}',
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    per_user_limit INTEGER DEFAULT 1,
    expiry_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- 6. COUPON USAGE
CREATE TABLE IF NOT EXISTS coupon_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    order_amount NUMERIC(10,2),
    discount_amount NUMERIC(10,2),
    license_id UUID REFERENCES user_licenses(id),
    used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon ON coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user ON coupon_usage(user_id);

-- 7. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    license_id UUID REFERENCES user_licenses(id),
    plan_id UUID REFERENCES subscription_plans(id),
    coupon_id UUID REFERENCES coupons(id),
    amount NUMERIC(10,2) NOT NULL,
    gst_amount NUMERIC(10,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT,
    payment_gateway TEXT,
    gateway_transaction_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
    invoice_number TEXT,
    invoice_url TEXT,
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(created_at);

-- 8. RENEWAL REMINDERS
CREATE TABLE IF NOT EXISTS renewal_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    license_id UUID NOT NULL REFERENCES user_licenses(id),
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('whatsapp','email','push','sms')),
    days_before INTEGER NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_license ON renewal_reminders(license_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON renewal_reminders(status);

-- 9. ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    actor_email TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    entity_name TEXT,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_logs(created_at);

-- 10. SALES LEADS / CRM
CREATE TABLE IF NOT EXISTS sales_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    mobile TEXT,
    company_name TEXT,
    tally_serial TEXT,
    source TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'prospect' CHECK (status IN ('prospect','interested','demo_given','converted','renewed','lost')),
    assigned_to UUID REFERENCES auth.users(id),
    plan_id UUID REFERENCES subscription_plans(id),
    notes TEXT,
    next_followup TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON sales_leads(assigned_to);

-- 11. LEAD FOLLOWUPS
CREATE TABLE IF NOT EXISTS lead_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    note TEXT NOT NULL,
    followup_type TEXT DEFAULT 'note' CHECK (followup_type IN ('note','call','email','whatsapp','meeting','demo')),
    next_followup TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. IN-APP ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info','warning','update','maintenance')),
    target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all','trial','active','expired','admin')),
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMPTZ DEFAULT now(),
    end_date TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. FEATURE FLAGS
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    target_plans TEXT[] DEFAULT '{}',
    target_users UUID[] DEFAULT '{}',
    rollout_percent INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. BULK OPERATIONS
CREATE TABLE IF NOT EXISTS bulk_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    result JSONB DEFAULT '{}',
    initiated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 15. LICENSE TRANSFER REQUESTS
CREATE TABLE IF NOT EXISTS license_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES user_licenses(id),
    from_user_id UUID NOT NULL REFERENCES auth.users(id),
    to_user_id UUID REFERENCES auth.users(id),
    to_email TEXT,
    to_tally_serial TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_transfers ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "super_admin_all" ON user_roles FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON subscription_plans FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON user_licenses FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON trial_history FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON coupons FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON coupon_usage FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON payments FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON activity_logs FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON sales_leads FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON lead_followups FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON announcements FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON feature_flags FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON bulk_operations FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON license_transfers FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));
CREATE POLICY "super_admin_all" ON renewal_reminders FOR ALL USING (auth.uid() IN (SELECT user_id FROM user_licenses WHERE status='active' AND license_key LIKE 'TOM-SUPER%'));

-- Users: read own data
CREATE POLICY "user_read_own_license" ON user_licenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_read_own_payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_read_own_trials" ON trial_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_read_plans" ON subscription_plans FOR SELECT USING (true);
CREATE POLICY "user_read_active_coupons" ON coupons FOR SELECT USING (is_active = true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Generate unique license key
CREATE OR REPLACE FUNCTION generate_license_key(plan_slug TEXT)
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    prefix := 'TOM-' || EXTRACT(YEAR FROM now())::TEXT || '-';

    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        IF i = 4 THEN result := result || '-'; END IF;
    END LOOP;

    RETURN prefix || result;
END;
$$ LANGUAGE plpgsql;

-- Check if trial already used (tamper-proof)
CREATE OR REPLACE FUNCTION check_trial_eligibility(
    p_email TEXT DEFAULT NULL,
    p_mobile TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL,
    p_tally_serial TEXT DEFAULT NULL,
    p_company_gst TEXT DEFAULT NULL
)
RETURNS TABLE(eligible BOOLEAN, reason TEXT, existing_trial_end TIMESTAMPTZ) AS $$
DECLARE
    existing RECORD;
BEGIN
    -- Check by Tally Serial (primary lock)
    IF p_tally_serial IS NOT NULL THEN
        SELECT * INTO existing FROM trial_history
        WHERE tally_serial = p_tally_serial AND trial_used = true
        ORDER BY created_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT false, 'Trial already used for Tally Serial: ' || p_tally_serial, existing.trial_end;
            RETURN;
        END IF;
    END IF;

    -- Check by Company GST
    IF p_company_gst IS NOT NULL THEN
        SELECT * INTO existing FROM trial_history
        WHERE company_gst = p_company_gst AND trial_used = true
        ORDER BY created_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT false, 'Trial already used for GST: ' || p_company_gst, existing.trial_end;
            RETURN;
        END IF;
    END IF;

    -- Check by Email
    IF p_email IS NOT NULL THEN
        SELECT * INTO existing FROM trial_history
        WHERE lower(email) = lower(p_email) AND trial_used = true
        ORDER BY created_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT false, 'Trial already used for email: ' || p_email, existing.trial_end;
            RETURN;
        END IF;
    END IF;

    -- Check by Device ID
    IF p_device_id IS NOT NULL THEN
        SELECT * INTO existing FROM trial_history
        WHERE device_id = p_device_id AND trial_used = true
        ORDER BY created_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT false, 'Trial already used on this device', existing.trial_end;
            RETURN;
        END IF;
    END IF;

    -- Check by Mobile
    IF p_mobile IS NOT NULL THEN
        SELECT * INTO existing FROM trial_history
        WHERE mobile = p_mobile AND trial_used = true
        ORDER BY created_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT false, 'Trial already used for mobile: ' || p_mobile, existing.trial_end;
            RETURN;
        END IF;
    END IF;

    -- All clear
    RETURN QUERY SELECT true, 'Eligible for trial'::TEXT, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql;

-- Validate license on login
CREATE OR REPLACE FUNCTION validate_user_license(p_user_id UUID)
RETURNS TABLE(valid BOOLEAN, status TEXT, plan_name TEXT, expiry_date TIMESTAMPTZ, days_left INTEGER) AS $$
DECLARE
    lic RECORD;
    plan RECORD;
BEGIN
    SELECT * INTO lic FROM user_licenses
    WHERE user_id = p_user_id AND status IN ('active','suspended')
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'no_license'::TEXT, 'None'::TEXT, NULL::TIMESTAMPTZ, 0;
        RETURN;
    END IF;

    -- Check expiry
    IF lic.expiry_date < now() THEN
        UPDATE user_licenses SET status = 'expired' WHERE id = lic.id;
        RETURN QUERY SELECT false, 'expired'::TEXT, 'Expired'::TEXT, lic.expiry_date, 0;
        RETURN;
    END IF;

    -- Check suspended
    IF lic.status = 'suspended' THEN
        RETURN QUERY SELECT false, 'suspended'::TEXT, 'Suspended'::TEXT, lic.expiry_date, 0;
        RETURN;
    END IF;

    -- Get plan name
    SELECT name INTO plan FROM subscription_plans WHERE id = lic.plan_id;

    RETURN QUERY SELECT
        true,
        lic.status,
        COALESCE(plan.name, 'Unknown'),
        lic.expiry_date,
        EXTRACT(DAY FROM lic.expiry_date - now())::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Generate coupon code
CREATE OR REPLACE FUNCTION generate_coupon_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..10 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS for Admin Dashboard
-- ============================================================

CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM auth.users) AS total_users,
    (SELECT COUNT(DISTINCT user_id) FROM user_licenses WHERE status = 'active' AND expiry_date > now()) AS active_users,
    (SELECT COUNT(DISTINCT user_id) FROM user_licenses WHERE status = 'expired' OR expiry_date <= now()) AS expired_users,
    (SELECT COUNT(*) FROM trial_history WHERE trial_used = true) AS trial_users,
    (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status = 'paid') AS total_revenue,
    (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status = 'paid' AND created_at >= date_trunc('month', now())) AS mrr,
    (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status = 'paid' AND created_at >= date_trunc('year', now())) AS arr;

CREATE OR REPLACE VIEW admin_recent_payments AS
SELECT
    p.*,
    u.email AS user_email,
    sp.name AS plan_name
FROM payments p
LEFT JOIN auth.users u ON p.user_id = u.id
LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
ORDER BY p.created_at DESC
LIMIT 100;

CREATE OR REPLACE VIEW admin_expiring_licenses AS
SELECT
    ul.*,
    u.email AS user_email,
    sp.name AS plan_name,
    EXTRACT(DAY FROM ul.expiry_date - now())::INTEGER AS days_left
FROM user_licenses ul
LEFT JOIN auth.users u ON ul.user_id = u.id
LEFT JOIN subscription_plans sp ON ul.plan_id = sp.id
WHERE ul.status = 'active' AND ul.expiry_date > now() AND ul.expiry_date <= now() + INTERVAL '30 days'
ORDER BY ul.expiry_date ASC;
