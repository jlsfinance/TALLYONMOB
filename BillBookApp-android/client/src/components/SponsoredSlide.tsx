import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, MapPin, FileText, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import admobService from '@/services/AdmobService';

interface SponsoredSlideProps {
    onInteraction?: (isActive: boolean) => void;
    type?: 'SHOE' | 'TEA';
    onOpenDetails?: () => void;
}

const SponsoredSlide: React.FC<SponsoredSlideProps> = ({ onInteraction, type = 'SHOE', onOpenDetails }) => {
    const sessionKey = type === 'SHOE' ? 'sponsored_shown_v1' : 'sponsored_shown_tea_v1';

    // We keep this simple now - always show initial teaser
    // The details are shown in a separate page

    return (
        <motion.div
            layout
            className={`w-full h-[110px] rounded-[16px] relative overflow-hidden shadow-sm border border-slate-100 transition-all px-5 py-0 flex items-center justify-between bg-gradient-to-br from-slate-900 to-slate-800`}
        >
            {/* --- INITIAL STATE --- */}
            <div className="w-full flex items-center justify-between z-10">
                <div className="flex-1">
                    <motion.h3
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-white text-lg font-bold leading-tight"
                    >
                        {type === 'SHOE' ? (
                            <>
                                Looking to buy <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                                    Footwear?
                                </span> 👟
                            </>
                        ) : (
                            <>
                                Kirana kharidna h? <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-orange-400">
                                    Checkout Deals
                                </span> ☕
                            </>
                        )}
                    </motion.h3>
                </div>

                <motion.button
                    whileTap={{ scale: 0.9 }}
                    animate={{
                        scale: [1, 1.05, 1],
                        boxShadow: [
                            "0 0 0 0 rgba(79, 70, 229, 0)",
                            "0 0 0 4px rgba(79, 70, 229, 0.3)",
                            "0 0 0 0 rgba(79, 70, 229, 0)"
                        ]
                    }}
                    transition={{
                        repeat: Infinity,
                        duration: 2
                    }}
                    onClick={() => {
                        if (onOpenDetails) onOpenDetails();
                        if (onInteraction) onInteraction(true);
                    }}
                    className="bg-white text-slate-900 font-bold text-xs py-2.5 px-5 rounded-full shadow-lg flex items-center gap-2 z-20"
                >
                    {type === 'SHOE' ? 'YES, SHOW ME' : 'HAAN, DIKHAO'}
                </motion.button>
            </div>

            {/* Background Texture/Particles (Optional subtle effect) */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay pointer-events-none" />
        </motion.div>
    );
};

export default SponsoredSlide;
