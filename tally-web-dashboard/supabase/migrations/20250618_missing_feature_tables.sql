-- ============================================================
-- Missing Feature Tables — 17 tables referenced in code but not yet created
-- ============================================================

-- 1. EMPLOYEES (PayrollPage)
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    employee_id TEXT,
    designation TEXT,
    department TEXT,
    basic_salary NUMERIC(12,2) DEFAULT 0,
    hra NUMERIC(12,2) DEFAULT 0,
    allowances NUMERIC(12,2) DEFAULT 0,
    pf_deduction NUMERIC(12,2) DEFAULT 0,
    esi_deduction NUMERIC(12,2) DEFAULT 0,
    tds_deduction NUMERIC(12,2) DEFAULT 0,
    other_deductions NUMERIC(12,2) DEFAULT 0,
    bank_account TEXT,
    ifsc_code TEXT,
    pan_number TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);

-- 2. PAYSLIPS (PayrollPage)
CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT,
    month TEXT NOT NULL,
    basic NUMERIC(12,2) DEFAULT 0,
    hra NUMERIC(12,2) DEFAULT 0,
    allowances NUMERIC(12,2) DEFAULT 0,
    gross NUMERIC(12,2) DEFAULT 0,
    pf NUMERIC(12,2) DEFAULT 0,
    esi NUMERIC(12,2) DEFAULT 0,
    tds NUMERIC(12,2) DEFAULT 0,
    other_deductions NUMERIC(12,2) DEFAULT 0,
    total_deductions NUMERIC(12,2) DEFAULT 0,
    net_pay NUMERIC(12,2) DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','finalized','paid')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, employee_id, month)
);
CREATE INDEX IF NOT EXISTS idx_payslips_company ON payslips(company_id);

-- 3. PETTY_CASH_ENTRIES (PettyCashPage)
CREATE TABLE IF NOT EXISTS petty_cash_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(12,2) DEFAULT 0,
    category TEXT,
    paid_to TEXT,
    receipt_no TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_company ON petty_cash_entries(company_id);

-- 4. COMPANY_SETTINGS (CustomDashboardBuilderPage)
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, key)
);
CREATE INDEX IF NOT EXISTS idx_company_settings_company ON company_settings(company_id);

-- 5. APPROVAL_DELEGATIONS (ApprovalWorkflowPage)
CREATE TABLE IF NOT EXISTS approval_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    delegate_from TEXT NOT NULL,
    delegate_to TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    reason TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_company ON approval_delegations(company_id);

-- 6. BANK_LEDGER_MAPPINGS (BankAutomationPage)
CREATE TABLE IF NOT EXISTS bank_ledger_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    owner_id TEXT,
    created_by TEXT,
    normalized_keyword TEXT NOT NULL,
    ledger_name TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    confidence NUMERIC(3,2) DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_ledger_mappings_company ON bank_ledger_mappings(company_id);

-- 7. BUDGETS (BudgetVsActualPage)
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    category TEXT NOT NULL,
    budget_amount NUMERIC(12,2) DEFAULT 0,
    fiscal_year TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, category, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_budgets_company ON budgets(company_id);

-- 8. EWAY_BILLS (EWayBillPage)
CREATE TABLE IF NOT EXISTS eway_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    voucher_id TEXT,
    ewb_number TEXT,
    party_name TEXT,
    amount NUMERIC(12,2) DEFAULT 0,
    transport_mode TEXT,
    vehicle_number TEXT,
    distance_km INTEGER,
    status TEXT DEFAULT 'draft',
    form_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eway_bills_company ON eway_bills(company_id);

-- 9. GST_AUTOMATION_RUNS (GstAutomationPage)
CREATE TABLE IF NOT EXISTS gst_automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    owner_id TEXT,
    created_by TEXT,
    source_mode TEXT,
    invoice_count INTEGER DEFAULT 0,
    result_json JSONB DEFAULT '{}',
    validation_errors JSONB DEFAULT '[]',
    validation_warnings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gst_automation_runs_company ON gst_automation_runs(company_id);

-- 10. IMPORTED_INVOICES (GstAutomationPage + InvoiceImportPage)
CREATE TABLE IF NOT EXISTS imported_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    owner_id TEXT,
    created_by TEXT,
    source TEXT DEFAULT 'manual',
    gstin TEXT,
    invoice_number TEXT,
    invoice_date TEXT,
    hsn_code TEXT,
    taxable_value NUMERIC(12,2) DEFAULT 0,
    cgst NUMERIC(12,2) DEFAULT 0,
    sgst NUMERIC(12,2) DEFAULT 0,
    igst NUMERIC(12,2) DEFAULT 0,
    total_tax NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) DEFAULT 0,
    invoice_type TEXT DEFAULT 'outward',
    status TEXT DEFAULT 'pending',
    raw_payload JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imported_invoices_company ON imported_invoices(company_id);

-- 11. NOTIFICATION_LOGS (PushNotificationsPage)
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    title TEXT,
    body TEXT,
    target_audience TEXT DEFAULT 'all',
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'draft',
    image_url TEXT,
    action_url TEXT,
    sent_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_logs_company ON notification_logs(company_id);

-- 12. NOTIFICATION_TEMPLATES (PushNotificationsPage)
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    body TEXT,
    category TEXT DEFAULT 'general',
    variables JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_templates_company ON notification_templates(company_id);

-- 13. NOTIFICATION_SETTINGS (PushNotificationsPage)
CREATE TABLE IF NOT EXISTS notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT true,
    categories JSONB DEFAULT '{}',
    quiet_hours_enabled BOOLEAN DEFAULT false,
    quiet_hours_start TEXT DEFAULT '22:00',
    quiet_hours_end TEXT DEFAULT '07:00',
    sound_enabled BOOLEAN DEFAULT true,
    vibration_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_settings_company ON notification_settings(company_id);

-- 14. USER_DEVICES (PushNotificationsPage)
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    user_name TEXT,
    user_email TEXT,
    user_id TEXT,
    platform TEXT,
    token TEXT,
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_devices_company ON user_devices(company_id);

-- 15. RECURRING_INVOICES (RecurringInvoicesPage)
CREATE TABLE IF NOT EXISTS recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    party_name TEXT,
    party_id TEXT,
    amount NUMERIC(12,2) DEFAULT 0,
    frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly')),
    start_date TEXT,
    next_invoice_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','completed')),
    items JSONB DEFAULT '[]',
    total_generated INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_company ON recurring_invoices(company_id);

-- 16. SALES_VISITS (SalesTeamPage)
CREATE TABLE IF NOT EXISTS sales_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    party_name TEXT,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    notes TEXT,
    salesperson TEXT,
    status TEXT DEFAULT 'checked_in' CHECK (status IN ('checked_in','checked_out')),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_visits_company ON sales_visits(company_id);

-- 17. TEAM_MEMBERS (TeamManagementPage)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    invited_by TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','pending','disabled')),
    name TEXT,
    invited_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_members_company ON team_members(company_id);

-- ============================================================
-- RLS Policies (permissive for authenticated users)
-- ============================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_ledger_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE eway_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON employees FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON payslips FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON petty_cash_entries FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON company_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON approval_delegations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON bank_ledger_mappings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON budgets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON eway_bills FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON gst_automation_runs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON imported_invoices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON notification_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON notification_templates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON notification_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON user_devices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON recurring_invoices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON sales_visits FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON team_members FOR ALL USING (auth.role() = 'authenticated');

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
