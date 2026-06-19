-- Fix RLS for desktop sync - Part 1: Drop old policies + enable RLS + create policies
-- All wrapped in exception handlers for idempotency

-- companies
DO $$ BEGIN DROP POLICY IF EXISTS "companies_select_auth" ON public.companies; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "companies_insert_auth" ON public.companies; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "companies_update_auth" ON public.companies; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "companies_all_auth" ON public.companies; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "companies_all_auth" ON public.companies FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- stock_items
DO $$ BEGIN DROP POLICY IF EXISTS "stock_items_select_auth" ON public.stock_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "stock_items_insert_auth" ON public.stock_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "stock_items_update_auth" ON public.stock_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "stock_items_all_auth" ON public.stock_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "stock_items_all_auth" ON public.stock_items FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ledgers
DO $$ BEGIN DROP POLICY IF EXISTS "ledgers_select_auth" ON public.ledgers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "ledgers_insert_auth" ON public.ledgers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "ledgers_update_auth" ON public.ledgers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "ledgers_all_auth" ON public.ledgers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ledgers_all_auth" ON public.ledgers FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- vouchers
DO $$ BEGIN DROP POLICY IF EXISTS "vouchers_select_auth" ON public.vouchers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "vouchers_insert_auth" ON public.vouchers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "vouchers_update_auth" ON public.vouchers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "vouchers_all_auth" ON public.vouchers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "vouchers_all_auth" ON public.vouchers FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- sales
DO $$ BEGIN DROP POLICY IF EXISTS "sales_select_auth" ON public.sales; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "sales_insert_auth" ON public.sales; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "sales_update_auth" ON public.sales; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "sales_all_auth" ON public.sales; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sales_all_auth" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- sync_history
DO $$ BEGIN DROP POLICY IF EXISTS "sync_history_all_auth" ON public.sync_history; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sync_history_all_auth" ON public.sync_history FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- sync_state
DO $$ BEGIN DROP POLICY IF EXISTS "sync_state_all_auth" ON public.sync_state; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sync_state_all_auth" ON public.sync_state FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- pending_transactions
DO $$ BEGIN DROP POLICY IF EXISTS "pending_transactions_all_auth" ON public.pending_transactions; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pending_transactions_all_auth" ON public.pending_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- voucher_ledger_entries
DO $$ BEGIN DROP POLICY IF EXISTS "voucher_ledger_entries_all_auth" ON public.voucher_ledger_entries; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.voucher_ledger_entries ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "voucher_ledger_entries_all_auth" ON public.voucher_ledger_entries FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- voucher_stock_entries
DO $$ BEGIN DROP POLICY IF EXISTS "voucher_stock_entries_all_auth" ON public.voucher_stock_entries; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.voucher_stock_entries ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "voucher_stock_entries_all_auth" ON public.voucher_stock_entries FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- bank_allocations
DO $$ BEGIN DROP POLICY IF EXISTS "bank_allocations_all_auth" ON public.bank_allocations; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bank_allocations ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bank_allocations_all_auth" ON public.bank_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- bill_allocations
DO $$ BEGIN DROP POLICY IF EXISTS "bill_allocations_all_auth" ON public.bill_allocations; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bill_allocations ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bill_allocations_all_auth" ON public.bill_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- sales_items
DO $$ BEGIN DROP POLICY IF EXISTS "sales_items_all_auth" ON public.sales_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales_items ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sales_items_all_auth" ON public.sales_items FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- user_profiles
DO $$ BEGIN DROP POLICY IF EXISTS "user_profiles_all_auth" ON public.user_profiles; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "user_profiles_all_auth" ON public.user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- app_settings
DO $$ BEGIN DROP POLICY IF EXISTS "app_settings_all_auth" ON public.app_settings; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "app_settings_all_auth" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- notifications
DO $$ BEGIN DROP POLICY IF EXISTS "notifications_all_auth" ON public.notifications; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "notifications_all_auth" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- device_tokens
DO $$ BEGIN DROP POLICY IF EXISTS "device_tokens_all_auth" ON public.device_tokens; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "device_tokens_all_auth" ON public.device_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- user_licenses
DO $$ BEGIN DROP POLICY IF EXISTS "user_licenses_select_own" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "user_licenses_auth_all" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "user_licenses_anon_select" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.user_licenses ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "user_licenses_auth_all" ON public.user_licenses FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "user_licenses_anon_select" ON public.user_licenses FOR SELECT TO anon USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- trial_history
DO $$ BEGIN DROP POLICY IF EXISTS "trial_history_auth_all" ON public.trial_history; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "trial_history_auth_all" ON public.trial_history FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- payments
DO $$ BEGIN DROP POLICY IF EXISTS "payments_auth_all" ON public.payments; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "payments_auth_all" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- plans
DO $$ BEGIN DROP POLICY IF EXISTS "plans_anon_select" ON public.plans; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "plans_auth_all" ON public.plans; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "plans_anon_select" ON public.plans FOR SELECT TO anon USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "plans_auth_all" ON public.plans FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- plan_features
DO $$ BEGIN DROP POLICY IF EXISTS "plan_features_anon_select" ON public.plan_features; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "plan_features_auth_all" ON public.plan_features; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "plan_features_anon_select" ON public.plan_features FOR SELECT TO anon USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "plan_features_auth_all" ON public.plan_features FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
