const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { supabaseIdentity: db } = require('../config/supabaseIdentity');
const { SubscriptionPayments } = require('../services/subscriptionPayments');
const router = express.Router();
const service = new SubscriptionPayments({ db, userClient: token => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false }
}) });
router.get('/availability', (_req, res) => res.json({ enabled: !!db && service.configured() }));
router.post('/webhook', async (req, res) => {
    try { if (!db) return res.status(503).json({ error: 'Payments not configured' }); res.json(await service.webhook(req.rawBody, req.headers['x-razorpay-signature'])); }
    catch (error) { res.status(error.status || 503).json({ error: error.message }); }
});
router.use(async (req, res, next) => {
    try {
        if (!db) return res.status(503).json({ error: 'Payments not configured' });
        const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
        if (!token) return res.status(401).json({ error: 'Please sign in' });
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) return res.status(401).json({ error: 'Please sign in again' });
        req.subscriptionUser = data.user; req.subscriptionToken = token; next();
    } catch { res.status(503).json({ error: 'Account verification temporarily unavailable' }); }
});
router.post('/checkout', async (req, res) => {
    try { res.json(await service.create(req.subscriptionUser, req.subscriptionToken, req.body)); }
    catch (error) { res.status(error.status || 503).json({ error: error.message }); }
});
router.get('/checkout/:id', async (req, res) => {
    try {
        if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid checkout' });
        res.json(await service.reconcile(await service.order(req.params.id, req.subscriptionUser.id)));
    } catch (error) { res.status(error.status || 503).json({ error: error.message }); }
});
module.exports = { subscriptionRoutes: router, subscriptionPayments: service };
