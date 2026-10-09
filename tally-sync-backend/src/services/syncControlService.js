const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

const uuid = () => crypto.randomUUID();

class SyncControlService {
  static async registerDevice({ companyId, deviceId, name, platform, metadata }) {
    if (!companyId || !deviceId) throw new Error('companyId and deviceId are required');
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('sync_devices').upsert({
      company_id: companyId,
      device_id: deviceId,
      name: name || deviceId,
      platform: platform || 'windows',
      status: 'active',
      last_seen_at: now,
      metadata: metadata || {},
      revoked_at: null,
    }, { onConflict: 'company_id,device_id' }).select().single();
    if (error) throw error;
    return data;
  }

  static async touchDevice(companyId, deviceId) {
    if (!companyId || !deviceId) return null;
    const { data, error } = await supabase.from('sync_devices').update({
      last_seen_at: new Date().toISOString(),
      status: 'active',
    }).eq('company_id', companyId).eq('device_id', deviceId).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  static async revokeDevice(companyId, deviceId) {
    const { data, error } = await supabase.from('sync_devices').update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    }).eq('company_id', companyId).eq('device_id', deviceId).select().single();
    if (error) throw error;
    return data;
  }

  static async listDevices(companyId) {
    const { data, error } = await supabase.from('sync_devices').select('*')
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
