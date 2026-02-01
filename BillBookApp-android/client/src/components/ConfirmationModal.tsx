import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle, Trash2 } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'info' | 'success' | 'warning';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'info'
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (variant) {
            case 'danger': return <Trash2 className="w-6 h-6 text-red-600" />;
            case 'warning': return <AlertTriangle className="w-6 h-6 text-orange-600" />;
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
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-[110] backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal Card */}
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
                                {/* Icon */}
                                <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${getColors()}`}>
                                    {getIcon()}
                                </div>

                                {/* Content */}
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                                    {title}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                                    {message}
                                </p>

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        {cancelText}
                                    </button>
                                    <button
                                        onClick={() => {
                                            onConfirm();
                                            onClose();
                                        }}
                                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white shadow-lg transition-transform active:scale-95 ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' :
                                            variant === 'warning' ? 'bg-orange-600 hover:bg-orange-700' :
                                                variant === 'success' ? 'bg-green-600 hover:bg-green-700' :
                                                    'bg-blue-600 hover:bg-blue-700'
                                            }`}
                                    >
                                        {confirmText}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
