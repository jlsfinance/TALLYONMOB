import { useState, useEffect } from 'react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/common/SEO';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight, ArrowLeft, Smartphone, Monitor, Cloud, Zap, Shield, CheckCircle,
    Database, Lock, Users, Activity, Mail, Sparkles, BarChart3, FileText,
    ChevronDown, ChevronRight, Share2, Scale, ShieldCheck, Send, Receipt,
    CreditCard, Bot, ScanLine, Building2, IndianRupee, Globe, Wifi,
    Eye, EyeOff, RefreshCw, Download, Upload, Camera, MessageCircle,
    Briefcase, Calculator, TrendingUp, TrendingDown, Clock, Star,
    Check, X, Crown, Zap as ZapIcon, Package, Truck, AlertTriangle,
    Settings, Bell, PieChart, LineChart, FileSpreadsheet, Repeat
} from 'lucide-react';

const GITHUB_DOWNLOADS = {
    pc: 'https://github.com/jlsfinance/TALLYONMOB/releases/latest/download/TallyLink.exe',
    android: 'https://github.com/jlsfinance/TALLYONMOB/releases/latest/download/TallyLink.apk',
    releases: 'https://github.com/jlsfinance/TALLYONMOB/releases/latest',
};

const PRICING_PLANS = [
    {
        name: 'Starter',
        price: 'Free',
        period: 'forever',
        desc: 'For small businesses getting started',
        color: 'from-slate-500 to-slate-600',
        features: [
            '1 Company', '100 Vouchers/month', 'Basic Dashboard',
            'Ledger View', 'Voucher Entry', 'CSV Export',
            'Mobile App Access', 'Email Support'
        ],
        unavailable: ['AI Insights', 'Custom Reports', 'Multi-user', 'WhatsApp Sending', 'Priority Support', 'API Access'],
        cta: 'Start Free',
        popular: false
    },
    {
        name: 'Professional',
        price: '₹999',
        period: '/month',
        desc: 'For growing businesses',
        color: 'from-cyan-500 to-blue-600',
        features: [
            '5 Companies', 'Unlimited Vouchers', 'AI Business Insights',
            'Custom Reports Builder', 'Multi-user (3 seats)', 'WhatsApp Invoice Sending',
            'Bank Reconciliation', 'TDS/TCS Management', 'GST Reports',
            'E-Way Bill', 'Priority Support', 'API Access'
        ],
        unavailable: ['Unlimited Users', 'White-label', 'Dedicated Manager'],
        cta: 'Start 14-day Trial',
        popular: true
    },
    {
        name: 'Enterprise',
        price: '₹2,999',
        period: '/month',
        desc: 'For large organizations',
        color: 'from-amber-500 to-orange-600',
        features: [
            'Unlimited Companies', 'Unlimited Vouchers', 'Everything in Pro',
            'Unlimited Users', 'White-label App', 'Custom Integrations',
            'Dedicated Account Manager', 'SLA 99.9% Uptime',
            'On-premise Deployment', 'Custom Training'
        ],
        unavailable: [],
        cta: 'Contact Sales',
        popular: false
    }
];

const FEATURES = [
    { icon: <RefreshCw size={22} />, title: 'Real-time Tally Sync', desc: '0.2s bidirectional sync between Tally and cloud', category: 'sync' },
    { icon: <Bot size={22} />, title: 'AI Business Insights', desc: '20+ financial ratios, cash flow forecasting', category: 'ai' },
    { icon: <ScanLine size={22} />, title: 'OCR Invoice Scanner', desc: 'Camera → extract data → auto-create vouchers', category: 'ai' },
    { icon: <MessageCircle size={22} />, title: 'WhatsApp Invoices', desc: 'Send PDF invoices via WhatsApp with one click', category: 'communication' },
    { icon: <FileSpreadsheet size={22} />, title: 'Bank Import (CSV/OFX/QIF)', desc: 'Auto-reconcile bank statements with vouchers', category: 'banking' },
    { icon: <PieChart size={22} />, title: 'Custom Dashboard Builder', desc: 'Drag-and-drop KPI widgets, fully customizable', category: 'reporting' },
    { icon: <Receipt size={22} />, title: 'Petty Cash Management', desc: 'Track small expenses, daily cash entries', category: 'accounting' },
    { icon: <Briefcase size={22} />, title: 'Payroll Integration', desc: 'Employee salary processing, PF/ESI calculation', category: 'hr' },
    { icon: <Shield size={22} />, title: 'TDS/TCS Management', desc: 'Auto-calculate, track, and file TDS/TCS returns', category: 'compliance' },
    { icon: <FileText size={22} />, title: 'GST Reports', desc: 'GSTR-1, GSTR-3B, HSN-wise summaries', category: 'compliance' },
    { icon: <CreditCard size={22} />, title: 'UPI Payments', desc: 'Collect payments via UPI, auto-reconcile', category: 'banking' },
    { icon: <Send size={22} />, title: 'Email Invoices', desc: 'Professional PDF invoices via email', category: 'communication' },
    { icon: <Users size={22} />, title: 'Multi-user & RBAC', desc: 'Role-based access, approval workflows', category: 'admin' },
    { icon: <BarChart3 size={22} />, title: 'Sales Analytics', desc: 'Trends, forecasting, team performance', category: 'reporting' },
    { icon: <Globe size={22} />, title: 'Multi-company', desc: 'Consolidated reports across all companies', category: 'accounting' },
    { icon: <Lock size={22} />, title: 'Bank-grade Security', desc: 'AES-256 encryption, ISO 27001 compliant', category: 'security' },
];

const JOURNEY_STEPS = [
    {
        step: 1,
        title: 'Tally Desktop',
        subtitle: 'Your Accounting Data',
        desc: 'All your vouchers, ledgers, stock items, and reports live in Tally ERP 9 or TallyPrime on your Windows PC.',
        icon: <Monitor size={28} />,
        color: 'from-blue-500 to-indigo-600',
        details: ['Vouchers (Sales, Purchase, Receipt, Payment)', 'Ledgers & Groups', 'Stock Items & Inventory', 'GST & Tax Data']
    },
    {
        step: 2,
        title: 'TallyLink Sync App',
        subtitle: 'Windows Background Service',
        desc: 'Our lightweight Windows app runs in the background, continuously syncing your Tally data to the cloud via secure API.',
        icon: <ArrowRight size={28} />,
        color: 'from-cyan-500 to-teal-600',
        details: ['Runs as Windows Service', 'Auto-detects Tally changes', 'Encrypted transmission (TLS 1.3)', 'Offline queue with auto-retry'],
        download: { url: GITHUB_DOWNLOADS.releases, label: 'Download for Windows', icon: <Monitor size={14} /> }
    },
    {
        step: 3,
        title: 'TallyLink Cloud',
        subtitle: 'Secure Cloud Storage',
        desc: 'Your data is encrypted and stored in Indian data centers. Always available, always synced, always secure.',
        icon: <Cloud size={28} />,
        color: 'from-purple-500 to-violet-600',
        details: ['AES-256 encryption at rest', '99.9% uptime SLA', 'Indian data centers (Mumbai)', 'Automatic backups']
    },
    {
        step: 4,
        title: 'Web Dashboard & Mobile App',
        subtitle: 'Access Anywhere',
        desc: 'View dashboards, create vouchers, send invoices, and manage your business from any device — laptop, tablet, or phone.',
        icon: <Smartphone size={28} />,
        color: 'from-emerald-500 to-green-600',
        details: ['React Web Dashboard', 'Android & iOS Apps', 'Offline mode available', 'Real-time data refresh'],
        download: { url: GITHUB_DOWNLOADS.releases, label: 'Download Android APK', icon: <Smartphone size={14} /> }
    },
    {
        step: 5,
        title: 'Sync Back to Tally',
        subtitle: 'Bidirectional Sync',
        desc: 'Vouchers created on the web/app are instantly synced back to your Tally desktop. Your books are always up-to-date.',
        icon: <ArrowLeft size={28} />,
        color: 'from-amber-500 to-orange-600',
        details: ['Auto-sync new vouchers', 'Update existing entries', 'Conflict resolution', 'Real-time status indicator']
    }
];

export default function LandingPage() {
    const { navigate } = useSafeNavigate();
    const { user, loading: authLoading } = useAuth() as any;
    const [activeFeature, setActiveFeature] = useState(0);
    const [activeJourney, setActiveJourney] = useState(0);
    const [activeFaq, setActiveFaq] = useState<number | null>(null);
    const [annualBilling, setAnnualBilling] = useState(false);

    useEffect(() => {
        if (!authLoading && user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, authLoading, navigate]);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveJourney(prev => (prev + 1) % JOURNEY_STEPS.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const faqs = [
        { q: 'How does Tally sync work?', a: 'Our Windows app runs as a background service, detecting changes in your Tally data every few seconds. Changes are encrypted and sent to our cloud servers via TLS 1.3. Your web dashboard and mobile app then fetch this data in real-time.' },
        { q: 'Is my financial data secure?', a: 'Yes. We use AES-256 encryption for data at rest and TLS 1.3 for data in transit. All data centers are located in India (Mumbai). We are ISO 27001 compliant and follow RBI data localization guidelines.' },
        { q: 'Can I create vouchers from the web/app?', a: 'Absolutely. You can create Sales, Purchase, Receipt, Payment, Journal, and Contra vouchers from the web dashboard or mobile app. These are instantly synced back to your Tally desktop.' },
        { q: 'What if Tally is offline?', a: 'Our sync app has an offline queue. If your PC or Tally is offline, changes are queued locally and automatically synced when connection is restored. You can also use the web/app in offline mode.' },
        { q: 'Do you support TallyPrime?', a: 'Yes, we support both Tally ERP 9 and TallyPrime. The sync works seamlessly with both versions.' },
        { q: 'How does AI-powered bank reconciliation work?', a: 'Our AI engine analyzes your bank statement entries and automatically matches them with existing vouchers based on amount, date, narration, and party name. It learns from your matching patterns to improve accuracy over time.' },
    ];

    return (
        <div className="bg-[#0A0C10] text-white selection:bg-cyan-500/30 font-sans overflow-x-hidden min-h-screen">
            <SEO title="TallyLink Cloud — Real-time Tally Sync & Business Management" description="Sync Tally ERP 9/TallyPrime to cloud in 0.2s. Access dashboards, send invoices via WhatsApp, AI-powered insights, and manage your business from anywhere." />

            {/* ===== HEADER ===== */}
            <header className="fixed top-0 w-full bg-[#111318]/80 backdrop-blur-xl border-b border-white/10 z-50">
                <div className="flex justify-between items-center h-16 px-4 md:px-8 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="text-sm font-black italic text-white">TL</span>
                        </div>
                        <span className="text-base font-black uppercase tracking-widest hidden sm:block">TallyLink</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-slate-400">
                        <button onClick={() => document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">How it Works</button>
                        <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Features</button>
                        <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Pricing</button>
                        <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">FAQ</button>
                    </nav>
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/login')} className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors">Login</button>
                        <button onClick={() => navigate('/login')} className="group px-4 py-2 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] text-xs font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                            Get Started <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ===== HERO ===== */}
            <section className="pt-28 pb-16 px-4 md:px-8 max-w-7xl mx-auto">
                <div className="text-center space-y-6 max-w-3xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                        <Zap size={11} className="text-cyan-300" />
                        <span>0.2s Real-time Sync • Made in India</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
                        Your Tally, <br className="hidden md:block" />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-cyan-400 to-emerald-300">
                            Everywhere.
                        </span>
                    </h1>
                    <p className="text-base md:text-lg text-slate-400 font-medium leading-relaxed max-w-xl mx-auto">
                        Sync Tally ERP 9 & TallyPrime to cloud in real-time. Access dashboards, send invoices via WhatsApp, AI-powered insights — all from any device.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => navigate('/login')} className="group px-8 py-4 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] rounded-xl text-sm font-black uppercase tracking-wider hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl shadow-cyan-400/25">
                            Start Free <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button onClick={() => document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' })} className="px-8 py-4 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-bold transition-all flex items-center justify-center gap-3">
                            See How it Works <ChevronDown size={16} />
                        </button>
                    </div>
                    {/* Download Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
                        <a href={GITHUB_DOWNLOADS.releases} target="_blank" rel="noopener noreferrer"
                            className="group px-6 py-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-sm font-bold transition-all flex items-center justify-center gap-2 text-cyan-200">
                            <Monitor size={16} /> Download for Windows
                        </a>
                        <a href={GITHUB_DOWNLOADS.releases} target="_blank" rel="noopener noreferrer"
                            className="group px-6 py-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-sm font-bold transition-all flex items-center justify-center gap-2 text-emerald-200">
                            <Smartphone size={16} /> Download Android APK
                        </a>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 max-w-4xl mx-auto">
                    {[
                        { label: 'Active Businesses', value: '15,000+', icon: <Building2 size={18} className="text-cyan-400" /> },
                        { label: 'Vouchers Synced', value: '2.5 Cr+', icon: <RefreshCw size={18} className="text-emerald-400" /> },
                        { label: 'Sync Speed', value: '0.2s', icon: <Zap size={18} className="text-amber-400" /> },
                        { label: 'Data Security', value: 'AES-256', icon: <Shield size={18} className="text-sky-400" /> }
                    ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-md text-center">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-2">{stat.icon}</div>
                            <h3 className="text-xl font-black text-white">{stat.value}</h3>
                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mt-0.5">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ===== DATA JOURNEY ===== */}
            <section id="journey" className="py-20 px-4 md:px-8 border-t border-white/5">
                <div className="max-w-7xl mx-auto space-y-12">
                    <div className="text-center space-y-3">
                        <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">Data Flow</p>
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight">How Your Data Travels</h2>
                        <p className="text-sm text-slate-400 max-w-lg mx-auto">From your Tally desktop to the cloud and back — every step is encrypted, fast, and reliable.</p>
                    </div>

                    {/* Journey Timeline */}
                    <div className="relative">
                        {/* Desktop Timeline */}
                        <div className="hidden md:flex items-center justify-between relative px-8">
                            <div className="absolute top-8 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-green-500 rounded-full opacity-30" />
                            {JOURNEY_STEPS.map((step, i) => (
                                <div key={i} className="relative flex flex-col items-center cursor-pointer group" onClick={() => setActiveJourney(i)}>
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${activeJourney === i ? `bg-gradient-to-br ${step.color} scale-110 shadow-2xl` : 'bg-slate-800 border border-white/10 group-hover:border-cyan-400/30'}`}>
                                        {step.icon}
                                    </div>
                                    <p className={`mt-3 text-xs font-bold transition-colors ${activeJourney === i ? 'text-white' : 'text-slate-500'}`}>{step.title}</p>
                                </div>
                            ))}
                        </div>

                        {/* Active Step Detail */}
                        <div className="mt-8 md:mt-12">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeJourney}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="p-6 md:p-8 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl"
                                >
                                    <div className="flex flex-col md:flex-row gap-6 items-start">
                                        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${JOURNEY_STEPS[activeJourney].color} flex items-center justify-center shrink-0 shadow-xl`}>
                                            {JOURNEY_STEPS[activeJourney].icon}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">Step {JOURNEY_STEPS[activeJourney].step}</span>
                                                <span className="text-[10px] text-slate-500">•</span>
                                                <span className="text-[10px] text-slate-500 font-bold">{JOURNEY_STEPS[activeJourney].subtitle}</span>
                                            </div>
                                            <h3 className="text-xl font-black mb-2">{JOURNEY_STEPS[activeJourney].title}</h3>
                                            <p className="text-sm text-slate-400 mb-4">{JOURNEY_STEPS[activeJourney].desc}</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {JOURNEY_STEPS[activeJourney].details.map((d, j) => (
                                                    <div key={j} className="flex items-center gap-2 text-xs text-slate-300">
                                                        <Check size={12} className="text-emerald-400 shrink-0" />
                                                        {d}
                                                    </div>
                                                ))}
                                            </div>
                                            {JOURNEY_STEPS[activeJourney].download && (
                                                <a href={JOURNEY_STEPS[activeJourney].download!.url} target="_blank" rel="noopener noreferrer"
                                                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white transition-all">
                                                    {JOURNEY_STEPS[activeJourney].download!.icon}
                                                    {JOURNEY_STEPS[activeJourney].download!.label}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Mobile Journey */}
                        <div className="md:hidden mt-6 space-y-3">
                            {JOURNEY_STEPS.map((step, i) => (
                                <div key={i} className={`p-4 rounded-xl border transition-all ${activeJourney === i ? 'border-cyan-400/30 bg-cyan-500/5' : 'border-white/5 bg-slate-900/30'}`} onClick={() => setActiveJourney(i)}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shrink-0`}>{step.icon}</div>
                                        <div>
                                            <p className="text-[10px] text-cyan-400 font-bold">Step {step.step}</p>
                                            <p className="text-sm font-bold">{step.title}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== FEATURES GRID ===== */}
            <section id="features" className="py-20 px-4 md:px-8 border-t border-white/5 bg-slate-950/50">
                <div className="max-w-7xl mx-auto space-y-12">
                    <div className="text-center space-y-3">
                        <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">Powerful Features</p>
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight">Everything You Need</h2>
                        <p className="text-sm text-slate-400 max-w-lg mx-auto">From basic accounting to AI-powered insights — TallyLink has it all.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {FEATURES.map((feat, i) => (
                            <div key={i} className="group p-5 rounded-2xl border border-white/5 bg-slate-900/30 hover:border-cyan-400/20 hover:bg-slate-900/50 transition-all cursor-pointer">
                                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-3 group-hover:bg-cyan-500/20 transition-colors">
                                    {feat.icon}
                                </div>
                                <h3 className="text-sm font-black mb-1">{feat.title}</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== PRICING ===== */}
            <section id="pricing" className="py-20 px-4 md:px-8 border-t border-white/5">
                <div className="max-w-7xl mx-auto space-y-12">
                    <div className="text-center space-y-3">
                        <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">Simple Pricing</p>
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight">Choose Your Plan</h2>
                        <p className="text-sm text-slate-400 max-w-lg mx-auto">Start free, upgrade when you need more. No hidden fees.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {PRICING_PLANS.map((plan, i) => (
                            <div key={i} className={`relative p-6 rounded-2xl border transition-all ${plan.popular ? 'border-cyan-400/30 bg-gradient-to-b from-cyan-500/5 to-transparent shadow-2xl shadow-cyan-500/5 scale-[1.02]' : 'border-white/5 bg-slate-900/30 hover:border-white/10'}`}>
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 text-[10px] font-black uppercase tracking-wider text-white">
                                        Most Popular
                                    </div>
                                )}
                                <div className="mb-6">
                                    <h3 className="text-lg font-black">{plan.name}</h3>
                                    <p className="text-xs text-slate-500 mt-1">{plan.desc}</p>
                                    <div className="mt-4 flex items-baseline gap-1">
                                        <span className="text-3xl font-black">{plan.price}</span>
                                        {plan.period !== 'forever' && <span className="text-sm text-slate-500">{plan.period}</span>}
                                    </div>
                                </div>
                                <button onClick={() => navigate('/login')} className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all mb-6 ${plan.popular ? 'bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] hover:scale-[1.02]' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}>
                                    {plan.cta}
                                </button>
                                <div className="space-y-2.5">
                                    {plan.features.map((f, j) => (
                                        <div key={j} className="flex items-center gap-2 text-xs text-slate-300">
                                            <Check size={14} className="text-emerald-400 shrink-0" />
                                            {f}
                                        </div>
                                    ))}
                                    {plan.unavailable.map((f, j) => (
                                        <div key={j} className="flex items-center gap-2 text-xs text-slate-600">
                                            <X size={14} className="text-slate-700 shrink-0" />
                                            {f}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== FAQ ===== */}
            <section id="faq" className="py-20 px-4 md:px-8 border-t border-white/5 bg-slate-950/50">
                <div className="max-w-3xl mx-auto space-y-8">
                    <div className="text-center space-y-3">
                        <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">FAQ</p>
                        <h2 className="text-3xl font-black tracking-tight">Frequently Asked Questions</h2>
                    </div>
                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <div key={i} className="rounded-2xl border border-white/5 bg-slate-900/30 overflow-hidden">
                                <button onClick={() => setActiveFaq(activeFaq === i ? null : i)} className="w-full px-6 py-4 flex justify-between items-center text-left font-bold text-sm text-white hover:bg-white/[0.02] transition-colors">
                                    {faq.q}
                                    <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 shrink-0 ml-4 ${activeFaq === i ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {activeFaq === i && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="px-6 pb-4 text-xs text-slate-400 leading-relaxed">
                                            {faq.a}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== CTA ===== */}
            <section className="py-20 px-4 md:px-8 border-t border-white/5">
                <div className="max-w-3xl mx-auto text-center space-y-6">
                    <h2 className="text-3xl md:text-4xl font-black tracking-tight">Ready to Transform Your Business?</h2>
                    <p className="text-sm text-slate-400">Join 15,000+ businesses already using TallyLink to manage their accounts from anywhere.</p>
                    <button onClick={() => navigate('/login')} className="group px-8 py-4 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#00363e] rounded-xl text-sm font-black uppercase tracking-wider hover:scale-[1.02] transition-all inline-flex items-center gap-3 shadow-xl shadow-cyan-400/25">
                        Start Free Now <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </section>

            {/* ===== FOOTER ===== */}
            <footer className="bg-slate-950/80 border-t border-white/10 py-12 px-4 md:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-xs font-black text-[#00363e]">TL</div>
                                <span className="text-sm font-black uppercase tracking-widest">TallyLink</span>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">Real-time Tally sync for modern businesses.</p>
                        </div>
                        <div>
                            <h5 className="text-xs font-black uppercase tracking-wider text-cyan-400 mb-3">Product</h5>
                            <ul className="space-y-2 text-xs text-slate-400">
                                <li><button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Features</button></li>
                                <li><button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Pricing</button></li>
                                <li><button onClick={() => document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">How it Works</button></li>
                                <li><a href={GITHUB_DOWNLOADS.releases} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1"><Monitor size={10} /> Windows App</a></li>
                                <li><a href={GITHUB_DOWNLOADS.releases} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1"><Smartphone size={10} /> Android APK</a></li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="text-xs font-black uppercase tracking-wider text-cyan-400 mb-3">Legal</h5>
                            <ul className="space-y-2 text-xs text-slate-400">
                                <li><button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">Privacy Policy</button></li>
                                <li><button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Terms & Conditions</button></li>
                                <li><button onClick={() => navigate('/refund')} className="hover:text-white transition-colors">Refund Policy</button></li>
                                <li><button onClick={() => navigate('/legal/cancellation-policy')} className="hover:text-white transition-colors">Cancellation Policy</button></li>
                                <li><button onClick={() => navigate('/legal/licensing-policy')} className="hover:text-white transition-colors">Licensing Policy</button></li>
                                <li><button onClick={() => navigate('/legal/cookie-policy')} className="hover:text-white transition-colors">Cookie Policy</button></li>
                                <li><button onClick={() => navigate('/legal/data-deletion-policy')} className="hover:text-white transition-colors">Data Deletion</button></li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="text-xs font-black uppercase tracking-wider text-cyan-400 mb-3">Support</h5>
                            <ul className="space-y-2 text-xs text-slate-400">
                                <li><button onClick={() => navigate('/support')} className="hover:text-white transition-colors">Help Center</button></li>
                                <li><button onClick={() => navigate('/legal/support-policy')} className="hover:text-white transition-colors">Support Policy</button></li>
                                <li><button onClick={() => navigate('/security')} className="hover:text-white transition-colors">Security</button></li>
                                <li><button onClick={() => navigate('/trust-center')} className="hover:text-white transition-colors">Trust Center</button></li>
                                <li><button onClick={() => navigate('/contact')} className="hover:text-white transition-colors">Contact Us</button></li>
                                <li><button onClick={() => navigate('/about')} className="hover:text-white transition-colors">About Us</button></li>
                                <li><button onClick={() => navigate('/pricing')} className="hover:text-white transition-colors">Pricing</button></li>
                            </ul>
                        </div>
                    </div>
                    <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        <p>© 2026 TallyLink Technologies. All rights reserved.</p>
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1"><ShieldCheck size={10} /> AES-256 Encrypted</span>
                            <span className="flex items-center gap-1"><Lock size={10} /> ISO 27001</span>
                            <span className="flex items-center gap-1"><Globe size={10} /> India Data Centers</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
