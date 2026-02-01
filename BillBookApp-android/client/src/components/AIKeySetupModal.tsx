import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Key, ExternalLink, ShieldCheck, AlertCircle } from 'lucide-react';
import { AIService } from '../services/aiService';
import { HapticService } from '../services/hapticService';

interface AIKeySetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    featureName?: string;
}

export const AIKeySetupModal: React.FC<AIKeySetupModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    featureName
}) => {
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setApiKey(AIService.getApiKey() || '');
            setError('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (!apiKey || apiKey.length < 20) {
            setError('Please enter a valid Gemini API Key');
            HapticService.error();
            return;
        }

        setIsSaving(true);
        try {
            AIService.setApiKey(apiKey);
            HapticService.success();
            onSuccess();
        } catch (err) {
            setError('Failed to save API key');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 overflow-y-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-8 relative overflow-hidden">
                            {/* Animated background elements */}
                            <div className="absolute inset-0 opacity-20">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-3xl animate-pulse" />
                                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full blur-2xl animate-pulse delay-1000" />
                            </div>

                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors z-10"
                            >
                                <X className="w-5 h-5 text-white" />
                            </button>

                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4">
                                    <Sparkles className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-2xl font-black text-white mb-1">
                                    AI Smart Features
                                </h2>
                                <p className="text-white/80 text-sm font-medium">
                                    {featureName ? `To use ${featureName}, you need a free Google Gemini key.` : 'Unlock smart features with a free Gemini API key.'}
                                </p>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                            {/* Steps */}
                            <div className="space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm flex-shrink-0">1</div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Get your free key</p>
                                        <a
                                            href="https://aistudio.google.com/app/apikey"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-bold hover:underline"
                                            onClick={() => HapticService.selection()}
                                        >
                                            Open Google AI Studio <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm flex-shrink-0">2</div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white mb-2">Paste it here</p>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                                <Key className="w-4 h-4 text-slate-400" />
                                            </div>
                                            <input
                                                type="password"
                                                value={apiKey}
                                                onChange={(e) => {
                                                    setApiKey(e.target.value);
                                                    setError('');
                                                }}
                                                placeholder="Paste your API Key..."
                                                className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-sm focus:border-indigo-500 focus:outline-none transition-all"
                                            />
                                        </div>
                                        {error && (
                                            <p className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> {error}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                                <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                <p>Your key is stored <b>locally</b> on your device. We do not store it on our servers.</p>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-2 flex flex-col gap-3">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-200 dark:shadow-none hover:shadow-indigo-400 transition-all flex items-center justify-center gap-2"
                                >
                                    {isSaving ? 'Configuring...' : 'Verify & Enable AI'}
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-full py-4 text-slate-400 dark:text-slate-500 text-sm font-bold hover:text-slate-600 transition-colors"
                                >
                                    Maybe Later
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
