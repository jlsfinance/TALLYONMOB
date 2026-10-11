const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'tally-sync-backend');
const telemetry = fs.readFileSync(path.join(backend, 'src/utils/telemetry.js'), 'utf8');
const index = fs.readFileSync(path.join(backend, 'src/index.js'), 'utf8');
const errorHandler = fs.readFileSync(path.join(backend, 'src/middleware/errorHandler.js'), 'utf8');
const syncRoutes = fs.readFileSync(path.join(backend, 'src/routes/syncRoutes.js'), 'utf8');
const windowsLogger = fs.readFileSync(path.join(root, 'tally-windows-sync/Services/SyncLogger.cs'), 'utf8');
const apiClient = fs.readFileSync(path.join(root, 'tally-windows-sync/Services/ApiClient.cs'), 'utf8');
const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');

 test('Phase 8 exposes correlation, readiness, and protected metrics contracts', () => {
  assert.match(telemetry, /requestContext/);
  assert.match(telemetry, /x-correlation-id/);
  assert.match(telemetry, /recordRequest/);
  assert.match(index, /\/health\/readiness/);
  assert.match(index, /\/metrics/);
  assert.match(index, /METRICS_ACCESS_KEY/);
});

test('Phase 8 errors return safe codes without stack or raw internal messages', () => {
  assert.match(errorHandler, /INTERNAL_ERROR/);
  assert.match(errorHandler, /correlationId/);
  assert.match(errorHandler, /status >= 500/);
  assert.doesNotMatch(errorHandler, /stack: err\.stack/);
  assert.doesNotMatch(syncRoutes, /message: error\.message/);
});

test('Windows logging blocks sensitive artifacts and raw sync payload logs', () => {
  assert.match(windowsLogger, /IsSensitiveArtifact/);
  assert.match(windowsLogger, /REDACTED/);
  assert.match(windowsLogger, /TRUNCATED/);
  assert.doesNotMatch(apiClient, /DEBUG UPLOAD VOUCHERS/);
  assert.doesNotMatch(apiClient, /DEBUG UPLOAD COMPANY/);
});

test('Release workflow fails closed and publishes checksums', () => {
  assert.match(release, /ErrorActionPreference = 'Stop'/);
  assert.match(release, /Squirrel\.exe is required/);
  assert.match(release, /refusing to publish fallback artifact/);
  assert.match(release, /SHA256SUMS\.txt/);
  assert.match(release, /windows-build-check/);
});
