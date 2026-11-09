import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, ShieldCheck, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLicenseGate } from '@/contexts/LicenseGateContext';
import { supabase } from '@/lib/insforge';
import './SubscriptionPage.css';
import './SubscriptionPaymentResultPage.css';

type PaymentStatus = 'paid' | 'pending' | 'failed' | 'cancelled' | 'expired';
export default function SubscriptionPaymentResultPage() {
    const [params] = useSearchParams();
    const { user, loading } = useAuth() as any;
    const { refresh } = useLicenseGate();
    const [licenseNotice, setLicenseNotice] = useState('');
    const orderId = params.get('checkout') || '';
    const validOrder = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    const result = useQuery({
        queryKey: ['subscription-payment-result', user?.id, orderId],
        enabled: Boolean(user?.id && validOrder),
        queryFn: async ({ signal }) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Please sign in to check your payment.');
            const controller = new AbortController();
            const abort = () => controller.abort();
            signal?.addEventListener('abort', abort, { once: true });
            const timeout = window.setTimeout(abort, 20000);
            try {
                const base = String(import.meta.env.VITE_SUBSCRIPTION_API_URL || '').replace(/\/$/, '');
                const response = await fetch(`${base}/api/v1/subscriptions/checkout/${encodeURIComponent(orderId)}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: controller.signal,
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Payment verification is temporarily unavailable.');
                if (data.orderId !== orderId || !['paid', 'pending', 'failed', 'cancelled', 'expired'].includes(data.status)) {
                    throw new Error('Could not verify this payment.');
                }
                return data as { status: PaymentStatus; orderId: string };
            } finally {
                window.clearTimeout(timeout);
                signal?.removeEventListener('abort', abort);
            }
        },
        retry: 1,
        refetchInterval: data => data && ['paid', 'cancelled', 'expired'].includes(data.status) ? false : 10000,
        refetchOnWindowFocus: true,
    });
    const status = result.data?.status;
    const paid = status === 'paid';
    const failed = status === 'failed' || status === 'cancelled' || status === 'expired';
    useEffect(() => {
        if (!user?.id || !status || status === 'pending' || status === 'failed') return;
        const key = 'syncora-pending-checkout:' + user.id;
        if (window.localStorage.getItem(key) === orderId) window.localStorage.removeItem(key);
    }, [user?.id, status, orderId]);
    useEffect(() => {
        if (!paid) return;
        let disposed = false;
        void refresh().catch(() => { if (!disposed) setLicenseNotice('Payment is confirmed. Reopen the dashboard to refresh subscription access.'); });
        return () => { disposed = true; };
    }, [paid, refresh]);

    const title = !validOrder ? 'Payment reference missing' : !user && !loading ? 'Sign in to check your payment' : paid ? 'Payment successful!' : status === 'cancelled' ? 'Payment cancelled' : status === 'expired' ? 'Payment link expired' : failed ? 'Payment failed' : result.isError ? 'Unable to confirm payment' : result.data ? 'Payment confirmation pending' : 'Checking your payment';
    const description = paid ? 'Your payment is verified and your subscription has been activated. You’re ready to continue with SYNCORA.' : failed ? 'This payment was not completed. Your subscription has not been activated by this attempt. You can check again or choose a plan to retry.' : result.isError ? 'We could not reach payment verification. This does not mean your payment failed. Please check again before making another payment.' : !validOrder ? 'Open the payment result from your checkout to verify its status.' : 'We’re checking securely with Razorpay. If money was debited, please wait for confirmation before paying again.';
    const Icon = paid ? CheckCircle2 : failed ? XCircle : Clock;
    return <main className="subscription-page payment-result-page">
        <section className={`payment-result-card ${paid ? 'is-success' : failed ? 'is-failed' : ''}`} aria-labelledby="payment-result-title">
            <span className="subscription-brand">SYNCORA<span> / PAYMENT</span></span>
            <div className="payment-result-icon"><Icon size={48} aria-hidden="true" /></div>
            <div aria-live="polite" role="status">
                <h1 id="payment-result-title">{title}</h1>
                <p>{description}</p>
            </div>
            {validOrder && <div className="payment-result-reference"><span>Checkout reference</span><code>{orderId}</code></div>}
            {result.isError && <p className="payment-result-notice">{result.error instanceof Error ? result.error.message : 'Please try again.'}</p>}
            {licenseNotice && <p className="payment-result-notice">{licenseNotice}</p>}
            <div className="payment-result-actions">
                {paid ? <Link className="payment-result-primary" to="/dashboard">Continue to dashboard</Link> : user && validOrder ? <button type="button" disabled={result.isFetching} onClick={() => void result.refetch()} className="payment-result-primary"><RefreshCw size={17} className={result.isFetching ? 'animate-spin' : ''} />{result.isFetching ? 'Checking…' : 'Check payment status'}</button> : <Link className="payment-result-primary" to="/login">Sign in</Link>}
                {(paid || failed) && <Link to="/subscription">{paid ? 'View subscription' : 'Choose a plan'}</Link>}
                <Link to="/support">Contact support</Link>
            </div>
            <small><ShieldCheck size={15} /> Verified securely on the server</small>
        </section>
    </main>;
}
