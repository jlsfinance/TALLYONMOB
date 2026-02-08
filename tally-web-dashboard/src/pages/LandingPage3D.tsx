import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { motion, useScroll, useTransform } from 'framer-motion';
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
    User
} from 'lucide-react';

export default function LandingPage3D() {
    const navigate = useNavigate();
    const { scrollYProgress } = useScroll();
    const { user, loading } = useAuth() as any;

    // Redirect logged in users to dashboard
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

    const handleContactSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await axios.post('http://localhost:5000/api/v1/contact/send', formData);
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
            icon: <Monitor size={32} />,
            title: "Tally ERP on PC",
            desc: "Your desktop Tally data stays secure and local.",
            color: "blue"
        },
        {
            icon: <Cloud size={32} />,
            title: "Cloud Sync",
            desc: "Encrypted real-time synchronization to our secure cloud.",
            color: "purple"
        },
        {
            icon: <Smartphone size={32} />,
            title: "Mobile Access",
            desc: "Access business reports anywhere, anytime on any device.",
            color: "emerald"
        },
    ];

    const stats = [
        { label: "Active Businesses", value: "10,000+", icon: <Users className="text-blue-400" /> },
        { label: "Uptime Reliability", value: "99.9%", icon: <Activity className="text-emerald-400" /> },
        { label: "Vouchers Synced", value: "1M+", icon: <RefreshCw className="text-purple-400" /> },
    ];

    const detailedFeatures = [
        {
            title: "Real-time Sync",
            desc: "Every transaction you enter in Tally is instantly available on your mobile dashboard.",
            icon: <Zap size={24} className="text-amber-400" />
        },
        {
            title: "AI Integrity Shield",
            desc: "Advanced AI algorithms audit your data for errors, discrepancies, and fraud detection.",
            icon: <Shield size={24} className="text-blue-400" />
        },
        {
            title: "GST Compliance",
            desc: "Generate GSTR-1, GSTR-3B, and Rate-wise summaries directly from your mobile.",
            icon: <CheckCircle size={24} className="text-emerald-400" />
        },
        {
            title: "Multi-Company Support",
            desc: "Manage all your business branches and companies from a single login.",
            icon: <Database size={24} className="text-purple-400" />
        },
        {
            title: "Auto-Backup",
            desc: "Never worry about data loss. Your encrypted data is backed up daily in the cloud.",
            icon: <Cloud size={24} className="text-indigo-400" />
        },
        {
            title: "Enterprise Encryption",
            desc: "Bank-grade 256-bit AES encryption ensures your financial data stays private.",
            icon: <Lock size={24} className="text-pink-400" />
        }
    ];

    return (
        <div className="min-h-screen bg-[#020202] text-white selection:bg-emerald-500/30">
            {/* Animated Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 90, 0],
                        opacity: [0.3, 0.5, 0.3]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-[120px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        rotate: [0, -90, 0],
                        opacity: [0.2, 0.4, 0.2]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-emerald-600/10 rounded-full blur-[120px]"
                />
            </div>

            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <RefreshCw size={22} className="text-white animate-spin-slow" />
                        </div>
                        <span className="font-black text-xl tracking-tighter uppercase italic">TallyLink</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
                        <a href="#contact" className="hover:text-white transition-colors">Contact</a>
                        <button
                            onClick={() => navigate('/login')}
                            className="px-5 py-2.5 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                        >
                            Log In
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-40 pb-20 px-6 text-center overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="relative z-10 max-w-5xl mx-auto"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-8">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Trusted by 10k+ CA & Businesses
                    </div>

                    <h1 className="text-6xl md:text-8xl font-black leading-[0.9] tracking-tighter mb-8">
                        YOUR TALLY,<br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-blue-400 to-indigo-500">
                            REIMAGINED.
                        </span>
                    </h1>

                    <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
                        The definitive solution to sync your Tally ERP data to the cloud. Real-time reports, AI audits, and business insights, right in your pocket.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-black rounded-2xl hover:shadow-2xl hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 group text-lg"
                        >
                            GET STARTED NOW
                            <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                        </button>
                        <button
                            onClick={() => window.open('/TallyLink.exe', '_blank')}
                            className="w-full sm:w-auto px-10 py-5 bg-white/5 border border-white/10 font-bold rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 backdrop-blur-md text-lg"
                        >
                            <Monitor size={20} />
                            DOWNLOAD SYNC APP
                        </button>
                    </div>
                </motion.div>

                {/* Dashboard Preview */}
                <motion.div
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 1 }}
                    className="mt-24 max-w-6xl mx-auto relative px-4"
                >
                    <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full -z-10" />
                    <img
                        src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2000"
                        alt="Dashboard Preview"
                        className="rounded-3xl border border-white/10 shadow-2xl shadow-black ring-1 ring-white/20"
                    />
                </motion.div>
            </section>

            {/* Stats Section */}
            <section className="py-20 border-y border-white/5 bg-black/30 backdrop-blur-md relative z-10">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
                    {stats.map((stat, i) => (
                        <div key={i} className="flex flex-col items-center gap-4 group">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {stat.icon}
                            </div>
                            <div className="text-center">
                                <h4 className="text-4xl font-black mb-1">{stat.value}</h4>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{stat.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* How It Works - Animated Flow */}
            <section id="how-it-works" className="py-32 px-6 relative z-10 bg-[#050505]">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-24">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">FLOW OF FREEDOM</h2>
                        <p className="text-gray-500 text-lg">From your desktop to your pocket in milliseconds.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative">
                        {/* Animated Connecting Lines (Desktop only) */}
                        <div className="hidden lg:block absolute top-[40px] left-[25%] right-[25%] h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-purple-500 opacity-20" />

                        {steps.map((step, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -50 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.2 }}
                                viewport={{ once: true }}
                                className="relative flex flex-col items-center text-center p-10 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-all"
                            >
                                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-8 shadow-2xl ${step.color === 'blue' ? 'bg-blue-600/20 text-blue-400' :
                                    step.color === 'purple' ? 'bg-purple-600/20 text-purple-400' :
                                        'bg-emerald-600/20 text-emerald-400'
                                    }`}>
                                    {step.icon}
                                </div>
                                <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
                                <p className="text-gray-400 leading-relaxed font-medium">{step.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Detail Grid */}
            <section id="features" className="py-32 px-6 relative z-10">
                <div className="max-w-7xl mx-auto">
                    <h2 className="text-4xl md:text-7xl font-black tracking-tighter mb-20 text-center">BUILT FOR SCALE</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {detailedFeatures.map((feat, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                viewport={{ once: true }}
                                className="p-10 rounded-[32px] bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 group transition-all"
                            >
                                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                                    {feat.icon}
                                </div>
                                <h3 className="text-xl font-black mb-4 group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{feat.title}</h3>
                                <p className="text-gray-500 leading-relaxed font-medium">{feat.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Contact Form Section */}
            <section id="contact" className="py-32 px-6 relative z-10 bg-black/40 backdrop-blur-3xl">
                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-20">
                    <div className="lg:w-1/2">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 italic uppercase">Get in Touch</h2>
                        <p className="text-gray-400 text-lg mb-12 leading-relaxed">
                            Have questions about TallyLink? Whether you need technical support, a custom quote, or want to partner with us, our team is ready to help.
                        </p>
                        <div className="space-y-8">
                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-white/[0.03] border border-white/5">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Mail size={24} /></div>
                                <div>
                                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Email us at</p>
                                    <p className="text-xl font-bold">lovneetrathi@gmail.com</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-white/[0.03] border border-white/5">
                                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400"><Phone size={24} /></div>
                                <div>
                                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Call us at</p>
                                    <p className="text-xl font-bold">+91 9413821007</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:w-1/2">
                        <form onSubmit={handleContactSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="John Doe"
                                        className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="john@example.com"
                                        className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Subject</label>
                                <input
                                    type="text"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    placeholder="Technical Support / Pricing"
                                    className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Message</label>
                                <textarea
                                    rows={5}
                                    required
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    placeholder="How can we help you today?"
                                    className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:outline-none transition-all resize-none"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-5 bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-black rounded-2xl hover:shadow-2xl hover:shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-3 text-lg"
                            >
                                {isSubmitting ? (
                                    <RefreshCw className="animate-spin" size={20} />
                                ) : (
                                    <>SEND MESSAGE <Mail size={20} /></>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </section>

            {/* Footer & Contact */}
            <footer className="relative z-10 pt-32 pb-12 border-t border-white/5 bg-[#020202]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 mb-20">
                        <div>
                            <div className="flex items-center gap-3 mb-8 text-2xl font-black uppercase cursor-pointer" onClick={() => navigate('/')}>
                                <span>TallyLink</span>
                            </div>
                            <p className="text-gray-500 max-w-sm mb-12 text-lg leading-relaxed">
                                Empowering Indian businesses with real-time financial transparency and AI-driven audits.
                            </p>
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 text-gray-400 font-bold">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-emerald-400"><User size={18} /></div>
                                    <span>Lavneet Rathi</span>
                                </div>
                                <div className="flex items-center gap-4 text-gray-400 font-bold">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-blue-400"><Mail size={18} /></div>
                                    <span>lovneetrathi@gmail.com</span>
                                </div>
                                <div className="flex items-center gap-4 text-gray-400 font-bold">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-purple-400"><Phone size={18} /></div>
                                    <span>+91 9413821007</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
                            <div>
                                <h5 className="text-white font-black mb-6 uppercase tracking-widest text-xs">Product</h5>
                                <ul className="space-y-4 text-gray-500 font-bold text-sm">
                                    <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">AI Audit</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Mobile App</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                                </ul>
                            </div>
                            <div>
                                <h5 className="text-white font-black mb-6 uppercase tracking-widest text-xs">Legal</h5>
                                <ul className="space-y-4 text-gray-500 font-bold text-sm">
                                    <li><button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">Privacy Policy</button></li>
                                    <li><button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Terms of Service</button></li>
                                    <li><button onClick={() => navigate('/refund')} className="hover:text-white transition-colors">Refund Policy</button></li>
                                </ul>
                            </div>
                            <div>
                                <h5 className="text-white font-black mb-6 uppercase tracking-widest text-xs">Connect</h5>
                                <ul className="space-y-4 text-gray-500 font-bold text-sm">
                                    <li><a href="#" className="hover:text-white transition-colors">Telegram Bot</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 text-gray-600 font-black text-xs uppercase tracking-[0.2em]">
                        <p>© 2026 LIVEKEEPING. ALL RIGHTS RESERVED.</p>
                        <div className="flex gap-12">
                            <span>MADE IN INDIA</span>
                            <span>VERSION 2.0.0</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
