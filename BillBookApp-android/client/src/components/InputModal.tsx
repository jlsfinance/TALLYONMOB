import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

interface InputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (value: string) => void;
    title: string;
    placeholder?: string;
    defaultValue?: string;
    type?: 'text' | 'email' | 'number' | 'password';
    validationMatch?: string; // If set, input must match this (e.g. "DELETE")
    submitLabel?: string;
    description?: string;
}

export const InputModal: React.FC<InputModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    title,
    placeholder,
    defaultValue = '',
    type = 'text',
    validationMatch,
    submitLabel = 'Confirm',
    description
}) => {
    const [value, setValue] = useState(defaultValue);

    useEffect(() => {
        if (isOpen) setValue(defaultValue);
    }, [isOpen, defaultValue]);

    const isValid = validationMatch ? value === validationMatch : value.length > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isValid) {
            onSubmit(value);
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-700"
                    >
                        {/* Header */}
                        <div className="bg-surface-container-high p-6 flex items-center justify-between border-b border-border">
                            <h3 className="text-xl font-bold text-foreground">{title}</h3>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-muted-foreground transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {description && (
                                <p className="text-sm text-muted-foreground">{description}</p>
                            )}

                            <div className="space-y-2">
                                <input
                                    type={type}
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-lg font-bold text-foreground focus:outline-none focus:border-google-blue focus:ring-4 focus:ring-google-blue/10 transition-all"
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={!isValid}
                                className={`w-full py-4 text-white rounded-2xl font-bold text-lg shadow-lg disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 ${validationMatch ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-google-blue hover:bg-google-blue/90 shadow-google-blue/20'
                                    }`}
                            >
                                {submitLabel} <Check className="w-5 h-5" />
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
