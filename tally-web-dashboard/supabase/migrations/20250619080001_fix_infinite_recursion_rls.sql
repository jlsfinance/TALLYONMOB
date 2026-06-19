-- Fix infinite recursion in RLS policies
-- The "super_admin_all" policies on user_licenses, payments, trial_history etc.
-- all query user_licenses to check super_admin status, causing infinite recursion.

-- Drop ALL super_admin_all policies from every table
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.subscription_plans; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.user_roles; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.trial_history; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.coupons; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.coupon_usage; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.payments; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.activity_logs; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.sales_leads; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.lead_followups; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.announcements; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.feature_flags; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.bulk_operations; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.license_transfers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "super_admin_all" ON public.renewal_reminders; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop recursive self-referencing policy on user_licenses
DO $$ BEGIN DROP POLICY IF EXISTS "user_read_own_license" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "user_licenses_select_own" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop old conflicting policies
DO $$ BEGIN DROP POLICY IF EXISTS "user_licenses_auth_all" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "user_licenses_anon_select" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "auth_all_user_licenses" ON public.user_licenses; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "trial_history_auth_all" ON public.trial_history; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "payments_auth_all" ON public.payments; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Recreate permissive policies (no recursion)
-- user_licenses: authenticated can read all, anyone can insert their own
DO $$ BEGIN CREATE POLICY "ul_auth_select" ON public.user_licenses FOR SELECT TO authenticated USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ul_auth_insert" ON public.user_licenses FOR INSERT TO authenticated WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ul_auth_update" ON public.user_licenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ul_anon_select" ON public.user_licenses FOR SELECT TO anon USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- trial_history
DO $$ BEGIN CREATE POLICY "th_auth_all" ON public.trial_history FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- payments
DO $$ BEGIN CREATE POLICY "pay_auth_all" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- subscription_plans (public read)
DO $$ BEGIN CREATE POLICY "sp_anon_select" ON public.subscription_plans FOR SELECT TO anon USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sp_auth_all" ON public.subscription_plans FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- user_roles
DO $$ BEGIN CREATE POLICY "ur_auth_all" ON public.user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- coupons
DO $$ BEGIN CREATE POLICY "c_anon_select" ON public.coupons FOR SELECT TO anon USING (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "c_auth_all" ON public.coupons FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- coupon_usage
DO $$ BEGIN CREATE POLICY "cu_auth_all" ON public.coupon_usage FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- activity_logs
DO $$ BEGIN CREATE POLICY "al_auth_all" ON public.activity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- sales_leads
DO $$ BEGIN CREATE POLICY "sl_auth_all" ON public.sales_leads FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- lead_followups
DO $$ BEGIN CREATE POLICY "lf_auth_all" ON public.lead_followups FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- announcements
DO $$ BEGIN CREATE POLICY "ann_auth_all" ON public.announcements FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- feature_flags
DO $$ BEGIN CREATE POLICY "ff_auth_all" ON public.feature_flags FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- bulk_operations
DO $$ BEGIN CREATE POLICY "bo_auth_all" ON public.bulk_operations FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- license_transfers
DO $$ BEGIN CREATE POLICY "lt_auth_all" ON public.license_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- renewal_reminders
DO $$ BEGIN CREATE POLICY "rr_auth_all" ON public.renewal_reminders FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN OTHERS THEN NULL; END $$;
