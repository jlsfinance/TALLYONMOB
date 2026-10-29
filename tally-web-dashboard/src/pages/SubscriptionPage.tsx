import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLicenseGate } from '@/contexts/LicenseGateContext';

const plans = [
    { id: 'monthly', title: 'Monthly', price: '₹99', period: 'month' },
    { id: 'yearly', title: 'Yearly', price: '₹999', period: 'year' },
] as const;

export default function SubscriptionPage() {
    const navigate = useNavigate();
    const { license, isLoading, licenseError, refresh } = useLicenseGate();
    const [selected, setSelected] = useState<(typeof plans)[number]['id']>('monthly');
    const [refreshing, setRefreshing] = useState(false);
    const [paymentNotice, setPaymentNotice] = useState(false);
    const active = license.status === 'active' || license.status === 'trial';

    const checkStatus = async () => {
        setRefreshing(true);
        try { await refresh(); } finally { setRefreshing(false); }
    };

    return (
        <main className="min-h-screen bg-[var(--bg)] px-4 py-5 pb-24 text-[var(--on-surface)]">
            <div className="mx-auto max-w-2xl">
                <button type="button" onClick={() => navigate('/select-mode')} className="mb-5 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <ArrowLeft size={18} /> Back
                </button>
                <div className="mb-6">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-600">SYNCORA</p>
                    <h1 className="text-2xl font-bold">Subscription</h1>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Choose a plan for your business.</p>
                </div>
                <section className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600"><ShieldCheck size={21} /></div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{isLoading ? 'Checking subscription…' : licenseError || (active ? license.planName || 'Active subscription' : 'No active subscription')}</p>
                        {!isLoading && active && license.expiryDate && <p className="mt-0.5 text-xs text-[var(--text-muted)]">Valid until {new Date(license.expiryDate).toLocaleDateString('en-IN')}</p>}
                        {!isLoading && !active && !licenseError && <p className="mt-0.5 text-xs text-[var(--text-muted)]">Select a monthly or yearly plan below.</p>}
                    </div>
                    <button type="button" onClick={checkStatus} disabled={refreshing} aria-label="Refresh subscription" className="rounded-lg p-2 text-[var(--text-muted)]"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
                </section>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {plans.map(plan => <button type="button" key={plan.id} onClick={() => { setSelected(plan.id); setPaymentNotice(false); }} aria-pressed={selected === plan.id} className={`rounded-2xl border p-5 text-left transition-colors ${selected === plan.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                        <span className="flex items-center justify-between text-sm font-bold">{plan.title}{selected === plan.id && <Check size={18} className="text-emerald-600" />}</span>
                        <span className="mt-4 block text-2xl font-bold">{plan.price}<span className="text-sm font-normal text-[var(--text-muted)]"> / {plan.period}</span></span>
                    </button>)}
                </div>
                <button type="button" onClick={() => setPaymentNotice(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-emerald-700"><CreditCard size={18} /> Continue to payment</button>
                {paymentNotice && <p role="status" className="mt-3 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm text-[var(--on-surface)]">Online payment setup is not complete yet. No payment has been taken.</p>}
            </div>
        </main>
    );
}
