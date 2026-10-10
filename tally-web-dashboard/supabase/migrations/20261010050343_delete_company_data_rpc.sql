-- Company deletion used to issue many client-side DELETE requests. RLS policies on
-- business tables commonly allow SELECT/INSERT/UPDATE but intentionally deny DELETE,
-- so the operation failed partway through. Perform cleanup atomically with a tightly
-- scoped SECURITY DEFINER function that verifies ownership before touching any rows.
-- The live companies.id column is TEXT (confirmed against the connected project).

CREATE OR REPLACE FUNCTION public.delete_company_data(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_id text;
    v_table text;
    v_company_tables text[] := ARRAY[
        -- Rows referencing vouchers, sales, purchases, or ledgers must be removed first.
        'voucher_stock_entries', 'voucher_ledger_entries', 'voucher_entries',
        'payment_links', 'email_queue', 'approval_items', 'bank_allocations',
        'bill_allocations', 'tds_tcs_entries', 'sales_items', 'purchase_items',
        'outstanding',
        -- Sales and purchases also reference vouchers.
        'sales', 'purchases',
        -- Company-scoped activity, configuration, memberships, and sync state.
        'sync_history', 'sync_logs', 'sync_state', 'sync_queue', 'sync_checkpoint',
        'sync_devices', 'sync_runs', 'sync_idempotency', 'sync_conflicts', 'deleted_records',
        'approval_rules', 'reminder_logs', 'notifications', 'notification_logs',
        'notification_templates', 'notification_settings', 'recurring_invoices',
        'sales_visits', 'team_members', 'company_users', 'company_members',
        'company_settings', 'employees', 'payslips', 'petty_cash_entries',
        'bank_ledger_mappings', 'budgets', 'eway_bills', 'gst_automation_runs',
        'api_keys',
        -- Company master records are deleted after their dependent rows.
        'vouchers', 'ledgers', 'stock', 'stock_items', 'ledger_groups', 'stock_groups',
        'stock_categories', 'cost_centres', 'voucher_types'
    ];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to delete a company' USING ERRCODE = '42501';
    END IF;

    SELECT c.owner_id::text
      INTO v_owner_id
      FROM public.companies AS c
     WHERE c.id = p_company_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_owner_id IS NULL OR v_owner_id <> auth.uid()::text THEN
        RAISE EXCEPTION 'Only the company owner can delete this company' USING ERRCODE = '42501';
    END IF;

    -- Optional feature tables vary between installations. Only delete from known,
    -- public-schema tables that actually have a company_id column. The dynamic table
    -- identifier comes exclusively from the fixed allow-list above.
    FOREACH v_table IN ARRAY v_company_tables LOOP
        IF EXISTS (
            SELECT 1
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = v_table
               AND column_name = 'company_id'
        ) THEN
            EXECUTE format('DELETE FROM public.%I WHERE company_id::text = $1', v_table)
                USING p_company_id;
        END IF;
    END LOOP;

    DELETE FROM public.companies WHERE id = p_company_id;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_company_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_company_data(text) TO authenticated;
