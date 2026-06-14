import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Smartphone, Receipt, ArrowRight, LogOut } from 'lucide-react';

export default function ModuleSelectionPage() {
    const { setAppMode, signOut } = useAuth() as any;
    const { navigate } = useSafeNavigate();

    const handleSelect = (mode: 'tally' | 'billing') => {
        setAppMode(mode);
        navigate('/select-company');
    };

    const modules = [
        {
            mode: 'tally' as const,
            icon: <Smartphone size={28} />,
            iconBg: 'bg-blue-50 dark:bg-blue-500/10',
            iconColor: 'text-blue-600 dark:text-blue-400',
            hoverBorder: 'hover:border-blue-300 dark:hover:border-blue-500/30',
            title: 'Tally on Mobile',
            desc: 'Access your real-time Tally data, ledgers, and reports anywhere. Perfect for accounting-heavy users.',
            tag: 'Most Popular',
            tagColor: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
        },
        {
            mode: 'billing' as const,
            icon: <Receipt size={28} />,
            iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            hoverBorder: 'hover:border-emerald-300 dark:hover:border-emerald-500/30',
            title: 'Billing & Invoicing',
            desc: 'Create invoices, manage inventory, and handle GST billing quickly. Fast and cashier-friendly.',
            tag: 'Quick Start',
            tagColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
        },
    ];

    return (
        <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-6 transition-colors duration-300">

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10 max-w-xl"
            >
                <h1 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)] tracking-tight mb-3">
                    How do you want to use TallyLink?
                </h1>
                <p className="text-[var(--text-muted)] text-sm">
                    Choose a module that fits your workflow. You can switch anytime.
                </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl">
                {modules.map((mod, i) => (
                    <motion.div
                        key={mod.mode}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        onClick={() => handleSelect(mod.mode)}
                        className="cursor-pointer group"
                    >
                        <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-7 transition-all duration-200 ${mod.hoverBorder} hover:shadow-[var(--shadow-lg)] relative`}>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold mb-5 ${mod.tagColor}`}>
                                {mod.tag}
                            </span>

                            <div className={`w-14 h-14 rounded-[var(--radius-md)] ${mod.iconBg} ${mod.iconColor} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform`}>
                                {mod.icon}
                            </div>

                            <h2 className="text-lg font-bold text-[var(--on-surface)] mb-2">{mod.title}</h2>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-6">{mod.desc}</p>

                            <div className="flex items-center gap-1.5 text-[var(--primary)] text-sm font-semibold group-hover:gap-3 transition-all">
                                Get Started <ArrowRight size={15} />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={() => { signOut(); navigate('/login'); }}
                className="mt-10 flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
            >
                <LogOut size={14} />
                Sign Out
            </motion.button>
        </div>
    );
}

