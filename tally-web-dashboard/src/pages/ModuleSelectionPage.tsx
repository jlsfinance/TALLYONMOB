import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Smartphone, Receipt, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/GlassUI';

export default function ModuleSelectionPage() {
    const { setAppMode } = useAuth() as any;
    const navigate = useNavigate();

    const handleSelect = (mode: 'tally' | 'billing') => {
        setAppMode(mode);
        if (mode === 'tally') {
            navigate('/select-company');
        } else {
            navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12 relative z-10"
            >
                <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
                    Choose how you want to use <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">TallySync</span>
                </h1>
                <p className="text-[var(--on-surface-variant)] text-lg">
                    Manage your business your way
                </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative z-10">
                {/* Tally on Mobile */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect('tally')}
                    className="cursor-pointer"
                >
                    <Card
                        padding="xl"
                        className="h-full border-white/5 hover:border-blue-500/30 transition-all duration-300 group overflow-hidden relative"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Smartphone size={120} />
                        </div>

                        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-6 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                            <Smartphone size={32} />
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-3">Tally on Mobile</h2>
                        <p className="text-[var(--on-surface-variant)] mb-8 leading-relaxed">
                            Access your real-time Tally data, ledgers, and reports anywhere. Perfect for accounting-heavy users.
                        </p>

                        <div className="flex items-center gap-2 text-cyan-400 font-semibold group-hover:gap-4 transition-all uppercase tracking-wider text-xs">
                            Select Module <ArrowRight size={16} />
                        </div>
                    </Card>
                </motion.div>

                {/* Billing */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect('billing')}
                    className="cursor-pointer"
                >
                    <Card
                        padding="xl"
                        className="h-full border-white/5 hover:border-emerald-500/30 transition-all duration-300 group overflow-hidden relative"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Receipt size={120} />
                        </div>

                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                            <Receipt size={32} />
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-3">Billing & Invoicing</h2>
                        <p className="text-[var(--on-surface-variant)] mb-8 leading-relaxed">
                            Create invoices, manage inventory, and handle GST billing quickly. Fast and cashier-friendly.
                        </p>

                        <div className="flex items-center gap-2 text-emerald-400 font-semibold group-hover:gap-4 transition-all uppercase tracking-wider text-xs">
                            Select Module <ArrowRight size={16} />
                        </div>
                    </Card>
                </motion.div>
            </div>

            {/* Logout Option */}
            <button
                onClick={() => navigate('/login')}
                className="mt-12 text-[var(--on-surface-variant)] hover:text-white transition-colors text-sm font-medium"
            >
                Back to Login
            </button>
        </div>
    );
}
