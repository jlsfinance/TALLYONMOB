#!/usr/bin/env node

const requiredWhenEnabled = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'PAYMENT_CATALOG_VERSION',
];

const enabled = String(process.env.PAYMENTS_ENABLED || 'false').toLowerCase() === 'true';

if (!enabled) {
  console.log('Payment activation is disabled; no gateway configuration is required.');
  process.exit(0);
}

const missing = requiredWhenEnabled.filter((name) => !process.env[name]);
const activationMode = process.env.PAYMENT_ACTIVATION_MODE;
if (activationMode !== 'server_webhook') {
  missing.push('PAYMENT_ACTIVATION_MODE=server_webhook');
}

if (missing.length > 0) {
  console.error(`Payment activation refused; missing secure configuration: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Payment configuration is complete for server-webhook activation.');
