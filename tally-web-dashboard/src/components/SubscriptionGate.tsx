import { useState } from 'react';
import { useLicenseGate } from '@/contexts/LicenseGateContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Crown, Check, X, Shield, Zap, Clock, Star,
    CreditCard, Tag, ArrowRight, Mail, MessageCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const PLANS = [
    { name: 'Monthly', slug: 'monthly', price: 299, duration: '30 days', icon: Clock, color: 'text-blue-500', popular: false },
    { name: 'Quarterly', slug: 'quarterly', price: 799, duration: '90 days', icon: Zap, color: 'text-purple-500', popular: false },
    { name: 'Yearly', slug: 'yearly', price: 2999, duration: '365 days', icon: Star, color: 'text-amber-500', popular: true },
    { name: 'Lifetime', slug: 'lifetime', price: 9999, duration: 'Forever', icon: Crown, color: 'text-emerald-500', popular: false },
];

function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
    const { license, isLoading, isReadOnly } = useLicenseGate();
    const { user } = useAuth() as any;
    const [showPlans, setShowPlans] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [couponDiscount, setCouponDiscount] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

    if (isLoading) return null;

    // If license is active and not expired, show children
    if (!isReadOnly) return <>{children}</>;

    // If expired or no license, show subscription gate
    return (
        <div className="min-h-screen bg-[var(--bg)] flex flex-col">
            {/* Expired Banner */}
            <div className="bg-gradient-to-r from-red-500/20 to-amber-500/20 border-b border-red-500/30 px-4 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield size={16} className="text-red-500" />
                        <span className="text-sm font-bold text-red-400">
                            {license.status === 'expired' ? 'Your subscription has expired' :
                             license.status === 'blocked' ? 'Account blocked' :
                             license.status === 'suspended' ? 'Account suspended' :
                             'No active subscription'}
                        </span>
                    </div>
                    <button onClick={() => setShowPlans(true)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                        Renew Now
                    </button>
                </div>
            </div>

            {/* Content — Read Only */}
            <div className="flex-1 opacity-60 pointer-events-none">
                {children}
            </div>

            {/* Subscription Plans Modal */}
            <AnimatePresence>
                {showPlans && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
                        onClick={() => setShowPlans(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] w-full max-w-lg max-h-[90vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}>

                            {/* Header */}
                            <div className="p-6 border-b border-[var(--border)] text-center">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-3">
                                    <Crown size={28} className="text-white" />
                                </div>
                                <h2 className="text-xl font-black mb-1">Upgrade Your Plan</h2>
                                <p className="text-sm text-[var(--text-muted)]">Unlock all features and sync your data</p>
                            </div>

                            {/* Plans */}
                            <div className="p-4 space-y-3">
                                {PLANS.map(plan => {
                                    const Icon = plan.icon;
                                    const finalPrice = couponCode ? Math.max(0, plan.price - couponDiscount) : plan.price;
                                    return (
                                        <div key={plan.slug}
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                                selectedPlan === plan.slug
                                                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                                                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                                            } ${plan.popular ? 'ring-2 ring-amber-500/30' : ''}`}
                                            onClick={() => setSelectedPlan(plan.slug)}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-lg bg-[var(--surface-container)] flex items-center justify-center ${plan.color}`}>
                                                        <Icon size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold">{plan.name}</span>
                                                            {plan.popular && (
                                                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">POPULAR</span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-[var(--text-muted)]">{plan.duration}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {couponCode && <span className="text-[10px] text-[var(--text-muted)] line-through">{formatCurrency(plan.price)}</span>}
                                                    <p className="text-lg font-black">{formatCurrency(finalPrice)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Coupon */}
                            <div className="px-4 pb-4">
                                <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                        <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                                            placeholder="Coupon code"
                                            className="w-full pl-9 pr-3 py-2 text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-lg font-mono uppercase" />
                                    </div>
                                    <button onClick={async () => {
                                        if (!couponCode) return;
                                        // Validate coupon
                                        const { data } = await supabase.from('coupons')
                                            .select('*')
                                            .eq('code', couponCode)
                                            .eq('is_active', true)
                                            .single();

                                        if (!data) { toast.error('Invalid coupon'); return; }
                                        if (data.expiry_date && new Date(data.expiry_date) < new Date()) { toast.error('Coupon expired'); return; }

                                        const selected = PLANS.find(p => p.slug === selectedPlan);
                                        if (!selected) { toast.error('Select a plan first'); return; }

                                        let discount = 0;
                                        if (data.discount_type === 'flat') discount = data.discount_value;
                                        else discount = (selected.price * data.discount_value) / 100;
                                        if (data.max_discount) discount = Math.min(discount, data.max_discount);

                                        setCouponDiscount(discount);
                                        toast.success(`Coupon applied! ₹${discount} off`);
                                    }} className="px-3 py-2 text-[11px] font-bold rounded-lg bg-[var(--primary)] text-white">Apply</button>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-4 border-t border-[var(--border)] space-y-2">
                                <button disabled={!selectedPlan}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-blue-500 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                                    <CreditCard size={16} /> Buy Now
                                </button>
                                <div className="flex gap-2">
                                    <a href="mailto:support@tallyonmobile.com"
                                        className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] font-bold text-[11px] flex items-center justify-center gap-1.5 hover:bg-[var(--surface-container)]">
                                        <Mail size={12} /> Contact Sales
                                    </a>
                                    <a href="https://wa.me/919999999999"
                                        className="flex-1 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-500 font-bold text-[11px] flex items-center justify-center gap-1.5 hover:bg-emerald-500/5">
                                        <MessageCircle size={12} /> WhatsApp
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
