import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Target, Zap, Shield, Users, Globe, TrendingUp, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';

const FEATURES = [
  { icon: <Zap size={20} />, title: 'Windows Connector', desc: 'Sync company data from the Windows PC running Tally.' },
  { icon: <Shield size={20} />, title: 'Account Access', desc: 'Sign in to view the companies connected to your account.' },
  { icon: <Globe size={20} />, title: 'Access Anywhere', desc: 'Desktop, mobile, tablet — your data everywhere' },
  { icon: <TrendingUp size={20} />, title: 'Business Reports', desc: 'Review sales, purchases, stock and balances after sync.' },
  { icon: <Users size={20} />, title: 'Multi-user', desc: 'Team access with role-based permissions' },
  { icon: <Target size={20} />, title: 'Vouchers and Ledgers', desc: 'Look up vouchers and review customer and supplier balances.' },
];

export default function AboutUsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SEO title="About Us | SYNCORA TallyOnMobile" description="SYNCORA TallyOnMobile - Connect Tally company data to Syncora for viewing on mobile and web." canonical="https://tallyonmob.vercel.app/about" />
      
      <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--on-surface)] mb-6 transition-colors">
          <ArrowLeft size={18} /> <span className="text-sm font-bold">Back</span>
        </button>

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-[var(--on-surface)] mb-4">About SYNCORA TallyOnMobile</h1>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
            We're on a mission to make Tally data accessible to every business owner, accountant, and decision-maker — anytime, anywhere.
          </p>
        </div>

        {/* Mission */}
        <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border)] mb-8">
          <h2 className="text-2xl font-black text-[var(--on-surface)] mb-4">Our Mission</h2>
          <p className="text-[var(--text-muted)] leading-relaxed mb-4">
            Tally is the backbone of Indian accounting. But accessing your financial data has been limited to one desktop, one location. We're changing that.
          </p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            SYNCORA TallyOnMobile bridges the gap between Tally's powerful accounting engine and modern cloud accessibility. Your original books remain in Tally. The connector syncs selected company data so you can open it in Syncora.
          </p>
        </div>

        {/* Why TallyOnMobile */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-[var(--on-surface)] mb-6">Why SYNCORA TallyOnMobile?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <motion.div key={f.title} initial={false}
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
              'Business owners who travel and need to check synced financial data',
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
