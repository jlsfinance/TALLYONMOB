/**
 * AdBanner Component
 * Shows native AdMob banner on mobile, placeholder on web
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import admobService from '@/services/AdmobService';

interface AdBannerProps {
    position?: 'top' | 'bottom';
    showPlaceholder?: boolean;
    className?: string;
    onAdLoaded?: () => void;
}

const AdBanner: React.FC<AdBannerProps> = ({
    position = 'bottom',
    showPlaceholder = true,
    className = '',
    onAdLoaded
}) => {
    const [adShown, setAdShown] = useState(false);
    const isNative = Capacitor.isNativePlatform();

    useEffect(() => {
        let mounted = true;

        const showAd = async () => {
            if (isNative) {
                const success = await admobService.showBanner(position);
                if (mounted) {
                    setAdShown(success);
                    if (success && onAdLoaded) {
                        onAdLoaded();
                    }
                }
            }
        };

        showAd();

        return () => {
            mounted = false;
            if (isNative) {
                admobService.hideBanner();
            }
        };
    }, [isNative, position, onAdLoaded]);

    // On native, the banner is shown by AdMob SDK
    // We render a spacer if ad is shown, unless handled by parent
    if (isNative) {
        if (adShown) {
            return (
                <div
                    className={`w-full h-[60px] bg-transparent ${className}`}
                    style={{
                        paddingBottom: position === 'bottom' ? 'env(safe-area-inset-bottom)' : 0
                    }}
                />
            );
        }
        return null;
    }

    // Web placeholder (for development/testing)
    if (!isNative && showPlaceholder) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`w-full ${className}`}
            >
                <div className="bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-center gap-3 py-3 px-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                                <Megaphone className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Sponsored
                                </p>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    Ad Banner Placeholder
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                            <Sparkles className="w-3 h-3" />
                            <span className="text-[9px] font-bold uppercase">Web Preview</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    return null;
};

export default AdBanner;
