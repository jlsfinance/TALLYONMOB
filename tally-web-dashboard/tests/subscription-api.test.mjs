import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { createSubscriptionHandler } from '../api/subscription.js';
import payments from '../api/_lib/subscriptionPayments.cjs';

const secret = 'test-only-webhook-signing-secret';
const db = { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } };
const service = new payments.SubscriptionPayments({ db, env: { RAZORPAY_WEBHOOK_SECRET: secret } });
const handler = createSubscriptionHandler(() => ({ db, service }));
async function request(path, { method = 'GET', body = '', headers = {} } = {}) {
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { url: path, method, headers });
    const result = { headers: {} };
    const res = { setHeader(k,v) { result.headers[k]=v; }, status(code) { result.status=code; return this; }, json(body) { result.body=body; return this; } };
    await handler(req, res);
    return result;
}
test('rewritten availability is JSON and never cached', async () => {
    const r = await request('/api/subscription?route=availability');
    assert.equal(r.status, 200); assert.equal(r.headers['Cache-Control'], 'no-store');
});
test('checkout requires a signed-in account', async () => {
    assert.equal((await request('/api/v1/subscriptions/checkout', { method: 'POST', body:'{}' })).status, 401);
});
test('raw signed webhook passes verification and unrelated events do not activate licences', async () => {
    const body = '{ "event": "test.connection" }';
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    const r = await request('/api/subscription?route=webhook', { method:'POST', body, headers:{'x-razorpay-signature':signature} });
    assert.equal(r.status,200); assert.deepEqual(r.body,{ignored:true});
});
test('missing or forged signatures are rejected', async () => {
    for (const signature of ['', '0'.repeat(64)]) {
        assert.equal((await request('/api/v1/subscriptions/webhook', { method:'POST', body:'{}', headers:{'x-razorpay-signature':signature} })).status,401);
    }
});
test('unknown API routes do not return the SPA', async () => {
    assert.equal((await request('/api/subscription?route=unknown')).status,404);
});
