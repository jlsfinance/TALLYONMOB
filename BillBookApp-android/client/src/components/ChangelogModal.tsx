import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check } from 'lucide-react';

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
    version: string;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose, version }) => {
    const changelogs = [
        {
            version: '2.4.2',
            date: '25 Jan 2026',
            features: [
                '🚀 Performance optimization and stability improvements',
                '🎨 UI refinements and better layouts',
                '🐛 General bug fixes and security updates',
            ],
        },
        {
            version: '1.9.8',
            date: '14 Jan 2026',
            features: [
                '🎤 Voice Input - Now with proper microphone permission request',
                '🔔 Daily Sales Notifications - Get your sales summary every evening at 9 PM',
                '📋 Improved invoice generation with better PDF quality',
                '🐛 Bug fixes and performance improvements',
            ],
        },
        {
            version: '1.0.4',
            date: '4 Jan 2026',
            features: [
                '💳 Enhanced payment tracking system',
                '📊 Better dashboard analytics',
                '🔒 Improved data security',
            ],
        },
        // Add more versions as needed
    ];

    // Find current version changelog
    const currentChangelog = changelogs.find(log => log.version === version) || changelogs[0];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/70 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-700"
                    >
                        {/* Header with gradient */}
                        <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-8 relative overflow-hidden">
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
                                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4">
                                    <Sparkles className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2">
                                    What's New
                                </h2>
                                <p className="text-white/80 font-medium">
                                    Version {currentChangelog.version} • {currentChangelog.date}
                                </p>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 max-h-[50vh] overflow-y-auto">
                            <div className="space-y-4">
                                {currentChangelog.features.map((feature, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-4"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        </div>
                                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                            {feature}
                                        </p>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Previous versions summary */}
                            {changelogs.length > 1 && (
                                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                        Previous Updates
                                    </p>
                                    <div className="space-y-2">
                                        {changelogs.slice(1, 3).map((log, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
                                            >
                                                <span className="font-medium">v{log.version}</span>
                                                <span>{log.date}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700">
                            <button
                                onClick={onClose}
                                className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-sm hover:shadow-lg hover:shadow-blue-500/50 active:scale-95 transition-all"
                            >
                                Got it, thanks! 🎉
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
