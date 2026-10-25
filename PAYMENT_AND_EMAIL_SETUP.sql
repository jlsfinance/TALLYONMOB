-- ==============================================================================
-- SUPABASE TABLES SETUP FOR PAYMENTS, EMAIL INVOICES & REMINDERS
-- Run this in Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Payment Links (UPI & Online Payment Links)
CREATE TABLE IF NOT EXISTS public.payment_links (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL,
    party_name TEXT NOT NULL,
    party_ledger_id UUID,
    voucher_id UUID,
    invoice_number TEXT,
    amount NUMERIC NOT NULL,
    upi_id TEXT,
    description TEXT,
    link_url TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'paid', 'expired'
    payment_mode TEXT DEFAULT 'UPI',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_company ON public.payment_links(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links(status);

-- 2. Email Queue (Email Invoices & Statements)
CREATE TABLE IF NOT EXISTS public.email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    to_email TEXT NOT NULL,
    cc TEXT,
    bcc TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    voucher_id UUID,
    invoice_number TEXT,
    party_name TEXT,
    amount NUMERIC,
    due_date TEXT,
    status TEXT DEFAULT 'sent', -- 'queued', 'sent', 'delivered', 'failed'
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_company ON public.email_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue(status);

-- 3. Reminder Logs (Payment Reminders History)
CREATE TABLE IF NOT EXISTS public.reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    party_name TEXT NOT NULL,
    party_ledger_id UUID,
    amount NUMERIC NOT NULL,
    channel TEXT NOT NULL, -- 'whatsapp', 'email', 'sms'
    message TEXT,
    status TEXT DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_company ON public.reminder_logs(company_id);

-- 4. Company Payment Settings (UPI Merchant Details)
CREATE TABLE IF NOT EXISTS public.company_payment_settings (
    company_id UUID PRIMARY KEY,
    upi_id TEXT,
    business_name TEXT,
    auto_reconcile BOOLEAN DEFAULT true,
    reminder_schedule TEXT DEFAULT '24hours',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and permissive policy
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for payment_links" ON public.payment_links FOR ALL USING (true);
CREATE POLICY "Allow all for email_queue" ON public.email_queue FOR ALL USING (true);
CREATE POLICY "Allow all for reminder_logs" ON public.reminder_logs FOR ALL USING (true);
CREATE POLICY "Allow all for company_payment_settings" ON public.company_payment_settings FOR ALL USING (true);
