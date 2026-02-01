import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

interface AlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    variant?: 'danger' | 'info' | 'success' | 'warning';
}

export const AlertModal: React.FC<AlertModalProps> = ({
    isOpen,
    onClose,
    title,
    message,
    variant = 'info'
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (variant) {
            case 'danger': return <AlertCircle className="w-6 h-6 text-red-600" />;
            case 'warning': return <AlertCircle className="w-6 h-6 text-orange-600" />;
            case 'success': return <CheckCircle className="w-6 h-6 text-green-600" />;
            default: return <Info className="w-6 h-6 text-blue-600" />;
        }
    };

    const getColors = () => {
        switch (variant) {
            case 'danger': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
            case 'warning': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
            case 'success': return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
            default: return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-[110] backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <div className="fixed inset-0 z-[111] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                            className="bg-white dark:bg-slate-900 w-full max-w-xs sm:max-w-sm rounded-[28px] shadow-2xl border border-white/10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 text-center">
                                <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${getColors()}`}>
                                    {getIcon()}
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                                    {title}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                                    {message}
                                </p>
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 px-4 rounded-xl text-sm font-bold text-white shadow-lg transition-transform active:scale-95 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600"
                                >
                                    OK
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
