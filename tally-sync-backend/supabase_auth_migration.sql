-- ============================================
-- LIVEKEEPING AUTH MIGRATION
-- Add owner_id to companies for user association
-- ============================================

-- Add owner_id to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_id);

-- Update RLS policy for companies - owners can manage
DROP POLICY IF EXISTS "Owners can manage their companies" ON companies;
CREATE POLICY "Owners can manage their companies" ON companies
    FOR ALL USING (owner_id = auth.uid());

-- Insert policy for company_users
DROP POLICY IF EXISTS "Users can insert company memberships" ON company_users;
CREATE POLICY "Owners can manage company users" ON company_users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM companies c 
            WHERE c.id = company_users.company_id AND c.owner_id = auth.uid()
        )
    );

-- Allow service role to bypass all RLS for sync operations
-- (Already works by default with service role key)

-- Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id, 
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- API Keys table for PC Sync authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,  -- SHA-256 hash of the API key
    key_prefix TEXT NOT NULL, -- First 8 chars for identification
    name TEXT DEFAULT 'Default Key',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, key_hash)
);

-- Enable RLS on api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policy for api_keys
CREATE POLICY "Users can manage their API keys" ON api_keys
    FOR ALL USING (user_id = auth.uid());

-- Index for fast API key lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- View for user's companies with stats
CREATE OR REPLACE VIEW v_user_companies AS
SELECT 
    c.id,
    c.name,
    c.formal_name,
    c.address,
    c.financial_year_start,
    c.financial_year_end,
    c.last_sync_at,
    c.owner_id,
    c.created_at,
    (SELECT COUNT(*) FROM ledgers WHERE company_id = c.id) as ledger_count,
    (SELECT COUNT(*) FROM vouchers WHERE company_id = c.id) as voucher_count,
    (SELECT COUNT(*) FROM stock WHERE company_id = c.id) as stock_count,
    (SELECT COALESCE(SUM(net_amount), 0) FROM sales WHERE company_id = c.id) as total_sales,
    (SELECT COALESCE(SUM(net_amount), 0) FROM purchases WHERE company_id = c.id) as total_purchases
FROM companies c;

-- ============================================
-- END OF AUTH MIGRATION
-- ============================================
