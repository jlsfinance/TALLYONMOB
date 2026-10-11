const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Phase 9 staging security hardening migration', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    'migrations',
    '20261011_security_hardening_staging.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('is explicitly marked staging-only and does not execute production mutations in code', () => {
    assert.match(sql, /STAGING ONLY/);
    assert.match(sql, /Do not apply to production/);
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
  });

  it('revokes anonymous access from sensitive tables and admin views', () => {
    for (const table of [
      'companies',
      'user_licenses',
      'trial_history',
      'payments',
      'license_transfers',
      'sync_devices',
      'sync_runs',
      'sync_conflicts',
      'sync_idempotency',
      'sync_logs',
      'outstanding',
      'voucher_entries',
    ]) {
      assert.match(sql, new RegExp(`public\\.${table}`));
    }
    assert.match(sql, /FROM anon;/);
    assert.match(sql, /admin_dashboard_stats/);
    assert.match(sql, /admin_recent_payments/);
    assert.match(sql, /admin_expiring_licenses/);
  });

  it('removes the known permissive policy names before scoped policies', () => {
    for (const policy of [
      'companies_all_auth',
      'companies_select_anon',
      'companies_update_anon',
      'companies_insert_anon',
      'auth_all_payments',
      'pay_auth_all',
      'auth_all_trial_history',
      'th_auth_all',
      'lt_auth_all',
      'sp_auth_all',
    ]) {
      assert.match(sql, new RegExp(`DROP POLICY IF EXISTS ${policy}`));
    }
    assert.match(sql, /sync_user_can_access_company/);
    assert.match(sql, /sync_user_can_write_company/);
  });

  it('adds missing-policy coverage for data tables flagged by Supabase advisors', () => {
    for (const table of ['sync_logs', 'outstanding', 'voucher_entries', 'sync_idempotency']) {
      assert.match(sql, new RegExp(`security_staging_${table}_select`));
      assert.match(sql, new RegExp(`security_staging_${table}_insert`));
      assert.match(sql, new RegExp(`security_staging_${table}_update`));
      assert.match(sql, new RegExp(`security_staging_${table}_delete`));
    }
  });

  it('removes unsafe RPC execution while preserving authenticated trial activation', () => {
    assert.match(sql, /activate_trial\(text,text,integer|activate_trial\(text,text,text,text,text,text,text,text\).*FROM anon/s);
    for (const fn of [
      'assign_license',
      'bind_tally_serial',
      'extend_license',
      'get_admin_stats',
      'get_admin_users',
      'get_user_by_email',
      'transfer_tally_serial',
      'update_license_status',
      'validate_user_license',
    ]) {
      assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}`));
    }
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.sync_user_can_access_company\(text\) FROM anon/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.sync_user_can_write_company\(text\) FROM anon/);
  });

  it('pins search_path for every security-sensitive RPC', () => {
    for (const fn of [
      'activate_trial',
      'assign_license',
      'bind_tally_serial',
      'extend_license',
      'get_admin_stats',
      'get_admin_users',
      'get_user_by_email',
      'transfer_tally_serial',
      'update_license_status',
      'validate_user_license',
    ]) {
      assert.match(sql, new RegExp(`ALTER FUNCTION public\\.${fn}`));
    }
    assert.equal((sql.match(/SET search_path = public, pg_temp;/g) || []).length, 10);
  });

  it('does not contain destructive table or row operations', () => {
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\./i);
  });
});
