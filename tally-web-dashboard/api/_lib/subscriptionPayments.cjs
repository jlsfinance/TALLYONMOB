const crypto = require('crypto');

class PaymentError extends Error {
    constructor(message, status = 503) { super(message); this.status = status; }
}
function verifyWebhook(rawBody, signature, secret) {
    if (!secret || /your_|placeholder|xxxxx|change.?me/i.test(secret)) throw new PaymentError('Payment webhook is not configured');
    if (!Buffer.isBuffer(rawBody) || !/^[a-f0-9]{64}$/i.test(signature || '')) throw new PaymentError('Invalid webhook signature', 401);
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new PaymentError('Invalid webhook signature', 401);
    return JSON.parse(rawBody.toString('utf8'));
}

class SubscriptionPayments {
    constructor({ db, userClient, fetchImpl = fetch, env = process.env }) {
        this.db = db; this.userClient = userClient; this.fetch = fetchImpl; this.env = env;
    }
    configured() {
        return /^rzp_(test|live)_[a-z0-9]+$/i.test(this.env.RAZORPAY_KEY_ID || '')
            && [this.env.RAZORPAY_KEY_SECRET, this.env.RAZORPAY_WEBHOOK_SECRET].every(s => s && s.length >= 8 && !/your_|placeholder|xxxxx|change.?me/i.test(s));
    }
    async assertPaymentMode(userId) {
        if (this.env.VERCEL_ENV !== 'production' || !/^rzp_test_/i.test(this.env.RAZORPAY_KEY_ID || '')) return;
        const { data, error } = await this.db.from('user_profiles').select('is_admin,is_active').eq('id', userId).maybeSingle();
        if (error) throw new PaymentError('Payment account verification unavailable');
        if (!data?.is_admin || data.is_active === false) throw new PaymentError('Payments are in test mode. Contact support.', 403);
    }
    async api(path, body) {
        if (!this.configured()) throw new PaymentError('Online payments are not configured yet. Contact support.');
        const response = await this.fetch('https://api.razorpay.com/v1' + path, {
            method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
            headers: { Authorization: 'Basic ' + Buffer.from(this.env.RAZORPAY_KEY_ID + ':' + this.env.RAZORPAY_KEY_SECRET).toString('base64'), 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (!response.ok) throw new PaymentError('Payment gateway temporarily unavailable. Please retry.');
        return response.json();
    }
    async order(id, userId) {
        let query = this.db.from('subscription_orders').select('*').eq('id', id);
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await query.maybeSingle();
        if (error) throw new PaymentError('Could not load checkout');
        if (!data) throw new PaymentError('Checkout not found', 404);
        return data;
    }
    async create(user, token, { planSlug, couponCode, requestId }) {
        if (!this.configured()) throw new PaymentError('Online payments are not configured yet. Contact support.');
        await this.assertPaymentMode(user.id);
        if (!['monthly', 'half_yearly', 'yearly'].includes(planSlug) || !/^[0-9a-f-]{36}$/i.test(requestId || '') || (couponCode && (typeof couponCode !== 'string' || couponCode.length > 80))) throw new PaymentError('Invalid checkout request', 400);
        const { data: order, error } = await this.userClient(token).rpc('create_subscription_order', {
            p_plan_slug: planSlug, p_coupon_code: couponCode || null, p_request_id: requestId
        });
        if (error || !order) throw new PaymentError(error?.message || 'Could not prepare checkout', 400);
        if (order.user_id !== user.id) throw new PaymentError('Checkout not found', 404);
        if (order.status === 'paid') return { orderId: order.id, status: 'paid' };
        if (order.status !== 'pending' || Date.parse(order.expires_at) <= Date.now()) throw new PaymentError('Checkout expired. Please start again.', 409);
        if (order.checkout_url) return { orderId: order.id, checkoutUrl: order.checkout_url, status: 'pending' };
        // Recover a timed-out create request using the gateway's unique reference ID.
        const existing = await this.api('/payment_links?reference_id=' + encodeURIComponent(order.id));
        let link = existing.items?.find(item => item.reference_id === order.id);
        if (!link) {
            const returnUrl = new URL(this.env.SUBSCRIPTION_RETURN_URL || 'https://tallyonmob.vercel.app/subscription');
            if (returnUrl.protocol !== 'https:' && !(['127.0.0.1','localhost'].includes(returnUrl.hostname) && this.env.NODE_ENV !== 'production')) throw new PaymentError('Payment return URL is not configured');
            returnUrl.searchParams.set('checkout', order.id);
            link = await this.api('/payment_links', {
                amount: Number(order.amount_paise), currency: 'INR', accept_partial: false,
                reference_id: order.id, expire_by: Math.floor(Date.parse(order.expires_at) / 1000),
                description: 'SYNCORA subscription - ' + order.plan_slug,
                customer: { email: user.email }, notify: { sms: false, email: false }, reminder_enable: false,
                notes: { subscription_order_id: order.id }, callback_url: returnUrl.toString(), callback_method: 'get'
            });
        }
        if (link.amount !== Number(order.amount_paise) || link.currency !== 'INR' || link.notes?.subscription_order_id !== order.id || !/^plink_[a-z0-9]+$/i.test(link.id || '') || !/^https:\/\/rzp\.io\//.test(link.short_url || '')) throw new PaymentError('Gateway checkout did not match the plan');
        const { data: saved, error: saveError } = await this.db.from('subscription_orders').update({ gateway_link_id: link.id, checkout_url: link.short_url }).eq('id', order.id).eq('user_id', user.id).select('id').single();
        if (saveError || saved?.id !== order.id) throw new PaymentError('Could not save checkout. Retry with the same request.');
        return { orderId: order.id, checkoutUrl: link.short_url, status: 'pending' };
    }
    async reconcile(order) {
        if (order.status === 'paid') return { status: 'paid', orderId: order.id };
        await this.assertPaymentMode(order.user_id);
        if (!order.gateway_link_id) return { status: 'pending', orderId: order.id };
        const link = await this.api('/payment_links/' + encodeURIComponent(order.gateway_link_id));
        if (link.status !== 'paid') return { status: ['expired', 'cancelled'].includes(link.status) ? link.status : 'pending', orderId: order.id };
        if (link.id !== order.gateway_link_id || link.notes?.subscription_order_id !== order.id || link.reference_id !== order.id
            || link.amount !== Number(order.amount_paise) || link.amount_paid !== Number(order.amount_paise) || link.currency !== 'INR') throw new PaymentError('Payment amount or order did not match', 409);
        let paymentId = link.payments?.find(p => p.status === 'captured')?.payment_id;
        if (!paymentId && link.order_id) {
            const payments = await this.api('/orders/' + encodeURIComponent(link.order_id) + '/payments');
            paymentId = payments.items?.find(p => p.status === 'captured' && p.order_id === link.order_id)?.id;
        }
        if (!/^pay_[a-z0-9]+$/i.test(paymentId || '')) throw new PaymentError('Payment capture is awaiting confirmation');
        const payment = await this.api('/payments/' + encodeURIComponent(paymentId));
        if (payment.status !== 'captured' || payment.captured !== true || payment.amount !== Number(order.amount_paise)
            || payment.currency !== 'INR' || (payment.amount_refunded || 0) !== 0 || !link.order_id || payment.order_id !== link.order_id) throw new PaymentError('Payment is not fully captured', 409);
        const { data, error } = await this.db.rpc('finalize_subscription_payment', {
            p_order_id: order.id, p_link_id: link.id, p_payment_id: payment.id,
            p_amount_paise: payment.amount, p_currency: payment.currency
        });
        if (error || !data?.success) throw new PaymentError('Payment received; activation is awaiting verification. Please retry.');
        return { status: 'paid', orderId: order.id };
    }
    async webhook(rawBody, signature) {
        const payload = verifyWebhook(rawBody, signature, this.env.RAZORPAY_WEBHOOK_SECRET);
        if (payload.event !== 'payment_link.paid') return { ignored: true };
        const link = payload.payload?.payment_link?.entity;
        if (!link?.notes?.subscription_order_id) return { ignored: true };
        const order = await this.order(link.notes.subscription_order_id);
        if (order.gateway_link_id !== link.id) throw new PaymentError('Payment link does not match checkout', 409);
        return this.reconcile(order);
    }
}
module.exports = { SubscriptionPayments, PaymentError, verifyWebhook };
