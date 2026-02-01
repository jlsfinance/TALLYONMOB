
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Invoice } from '@/types';
import { CheckCircle2, Share2, Printer, Home, Quote } from 'lucide-react';
import AdBanner from './AdBanner';
import admobService from '@/services/AdmobService';


interface PostSaveSummaryProps {
    invoice: Invoice;
    onGoHome: () => void;
    onViewInvoice: () => void;
}

const BUSINESS_QUOTES = [
    "Opportunities don't happen. You create them.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "Business is all about relationships, how well you build them determines how well they build your business.",
    "The secret of business is to know something that nobody else knows.",
    "Quality is more important than quantity. One home run is much better than two doubles.",
    "Your most unhappy customers are your greatest source of learning.",
    "Don't deliver a product, deliver an experience.",
    "The only way to do great work is to love what you do.",
    "Innovation distinguishes between a leader and a follower.",
    "Believe you can and you're halfway there."
];

const PostSaveSummary: React.FC<PostSaveSummaryProps> = ({ invoice, onGoHome, onViewInvoice }) => {
    const [quote, setQuote] = useState('');
    const [isNativeAdLoaded, setIsAdLoaded] = useState(false);

    useEffect(() => {
        // Pick a random quote
        const randomQuote = BUSINESS_QUOTES[Math.floor(Math.random() * BUSINESS_QUOTES.length)];
        setQuote(randomQuote);

        // Show interstitial ad after save (with delay for better UX)
        const showInterstitialAd = async () => {
            try {
                // Wait a bit before showing ad to let user see the success message
                await new Promise(resolve => setTimeout(resolve, 1500));
                await admobService.showInterstitial();
            } catch (error) {
                console.log('[PostSaveSummary] Interstitial ad not available');
            }
        };

        // Initialize and show ad
        admobService.initialize().then(() => {
            showInterstitialAd();
        });
    }, []);

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-between p-4 relative overflow-hidden">

            {/* Dynamic Background Elements */}
            <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] bg-green-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-3xl" />

            {/* 1. Top Section: Success & Summary */}
            <div className="w-full max-w-md flex flex-col items-center z-10 mt-4">
                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                        type: 'spring',
                        stiffness: 260,
                        damping: 20,
                        delay: 0.1
                    }}
                    className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30 mb-4"
                >
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                            delay: 0.3,
                            duration: 0.5,
                            type: "spring"
                        }}
                    >
                        <CheckCircle2 className="w-8 h-8 text-white" strokeWidth={3} />
                    </motion.div>
                </motion.div>

                <motion.h1
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl font-black text-slate-900 dark:text-white mb-2"
                >
                    Invoice Saved!
                </motion.h1>

                <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="w-full bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-emerald-600" />

                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Amount</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{formatCurrency(invoice.total)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Invoice #</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">{invoice.invoiceNumber}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-400">
                            {invoice.customerName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{invoice.customerName}</p>
                            <p className="text-[9px] text-slate-500 font-medium">Customer</p>
                        </div>
                    </div>
                </motion.div>

                {/* Quick Actions Row */}
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex gap-3 mt-4 w-full"
                >
                    <button onClick={onViewInvoice} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                        <Printer className="w-3.5 h-3.5" /> Print / Share
                    </button>
                </motion.div>
            </div>

            {/* 2. Middle: Random Business Quote */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="max-w-md mx-auto text-center px-4 py-4 relative z-10"
            >
                <Quote className="w-6 h-6 text-slate-300 dark:text-slate-700 mx-auto mb-2 opacity-50" />
                <p className="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 italic font-serif leading-relaxed">
                    "{quote}"
                </p>
                <div className="w-10 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mt-4 rounded-full opacity-50" />
            </motion.div>

            {/* 3. Middle/Bottom: Action Button (Moved UP) */}
            <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="w-full max-w-md px-4 z-20"
            >
                <button
                    onClick={onGoHome}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 group"
                >
                    Go to Dashboard
                    <Home className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
            </motion.div>

            {/* 4. Bottom: AdMob Banner Ad (Moved DOWN to replace Promo Slot) */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="w-full max-w-md pb-4"
            >
                <AdBanner
                    position="bottom"
                    showPlaceholder={true}
                    className="mb-0"
                    onAdLoaded={() => setIsAdLoaded(true)}
                />

                {/* Fallback promo - Hidden when Native Ad is loaded */}
                {!isNativeAdLoaded && (
                    <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-3 text-white relative overflow-hidden shadow-lg mx-4 mt-2">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl translate-x-8 -translate-y-8" />

                        <div className="relative z-10 flex justify-between items-center">
                            <div>
                                <span className="bg-white/20 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest mb-1.5 inline-block">Sponsored</span>
                                <h3 className="text-sm font-bold mb-0.5">Grow with JLS Premium</h3>
                                <p className="text-[10px] text-white/80 max-w-[180px]">Unlock advanced analytics and multi-user support today.</p>
                            </div>
                            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20">
                                <Share2 className="w-6 h-6 text-white" />
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>

        </div>
    );
};

export default PostSaveSummary;
