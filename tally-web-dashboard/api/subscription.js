import { createClient } from '@supabase/supabase-js';
import payments from './_lib/subscriptionPayments.cjs';

const { SubscriptionPayments } = payments;
let cached;
function dependencies() {
    if (cached) return cached;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || new URL(url).hostname !== 'pfqmqpboomwtxgyfqnsn.supabase.co') return {};
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const db = createClient(url, key, options);
    const userClient = token => createClient(url, key, {
        ...options, global: { headers: { Authorization: 'Bearer ' + token } },
    });
    cached = { db, service: new SubscriptionPayments({ db, userClient }) };
    return cached;
}

async function rawBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 65536) throw Object.assign(new Error('Request too large'), { status: 413 });
        chunks.push(bytes);
    }
    return Buffer.concat(chunks);
}

export function createSubscriptionHandler(getDependencies = dependencies) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const { pathname, searchParams } = new URL(req.url, 'https://tallyonmob.vercel.app');
            const route = searchParams.get('route') || pathname.replace(/^\/api\/v1\/subscriptions\/?/, '');
            const { db, service } = getDependencies();
            if (route === 'availability' && req.method === 'GET') {
                return res.status(200).json({ enabled: Boolean(db && service?.configured()), testMode: /^rzp_test_/i.test(process.env.RAZORPAY_KEY_ID || '') });
            }
            const checkoutId = /^checkout\/([0-9a-f-]{36})$/i.exec(route)?.[1];
            if (!((route === 'webhook' || route === 'checkout') && req.method === 'POST') && !(checkoutId && req.method === 'GET')) {
                return res.status(404).json({ error: 'Subscription endpoint not found' });
            }
            if (!db || !service) return res.status(503).json({ error: 'Payments not configured' });
            if (route === 'webhook') {
                return res.status(200).json(await service.webhook(await rawBody(req), req.headers['x-razorpay-signature']));
            }
            const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
            if (!token) return res.status(401).json({ error: 'Please sign in' });
            const { data, error } = await db.auth.getUser(token);
            if (error || !data?.user) return res.status(401).json({ error: 'Please sign in again' });
            if (checkoutId) return res.status(200).json(await service.reconcile(await service.order(checkoutId, data.user.id)));
            let body;
            try { body = JSON.parse((await rawBody(req)).toString('utf8')); }
            catch (e) { if (e.status) throw e; return res.status(400).json({ error: 'Invalid JSON body' }); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Invalid checkout' });
            return res.status(200).json(await service.create(data.user, token, body));
        } catch (error) {
            return res.status(error.status || 503).json({ error: error.status ? error.message : 'Payment verification temporarily unavailable' });
        }
    };
}

export default createSubscriptionHandler();
