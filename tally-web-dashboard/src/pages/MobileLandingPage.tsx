import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    RefreshCw,
    ArrowRight,
    Sparkles,
    ShieldCheck,
    Zap
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export default function MobileLandingPage() {
    const navigate = useNavigate();
    const isNative = Capacitor.isNativePlatform();

    // If accessed on web, maybe show download link? 
    // But for now this is primarily for the App entry.

    return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden font-sans">
            {/* Background Gradients */}
            <div className="absolute top-[-20%] right-[-20%] w-[80vw] h-[80vw] bg-blue-600/20 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-cyan-500/10 rounded-full blur-[80px]" />

            {/* Content Container */}
            <div className="flex-1 flex flex-col px-6 pt-12 pb-8 z-10">

                {/* Logo / Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="flex flex-col items-center mt-8 mb-12"
                >
                    <div className="relative mb-6">
                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
                            <RefreshCw size={48} className="text-white animate-spin-slow" />
                        </div>
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-[#0f172a] animate-pulse" />
                    </div>

                    <h1 className="text-4xl font-black tracking-tighter mb-2">
                        Tally<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Link</span>
                    </h1>
                    <p className="text-slate-400 text-center text-sm font-medium px-4 leading-relaxed">
                        Your Business. In Your Pocket.<br />Real-time Tally Sync.
                    </p>
                </motion.div>

                {/* Features Cards */}
                <div className="flex-1 space-y-4 mb-8">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center gap-4"
                    >
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                            <Zap size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">Instant Sync</h3>
                            <p className="text-xs text-slate-400">Live data from Tally Prime/ERP9</p>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center gap-4"
                    >
                        <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">AI Assistant</h3>
                            <p className="text-xs text-slate-400">Ask questions about your sales</p>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center gap-4"
                    >
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">100% Secure</h3>
                            <p className="text-xs text-slate-400">End-to-end encrypted data</p>
                        </div>
                    </motion.div>
                </div>

                {/* Bottom Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="mt-auto space-y-4"
                >
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                    >
                        Get Started
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                        onClick={() => navigate('/privacy')}
                        className="w-full text-center text-xs text-slate-500 font-medium hover:text-slate-400 transition-colors"
                    >
                        Terms of Service & Privacy Policy
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
