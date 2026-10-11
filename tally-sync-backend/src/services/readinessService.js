const { createClient } = require('@supabase/supabase-js');

const CHECK_TIMEOUT_MS = Number(process.env.READINESS_CHECK_TIMEOUT_MS || 1500);

function getReadinessClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-client-info': 'tally-sync-readiness' } },
  });
}

async function withTimeout(promise, timeoutMs = CHECK_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('readiness check timeout')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkTable(client, table) {
  if (!client) return 'not_configured';
  try {
    const { error } = await withTimeout(
      client.from(table).select('id', { head: true, count: 'exact' }).limit(1),
    );
    return error ? 'unhealthy' : 'healthy';
  } catch {
    return 'unhealthy';
  }
}

async function getReadiness() {
  const client = getReadinessClient();
  const [database, syncControlPlane] = await Promise.all([
    checkTable(client, 'companies'),
    checkTable(client, 'sync_devices'),
  ]);
  const checks = { process: 'healthy', database, syncControlPlane };
  const dependencyStates = [database, syncControlPlane];
  const status = dependencyStates.every((state) => state === 'healthy')
    ? 'healthy'
    : dependencyStates.some((state) => state === 'unhealthy')
      ? 'unhealthy'
      : 'degraded';
  return { status, checks };
}

module.exports = { getReadiness, checkTable, withTimeout };
