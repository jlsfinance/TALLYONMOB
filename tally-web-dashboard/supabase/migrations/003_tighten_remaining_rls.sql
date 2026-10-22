-- Migration: 003_tighten_remaining_rls_policies
-- Remove permissive policies and add scoped access for 22 remaining tables.
-- Admin: auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com'
-- Company membership: EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND company_id = t.company_id)

-- ============================================================
-- 1. USER DATA TABLES (user_id scoped)
-- ============================================================

-- user_profiles: users see/update own profile; admin sees all
DROP POLICY IF EXISTS user_profiles_all_auth ON public.user_profiles;
-- "Users can view own profile" and "Users can update own profile" already exist and are correct

-- user_roles: admin only (role definitions are global config)
DROP POLICY IF EXISTS ur_auth_all ON public.user_roles;
-- admin_all_user_roles already exists and is correct

-- payments: user sees own; admin sees all
DROP POLICY IF EXISTS auth_all ON public.payments;
DROP POLICY IF EXISTS auth_all_payments ON public.payments;
DROP POLICY IF EXISTS pay_auth_all ON public.payments;
-- user_read_own_payments already exists (SELECT, auth.uid() = user_id)
-- admin_all_payments already exists (admin ALL)

-- payslips: company-scoped
DROP POLICY IF EXISTS auth_all ON public.payslips;
DROP POLICY IF EXISTS payslips_all ON public.payslips;
CREATE POLICY payslips_company_select ON public.payslips
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
CREATE POLICY payslips_company_modify ON public.payslips
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- trial_history: user sees own; admin sees all
DROP POLICY IF EXISTS auth_all_trial_history ON public.trial_history;
DROP POLICY IF EXISTS th_auth_all ON public.trial_history;
-- user_read_own_trials already exists (SELECT, auth.uid() = user_id)
-- admin_all_trial_history already exists (admin ALL)

-- renewal_reminders: user sees own (via license); admin sees all
DROP POLICY IF EXISTS rr_auth_all ON public.renewal_reminders;
CREATE POLICY renewal_reminders_user_select ON public.renewal_reminders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');
CREATE POLICY renewal_reminders_user_modify ON public.renewal_reminders
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (user_id = auth.uid() OR auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- license_transfers: involved users + admin
DROP POLICY IF EXISTS lt_auth_all ON public.license_transfers;
CREATE POLICY license_transfers_involved_select ON public.license_transfers
  FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');
CREATE POLICY license_transfers_admin_modify ON public.license_transfers
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- ============================================================
-- 2. COMPANY DATA TABLES
-- ============================================================

-- employees: company-scoped
DROP POLICY IF EXISTS auth_all ON public.employees;
DROP POLICY IF EXISTS employees_all ON public.employees;
CREATE POLICY employees_company_select ON public.employees
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
CREATE POLICY employees_company_modify ON public.employees
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- notifications: company-scoped + own
DROP POLICY IF EXISTS anon_insert ON public.notifications;
DROP POLICY IF EXISTS auth_all ON public.notifications;
DROP POLICY IF EXISTS notifications_all_auth ON public.notifications;
CREATE POLICY notifications_company_select ON public.notifications
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
CREATE POLICY notifications_company_modify ON public.notifications
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- device_tokens: user-scoped (own tokens)
DROP POLICY IF EXISTS anon_insert ON public.device_tokens;
DROP POLICY IF EXISTS auth_all ON public.device_tokens;
DROP POLICY IF EXISTS device_tokens_all_auth ON public.device_tokens;
CREATE POLICY device_tokens_own_select ON public.device_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY device_tokens_own_modify ON public.device_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- activity_logs: admin + own
DROP POLICY IF EXISTS al_auth_all ON public.activity_logs;
DROP POLICY IF EXISTS auth_all ON public.activity_logs;
-- admin_all_activity_logs already exists (admin ALL)

-- bulk_operations: admin only (background ops)
DROP POLICY IF EXISTS bo_auth_all ON public.bulk_operations;
CREATE POLICY bulk_operations_admin ON public.bulk_operations
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- lead_followups: company-scoped via lead
DROP POLICY IF EXISTS lf_auth_all ON public.lead_followups;
CREATE POLICY lead_followups_auth ON public.lead_followups
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
-- NOTE: lead_followups has no company_id column; linked via lead_id -> sales_leads
-- Keeping permissive for now; refine when company linkage is verified

-- data_chunks: company-scoped
DROP POLICY IF EXISTS "Users can read own company chunks" ON public.data_chunks;
DROP POLICY IF EXISTS "Users can insert own company chunks" ON public.data_chunks;
DROP POLICY IF EXISTS "Users can update own company chunks" ON public.data_chunks;
DROP POLICY IF EXISTS "Users can delete own company chunks" ON public.data_chunks;
CREATE POLICY data_chunks_company_select ON public.data_chunks
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
CREATE POLICY data_chunks_company_modify ON public.data_chunks
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- embedding_jobs: company-scoped
DROP POLICY IF EXISTS "Users can read own embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can insert embedding jobs" ON public.embedding_jobs;
DROP POLICY IF EXISTS "Users can update embedding jobs" ON public.embedding_jobs;
CREATE POLICY embedding_jobs_company ON public.embedding_jobs
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- ============================================================
-- 3. SHARED / CONFIG TABLES
-- ============================================================

-- announcements: SELECT for all auth, write for admin
DROP POLICY IF EXISTS ann_auth_all ON public.announcements;
CREATE POLICY announcements_select ON public.announcements
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY announcements_admin_write ON public.announcements
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- coupons: keep anon select + admin; drop permissive auth_all
DROP POLICY IF EXISTS auth_all ON public.coupons;
DROP POLICY IF EXISTS c_auth_all ON public.coupons;
-- c_anon_select already exists (SELECT, anon, true)
-- admin_all_coupons already exists (admin ALL)
-- user_read_active_coupons already exists

-- subscription_plans: keep anon select + admin; drop permissive
DROP POLICY IF EXISTS auth_all ON public.subscription_plans;
DROP POLICY IF EXISTS auth_all_subscription_plans ON public.subscription_plans;
DROP POLICY IF EXISTS sp_auth_all ON public.subscription_plans;
-- sp_anon_select already exists (SELECT, anon, true)
-- admin_all_subscription_plans already exists (admin ALL)
-- user_read_plans already exists

-- feature_flags: SELECT for all auth, write for admin
DROP POLICY IF EXISTS ff_auth_all ON public.feature_flags;
CREATE POLICY feature_flags_select ON public.feature_flags
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY feature_flags_admin_write ON public.feature_flags
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- sales_leads: admin only (leads are sales pipeline)
DROP POLICY IF EXISTS auth_all ON public.sales_leads;
DROP POLICY IF EXISTS sl_auth_all ON public.sales_leads;
-- admin_all_sales_leads already exists (admin ALL)

-- coupon_usage: user sees own; admin sees all
DROP POLICY IF EXISTS cu_auth_all ON public.coupon_usage;
CREATE POLICY coupon_usage_user_select ON public.coupon_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');
CREATE POLICY coupon_usage_admin_modify ON public.coupon_usage
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lovneetrathi@gmail.com');

-- telemetry_events: keep anon insert (desktop app); admin read
-- anon_insert already exists (INSERT, anon, true) - needed for desktop app telemetry
-- No change needed (already appropriately scoped)

-- trial_history: already handled above (user_read_own_trials + admin_all_trial_history)
-- th_auth_all and auth_all_trial_history dropped above
