import React from 'react';
import { motion } from 'framer-motion';
import { Server, FileText, CheckCircle2 } from 'lucide-react';

interface WelcomeScreenProps {
    onSelect: (mode: 'TALLY' | 'NORMAL') => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelect }) => {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-md w-full">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Welcome to BillBook</h1>
                    <p className="text-slate-400">How would you like to use the app?</p>
                </div>

                <div className="grid gap-4">
                    {/* Tally Option */}
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect('TALLY')}
                        className="group relative p-6 bg-slate-900/50 hover:bg-slate-900 border-2 border-slate-800 hover:border-blue-500 rounded-2xl transition-all text-left"
                    >
                        <div className="absolute top-4 right-4">
                            {/* Checkbox circle */}
                            <div className="w-6 h-6 rounded-full border-2 border-slate-700 group-hover:border-blue-500 group-hover:bg-blue-500 flex items-center justify-center transition-colors">
                                <CheckCircle2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                        </div>

                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400 group-hover:scale-110 transition-transform">
                            <Server className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Tally on Mobile</h3>
                        <p className="text-sm text-slate-400 leading-snug">
                            Sync data from your PC Tally. View Sales, Outstanding, and Reports live.
                        </p>
                    </motion.button>

                    {/* Normal Billing Option */}
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect('NORMAL')}
                        className="group relative p-6 bg-slate-900/50 hover:bg-slate-900 border-2 border-slate-800 hover:border-emerald-500 rounded-2xl transition-all text-left"
                    >
                        <div className="absolute top-4 right-4">
                            <div className="w-6 h-6 rounded-full border-2 border-slate-700 group-hover:border-emerald-500 group-hover:bg-emerald-500 flex items-center justify-center transition-colors">
                                <CheckCircle2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                        </div>

                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400 group-hover:scale-110 transition-transform">
                            <FileText className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Normal Billing</h3>
                        <p className="text-sm text-slate-400 leading-snug">
                            Create Invoices, Manage Stock, and Parties manually on this device.
                        </p>
                    </motion.button>
                </div>
            </div>
        </div>
    );
};
