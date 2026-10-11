const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, '..', 'scripts', 'verify-payment-readiness.js');

function run(env) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('payment readiness passes closed when payments are disabled', () => {
  const result = run({ PAYMENTS_ENABLED: 'false' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /disabled/);
});

test('payment readiness rejects enabled payments without gateway secrets', () => {
  const result = run({
    PAYMENTS_ENABLED: 'true',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    PAYMENT_CATALOG_VERSION: '',
    PAYMENT_ACTIVATION_MODE: 'client_callback',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Payment activation refused/);
  assert.match(result.stderr, /RAZORPAY_WEBHOOK_SECRET/);
  assert.match(result.stderr, /PAYMENT_ACTIVATION_MODE=server_webhook/);
});

test('payment readiness accepts only server-webhook activation with complete configuration', () => {
  const result = run({
    PAYMENTS_ENABLED: 'true',
    RAZORPAY_KEY_ID: 'configured',
    RAZORPAY_KEY_SECRET: 'configured',
    RAZORPAY_WEBHOOK_SECRET: 'configured',
    PAYMENT_CATALOG_VERSION: 'catalog-v1',
    PAYMENT_ACTIVATION_MODE: 'server_webhook',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /server-webhook/);
});
