import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Target, Zap, Shield, Users, Globe, TrendingUp, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';

const FEATURES = [
  { icon: <Zap size={20} />, title: 'Real-time Sync', desc: 'Tally data syncs to cloud in under 0.2 seconds' },
  { icon: <Shield size={20} />, title: 'Bank-grade Security', desc: 'AES-256 encryption, SOC 2 aligned architecture' },
  { icon: <Globe size={20} />, title: 'Access Anywhere', desc: 'Desktop, mobile, tablet — your data everywhere' },
  { icon: <TrendingUp size={20} />, title: 'AI Insights', desc: '20+ financial ratios, cash flow forecasting' },
  { icon: <Users size={20} />, title: 'Multi-user', desc: 'Team access with role-based permissions' },
  { icon: <Target size={20} />, title: 'GST Compliant', desc: 'GSTR-1, GSTR-3B, e-invoice ready' },
];

const STATS = [
  { value: '10K+', label: 'Active Users' },
  { value: '50M+', label: 'Vouchers Synced' },
  { value: '99.9%', label: 'Uptime' },
  { value: '4.8/5', label: 'User Rating' },
];

export default function AboutUsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SEO title="About Us | TallyOnMobile" description="TallyOnMobile - India's leading Tally cloud sync platform. Real-time Tally data on any device." canonical="https://tallyonmob.vercel.app/about" />
      
      <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--on-surface)] mb-6 transition-colors">
          <ArrowLeft size={18} /> <span className="text-sm font-bold">Back</span>
        </button>

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-[var(--on-surface)] mb-4">About TallyOnMobile</h1>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
            We're on a mission to make Tally data accessible to every business owner, accountant, and decision-maker — anytime, anywhere.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {STATS.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="text-center p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)]">
              <div className="text-3xl font-black text-indigo-400">{s.value}</div>
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Mission */}
        <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border)] mb-8">
          <h2 className="text-2xl font-black text-[var(--on-surface)] mb-4">Our Mission</h2>
          <p className="text-[var(--text-muted)] leading-relaxed mb-4">
            Tally is the backbone of Indian accounting. But accessing your financial data has been limited to one desktop, one location. We're changing that.
          </p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            TallyOnMobile bridges the gap between Tally's powerful accounting engine and modern cloud accessibility. Your data stays in Tally — we just make it visible, portable, and insightful across all your devices.
          </p>
        </div>

        {/* Why TallyOnMobile */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-[var(--on-surface)] mb-6">Why TallyOnMobile?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-indigo-500/50 transition-colors">
                <div className="text-indigo-400 mb-3">{f.icon}</div>
                <h3 className="font-bold text-[var(--on-surface)] mb-1">{f.title}</h3>
                <p className="text-xs text-[var(--text-muted)]">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Built For */}
        <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-2xl p-8 border border-indigo-500/20">
          <h2 className="text-2xl font-black text-[var(--on-surface)] mb-4">Built For</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              'Business owners who travel but need real-time financial data',
              'Accountants managing multiple client companies',
              'CA firms requiring remote Tally access for audits',
              'Sales teams needing instant invoice access on mobile',
              'Decision-makers who want dashboards on the go',
              'Enterprises with multi-location Tally deployments',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-sm text-[var(--text-muted)]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
