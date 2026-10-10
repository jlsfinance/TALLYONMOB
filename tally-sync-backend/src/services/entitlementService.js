const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { SYNC_DATA_TYPES } = require('../config/constants');

const stableError = (code, retryable = false) => Object.assign(new Error(code), { code, retryable, correlationId: crypto.randomUUID() });
const asFeatures = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try { return asFeatures(JSON.parse(value)); } catch { return value.split(',').map((item) => item.trim()).filter(Boolean); }
  }
  return [];
};
const versionParts = (value) => String(value || '0').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
const isVersionAtLeast = (actual, minimum) => {
  const a = versionParts(actual); const b = versionParts(minimum);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0);
  }
  return true;
};

class EntitlementService {
  static async authorizeSyncWrite({ companyId, dataType, recordCount = 0, tallySerial, appVersion }) {
    if (!companyId) throw stableError('COMPANY_NOT_ALLOWED');
    if (dataType && !SYNC_DATA_TYPES.includes(dataType)) throw stableError('FEATURE_NOT_INCLUDED');
    const { data: company, error: companyError } = await supabase.from('companies')
      .select('id,owner_id,user_id,is_active').eq('id', companyId).maybeSingle();
    if (companyError) throw stableError('RETRYABLE_SERVER_ERROR', true);
    if (!company || company.is_active === false) throw stableError('COMPANY_NOT_ALLOWED');

    const { data: members, error: memberError } = await supabase.from('company_users')
      .select('user_id,role,can_sync').eq('company_id', companyId).limit(100);
    if (memberError) throw stableError('RETRYABLE_SERVER_ERROR', true);
    const eligibleMembers = (members || []).filter((member) => member.can_sync || ['owner', 'admin'].includes(member.role));
    const principalIds = [...new Set([company.owner_id, company.user_id, ...eligibleMembers.map((member) => member.user_id)].filter(Boolean))];
    if (!principalIds.length) throw stableError('COMPANY_NOT_ALLOWED');
    if ((members || []).length && !eligibleMembers.length && company.owner_id !== company.user_id) throw stableError('COMPANY_NOT_ALLOWED');

    const now = new Date();
    const { data: licenses, error: licenseError } = await supabase.from('user_licenses')
      .select('id,user_id,status,expiry_date,tally_serial,plan_id,plan_slug')
      .in('user_id', principalIds).order('expiry_date', { ascending: false }).limit(50);
    if (licenseError) throw stableError('RETRYABLE_SERVER_ERROR', true);
    const activeLicense = (licenses || []).find((license) => license.status === 'active' && license.expiry_date && new Date(license.expiry_date) > now);
    const suspendedLicense = (licenses || []).find((license) => license.status === 'suspended');
    let entitlement = activeLicense;
    let features = [];
    let expiryDate = null;
    let planSlug = 'trial';

    if (entitlement) {
      expiryDate = entitlement.expiry_date;
      planSlug = entitlement.plan_slug || 'unknown';
      if (entitlement.plan_id) {
        const { data: plan, error: planError } = await supabase.from('subscription_plans')
          .select('slug,features').eq('id', entitlement.plan_id).maybeSingle();
        if (planError) throw stableError('RETRYABLE_SERVER_ERROR', true);
        features = asFeatures(plan?.features);
        planSlug = plan?.slug || planSlug;
      }
    } else {
      const { data: trials, error: trialError } = await supabase.from('trial_history')
        .select('user_id,trial_end,trial_used,tally_serial').in('user_id', principalIds)
        .eq('trial_used', true).order('trial_end', { ascending: false }).limit(50);
      if (trialError) throw stableError('RETRYABLE_SERVER_ERROR', true);
      const trial = (trials || []).find((item) => item.trial_end && new Date(item.trial_end) > now);
      if (trial) {
        entitlement = { user_id: trial.user_id, tally_serial: trial.tally_serial };
        expiryDate = trial.trial_end;
        features = ['sync'];
      }
    }
    if (!entitlement) {
      if (suspendedLicense) throw stableError('LICENSE_SUSPENDED');
      const anyLicense = (licenses || [])[0];
      if (anyLicense?.expiry_date && new Date(anyLicense.expiry_date) <= now) throw stableError('LICENSE_EXPIRED');
      throw stableError('NO_LICENSE');
    }

    const boundSerial = entitlement.tally_serial;
    if (boundSerial && !tallySerial) throw stableError('SERIAL_MISMATCH');
    if (boundSerial && tallySerial && boundSerial !== tallySerial) throw stableError('SERIAL_MISMATCH');
    if (!features.includes('*') && !features.includes('sync')) throw stableError('FEATURE_NOT_INCLUDED');

    const minimumVersion = process.env.MIN_SYNC_APP_VERSION;
    if (minimumVersion && (!appVersion || !isVersionAtLeast(appVersion, minimumVersion))) throw stableError('APP_VERSION_UNSUPPORTED');
    const maxRecords = Number.parseInt(process.env.MAX_SYNC_RECORDS_PER_REQUEST || '50000', 10);
    if (recordCount > maxRecords) throw stableError('QUOTA_EXCEEDED');

    return { companyId, userId: entitlement.user_id, planSlug, expiryDate, recordCount, correlationId: crypto.randomUUID() };
  }
}

module.exports = EntitlementService;
