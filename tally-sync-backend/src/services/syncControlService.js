const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

const uuid = () => crypto.randomUUID();
const DEVICE_FIELDS = 'id,company_id,device_id,name,platform,status,last_seen_at,metadata,created_at,revoked_at,device_token_issued_at,last_token_seen_at,token_revoked_at';
const hashDeviceToken = (token) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');
const generateDeviceToken = () => crypto.randomBytes(32).toString('base64url');
const tokensMatch = (token, expectedHash) => {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashDeviceToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
const securityError = (code) => Object.assign(new Error(code), { code });

class SyncControlService {
  static async registerDevice({ companyId, deviceId, name, platform, metadata, deviceToken }) {
    if (!companyId || !deviceId) throw new Error('companyId and deviceId are required');
    const now = new Date().toISOString();
    const { data: existing, error: lookupError } = await supabase.from('sync_devices').select(`${DEVICE_FIELDS},device_token_hash`)
      .eq('company_id', companyId).eq('device_id', deviceId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.status === 'revoked') throw securityError('DEVICE_REVOKED');
    if (existing?.device_token_hash && !tokensMatch(deviceToken, existing.device_token_hash)) {
      throw securityError(deviceToken ? 'DEVICE_TOKEN_INVALID' : 'DEVICE_TOKEN_REQUIRED');
    }
    const issuedToken = existing?.device_token_hash ? null : generateDeviceToken();
    const values = {
      company_id: companyId,
      device_id: deviceId,
      name: name || deviceId,
      platform: platform || 'windows',
      status: 'active',
      last_seen_at: now,
      metadata: metadata || {},
      revoked_at: null,
      ...(issuedToken ? { device_token_hash: hashDeviceToken(issuedToken), device_token_issued_at: now, token_revoked_at: null } : {}),
    };
    const query = existing
      ? supabase.from('sync_devices').update(values).eq('id', existing.id).eq('status', 'active')
      : supabase.from('sync_devices').insert(values);
    const { data, error } = await query.select(DEVICE_FIELDS).single();
    if (error) throw error;
    return { device: data, deviceToken: issuedToken };
  }

  static async assertDeviceActive(companyId, deviceId, deviceToken) {
    if (!companyId || !deviceId) throw securityError('DEVICE_REQUIRED');
    const { data, error } = await supabase.from('sync_devices').select(`${DEVICE_FIELDS},device_token_hash`)
      .eq('company_id', companyId).eq('device_id', deviceId).maybeSingle();
    if (error) throw error;
    if (!data) throw securityError('DEVICE_NOT_REGISTERED');
    if (data.status !== 'active' || data.revoked_at || data.token_revoked_at) throw securityError('DEVICE_REVOKED');
    if (!tokensMatch(deviceToken, data.device_token_hash)) throw securityError(deviceToken ? 'DEVICE_TOKEN_INVALID' : 'DEVICE_TOKEN_REQUIRED');
    const { device_token_hash: ignored, ...safeDevice } = data;
    return safeDevice;
  }

  static async touchDevice(companyId, deviceId, deviceToken) {
    await this.assertDeviceActive(companyId, deviceId, deviceToken);
    const { data, error } = await supabase.from('sync_devices').update({
      last_seen_at: new Date().toISOString(),
      last_token_seen_at: new Date().toISOString(),
    }).eq('company_id', companyId).eq('device_id', deviceId).eq('status', 'active').select(DEVICE_FIELDS).maybeSingle();
    if (error) throw error;
    return data;
  }

  static async revokeDevice(companyId, deviceId) {
    const { data, error } = await supabase.from('sync_devices').update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      token_revoked_at: new Date().toISOString(),
      device_token_hash: null,
    }).eq('company_id', companyId).eq('device_id', deviceId).eq('status', 'active').select(DEVICE_FIELDS).maybeSingle();
    if (error) throw error;
    if (!data) throw securityError('DEVICE_NOT_ACTIVE');
    return data;
  }

  static async listDevices(companyId) {
    const { data, error } = await supabase.from('sync_devices').select(DEVICE_FIELDS)
      .eq('company_id', companyId).order('last_seen_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async createRun({ companyId, deviceId, dataType, totalRecords = 0, metadata = {} }) {
    const { data, error } = await supabase.from('sync_runs').insert({
      id: uuid(), company_id: companyId, device_id: deviceId || null,
      data_type: dataType, total_records: totalRecords, metadata,
    }).select().single();
    if (error) throw error;
    return data;
  }

  static async finishRun(runId, result = {}) {
    if (!runId) return null;
    const status = result.success ? 'success' : (result.count > 0 ? 'partial' : 'failed');
    const { data, error } = await supabase.from('sync_runs').update({
      status,
      processed_records: result.count || 0,
      failed_records: result.failed || 0,
      conflict_records: result.conflicts || 0,
      completed_at: new Date().toISOString(),
      last_error: result.errors ? JSON.stringify(result.errors) : null,
      metadata: { duration: result.duration || null, total: result.total || 0 },
    }).eq('id', runId).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  static async getHealth(companyId) {
    const [devices, runs, conflicts] = await Promise.all([
      supabase.from('sync_devices').select('device_id,name,platform,status,last_seen_at').eq('company_id', companyId),
      supabase.from('sync_runs').select('id,device_id,data_type,status,total_records,processed_records,failed_records,conflict_records,started_at,completed_at,last_error').eq('company_id', companyId).order('started_at', { ascending: false }).limit(20),
      supabase.from('sync_conflicts').select('id,data_type,record_id,status,detected_at').eq('company_id', companyId).eq('status', 'open').order('detected_at', { ascending: false }).limit(100),
    ]);
    for (const result of [devices, runs, conflicts]) if (result.error) throw result.error;
    const activeDevices = (devices.data || []).filter((device) => device.status === 'active');
    const lastSeen = activeDevices.map((device) => device.last_seen_at).filter(Boolean).sort().pop() || null;
    return {
      companyId,
      deviceCount: (devices.data || []).length,
      activeDeviceCount: activeDevices.length,
      lastSeenAt: lastSeen,
      openConflictCount: (conflicts.data || []).length,
      recentRuns: runs.data || [],
      devices: devices.data || [],
      conflicts: conflicts.data || [],
    };
  }

  static async getIdempotentResponse(companyId, key) {
    if (!companyId || !key) return null;
    const { data, error } = await supabase.from('sync_idempotency').select('response')
      .eq('company_id', companyId).eq('idempotency_key', key).maybeSingle();
    if (error) throw error;
    return data?.response || null;
  }

  static async saveIdempotentResponse(companyId, deviceId, key, response) {
    if (!companyId || !key) return;
    const { error } = await supabase.from('sync_idempotency').upsert({
      company_id: companyId, device_id: deviceId || null, idempotency_key: key, response,
    }, { onConflict: 'company_id,idempotency_key' });
    if (error) throw error;
  }

  static async recordConflict({ companyId, deviceId, dataType, recordId, localVersion, incomingVersion, conflictType = 'stale_update' }) {
    const { data, error } = await supabase.from('sync_conflicts').insert({
      company_id: companyId, device_id: deviceId || null, data_type: dataType,
      record_id: recordId, conflict_type, local_version: localVersion || null,
      incoming_version: incomingVersion || null,
    }).select().single();
    if (error) throw error;
    return data;
  }

  static async listConflicts(companyId, status = 'open') {
    const query = supabase.from('sync_conflicts').select('*').eq('company_id', companyId)
      .order('detected_at', { ascending: false }).limit(200);
    const { data, error } = status ? await query.eq('status', status) : await query;
    if (error) throw error;
    return data || [];
  }

  static async resolveConflict(id, resolution = 'manual') {
    const { data, error } = await supabase.from('sync_conflicts').update({
      status: resolution === 'ignore' ? 'ignored' : 'resolved',
      resolution, resolved_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  static async safe(operation, fallback = null) {
    try { return await operation(); }
    catch (error) {
      logger.warn(`Sync control-plane operation unavailable: ${error.message}`);
      return fallback;
    }
  }
}

module.exports = SyncControlService;
