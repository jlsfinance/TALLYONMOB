import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowRight,
    Smartphone,
    Monitor,
    Cloud,
    Zap,
    Shield,
    RefreshCw,
    CheckCircle
} from 'lucide-react';

export default function LandingPage3D() {
    const navigate = useNavigate();

    const steps = [
        {
            icon: <Monitor size={32} />,
            title: "Tally ERP on PC",
            desc: "Your desktop Tally data stays secure",
            color: "blue"
        },
        {
            icon: <Cloud size={32} />,
            title: "Cloud Sync",
            desc: "Encrypted real-time synchronization",
            color: "purple"
        },
        {
            icon: <Smartphone size={32} />,
            title: "Mobile Access",
            desc: "Access anywhere, anytime",
            color: "emerald"
        },
    ];

    const features = [
        "Real-time voucher sync",
        "Ledger & party management",
        "Inventory tracking",
        "GST reports",
        "Outstanding alerts",
        "Multi-company support",
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-blue-600/5 rounded-full blur-[150px]" />
                <div className="absolute bottom-[-300px] right-[-200px] w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px]" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
                        <span className="text-white font-bold text-lg">L</span>
                    </div>
                    <span className="font-bold text-lg">LiveKeeping</span>
                </div>
                <button
                    onClick={() => navigate('/')}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
                >
                    Go to Dashboard
                </button>
            </header>

            {/* Hero Section */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-32 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        System Operational
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
                        Your Tally,
                        <br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                            Everywhere.
                        </span>
                    </h1>

                    <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
                        Seamlessly sync your Tally ERP data to any device. Real-time access to vouchers, ledgers, and reports - without touching your PC.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-gray-100 transition-colors flex items-center gap-2 group"
                        >
                            Open Dashboard
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button
                            onClick={() => window.open('/TallyLink.exe', '_blank')}
                            className="px-8 py-4 bg-white/5 border border-white/10 font-semibold rounded-2xl hover:bg-white/10 transition-colors"
                        >
                            Download Sync App
                        </button>
                    </div>
                </motion.div>
            </section>

            {/* How It Works */}
            <section className="relative z-10 max-w-5xl mx-auto px-6 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
                    <p className="text-gray-400">Simple 3-step sync process</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {steps.map((step, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: index * 0.1 }}
                            viewport={{ once: true }}
                            className="relative"
                        >
                            <div className={`
                                bg-[#121214] border border-white/10 rounded-3xl p-8 text-center
                                hover:border-white/20 transition-all duration-300 h-full
                            `}>
                                <div className={`
                                    w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 border
                                    ${step.color === 'blue' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : ''}
                                    ${step.color === 'purple' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : ''}
                                    ${step.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : ''}
                                `}>
                                    {step.icon}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                                <p className="text-gray-500">{step.desc}</p>
                            </div>

                            {/* Connector Line */}
                            {index < steps.length - 1 && (
                                <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-[2px] bg-gradient-to-r from-white/20 to-transparent" />
                            )}
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Features Grid */}
            <section className="relative z-10 max-w-5xl mx-auto px-6 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="bg-[#121214] border border-white/10 rounded-3xl p-8 md:p-12"
                >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                        <div>
                            <h2 className="text-3xl font-bold mb-4">Everything you need</h2>
                            <p className="text-gray-400">All your Tally data, accessible everywhere.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {features.map((feature, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm">
                                    <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                                    <span className="text-gray-300">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* CTA */}
            <section className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-3xl md:text-4xl font-bold mb-6">
                        Ready to get started?
                    </h2>
                    <p className="text-gray-400 mb-8">
                        Download the desktop sync app and connect your first company in minutes.
                    </p>
                    <button
                        onClick={() => window.open('/TallyLink.exe', '_blank')}
                        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto"
                    >
                        <Zap size={18} />
                        Download Now
                    </button>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 border-t border-white/5 py-8 text-center text-gray-500 text-sm">
                <p>© 2026 LiveKeeping. All rights reserved.</p>
            </footer>
        </div>
    );
}
