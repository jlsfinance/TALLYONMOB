-- ============================================================
-- Real Data Tables: Approval, UPI, Email, Reminders
-- ============================================================

-- 1. APPROVAL RULES
CREATE TABLE IF NOT EXISTS approval_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    voucher_type TEXT NOT NULL DEFAULT 'all',
    min_amount NUMERIC(12,2) DEFAULT 0,
    max_amount NUMERIC(12,2),
    approver_email TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. APPROVAL ITEMS (pending approvals from vouchers)
CREATE TABLE IF NOT EXISTS approval_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
    voucher_type TEXT NOT NULL,
    voucher_number TEXT,
    party_name TEXT,
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_by TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_items_status ON approval_items(status);
CREATE INDEX IF NOT EXISTS idx_approval_items_company ON approval_items(company_id);

-- 3. PAYMENT LINKS (UPI)
CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
    party_name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    upi_id TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','expired','cancelled')),
    upi_ref TEXT,
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_company ON payment_links(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);

-- 4. EMAIL QUEUE (for invoice emails)
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_company ON email_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);

-- 5. REMINDER LOGS
CREATE TABLE IF NOT EXISTS reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    party_name TEXT NOT NULL,
    party_email TEXT,
    party_phone TEXT,
    amount NUMERIC(12,2),
    channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','sms')),
    message TEXT,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_company ON reminder_logs(company_id);

-- 6. TDS/TCS ENTRIES (calculated from vouchers)
CREATE TABLE IF NOT EXISTS tds_tcs_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('tds','tcs')),
    party_name TEXT NOT NULL,
    pan TEXT,
    section TEXT NOT NULL,
    base_amount NUMERIC(12,2) NOT NULL,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filed','overdue')),
    entry_date TEXT,
    certificate_generated BOOLEAN DEFAULT false,
    is_non_resident BOOLEAN DEFAULT false,
    nationality TEXT,
    tax_treaty_country TEXT,
    article_number TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tds_tcs_company ON tds_tcs_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_tds_tcs_type ON tds_tcs_entries(entry_type);

-- RLS
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_tcs_entries ENABLE ROW LEVEL SECURITY;

-- Policies (allow authenticated users to read/write)
CREATE POLICY "Allow all for authenticated" ON approval_rules FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON approval_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON payment_links FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON email_queue FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON reminder_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON tds_tcs_entries FOR ALL USING (auth.role() = 'authenticated');
