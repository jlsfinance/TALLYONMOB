import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { companyApi, portalApi } from '@/lib/supabase';
import SEO from '../components/common/SEO';
import { motion, useScroll, useTransform, useInView, Variants, AnimatePresence } from 'framer-motion';
import {
    ArrowRight,
    Smartphone,
    Monitor,
    Cloud,
    Zap,
    Shield,
    RefreshCw,
    CheckCircle,
    Database,
    Lock,
    Users,
    Activity,
    Mail,
    Sparkles,
    BarChart3,
    FileText,
    Play,
    ChevronDown,
    MessageSquare,
    Send
} from 'lucide-react';
import ThreeDHeroScene from '../components/landing/ThreeDHeroScene';
import CustomCursor from '../components/landing/CustomCursor';
import SmoothLoader from '../components/landing/SmoothLoader';

// --- Animation Variants ---
const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const revealVariant: Variants = {
    hidden: { scale: 0.95, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
};

// --- Components ---

function MetricCard({ label, value, suffix, icon, delay = 0 }: any) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    return (
        <motion.div
            ref={ref}
            variants={revealVariant}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ delay }}
            className="relative group p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-3xl overflow-hidden hover:bg-white/[0.04] transition-all duration-500 hover:border-white/10"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-cyan-400">
                    {icon}
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white tracking-tight">
                        {isInView ? value : '0'}
                    </span>
                    <span className="text-xl font-bold text-cyan-500">{suffix}</span>
                </div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">{label}</p>
            </div>
        </motion.div>
    );
}

function FeatureCard({ title, desc, icon, gradient, index }: any) {
    return (
        <motion.div
            variants={fadeInUp}
            whileHover={{ y: -10 }}
            className={`relative group p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden transition-all duration-500`}
        >
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-30 transition-opacity duration-700`} />
            <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 text-white group-hover:scale-110 group-hover:bg-white/10 transition-all duration-500">
                    {icon}
                </div>
                <h3 className="text-xl font-black text-white mb-3 tracking-tight">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed font-medium">{desc}</p>
            </div>
        </motion.div>
    );
}

// --- Main Page ---

export default function LandingPage3D() {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth() as any;
    const heroRef = useRef(null);
    const [downloadUrl, setDownloadUrl] = useState('https://github.com/jlsfinance/TALLYONMOB/releases/latest/download/TallyLinkSetup.exe');
    const [use3DHero, setUse3DHero] = useState(false);
    const { scrollYProgress } = useScroll();

    // Parallax Effects
    const yHero = useTransform(scrollYProgress, [0, 0.5], [0, -150]);
    const opacityHero = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

    useEffect(() => {
        if (!authLoading && user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, authLoading, navigate]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 1024px)');
        const handleChange = () => setUse3DHero(mediaQuery.matches);

        handleChange();
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        companyApi.getAppSettings().then(({ data }) => {
            if (data?.windows_app_download_url) setDownloadUrl(data.windows_app_download_url);
        });
    }, []);

    const features = [
        {
            title: "Real-time Tally Sync",
            desc: "Instantly synchronize every voucher, ledger, and stock item from your locally hosted Tally.ERP 9 or TallyPrime straight to the cloud.",
            icon: <Zap size={24} />,
            gradient: "from-cyan-500/20 via-blue-500/10 to-transparent"
        },
        {
            title: "Bank-Grade Security",
            desc: "Your data is protected with AES-256 military-grade encryption during transit and at rest. Your financial secrets are safe with us.",
            icon: <Shield size={24} />,
            gradient: "from-violet-500/20 via-purple-500/10 to-transparent"
        },
        {
            title: "Intelligent Auditing",
            desc: "AI-driven anomaly detection flags potential errors or manual tempering in your vouchers before they affect your balance sheet.",
            icon: <Activity size={24} />,
            gradient: "from-emerald-500/20 via-teal-500/10 to-transparent"
        },
        {
            title: "GSTR Automation",
            desc: "Generate professional GSTR-1 and GSTR-3B summaries instantly from your Tally data. Tax compliance has never been this smooth.",
            icon: <FileText size={24} />,
            gradient: "from-amber-500/20 via-orange-500/10 to-transparent"
        },
        {
            title: "Multi-Entity Support",
            desc: "Seamlessly manage and switch between unlimited companies. Perfect for CAs and business owners with multiple units.",
            icon: <Database size={24} />,
            gradient: "from-blue-500/20 via-indigo-500/10 to-transparent"
        },
        {
            title: "Professional Dashboard",
            desc: "Experience high-fidelity charts, aging reports, and outstanding bills on an interface designed for modern executives.",
            icon: <BarChart3 size={24} />,
            gradient: "from-rose-500/20 via-pink-500/10 to-transparent"
        }
    ];

    return (
        <div className="bg-[#030712] text-white selection:bg-cyan-500/30 selection:text-white font-sans overflow-x-hidden">
            <SEO title="TallyLink | The Premium 3D Tally Experience" description="Access Tally ERP 9 and TallyPrime on mobile and web with real-time sync, 256-bit encryption, and professional analytics." />

            <SmoothLoader />
            <CustomCursor />

            {/* --- Navigation --- */}
            <motion.nav
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="fixed top-0 left-0 right-0 z-[100] p-3 sm:p-6 lg:p-8 pointer-events-none"
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="text-xl font-black italic tracking-tighter">TL</span>
                        </div>
                        <span className="text-lg font-black uppercase tracking-widest hidden sm:block">TallyLink</span>
                    </div>

                    <div className="hidden lg:flex items-center gap-1 p-1 bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/5 shadow-2xl">
                        {['Features', 'Security', 'FAQ', 'Contact'].map((item) => (
                            <button key={item} className="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                {item}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/login')} className="hidden sm:block text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors">
                            Sign In
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className="group px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-black text-[10px] sm:text-xs font-black uppercase tracking-[0.18em] rounded-lg sm:rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-2xl shadow-cyan-500/10"
                        >
                            Get Started
                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </motion.nav>
            {/* --- Hero Section --- */}
            <section ref={heroRef} className="relative min-h-[100svh] flex items-center px-4 sm:px-6 lg:px-12 pt-20 sm:pt-24 pb-12 sm:pb-20 overflow-hidden">
                {use3DHero ? (
                    <ThreeDHeroScene />
                ) : (
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#05182f] via-[#031225] to-[#040b18]" />
                )}

                <div className="absolute inset-0 z-[1] pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(20,184,166,0.24),transparent_38%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.22),transparent_42%)]" />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#030712]/40 via-[#030712]/75 to-[#030712]" />
                    <div className="absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-emerald-500/20 blur-[120px]" />
                    <div className="absolute -left-24 bottom-8 h-72 w-72 rounded-full bg-sky-500/20 blur-[120px]" />
                </div>

                <div className="max-w-7xl mx-auto w-full relative z-10 grid xl:grid-cols-[minmax(0,1fr)_440px] gap-8 lg:gap-12 items-center">
                    <motion.div style={use3DHero ? { y: yHero, opacity: opacityHero } : undefined} className="space-y-6 sm:space-y-8">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.45 }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] text-cyan-200"
                        >
                            <Sparkles size={13} className="text-cyan-300" />
                            <span className="sm:hidden">Built for Tally Teams</span><span className="hidden sm:inline">Built for Indian Accounting Teams</span>
                        </motion.div>

                        <div className="space-y-5">
                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.55 }}
                                className="hidden sm:block text-[clamp(3.4rem,8vw,6.2rem)] font-black leading-[0.9] tracking-[-0.03em]"
                            >
                                Tally Access,
                                <br />
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300">
                                    Without Office Boundaries.
                                </span>
                            </motion.h1>

                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.55 }}
                                className="sm:hidden text-[2.95rem] font-black leading-[0.92] tracking-[-0.03em]"
                            >
                                Your Tally,
                                <br />
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300">
                                    On Every Screen.
                                </span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.65 }}
                                className="text-base sm:text-lg text-slate-300 max-w-xl sm:max-w-2xl font-medium leading-relaxed"
                            >
                                Create vouchers from web, AI assistant, or desktop, then sync instantly with your Tally process.
                                Faster reporting, cleaner GST data, and smooth experience across desktop and mobile.
                            </motion.p>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.72 }}
                            className="grid gap-3 sm:grid-cols-2 max-w-2xl"
                        >
                            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-sm text-slate-200 flex items-start gap-3">
                                <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                                <span>Website or AI-created entries are queued and pushed to Tally with traceable status.</span>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-sm text-slate-200 flex items-start gap-3">
                                <Shield size={18} className="text-cyan-300 mt-0.5 shrink-0" />
                                <span>GST data, stock movement, and ledger impact stay consistent across all views.</span>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.78 }}
                            className="flex flex-col sm:flex-row gap-3 sm:gap-4"
                        >
                            <button
                                onClick={() => navigate('/login')}
                                className="group w-full sm:w-auto px-7 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 rounded-2xl text-sm font-black uppercase tracking-[0.18em] hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-[0_16px_40px_rgba(14,165,233,0.35)]"
                            >
                                Start Free Sync
                                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                            </button>
                            <button
                                onClick={() => window.open(downloadUrl, '_blank')}
                                className="w-full sm:w-auto px-7 sm:px-10 py-4 sm:py-5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-black uppercase tracking-[0.16em] transition-all flex items-center justify-center gap-3"
                            >
                                <Monitor size={17} />
                                Download Windows App
                            </button>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.88 }}
                            className="hidden sm:flex flex-wrap items-center gap-3 pt-1"
                        >
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-slate-300">
                                <Smartphone size={14} className="text-emerald-300" /> Mobile Dashboard
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-slate-300">
                                <Monitor size={14} className="text-sky-300" /> Desktop Connector
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-slate-300">
                                <Cloud size={14} className="text-cyan-300" /> Cloud Analytics
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9 }}
                            className="sm:hidden grid grid-cols-3 gap-2"
                        >
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Uptime</p>
                                <p className="text-sm font-black text-cyan-200 mt-0.5">99.9%</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Delay</p>
                                <p className="text-sm font-black text-cyan-200 mt-0.5">0.2s</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Support</p>
                                <p className="text-sm font-black text-cyan-200 mt-0.5">24x7</p>
                            </div>
                        </motion.div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 30, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ delay: 0.82, duration: 0.7 }}
                        className="relative hidden xl:block"
                    >
                        <div className="rounded-[28px] border border-white/10 bg-[#071226]/70 backdrop-blur-2xl p-5 sm:p-6 shadow-[0_30px_90px_rgba(4,26,50,0.45)]">
                            <div className="flex items-center justify-between mb-5">
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Live Sync Snapshot</p>
                                <span className="text-[11px] font-bold text-emerald-300">Updated now</span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-black">Push Rate</p>
                                    <p className="text-xl font-black text-white mt-1">99.9%</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-black">Avg Delay</p>
                                    <p className="text-xl font-black text-white mt-1">0.2s</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-black">GST Rules</p>
                                    <p className="text-xl font-black text-white mt-1">Auto</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                                    <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center shrink-0">
                                        <Zap size={15} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Voucher posted from web panel</p>
                                        <p className="text-xs text-slate-400">Mapped with ledger + stock lines, then queued to Tally.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
                                        <RefreshCw size={15} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">AI bank statement mapped</p>
                                        <p className="text-xs text-slate-400">Known names auto-match; unknown entries ask manual mapping once.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                                    <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
                                        <FileText size={15} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">GST and stock drilldown refreshed</p>
                                        <p className="text-xs text-slate-400">Running balances stay aligned with voucher timeline.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.05] to-white/[0.02] px-4 py-3.5">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Trusted Network</p>
                                <div className="mt-2.5 flex items-center justify-between gap-3">
                                    <div className="flex -space-x-2">
                                        {['CA', 'SM', 'TR', 'FM'].map((label) => (
                                            <div key={label} className="w-8 h-8 rounded-full border-2 border-[#071226] bg-slate-700/80 text-[10px] font-black text-cyan-200 flex items-center justify-center">
                                                {label}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs font-bold text-slate-300">10K+ firms across India</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* --- Scroll Indicator --- */}
                <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="hidden md:flex absolute bottom-10 left-1/2 -translate-x-1/2 flex-col items-center gap-4 text-gray-500"
                >
                    <span className="text-[8px] font-black uppercase tracking-[0.5em] rotate-180 [writing-mode:vertical-lr]">Scroll</span>
                    <div className="w-[1px] h-12 bg-gradient-to-b from-gray-700 to-transparent" />
                </motion.div>
            </section>

            {/* --- Stats Banner --- */}
            <section className="py-24 px-6 relative z-10 border-y border-white/5 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                        <MetricCard label="Trusted Businesses" value="10" suffix="K+" icon={<Users size={20} />} delay={0} />
                        <MetricCard label="App Uptime" value="99.9" suffix="%" icon={<Activity size={20} />} delay={0.1} />
                        <MetricCard label="Secure Vouchers" value="5" suffix="M+" icon={<FileText size={20} />} delay={0.2} />
                        <MetricCard label="Sync Latency" value="0.2" suffix="s" icon={<Cloud size={20} />} delay={0.3} />
                    </div>
                </div>
            </section>

            {/* --- Features Section --- */}
            <section className="py-32 px-6 relative z-10">
                <div className="max-w-7xl mx-auto space-y-24">
                    <div className="max-w-3xl space-y-6">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            className="inline-flex items-center gap-2 text-cyan-500 text-[10px] font-black uppercase tracking-[0.3em]"
                        >
                            <span className="w-8 h-[1px] bg-cyan-500" />
                            Precision Engineering
                        </motion.div>
                        <h2 className="text-5xl lg:text-7xl font-black tracking-tighter">
                            Designed for <span className="text-gray-500">Stability.</span> <br />
                            Optimized for <span className="text-cyan-400">Speed.</span>
                        </h2>
                        <p className="text-xl text-gray-500 font-medium">TallyLink isn't just a sync tool; it's a financial cockpit for your entire business ecosystem.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feat, i) => (
                            <FeatureCard key={i} {...feat} index={i} />
                        ))}
                    </div>
                </div>
            </section>

            {/* --- Quote / Social Proof --- */}
            <section className="py-32 px-6 relative z-10 overflow-hidden">
                <div className="max-w-7xl mx-auto relative px-12 py-24 rounded-[40px] bg-gradient-to-br from-white/5 to-transparent border border-white/5 flex flex-col items-center text-center space-y-12">
                    <div className="absolute top-0 right-0 p-12 opacity-10">
                        <RefreshCw size={200} className="animate-spin-slow" />
                    </div>

                    <Sparkles className="text-cyan-500" size={48} />
                    <h3 className="text-4xl md:text-5xl font-black italic tracking-tighter max-w-4xl">
                        "TallyLink bridged the gap between my office desk and my mobile screen.
                        It's the most professional free tool I've used in a decade."
                    </h3>

                    <div className="space-y-2">
                        <p className="text-lg font-black uppercase tracking-widest text-white">Anand Deshmukh</p>
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-[0.3em]">CFO, India Global Logistics</p>
                    </div>
                </div>
            </section>

            {/* --- Final CTA --- */}
            <section className="py-40 px-6 relative z-10 text-center">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    className="max-w-4xl mx-auto space-y-12"
                >
                    <div className="space-y-6">
                        <h2 className="text-6xl md:text-8xl font-black tracking-tighter">
                            Ready to take the <br />
                            <span className="text-cyan-400">Tally Leap?</span>
                        </h2>
                        <p className="text-xl text-gray-500 font-medium max-w-2xl mx-auto">
                            Join over 10,000 professional firms using TallyLink for real-time intelligence.
                            Zero cost, zero hidden fees, zero compromises.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                        <button onClick={() => navigate('/login')} className="px-12 py-6 bg-white text-black text-sm font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all shadow-2xl shadow-cyan-500/20">
                            Create Free Account
                        </button>
                        <button onClick={() => navigate('/login')} className="px-12 py-6 bg-white/5 backdrop-blur-xl border border-white/5 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all">
                            Request Live Demo
                        </button>
                    </div>
                </motion.div>
            </section>

            {/* --- Footer --- */}
            <footer className="py-20 px-6 border-t border-white/5 bg-white/[0.01]">
                <div className="max-w-7xl mx-auto grid lg:grid-cols-4 gap-20">
                    <div className="lg:col-span-2 space-y-8">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-sm font-black italic">TL</div>
                            <span className="text-lg font-black uppercase tracking-widest">TallyLink</span>
                        </div>
                        <p className="text-gray-500 text-sm font-medium max-w-sm leading-relaxed">
                            Empowering Indian SMEs with real-time financial synchronization.
                            Built with love for the accounting community.
                        </p>
                        <div className="flex gap-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-cyan-500/20 transition-colors border border-white/5 flex items-center justify-center text-gray-400 hover:text-cyan-400 cursor-pointer">
                                    <Cloud size={16} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-8">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Platform</h4>
                        <ul className="space-y-4 text-sm font-bold text-gray-600">
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">Tally ERP 9 Sync</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">TallyPrime Engine</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">Mobile Dashboard</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors">API for Developers</li>
                        </ul>
                    </div>

                    <div className="space-y-8 text-right">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Legal</h4>
                        <ul className="space-y-4 text-sm font-bold text-gray-600">
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => navigate('/privacy')}>Privacy Policy</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => navigate('/terms')}>Terms of Service</li>
                            <li className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => navigate('/refund')}>Data Policy</li>
                        </ul>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest">© 2026 TallyLink Technologies. All rights reserved.</p>
                    <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                        Secured by <Shield size={10} className="text-emerald-500" /> AES-256 Encryption
                    </p>
                </div>
            </footer>
        </div>
    );
}
