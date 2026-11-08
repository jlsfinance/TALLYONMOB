-- ============================================
-- LICENSE & SUBSCRIPTION TABLES
-- Enables PC Connector "Buy Licence" button to work
-- ============================================

-- 1. Subscription plans (catalog of available plans)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    price_inr INTEGER NOT NULL,                 -- price in rupees (e.g. 99)
    price_paise INTEGER NOT NULL,               -- price in paise for Razorpay (e.g. 9900)
    duration_days INTEGER NOT NULL,             -- validity in days
    company_limit INTEGER DEFAULT -1,           -- -1 = unlimited
    features TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: plans are readable by everyone
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are viewable by authenticated users" ON public.subscription_plans
    FOR SELECT TO authenticated USING (true);

-- 2. User licenses (one row per purchased/active license)
CREATE TABLE IF NOT EXISTS public.user_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans(id),
    plan_slug TEXT,
    license_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',     -- pending, active, expired, suspended
    activation_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    razorpay_payment_id TEXT,
    razorpay_order_id TEXT,
    razorpay_link_id TEXT,
    amount_paid INTEGER,                        -- amount paid in rupees
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own licenses" ON public.user_licenses
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage licenses" ON public.user_licenses
    FOR ALL TO service_role USING (true);

-- 3. Seed default plans
INSERT INTO public.subscription_plans (name, slug, price_inr, price_paise, duration_days, company_limit, features)
VALUES
    ('Trial', 'trial', 0, 0, 7, 1, ARRAY['dashboard','parties','daybook','limited_sync','basic_reports']),
    ('Monthly', 'monthly', 99, 9900, 30, -1, ARRAY['dashboard','parties','daybook','sync','reports','pdf_export','excel_export','whatsapp_share','advanced_reports','gst_reports']),
    ('Quarterly', 'quarterly', 249, 24900, 90, -1, ARRAY['dashboard','parties','daybook','sync','reports','pdf_export','excel_export','whatsapp_share','advanced_reports','gst_reports','e_way_bill','bank_reconciliation']),
    ('Half Yearly', 'half_yearly', 499, 49900, 180, -1, ARRAY['dashboard','parties','daybook','sync','reports','pdf_export','excel_export','whatsapp_share','advanced_reports','gst_reports','e_way_bill','bank_reconciliation','ai_entry']),
    ('Yearly', 'yearly', 999, 99900, 365, -1, ARRAY['dashboard','parties','daybook','sync','reports','pdf_export','excel_export','whatsapp_share','advanced_reports','gst_reports','e_way_bill','bank_reconciliation','ai_entry','sales_analytics','business_insights']),
    ('Lifetime', 'lifetime', 4999, 499900, 36500, -1, ARRAY['dashboard','parties','daybook','sync','reports','pdf_export','excel_export','whatsapp_share','advanced_reports','gst_reports','e_way_bill','bank_reconciliation','ai_entry','sales_analytics','business_insights','tds_tcs'])
ON CONFLICT (slug) DO NOTHING;

-- Index for license lookup by user
CREATE INDEX IF NOT EXISTS idx_user_licenses_user_id ON public.user_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_licenses_status ON public.user_licenses(status);
