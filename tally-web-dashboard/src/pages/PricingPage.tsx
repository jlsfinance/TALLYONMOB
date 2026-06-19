import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Check, Zap, Crown, Building2, Star, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const PLANS = [
  {
    name: 'Trial', price: 'Free', priceInPaise: 0, duration: '7 days', icon: <Zap size={20} />,
    features: ['1 Company', '1,000 Vouchers', 'Basic Reports', 'Mobile Access', 'Email Support'],
    cta: 'Start Free Trial', color: 'border-slate-500/30', popular: false, planId: 'trial',
  },
  {
    name: 'Monthly', price: '₹99', priceInPaise: 9900, duration: '/month', icon: <Star size={20} />,
    features: ['1 Company', '100 Vouchers/day', 'All Reports', 'WhatsApp Share', 'Email Invoices', 'Priority Support'],
    cta: 'Subscribe Now', color: 'border-indigo-500/50', popular: true, planId: 'monthly',
  },
  {
    name: 'Quarterly', price: '₹249', priceInPaise: 24900, duration: '/quarter', badge: 'Save 16%', icon: <Star size={20} />,
    features: ['2 Companies', 'Unlimited Vouchers', 'Advanced Analytics', 'Priority Support', 'GST Filing', 'Data Export'],
    cta: 'Subscribe Now', color: 'border-emerald-500/50', popular: false, planId: 'quarterly',
  },
  {
    name: 'Half Yearly', price: '₹499', priceInPaise: 49900, duration: '/6 months', badge: 'Save 17%', icon: <Star size={20} />,
    features: ['3 Companies', 'Unlimited Vouchers', 'Advanced Analytics', 'Priority Support', 'GST Filing', 'Data Export'],
    cta: 'Subscribe Now', color: 'border-purple-500/50', popular: false, planId: 'half_yearly',
  },
  {
    name: 'Yearly', price: '₹999', priceInPaise: 99900, duration: '/year', badge: 'Save 17%', icon: <Crown size={20} />,
    features: ['5 Companies', 'Unlimited Everything', 'AI Insights', 'Custom Templates', 'Dedicated Support', 'GST Filing', 'API Access'],
    cta: 'Subscribe Now', color: 'border-amber-500/50', popular: false, planId: 'yearly',
  },
  {
    name: 'Lifetime', price: '₹4,999', priceInPaise: 499900, duration: 'forever', badge: 'Best Value', icon: <Crown size={20} />,
    features: ['Unlimited Companies', 'Unlimited Everything', 'AI Insights', 'Custom Templates', 'Dedicated Support', 'Free Updates', 'Lifetime Access'],
    cta: 'Buy Lifetime', color: 'border-emerald-500/50', popular: false, planId: 'lifetime',
  },
  {
    name: 'Enterprise', price: 'Custom', priceInPaise: 0, duration: 'per year', icon: <Building2 size={20} />,
    features: ['Unlimited Companies', 'Unlimited Vouchers', 'All Features', 'Dedicated Support', 'Custom Integrations', 'SLA Guarantee', 'On-premise Option', 'Training Sessions'],
    cta: 'Contact Sales', color: 'border-violet-500/50', popular: false, planId: 'enterprise',
  },
];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (plan: typeof PLANS[0]) => {
    if (plan.planId === 'trial') {
      navigate('/subscription');
      return;
    }
    if (plan.planId === 'enterprise') {
      window.open('mailto:lovneetrathi@gmail.com?subject=Enterprise%20Plan%20Inquiry', '_blank');
      return;
    }

    if (!user) {
      toast.error('Please sign in to subscribe');
      navigate('/login');
      return;
    }

    setLoadingPlan(plan.planId);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Failed to load payment gateway. Check your internet.');
        setLoadingPlan(null);
        return;
      }

      const razorpay = new window.Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: plan.priceInPaise,
        currency: 'INR',
        name: 'SYNCORA TallyOnMobile',
        description: `${plan.name} Plan - ${plan.price}${plan.duration}`,
        prefill: {
          email: user.email || '',
          contact: '',
        },
        theme: {
          color: '#6366f1',
        },
        handler: function (response: any) {
          toast.success('Payment successful! Activating your plan...');
          setLoadingPlan(null);
          navigate('/subscription?payment=success&payment_id=' + response.razorpay_payment_id);
        },
        modal: {
          ondismiss: function () {
            setLoadingPlan(null);
          },
        },
      });
      razorpay.open();
    } catch (err: any) {
      console.error('Razorpay error:', err);
      toast.error('Payment failed: ' + (err.message || 'Unknown error'));
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SEO title="Pricing | SYNCORA TallyOnMobile" description="Simple, transparent pricing for SYNCORA TallyOnMobile. Start free, upgrade when ready. All plans include real-time Tally sync." canonical="https://tallyonmob.vercel.app/pricing" />
      
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
              <button 
                onClick={() => handleSubscribe(plan)}
                disabled={loadingPlan === plan.planId}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${plan.popular ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--on-surface)] hover:border-indigo-500/50'}`}>
                {loadingPlan === plan.planId ? (
                  <><Loader2 size={14} className="animate-spin" /> Processing...</>
                ) : plan.cta}
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
