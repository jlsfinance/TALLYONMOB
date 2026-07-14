import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Zap, Crown, Building2, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';

const PLANS = [
  {
    name: 'Trial', price: 'Free', duration: '7 days', icon: <Zap size={20} />,
    features: ['1 Company', '1,000 Vouchers', 'Basic Reports', 'Mobile Access', 'Email Support'],
    cta: 'Start Free Trial', color: 'border-slate-500/30', popular: false,
  },
  {
    name: 'Monthly', price: '₹299', duration: '/month', icon: <Star size={20} />,
    features: ['3 Companies', 'Unlimited Vouchers', 'All Reports', 'AI Insights', 'WhatsApp Alerts', 'Priority Support', 'GST Reports'],
    cta: 'Subscribe Now', color: 'border-indigo-500/50', popular: true,
  },
  {
    name: 'Quarterly', price: '₹799', duration: '/quarter', badge: 'Save 11%', icon: <Star size={20} />,
    features: ['5 Companies', 'Unlimited Vouchers', 'All Reports', 'AI Insights', 'WhatsApp Alerts', 'Priority Support', 'GST Reports', 'Data Export'],
    cta: 'Subscribe Now', color: 'border-emerald-500/50', popular: false,
  },
  {
    name: 'Yearly', price: '₹2,999', duration: '/year', badge: 'Save 17%', icon: <Crown size={20} />,
    features: ['10 Companies', 'Unlimited Vouchers', 'All Reports', 'AI Insights', 'WhatsApp Alerts', 'Priority Support', 'GST Reports', 'Data Export', 'API Access', 'Custom Reports'],
    cta: 'Subscribe Now', color: 'border-amber-500/50', popular: false,
  },
  {
    name: 'Enterprise', price: 'Custom', duration: 'per year', icon: <Building2 size={20} />,
    features: ['Unlimited Companies', 'Unlimited Vouchers', 'All Features', 'Dedicated Support', 'Custom Integrations', 'SLA Guarantee', 'On-premise Option', 'Training Sessions'],
    cta: 'Contact Sales', color: 'border-violet-500/50', popular: false,
  },
];

export default function PricingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SEO title="Pricing | TallyOnMobile" description="Simple, transparent pricing for TallyOnMobile. Start free, upgrade when ready. All plans include real-time Tally sync." canonical="https://tallyonmob.vercel.app/pricing" />
      
      <div className="max-w-6xl mx-auto px-4 py-8 pb-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--on-surface)] mb-6 transition-colors">
          <ArrowLeft size={18} /> <span className="text-sm font-bold">Back</span>
        </button>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-[var(--on-surface)] mb-3">Simple, Transparent Pricing</h1>
          <p className="text-[var(--text-muted)] max-w-xl mx-auto">Start free with 7-day trial. No credit card required. Upgrade anytime.</p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-10">
          {PLANS.map((plan, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={`relative p-5 rounded-2xl bg-[var(--surface)] border ${plan.color} ${plan.popular ? 'ring-2 ring-indigo-500/50' : ''} transition-all hover:scale-[1.02]`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-600 text-[10px] font-bold text-white uppercase tracking-wider">Most Popular</div>
              )}
              {plan.badge && (
                <div className="absolute -top-3 right-4 px-2 py-0.5 rounded-full bg-emerald-600 text-[10px] font-bold text-white">{plan.badge}</div>
              )}
              <div className="text-indigo-400 mb-2">{plan.icon}</div>
              <h3 className="font-bold text-[var(--on-surface)]">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-black text-[var(--on-surface)]">{plan.price}</span>
                <span className="text-xs text-[var(--text-muted)]">{plan.duration}</span>
              </div>
              <ul className="space-y-2 mb-5">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Check size={12} className="text-emerald-400 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate('/subscription')}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${plan.popular ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--on-surface)] hover:border-indigo-500/50'}`}>
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>

        {/* GST Note */}
        <div className="bg-[var(--surface)] rounded-2xl p-6 border border-[var(--border)] text-center">
          <p className="text-sm text-[var(--text-muted)]">
            All prices are exclusive of 18% GST. Coupons and discounts may apply at checkout.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Payments powered by Razorpay. Secure, PCI-DSS compliant. UPI, Cards, Netbanking accepted.
          </p>
        </div>
      </div>
    </div>
  );
}
