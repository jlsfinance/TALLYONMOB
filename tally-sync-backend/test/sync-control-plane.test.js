const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'src/routes/syncRoutes.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/services/syncControlService.js'), 'utf8');
const syncService = fs.readFileSync(path.join(root, 'src/services/syncService.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/20261009_sync_control_plane.sql'), 'utf8');
const phase3Migration = fs.readFileSync(path.join(root, 'migrations/20261009_incremental_sync_performance.sql'), 'utf8');

const requiredRoutes = [
  "router.post('/device/register'",
  "router.post('/device/:deviceId/revoke'",
  "router.get('/devices/:companyId'",
  "router.get('/health/:companyId'",
  "router.get('/conflicts/:companyId'",
  "router.post('/conflicts/:id/resolve'",
];
const requiredMethods = [
  'registerDevice', 'revokeDevice', 'listDevices', 'createRun', 'finishRun',
  'getHealth', 'getIdempotentResponse', 'saveIdempotentResponse',
  'recordConflict', 'listConflicts', 'resolveConflict',
];
const requiredTables = ['sync_devices', 'sync_runs', 'sync_idempotency', 'sync_conflicts'];

test('Phase 2 exposes device, health, and conflict endpoints', () => {
  for (const route of requiredRoutes) assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Phase 2 control service exposes all required operations', () => {
  for (const method of requiredMethods) assert.match(service, new RegExp(`static async ${method}\\b`));
});

test('Phase 2 migration contains required tables, constraints, indexes, and RLS', () => {
  for (const table of requiredTables) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /UNIQUE\(company_id, device_id\)/);
  assert.match(migration, /UNIQUE\(company_id, idempotency_key\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /idx_sync_conflicts_company_status/);
});

test('Phase 3 exposes resumable checkpoint/progress APIs and durable fields', () => {
  assert.match(routes, /router\.get\('\/checkpoint\/:companyId\/:module'/);
  assert.match(routes, /router\.put\('\/checkpoint\/:companyId\/:module'/);
  assert.match(routes, /router\.get\('\/progress\/:companyId'/);
  assert.match(syncService, /static async getCheckpoint\b/);
  assert.match(syncService, /static async saveCheckpoint\b/);
  assert.match(syncService, /static async getSyncProgress\b/);
  for (const column of ['records_processed', 'bytes_processed', 'page_size', 'last_alter_id', 'expires_at']) {
    assert.match(phase3Migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }
  assert.match(phase3Migration, /idx_vouchers_company_alter_id/);
  assert.match(phase3Migration, /idx_ledgers_company_alter_id/);
  assert.match(phase3Migration, /idx_stock_company_alter_id/);
  assert.match(phase3Migration, /ALTER TABLE public\.sync_checkpoint ENABLE ROW LEVEL SECURITY/);
});

test('Live endpoint integration is opt-in and clearly reported', async (t) => {
  const baseUrl = process.env.SYNC_BACKEND_URL;
  const apiKey = process.env.SYNC_API_KEY;
  const companyId = process.env.CONTROL_PLANE_TEST_COMPANY_ID;
  if (!baseUrl || !apiKey || !companyId) {
    t.skip('Set SYNC_BACKEND_URL, SYNC_API_KEY, and CONTROL_PLANE_TEST_COMPANY_ID for live API checks');
    return;
  }

  const deviceId = `phase2-test-${Date.now()}`;
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
  const register = await fetch(`${baseUrl.replace(/\/$/, '')}/device/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ companyId, deviceId, name: 'Phase 2 Test Device', platform: 'test' }),
  });
  assert.equal(register.status, 200, await register.text());
  const registerBody = await register.json();
  assert.equal(registerBody.success, true);

  const health = await fetch(`${baseUrl.replace(/\/$/, '')}/health/${encodeURIComponent(companyId)}`, {
    headers,
  });
  assert.equal(health.status, 200, await health.text());
  const healthBody = await health.json();
  assert.equal(healthBody.success, true);
  assert.ok(Array.isArray(healthBody.data.devices));
  assert.ok(Object.hasOwn(healthBody.data, 'openConflictCount'));

  const revoke = await fetch(`${baseUrl.replace(/\/$/, '')}/device/${encodeURIComponent(deviceId)}/revoke`, {
    method: 'POST', headers,
    body: JSON.stringify({ companyId }),
  });
  assert.equal(revoke.status, 200, await revoke.text());
  assert.equal((await revoke.json()).success, true);
});
