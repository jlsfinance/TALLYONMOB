import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLicenseGate } from '@/contexts/LicenseGateContext';
import { supabase } from '@/lib/insforge';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Crown, Check, X, Shield, Zap, Clock, Star, CreditCard, Tag,
    ArrowRight, Loader2, AlertTriangle, CheckCircle2, Copy, MessageCircle, Mail
} from 'lucide-react';
import toast from 'react-hot-toast';

const PLANS = [
    { name: 'Free Trial', slug: 'trial', price: 0, duration: '7 days', icon: Clock, color: 'text-slate-400', features: ['Single company', '50 vouchers/day', 'Basic reports', 'Mobile access'] },
    { name: 'Monthly', slug: 'monthly', price: 299, duration: '30 days', icon: Zap, color: 'text-blue-500', features: ['1 company', '100 vouchers/day', 'All reports', 'WhatsApp share', 'Email invoices'] },
    { name: 'Quarterly', slug: 'quarterly', price: 799, duration: '90 days', icon: Shield, color: 'text-purple-500', popular: false, features: ['2 companies', 'Unlimited vouchers', 'Advanced analytics', 'Priority support', 'GST filing'] },
    { name: 'Half Yearly', slug: 'half_yearly', price: 1499, duration: '180 days', icon: Star, color: 'text-indigo-500', features: ['3 companies', 'Unlimited vouchers', 'Advanced analytics', 'Priority support', 'GST filing'] },
    { name: 'Yearly', slug: 'yearly', price: 2999, duration: '365 days', icon: Crown, color: 'text-amber-500', popular: true, features: ['5 companies', 'Unlimited everything', 'AI insights', 'Custom templates', 'Dedicated support'] },
    { name: 'Lifetime', slug: 'lifetime', price: 9999, duration: 'Forever', icon: Crown, color: 'text-emerald-500', features: ['Unlimited companies', 'Unlimited everything', 'AI insights', 'Custom templates', 'Dedicated support', 'Free updates'] },
];

function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function SubscriptionPage() {
    const { user } = useAuth() as any;
    const { license, isReadOnly, refresh } = useLicenseGate();
    const [loading, setLoading] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [couponCode, setCouponCode] = useState('');
    const [couponDiscount, setCouponDiscount] = useState(0);
    const [payments, setPayments] = useState<any[]>([]);

    useEffect(() => {
        if (user?.id) {
            supabase.from('payments')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5)
                .then(({ data }) => setPayments(data || []))
                .catch(() => setPayments([]));
        }
    }, [user?.id]);

    const handlePurchase = async () => {
        if (!selectedPlan || !user?.id) return;
        setLoading(true);
        try {
            const plan = PLANS.find(p => p.slug === selectedPlan);
            if (!plan) return;

            const { error } = await supabase.from('payments').insert({
                user_id: user.id,
                plan_slug: selectedPlan,
                amount: plan.price,
                coupon_code: couponCode || null,
                discount: couponDiscount,
                final_amount: Math.max(0, plan.price - couponDiscount),
                status: 'pending',
                payment_method: 'manual',
            });

            if (error) throw error;

            toast.success('Payment request created! Contact support to complete.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to create payment');
        } finally {
            setLoading(false);
        }
    };

    const handleStartTrial = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            // Check if trial already used
            const { data: existing } = await supabase
                .from('trial_history')
                .select('id')
                .eq('user_id', user.id)
                .limit(1)
                .catch(() => ({ data: [] }));

            if (existing && existing.length > 0) {
                toast.error('Free trial already used. Please purchase a plan.');
                setLoading(false);
                return;
            }

            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 7);

            const { error } = await supabase.from('trial_history').insert({
                user_id: user.id,
                trial_start: new Date().toISOString(),
                trial_end: trialEnd.toISOString(),
                trial_used: true,
                status: 'active',
            });

            if (error) throw error;

            toast.success('7-day free trial activated! Refreshing...');
            setTimeout(() => window.location.reload(), 1000);
        } catch (err: any) {
            toast.error(err.message || 'Failed to start trial');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg)] pb-24 md:pb-6 px-1">
            <div className="max-w-4xl mx-auto">
                {/* Current Status */}
                <div className="mb-6 mt-3 md:mt-4">
                    <h1 className="text-xl md:text-2xl font-black mb-4 flex items-center gap-2">
                        <Crown size={22} className="text-amber-500" />
                        Subscription & Billing
                    </h1>

                    <div className={`p-4 rounded-xl border ${
                        isReadOnly ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20'
                    }`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                isReadOnly ? 'bg-red-500/10' : 'bg-emerald-500/10'
                            }`}>
                                {isReadOnly ? <AlertTriangle size={24} className="text-red-500" /> : <CheckCircle2 size={24} className="text-emerald-500" />}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold">
                                    {isReadOnly ? 'No Active Subscription' : `${license.planName || 'Active Plan'}`}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    {license.status === 'expired' && `Expired ${Math.abs(license.daysLeft)} days ago`}
                                    {license.status === 'active' && `${license.daysLeft} days remaining`}
                                    {license.status === 'trial' && `Trial: ${license.daysLeft} days remaining`}
                                    {license.status === 'none' && 'Start a free trial or buy a plan'}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-[var(--text-muted)]">Status</p>
                                <p className={`text-sm font-bold ${
                                    isReadOnly ? 'text-red-500' : 'text-emerald-500'
                                }`}>{license.status.toUpperCase()}</p>
                            </div>
                        </div>
                        {/* Quick Trial Button */}
                        {license.status === 'none' && (
                            <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                <button disabled={loading} onClick={handleStartTrial}
                                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-[12px] disabled:opacity-40 flex items-center justify-center gap-2">
                                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                                    {loading ? 'Activating...' : 'Start 7-Day Free Trial'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {PLANS.map(plan => {
                        const Icon = plan.icon;
                        const isSelected = selectedPlan === plan.slug;
                        const finalPrice = couponCode ? Math.max(0, plan.price - couponDiscount) : plan.price;
                        return (
                            <motion.div key={plan.slug}
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all relative ${
                                    isSelected ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                                } ${plan.popular ? 'ring-2 ring-amber-500/30' : ''}`}
                                onClick={() => setSelectedPlan(plan.slug)}>
                                {plan.popular && (
                                    <div className="absolute -top-2 right-3 text-[8px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white">POPULAR</div>
                                )}
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-9 h-9 rounded-lg bg-[var(--surface-container)] flex items-center justify-center ${plan.color}`}>
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold">{plan.name}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">{plan.duration}</p>
                                    </div>
                                </div>
                                <div className="mb-3">
                                    {couponCode && plan.price > 0 && <span className="text-[10px] text-[var(--text-muted)] line-through mr-1">{formatCurrency(plan.price)}</span>}
                                    <span className="text-xl font-black">{plan.price === 0 ? 'Free' : formatCurrency(finalPrice)}</span>
                                </div>
                                <ul className="space-y-1">
                                    {plan.features.map((f, i) => (
                                        <li key={i} className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                            <Check size={10} className="text-emerald-500 shrink-0" /> {f}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Coupon + Purchase */}
                {selectedPlan && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
                        <div className="flex gap-2 mb-4">
                            <div className="flex-1 relative">
                                <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponDiscount(0); }}
                                    placeholder="Have a coupon?"
                                    className="w-full pl-9 pr-3 py-2 text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-lg font-mono uppercase" />
                            </div>
                            <button onClick={async () => {
                                if (!couponCode) return;
                                const { data } = await supabase.from('coupons')
                                    .select('*').eq('code', couponCode).eq('is_active', true).single();
                                if (!data) { toast.error('Invalid coupon'); return; }
                                if (data.expiry_date && new Date(data.expiry_date) < new Date()) { toast.error('Coupon expired'); return; }

                                const plan = PLANS.find(p => p.slug === selectedPlan);
                                if (!plan) return;
                                let discount = data.discount_type === 'flat' ? data.discount_value : (plan.price * data.discount_value) / 100;
                                if (data.max_discount) discount = Math.min(discount, data.max_discount);
                                setCouponDiscount(discount);
                                toast.success(`Coupon applied! ₹${discount} off`);
                            }} className="px-4 py-2 text-[11px] font-bold rounded-lg bg-[var(--primary)] text-white">Apply</button>
                        </div>
                        <button disabled={loading} onClick={handlePurchase}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-blue-500 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                            {loading ? 'Processing...' : 'Buy Now'}
                        </button>
                    </motion.div>
                )}

                {/* Contact */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                    <a href="mailto:support@tallyonmobile.com" className="p-4 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-container)] transition-colors flex items-center gap-3">
                        <Mail size={18} className="text-blue-500" />
                        <div>
                            <p className="text-sm font-bold">Email Support</p>
                            <p className="text-[10px] text-[var(--text-muted)]">support@tallyonmobile.com</p>
                        </div>
                    </a>
                    <a href="https://wa.me/919999999999" className="p-4 rounded-xl border border-emerald-500/20 hover:bg-emerald-500/5 transition-colors flex items-center gap-3">
                        <MessageCircle size={18} className="text-emerald-500" />
                        <div>
                            <p className="text-sm font-bold text-emerald-500">WhatsApp</p>
                            <p className="text-[10px] text-[var(--text-muted)]">Instant support</p>
                        </div>
                    </a>
                </div>

                {/* Recent Payments */}
                {payments.length > 0 && (
                    <div>
                        <h3 className="text-sm font-bold mb-3">Recent Payments</h3>
                        <div className="space-y-2">
                            {payments.map(p => (
                                <div key={p.id} className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold">{p.plan_slug?.replace(/_/g, ' ')?.toUpperCase()}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">{new Date(p.created_at).toLocaleDateString('en-IN')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold">{formatCurrency(p.final_amount || p.amount)}</p>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                            p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                                            p.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'
                                        }`}>{p.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
