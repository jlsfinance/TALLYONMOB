-- STAGING ONLY: security hardening rehearsal.
-- Do not apply to production until staging restore, negative tests, and app smoke tests pass.
-- This migration intentionally removes broad historical access without dropping data.

BEGIN;

-- 1. Remove anonymous access from sensitive data and admin views.
REVOKE ALL ON TABLE
  public.companies,
  public.user_licenses,
  public.trial_history,
  public.payments,
  public.license_transfers,
  public.sync_devices,
  public.sync_runs,
  public.sync_conflicts,
  public.sync_idempotency,
  public.sync_logs,
  public.outstanding,
  public.voucher_entries
FROM anon;

REVOKE ALL ON TABLE
  public.admin_dashboard_stats,
  public.admin_recent_payments,
  public.admin_expiring_licenses
FROM anon, authenticated;

-- Admin views are backend/service-role only until an authenticated admin route
-- has been verified against the dashboard contract.
GRANT SELECT ON TABLE
  public.admin_dashboard_stats,
  public.admin_recent_payments,
  public.admin_expiring_licenses
TO service_role;

-- 2. Remove permissive historical policies. Policies are OR-combined, so these
-- must be dropped before the scoped policies below can provide protection.
DROP POLICY IF EXISTS companies_all_auth ON public.companies;
DROP POLICY IF EXISTS companies_select_anon ON public.companies;
DROP POLICY IF EXISTS companies_update_anon ON public.companies;
DROP POLICY IF EXISTS companies_insert_anon ON public.companies;

DROP POLICY IF EXISTS auth_all ON public.companies;
DROP POLICY IF EXISTS auth_all_payments ON public.payments;
DROP POLICY IF EXISTS auth_all ON public.payments;
DROP POLICY IF EXISTS pay_auth_all ON public.payments;
DROP POLICY IF EXISTS auth_all_trial_history ON public.trial_history;
DROP POLICY IF EXISTS th_auth_all ON public.trial_history;
DROP POLICY IF EXISTS lt_auth_all ON public.license_transfers;
DROP POLICY IF EXISTS auth_all_subscription_plans ON public.subscription_plans;
DROP POLICY IF EXISTS sp_auth_all ON public.subscription_plans;

-- 3. Restore explicit owner/company policies for the tables covered here.
-- Existing owner policies are retained; these policies make the intended
-- company membership rule explicit for the sync tables with missing policies.
DROP POLICY IF EXISTS security_staging_sync_logs_select ON public.sync_logs;
DROP POLICY IF EXISTS security_staging_sync_logs_insert ON public.sync_logs;
DROP POLICY IF EXISTS security_staging_sync_logs_update ON public.sync_logs;
DROP POLICY IF EXISTS security_staging_sync_logs_delete ON public.sync_logs;
CREATE POLICY security_staging_sync_logs_select ON public.sync_logs
  FOR SELECT TO authenticated
  USING (public.sync_user_can_access_company(company_id));
CREATE POLICY security_staging_sync_logs_insert ON public.sync_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_sync_logs_update ON public.sync_logs
  FOR UPDATE TO authenticated
  USING (public.sync_user_can_write_company(company_id))
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_sync_logs_delete ON public.sync_logs
  FOR DELETE TO authenticated
  USING (public.sync_user_can_write_company(company_id));

DROP POLICY IF EXISTS security_staging_outstanding_select ON public.outstanding;
DROP POLICY IF EXISTS security_staging_outstanding_insert ON public.outstanding;
DROP POLICY IF EXISTS security_staging_outstanding_update ON public.outstanding;
DROP POLICY IF EXISTS security_staging_outstanding_delete ON public.outstanding;
CREATE POLICY security_staging_outstanding_select ON public.outstanding
  FOR SELECT TO authenticated
  USING (public.sync_user_can_access_company(company_id));
CREATE POLICY security_staging_outstanding_insert ON public.outstanding
  FOR INSERT TO authenticated
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_outstanding_update ON public.outstanding
  FOR UPDATE TO authenticated
  USING (public.sync_user_can_write_company(company_id))
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_outstanding_delete ON public.outstanding
  FOR DELETE TO authenticated
  USING (public.sync_user_can_write_company(company_id));

DROP POLICY IF EXISTS security_staging_voucher_entries_select ON public.voucher_entries;
DROP POLICY IF EXISTS security_staging_voucher_entries_insert ON public.voucher_entries;
DROP POLICY IF EXISTS security_staging_voucher_entries_update ON public.voucher_entries;
DROP POLICY IF EXISTS security_staging_voucher_entries_delete ON public.voucher_entries;
CREATE POLICY security_staging_voucher_entries_select ON public.voucher_entries
  FOR SELECT TO authenticated
  USING (public.sync_user_can_access_company(company_id));
CREATE POLICY security_staging_voucher_entries_insert ON public.voucher_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_voucher_entries_update ON public.voucher_entries
  FOR UPDATE TO authenticated
  USING (public.sync_user_can_write_company(company_id))
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_voucher_entries_delete ON public.voucher_entries
  FOR DELETE TO authenticated
  USING (public.sync_user_can_write_company(company_id));

DROP POLICY IF EXISTS security_staging_sync_idempotency_select ON public.sync_idempotency;
DROP POLICY IF EXISTS security_staging_sync_idempotency_insert ON public.sync_idempotency;
DROP POLICY IF EXISTS security_staging_sync_idempotency_update ON public.sync_idempotency;
DROP POLICY IF EXISTS security_staging_sync_idempotency_delete ON public.sync_idempotency;
CREATE POLICY security_staging_sync_idempotency_select ON public.sync_idempotency
  FOR SELECT TO authenticated
  USING (public.sync_user_can_access_company(company_id));
CREATE POLICY security_staging_sync_idempotency_insert ON public.sync_idempotency
  FOR INSERT TO authenticated
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_sync_idempotency_update ON public.sync_idempotency
  FOR UPDATE TO authenticated
  USING (public.sync_user_can_write_company(company_id))
  WITH CHECK (public.sync_user_can_write_company(company_id));
CREATE POLICY security_staging_sync_idempotency_delete ON public.sync_idempotency
  FOR DELETE TO authenticated
  USING (public.sync_user_can_write_company(company_id));

-- License data is private by default. Activation/billing writes remain in
-- trusted server code; users can only read their own license/trial/payment rows.
DROP POLICY IF EXISTS security_staging_user_licenses_select ON public.user_licenses;
CREATE POLICY security_staging_user_licenses_select ON public.user_licenses
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS security_staging_trial_history_select ON public.trial_history;
CREATE POLICY security_staging_trial_history_select ON public.trial_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS security_staging_payments_select ON public.payments;
CREATE POLICY security_staging_payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.user_licenses,
  public.trial_history,
  public.payments
FROM authenticated, anon;
GRANT SELECT ON TABLE
  public.user_licenses,
  public.trial_history,
  public.payments
TO authenticated;

-- 4. Privileged RPCs are server-only except the authenticated trial activation
-- contract. Sync authorization helpers remain executable by authenticated
-- users because RLS policies call them in the authenticated request context.
REVOKE EXECUTE ON FUNCTION public.activate_trial(text,text,text,text,text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_license(text,text,integer,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_tally_serial(uuid,text,boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.extend_license(uuid,integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_stats() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_users() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_by_email(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_tally_serial(uuid,text,uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_license_status(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_user_license(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_user_can_access_company(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_user_can_write_company(text) FROM anon;

-- 5. Pin search_path on security-sensitive functions to prevent search-path
-- hijacking. Fully qualified table names are retained in the functions.
ALTER FUNCTION public.activate_trial(text,text,text,text,text,text,text,text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.assign_license(text,text,integer,text,text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.bind_tally_serial(uuid,text,boolean)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.extend_license(uuid,integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_admin_stats()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_admin_users()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_by_email(text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.transfer_tally_serial(uuid,text,uuid,text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_license_status(uuid,text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_user_license(uuid,text)
  SET search_path = public, pg_temp;

COMMIT;
