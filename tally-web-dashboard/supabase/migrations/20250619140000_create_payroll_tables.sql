CREATE TABLE IF NOT EXISTS employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  employee_id TEXT,
  designation TEXT,
  department TEXT,
  basic_salary NUMERIC DEFAULT 0,
  hra NUMERIC DEFAULT 0,
  allowances NUMERIC DEFAULT 0,
  pf_deduction NUMERIC DEFAULT 0,
  esi_deduction NUMERIC DEFAULT 0,
  tds_deduction NUMERIC DEFAULT 0,
  other_deductions NUMERIC DEFAULT 0,
  bank_account TEXT,
  ifsc_code TEXT,
  pan_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "employees_all" ON employees FOR ALL USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payslips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  employee_name TEXT NOT NULL,
  month TEXT NOT NULL,
  basic NUMERIC DEFAULT 0,
  hra NUMERIC DEFAULT 0,
  allowances NUMERIC DEFAULT 0,
  gross NUMERIC DEFAULT 0,
  pf NUMERIC DEFAULT 0,
  esi NUMERIC DEFAULT 0,
  tds NUMERIC DEFAULT 0,
  other_deductions NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_pay NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "payslips_all" ON payslips FOR ALL USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS payslips_company_employee_month ON payslips(company_id, employee_id, month);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
