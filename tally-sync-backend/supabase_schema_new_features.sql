-- Features Schema Update (Recurring, Portal, Reports)

-- 1. Recurring Invoices Table
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    party_name TEXT NOT NULL,
    party_id UUID REFERENCES public.ledgers(id),
    amount DECIMAL(15, 2) NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    start_date DATE NOT NULL,
    next_invoice_date DATE NOT NULL,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    items JSONB DEFAULT '[]'::jsonb,
    total_generated INTEGER DEFAULT 0,
    last_generated DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for recurring_invoices
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read/write for authenticated users based on company_id" ON public.recurring_invoices
    USING (auth.uid() IN (SELECT user_id FROM public.companies WHERE id = company_id))
    WITH CHECK (auth.uid() IN (SELECT user_id FROM public.companies WHERE id = company_id));


-- 2. Report Templates Table
CREATE TABLE IF NOT EXISTS public.report_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    config JSONB NOT NULL, -- Stores table, fields, filters, sort, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for report_templates
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users based on company_id" ON public.report_templates
    USING (auth.uid() IN (SELECT user_id FROM public.companies WHERE id = company_id))
    WITH CHECK (auth.uid() IN (SELECT user_id FROM public.companies WHERE id = company_id));


-- 3. Payment Links Table (for tracking generated Razorpay links)
CREATE TABLE IF NOT EXISTS public.payment_links (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    party_name TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    razorpay_link_id TEXT,
    short_url TEXT,
    status TEXT DEFAULT 'created', -- created, paid, expired
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for payment_links
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users based on company_id" ON public.payment_links
    USING (auth.uid() IN (SELECT user_id FROM public.companies WHERE id = company_id));


-- 4. Enable public read access for specific portal queries (Optional/Advanced)
-- For the customer portal to work without login, we rely on the BACKEND to fetch data using the SERVICE ROLE KEY.
-- The frontend (public portal) does NOT connect to Supabase directly for Ledgers/Vouchers. 
-- It calls our nodejs backend `/api/v1/portal/*` endpoints which use the service role key.
-- So NO public RLS policies are needed for the portal to work securely.

-- Instructions:
-- Run this SQL in your Supabase SQL Editor to enable the new features.
