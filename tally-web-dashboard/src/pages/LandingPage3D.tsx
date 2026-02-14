import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { companyApi } from '@/lib/supabase';
import SEO from '../components/common/SEO';
import { motion, useScroll, useTransform, useInView, Variants } from 'framer-motion';
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
    Phone,
    User,
    Sparkles,
    BarChart3,
    FileText,
    Globe,
    Play,
    Star,
    ChevronDown,
    Plus
} from 'lucide-react';

// Animation variants
const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

// Animated Counter Component
function AnimatedCounter({ value, suffix = '' }: { value: string; suffix?: string }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    return (
        <span ref={ref} className="tabular-nums">
            {isInView ? value : '0'}{suffix}
        </span>
    );
}

export default function LandingPage3D() {
    const navigate = useNavigate();
    const { scrollYProgress } = useScroll();
    const { user, loading } = useAuth() as any;
    const heroRef = useRef(null);
    const isHeroInView = useInView(heroRef, { once: true });

    // Parallax transforms
    const y1 = useTransform(scrollYProgress, [0, 1], [0, -100]);
    const y2 = useTransform(scrollYProgress, [0, 1], [0, -200]);
    const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

    // Redirect logged in users
    useEffect(() => {
        if (!loading && user) {
            navigate('/select-mode', { replace: true });
        }
    }, [user, loading, navigate]);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState('https://github.com/jlsfinance/TALLYONMOB/releases/latest/download/TallyLinkSetup.exe');
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const { data } = await companyApi.getAppSettings();
                if (data?.windows_app_download_url) {
                    setDownloadUrl(data.windows_app_download_url);
                }
            } catch (err) {
                console.error('Error loading download settings:', err);
            }
        };
        loadSettings();
    }, []);

    const handleContactSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // Use Backend URL from env
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
            await axios.post(`${apiUrl}/contact`, formData);
            toast.success('Message sent! We will get back to you soon.');
            setFormData({ name: '', email: '', subject: '', message: '' });
        } catch (error) {
            console.error('Submission error:', error);
            toast.error('Failed to send message. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const steps = [
        {
            icon: <Monitor size={28} />,
            title: "Install TallyLink",
            desc: "Download & run our lightweight Windows app. It connects directly to your Tally ERP.",
            color: "from-cyan-500 to-blue-600",
            step: "01"
        },
        {
            icon: <Cloud size={28} />,
            title: "Auto Cloud Sync",
            desc: "Your data syncs automatically with military-grade encryption. No manual exports.",
            color: "from-violet-500 to-purple-600",
            step: "02"
        },
        {
            icon: <Smartphone size={28} />,
            title: "Access Anywhere",
            desc: "View real-time reports on mobile, tablet, or web. Share with your CA instantly.",
            color: "from-emerald-500 to-teal-600",
            step: "03"
        },
    ];

    const stats = [
        { label: "Active Businesses", value: "10K", suffix: "+", icon: <Users className="text-cyan-400" size={20} /> },
        { label: "Uptime SLA", value: "99.9", suffix: "%", icon: <Activity className="text-emerald-400" size={20} /> },
        { label: "Vouchers Synced", value: "5M", suffix: "+", icon: <FileText className="text-violet-400" size={20} /> },
        { label: "Data Secured", value: "256", suffix: "-bit", icon: <Shield className="text-amber-400" size={20} /> },
    ];

    const features = [
        {
            title: "Real-time Sync",
            desc: "Every transaction in Tally instantly reflects on your mobile dashboard. Zero lag.",
            icon: <Zap size={22} />,
            gradient: "from-amber-500/20 to-orange-500/20",
            iconColor: "text-amber-400"
        },
        {
            title: "AI Audit Shield",
            desc: "AI-powered anomaly detection finds discrepancies before they become problems.",
            icon: <Shield size={22} />,
            gradient: "from-blue-500/20 to-cyan-500/20",
            iconColor: "text-blue-400"
        },
        {
            title: "GST Ready",
            desc: "Auto-generate GSTR-1, GSTR-3B reports. Tax filing made effortless.",
            icon: <CheckCircle size={22} />,
            gradient: "from-emerald-500/20 to-teal-500/20",
            iconColor: "text-emerald-400"
        },
        {
            title: "Multi-Company",
            desc: "Manage unlimited companies from a single dashboard. Perfect for CAs.",
            icon: <Database size={22} />,
            gradient: "from-violet-500/20 to-purple-500/20",
            iconColor: "text-violet-400"
        },
        {
            title: "Auto Backup",
            desc: "Your data is continuously backed up. Never lose a single voucher.",
            icon: <Cloud size={22} />,
            gradient: "from-indigo-500/20 to-blue-500/20",
            iconColor: "text-indigo-400"
        },
        {
            title: "Free Forever",
            desc: "Zero costs, zero subscriptions. 100% free tool to empower Indian accounting.",
            icon: <Sparkles size={22} />,
            gradient: "from-cyan-500/20 to-emerald-500/20",
            iconColor: "text-emerald-400"
        },
        {
            title: "Bank-grade Security",
            desc: "256-bit AES encryption, SOC2 compliant infrastructure. Your data is vault-safe.",
            icon: <Lock size={22} />,
            gradient: "from-rose-500/20 to-pink-500/20",
            iconColor: "text-rose-400"
        }
    ];

    const testimonials = [
        {
            name: "Rajesh Sharma",
            role: "CA, Sharma & Associates",
            quote: "TallySync transformed how I manage 50+ clients. Reports are instant now.",
            rating: 5
        },
        {
            name: "Priya Patel",
            role: "CFO, TechVentures",
            quote: "Finally, I can check business health from my phone. Game changer!",
            rating: 5
        },
        {
            name: "Amit Gupta",
            role: "Business Owner",
            quote: "The GST reports alone save me 10 hours every month. Worth every rupee.",
            rating: 5
        }
    ];

    // SEO Schema for Software Application (GEO Optimization)
    const softwareSchema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "TallyLink - 100% Free Tally on Mobile",
        "operatingSystem": "Windows 10, Windows 11, Android, iOS, Cloud",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "AccountingApplication",
        "fileSize": "12MB",
        "softwareVersion": "2.5.0",
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "ratingCount": "1000"
        },
        "offers": {
            "@type": "Offer",
            "price": "0.00",
            "priceCurrency": "INR"
        },
        "description": "100% FREE Enterprise-grade real-time Tally on Mobile and Web dashboard. Access Tally ERP 9 and TallyPrime data anywhere with automated cloud sync.",
        "brand": {
            "@type": "Brand",
            "name": "TallyLink"
        },
        "featureList": "Real-time Tally Sync, Mobile Dashboard, GSTR Reports, Multi-User Access, Bank-Grade Security",
        "screenshot": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2000",
        "author": {
            "@type": "Organization",
            "name": "TallyLink Technologies",
            "url": "https://tallyonmob.vercel.app"
        },
        "mainEntityOfPage": "https://tallyonmob.vercel.app"
    };

    const howToSchema = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": "How to Use Tally on Mobile for Free",
        "description": "Sync your Tally ERP 9 or TallyPrime data to mobile in 3 simple steps.",
        "step": steps.map((step, index) => ({
            "@type": "HowToStep",
            "position": index + 1,
            "name": step.title,
            "itemListElement": {
                "@type": "HowToDirection",
                "text": step.desc
            }
        }))
    };

    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [{
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://tallyonmob.vercel.app"
        }]
    };

    const faqItems = [
        {
            question: "Is TallyLink really 100% free?",
            answer: "Yes, TallyLink is completely free for all users. We believe in empowering Indian SMEs with accessible technology. There are no hidden fees or subscriptions."
        },
        {
            question: "Is my Tally data safe on mobile?",
            answer: "Absolutely. We use bank-grade 256-bit AES encryption. Your data is encrypted before it leaves your Tally machine and remains encrypted in the cloud."
        },
        {
            question: "Does it work with Tally Prime and ERP 9?",
            answer: "Yes, TallyLink is compatible with both Tally.ERP 9 and TallyPrime. Our smart connector detects your version automatically."
        },
        {
            question: "How do I sync Tally to mobile?",
            answer: "Download our desktop app, log in, and select the companies you want to sync. The process takes less than 3 minutes."
        }
    ];

    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqItems.map(item => ({
            "@type": "Question",
            "name": item.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": item.answer
            }
        }))
    };

    const organizationSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "TallyLink",
        "url": "https://tallyonmob.vercel.app",
        "logo": "https://tallyonmob.vercel.app/logo.png",
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+91 9413821007",
            "contactType": "Customer Support",
            "email": "support@tallyonmob.vercel.app",
            "areaServed": "IN",
            "availableLanguage": ["English", "Hindi"]
        }
    };

    return (
        <div className="min-h-screen bg-[#030712] text-white selection:bg-cyan-500/30 overflow-x-hidden">
            <SEO
                title="TallyLink | 100% FREE Real-Time Tally on Mobile & Web"
                description="Experience the power of Tally ERP 9 & TallyPrime on mobile for FREE. Real-time vouchers, ledgers, and GST reports with bank-grade encryption."
                keywords="free tally on mobile app, tally sync cloud, tally prime mobile view free, tally erp 9 dashboard mobile, android tally viewer free"
                schema={[softwareSchema, organizationSchema, faqSchema, howToSchema, breadcrumbSchema]}
                canonical="https://tallyonmob.vercel.app"
            />
            {/* Animated Gradient Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                {/* Primary gradient orbs */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        x: [0, 50, 0],
                        y: [0, -30, 0],
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-cyan-600/20 via-blue-600/10 to-transparent rounded-full blur-[120px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        x: [0, -40, 0],
                        y: [0, 40, 0],
                    }}
                    transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[40%] right-[-15%] w-[50%] h-[50%] bg-gradient-to-br from-violet-600/15 via-purple-600/10 to-transparent rounded-full blur-[120px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        y: [0, -50, 0],
                    }}
                    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-gradient-to-br from-emerald-600/15 to-transparent rounded-full blur-[100px]"
                />

                {/* Grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px'
                    }}
                />
            </div>

            {/* Navbar */}
            <motion.nav
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="fixed top-0 left-0 right-0 z-50"
            >
                <div className="mx-4 mt-4">
                    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08]">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                                    <RefreshCw size={18} className="text-white" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#030712] animate-pulse" />
                            </div>
                            <div>
                                <span className="font-black text-lg tracking-tight">TallyLink</span>
                                <span className="text-[8px] font-bold text-cyan-400 ml-1 uppercase tracking-widest">Pro</span>
                            </div>
                        </div>

                        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
                            <a href="#features" className="hover:text-white transition-colors relative group">
                                Features
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 group-hover:w-full transition-all duration-300" />
                            </a>
                            <a href="#how-it-works" className="hover:text-white transition-colors relative group">
                                How it Works
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 group-hover:w-full transition-all duration-300" />
                            </a>
                            <a href="#testimonials" className="hover:text-white transition-colors relative group">
                                Reviews
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 group-hover:w-full transition-all duration-300" />
                            </a>
                            <a href="#contact" className="hover:text-white transition-colors relative group">
                                Contact
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 group-hover:w-full transition-all duration-300" />
                            </a>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/login')}
                                className="hidden sm:block px-5 py-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => navigate('/login')}
                                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Get Started
                            </button>
                        </div>
                    </div>
                </div>
            </motion.nav>

            {/* Hero Section */}
            <section ref={heroRef} className="relative pt-40 pb-20 px-6 overflow-hidden">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        style={{ opacity }}
                        className="text-center max-w-5xl mx-auto"
                    >
                        {/* Badge */}
                        <div className="flex flex-col items-center gap-4 mb-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                                transition={{ duration: 0.6 }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20"
                            >
                                <Sparkles size={14} className="text-cyan-400" />
                                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Trusted by 10,000+ Indian Businesses</span>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={isHeroInView ? { opacity: 1, scale: 1 } : {}}
                                transition={{ duration: 0.5, delay: 0.2 }}
                                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">100% Free Forever</span>
                            </motion.div>
                        </div>

                        {/* Main Headline */}
                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, delay: 0.1 }}
                            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tight mb-8"
                        >
                            Your Tally Data,
                            <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-500">
                                Everywhere.
                            </span>
                        </motion.h1>

                        {/* Subheadline */}
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed font-medium"
                        >
                            Sync your Tally ERP to the cloud in real-time. Access reports, track sales,
                            and manage your business from any device. <span className="text-white">100% Free Tool for Indian SMEs.</span>
                        </motion.p>

                        {/* CTA Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            className="flex flex-col sm:flex-row items-center justify-center gap-4"
                        >
                            <button
                                onClick={() => navigate('/login')}
                                className="group w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-2xl hover:shadow-2xl hover:shadow-cyan-500/30 transition-all flex items-center justify-center gap-3 text-lg hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Get Started for FREE
                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                            <button
                                onClick={() => window.open(downloadUrl, '_blank')}
                                className="group w-full sm:w-auto px-8 py-4 bg-white/5 backdrop-blur-sm border border-white/10 font-bold rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-3 text-lg"
                            >
                                <Monitor size={20} />
                                Download for Windows
                            </button>
                        </motion.div>

                        {/* Trust indicators */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={isHeroInView ? { opacity: 1 } : {}}
                            transition={{ duration: 0.8, delay: 0.5 }}
                            className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500"
                        >
                            <div className="flex items-center gap-2">
                                <CheckCircle size={16} className="text-emerald-500" />
                                <span>No Credit Card Required</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle size={16} className="text-emerald-500" />
                                <span>100% Free Lifetime Access</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle size={16} className="text-emerald-500" />
                                <span>Open Source Power</span>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Dashboard Preview */}
                    <motion.div
                        initial={{ opacity: 0, y: 100, scale: 0.95 }}
                        animate={isHeroInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ duration: 1, delay: 0.4 }}
                        className="mt-20 relative"
                    >
                        {/* Glow effect behind */}
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-violet-500/20 blur-[80px] -z-10 scale-90" />

                        {/* Browser frame */}
                        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-sm shadow-2xl">
                            {/* Browser header */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                </div>
                                <div className="flex-1 flex justify-center">
                                    <div className="px-4 py-1 rounded-lg bg-white/5 text-xs text-gray-500 font-mono">
                                        tallyonmob.vercel.app
                                    </div>
                                </div>
                            </div>

                            {/* Dashboard image */}
                            <img
                                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2000"
                                alt="TallyLink FREE Dashboard Preview"
                                className="w-full object-cover"
                                style={{ maxHeight: '500px' }}
                            />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-20 relative z-10">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-100px" }}
                        className="grid grid-cols-2 md:grid-cols-4 gap-6"
                    >
                        {stats.map((stat, i) => (
                            <motion.div
                                key={i}
                                variants={fadeInUp}
                                className="relative group"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="relative p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm text-center">
                                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/5 flex items-center justify-center">
                                        {stat.icon}
                                    </div>
                                    <h4 className="text-3xl md:text-4xl font-black mb-1">
                                        <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                                    </h4>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{stat.label}</p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="py-32 px-6 relative z-10">
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        variants={fadeInUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="text-center mb-20"
                    >
                        <span className="text-cyan-400 text-xs font-black uppercase tracking-widest mb-4 block">Simple Setup</span>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
                            Up & Running in <span className="text-cyan-400">3 Minutes</span>
                        </h2>
                        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                            No IT team required. Install, login, and your Tally data flows to the cloud automatically.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
                        {/* Connection line (desktop) */}
                        <div className="hidden lg:block absolute top-[100px] left-[20%] right-[20%] h-0.5">
                            <div className="h-full bg-gradient-to-r from-cyan-500/50 via-violet-500/50 to-emerald-500/50" />
                        </div>

                        {steps.map((step, i) => (
                            <motion.div
                                key={i}
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.15 }}
                                className="relative group"
                            >
                                <div className="relative p-8 rounded-3xl bg-gradient-to-b from-white/[0.06] to-transparent border border-white/[0.08] hover:border-white/[0.15] transition-all duration-500">
                                    {/* Step number */}
                                    <div className="absolute -top-4 -left-4 w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 flex items-center justify-center text-xs font-black text-gray-400">
                                        {step.step}
                                    </div>

                                    {/* Icon */}
                                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                        {step.icon}
                                    </div>

                                    <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                                    <p className="text-gray-400 leading-relaxed">{step.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" className="py-32 px-6 relative z-10 bg-gradient-to-b from-transparent via-cyan-950/10 to-transparent">
                <div className="max-w-7xl mx-auto">
                    <motion.div
                        variants={fadeInUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="text-center mb-20"
                    >
                        <span className="text-cyan-400 text-xs font-black uppercase tracking-widest mb-4 block">Powerful Features</span>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
                            Everything You Need to <span className="text-cyan-400">Scale</span>
                        </h2>
                        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                            Built specifically for Indian businesses. GST-ready, CA-friendly, and blazing fast.
                        </p>
                    </motion.div>

                    <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {features.map((feat, i) => (
                            <motion.div
                                key={i}
                                variants={fadeInUp}
                                className="group relative p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-500"
                            >
                                <div className={`absolute inset-0 bg-gradient-to-br ${feat.gradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                                <div className="relative">
                                    <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-5 ${feat.iconColor} group-hover:scale-110 transition-transform`}>
                                        {feat.icon}
                                    </div>
                                    <h3 className="text-lg font-bold mb-2 group-hover:text-white transition-colors">{feat.title}</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed group-hover:text-gray-400 transition-colors">{feat.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="py-20 px-6 relative z-10">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        variants={fadeInUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <span className="text-cyan-400 text-xs font-black uppercase tracking-widest mb-4 block">Common Questions</span>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
                            Frequently Asked <span className="text-cyan-400">Questions</span>
                        </h2>
                    </motion.div>

                    <div className="space-y-4">
                        {faqItems.map((item, i) => (
                            <motion.div
                                key={i}
                                variants={fadeInUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="group"
                            >
                                <button
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className={`w-full text-left p-6 rounded-2xl border transition-all duration-300 flex items-center justify-between ${openFaq === i
                                        ? 'bg-white/[0.05] border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                                        : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15]'
                                        }`}
                                >
                                    <span className="font-bold text-lg">{item.question}</span>
                                    <ChevronDown
                                        size={20}
                                        className={`text-cyan-400 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''
                                            }`}
                                    />
                                </button>
                                <div
                                    className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                                        }`}
                                >
                                    <div className="p-6 pt-0 text-gray-400 leading-relaxed">
                                        {item.answer}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section id="testimonials" className="py-32 px-6 relative z-10">
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        variants={fadeInUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <span className="text-cyan-400 text-xs font-black uppercase tracking-widest mb-4 block">Testimonials</span>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
                            Loved by <span className="text-cyan-400">Thousands</span>
                        </h2>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {testimonials.map((t, i) => (
                            <motion.div
                                key={i}
                                variants={fadeInUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="p-8 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08]"
                            >
                                <div className="flex gap-1 mb-4">
                                    {[...Array(t.rating)].map((_, j) => (
                                        <Star key={j} size={16} className="fill-yellow-400 text-yellow-400" />
                                    ))}
                                </div>
                                <p className="text-gray-300 mb-6 leading-relaxed">"{t.quote}"</p>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                                        {t.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">{t.name}</p>
                                        <p className="text-gray-500 text-xs">{t.role}</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Contact Section */}
            <section id="contact" className="py-32 px-6 relative z-10">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        <motion.div
                            variants={fadeInUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                        >
                            <span className="text-cyan-400 text-xs font-black uppercase tracking-widest mb-4 block">Get in Touch</span>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
                                Let's Talk <span className="text-cyan-400">Business</span>
                            </h2>
                            <p className="text-gray-400 text-lg mb-10 leading-relaxed">
                                Have questions? Need a demo? Our team is ready to help you get started with TallySync.
                            </p>

                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                        <Mail size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email</p>
                                        <p className="font-semibold">{import.meta.env.VITE_SUPPORT_EMAIL || 'support@tallysync.in'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                        <Phone size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Phone</p>
                                        <p className="font-semibold">{import.meta.env.VITE_SUPPORT_PHONE || '+91 9413821007'}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            variants={fadeInUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                        >
                            <form onSubmit={handleContactSubmit} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Your Name"
                                            className="w-full px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all placeholder:text-gray-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                                        <input
                                            type="email"
                                            required
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            placeholder="you@company.com"
                                            className="w-full px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all placeholder:text-gray-600"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Subject</label>
                                    <input
                                        type="text"
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        placeholder="How can we help?"
                                        className="w-full px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all placeholder:text-gray-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Message</label>
                                    <textarea
                                        rows={5}
                                        required
                                        value={formData.message}
                                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                        placeholder="Tell us about your needs..."
                                        className="w-full px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none placeholder:text-gray-600"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <RefreshCw className="animate-spin" size={18} />
                                    ) : (
                                        <>Send Message <ArrowRight size={18} /></>
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 px-6 relative z-10">
                <motion.div
                    variants={scaleIn}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="max-w-4xl mx-auto text-center"
                >
                    <div className="relative p-12 md:p-16 rounded-3xl overflow-hidden">
                        {/* Background gradient */}
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 via-blue-600/20 to-violet-600/20 blur-xl" />
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent border border-white/[0.1] rounded-3xl" />

                        <div className="relative">
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
                                Ready to Digitally Transform Your Tally?
                            </h2>
                            <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
                                Join 10,000+ businesses already using TallyLink for 100% FREE. No hidden charges, no credit cards required.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button
                                    onClick={() => navigate('/login')}
                                    className="px-8 py-4 bg-white text-gray-900 font-bold rounded-xl hover:scale-105 transition-transform shadow-xl shadow-white/10"
                                >
                                    Get Started for FREE
                                </button>
                                <button
                                    onClick={() => window.open(downloadUrl, '_blank')}
                                    className="px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 font-bold rounded-xl hover:bg-white/20 transition-all"
                                >
                                    Download Now
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 pt-20 pb-10 border-t border-white/[0.05]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 mb-16">
                        {/* Brand */}
                        <div className="lg:col-span-2">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                    <RefreshCw size={18} className="text-white" />
                                </div>
                                <span className="font-black text-xl">TallyLink</span>
                            </div>
                            <p className="text-gray-500 max-w-sm mb-6 leading-relaxed">
                                100% FREE tool empowering Indian businesses with real-time financial transparency. Your Tally data, everywhere.
                            </p>
                            <div className="flex items-center gap-4 text-gray-500">
                                <a href="https://tallyonmob.vercel.app" className="hover:text-white transition-colors">
                                    <Globe size={20} />
                                </a>
                                <a href="mailto:support@tallyonmob.vercel.app" className="hover:text-white transition-colors">
                                    <Mail size={20} />
                                </a>
                                <a href="tel:+919413821007" className="hover:text-white transition-colors">
                                    <Phone size={20} />
                                </a>
                            </div>
                        </div>

                        {/* Links - Strategic Expansion */}
                        <div>
                            <h5 className="font-bold mb-4 text-sm uppercase tracking-wider text-gray-400">Policies</h5>
                            <ul className="space-y-2 text-xs text-gray-500">
                                <li><button onClick={() => navigate('/legal/privacy-policy')} className="hover:text-cyan-400 transition-colors">Privacy Policy</button></li>
                                <li><button onClick={() => navigate('/legal/terms-and-conditions')} className="hover:text-cyan-400 transition-colors">Terms of Service</button></li>
                                <li><button onClick={() => navigate('/legal/refund-policy')} className="hover:text-cyan-400 transition-colors">Refund & Cancellation</button></li>
                                <li><button onClick={() => navigate('/legal/cookie-policy')} className="hover:text-cyan-400 transition-colors">Cookie Policy</button></li>
                                <li><button onClick={() => navigate('/legal/acceptable-use-policy')} className="hover:text-cyan-400 transition-colors">Acceptable Use</button></li>
                                <li><button onClick={() => navigate('/legal/billing-and-subscription')} className="hover:text-cyan-400 transition-colors">Billing Policy</button></li>
                                <li><button onClick={() => navigate('/legal/termination-policy')} className="hover:text-cyan-400 transition-colors">Termination Policy</button></li>
                            </ul>
                        </div>

                        <div>
                            <h5 className="font-bold mb-4 text-sm uppercase tracking-wider text-gray-400">Governance</h5>
                            <ul className="space-y-2 text-xs text-gray-500">
                                <li><button onClick={() => navigate('/legal/gst-compliance-statement')} className="hover:text-cyan-400 transition-colors">GST Compliance</button></li>
                                <li><button onClick={() => navigate('/legal/data-protection-policy')} className="hover:text-cyan-400 transition-colors">Data Protection (DPDP)</button></li>
                                <li><button onClick={() => navigate('/legal/service-level-agreement')} className="hover:text-cyan-400 transition-colors">SLA Commitment</button></li>
                                <li><button onClick={() => navigate('/legal/intellectual-property-policy')} className="hover:text-cyan-400 transition-colors">IP Rights Policy</button></li>
                                <li><button onClick={() => navigate('/legal/user-grievance-redressal')} className="hover:text-cyan-400 transition-colors">Grievance Redressal</button></li>
                                <li><button onClick={() => navigate('/legal/disclaimer-and-liability')} className="hover:text-cyan-400 transition-colors">Disclaimer & Liability</button></li>
                                <li><button onClick={() => navigate('/legal/indemnification-policy')} className="hover:text-cyan-400 transition-colors">Indemnification</button></li>
                            </ul>
                        </div>

                        <div>
                            <h5 className="font-bold mb-4 text-sm uppercase tracking-wider text-gray-400">Trust & Safety</h5>
                            <ul className="space-y-2 text-xs text-gray-500">
                                <li><button onClick={() => navigate('/legal/security-statement')} className="hover:text-cyan-400 transition-colors">Security Statement</button></li>
                                <li><button onClick={() => navigate('/legal/sub-processor-list')} className="hover:text-cyan-400 transition-colors">Sub-processor List</button></li>
                                <li><button onClick={() => navigate('/legal/anti-spam-policy')} className="hover:text-cyan-400 transition-colors">Anti-Spam Policy</button></li>
                                <li><button onClick={() => navigate('/legal/third-party-disclosures')} className="hover:text-cyan-400 transition-colors">Third-Party Disclosure</button></li>
                                <li><button onClick={() => navigate('/legal/compliance-with-indian-laws')} className="hover:text-cyan-400 transition-colors">Indian Law Compliance</button></li>
                                <li><button onClick={() => navigate('/legal/data-processing-addendum')} className="hover:text-cyan-400 transition-colors">Data Processing (DPA)</button></li>
                                <li><button onClick={() => navigate('/legal/accessibility-statement')} className="hover:text-cyan-400 transition-colors">Accessibility</button></li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom */}
                    <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row justify-between items-center gap-4 text-gray-600 text-sm">
                        <p>© 2026 TallySync. All rights reserved.</p>
                        <div className="flex items-center gap-6">
                            <span>Made with ❤️ in India</span>
                            <span>v2.1.0</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
