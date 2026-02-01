import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, MapPin, Share2, Sparkles } from 'lucide-react';
import AdBanner from './AdBanner';

interface SponsoredDetailsProps {
    type: 'SHOE' | 'TEA';
    onBack: () => void;
}

const SponsoredDetails: React.FC<SponsoredDetailsProps> = ({ type, onBack }) => {
    // const isNative = Capacitor.isNativePlatform();

    // Interstitial removed to keep Ad and Details on the same page simultaneously
    // useEffect(() => { ... }, []);

    const content = type === 'SHOE' ? {
        title: 'Maheshwari Footwear',
        subtitle: 'Deals in Bairathi & Topseries',
        image: '/banners/slide_shoe_sponsored.png',
        gradient: 'from-indigo-900 via-purple-900 to-slate-900',
        accent: 'indigo',
        description: 'Exclusive collection of premium footwear for men, women, and kids. Visit our store for the latest trends and durable designs perfect for every occasion.'
    } : {
        title: 'Mahesh Tea Company',
        subtitle: 'Deals in Premium Tea',
        image: '/banners/slide_mahesh_tea.png',
        gradient: 'from-orange-900 via-amber-900 to-slate-900',
        accent: 'amber',
        description: 'Experience the rich aroma and taste of premium tea leaves directly from the gardens of Assam. Wholesale rates available for bulk orders.'
    };

    return (
        <div className={`h-screen w-full flex flex-col bg-slate-950 relative overflow-hidden`}>
            {/* Background Gradient */}
            <div className={`absolute inset-0 bg-gradient-to-br ${content.gradient} opacity-80`} />

            {/* Background Texture */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />

            {/* Header */}
            <div className="relative z-20 p-4 pt-[env(safe-area-inset-top)] flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-transform"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-white/10 text-white/90 border border-white/20 inline-flex items-center gap-1 mb-1">
                        <Sparkles className="w-3 h-3" /> Sponsored
                    </span>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 relative z-10 flex flex-col p-6 overflow-y-auto pb-24">

                {/* Product Image */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="w-full aspect-square max-h-[300px] mx-auto mb-8 relative"
                >
                    {/* Glow */}
                    <div className={`absolute inset-0 bg-${content.accent}-500/30 blur-3xl rounded-full mix-blend-screen`} />

                    <img
                        src={content.image}
                        alt={content.title}
                        className="w-full h-full object-contain drop-shadow-2xl relative z-10"
                    />
                </motion.div>

                {/* Info Card */}
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white/10 backdrop-blur-lg border border-white/10 rounded-3xl p-6"
                >
                    <h1 className="text-3xl font-black text-white mb-2 leading-tight">
                        {content.title}
                    </h1>
                    <p className={`text-${content.accent}-200 text-lg font-medium mb-4`}>
                        {content.subtitle}
                    </p>
                    <p className="text-slate-300 text-sm leading-relaxed mb-6">
                        {content.description}
                    </p>

                    {/* Inline Ad Block - Satisfying "Ad and Details on same page" */}
                    <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 mb-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-white/20 text-[9px] font-bold text-white px-2 py-0.5 rounded-bl-lg">
                            ADVERTISEMENT
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-yellow-400" />
                            </div>
                            <div>
                                <h4 className="text-white text-sm font-bold">Limited Time Offer!</h4>
                                <p className="text-slate-400 text-xs">Get 50% off on your first bulk order.</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { icon: Phone, label: "Call Now" },
                            { icon: MapPin, label: "Direction" },
                            { icon: Share2, label: "Share" }
                        ].map((btn, idx) => (
                            <motion.button
                                key={idx}
                                whileTap={{ scale: 0.95 }}
                                className="flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-2xl transition-colors"
                            >
                                <btn.icon className="w-6 h-6 text-white" />
                                <span className="text-xs font-bold text-slate-300">{btn.label}</span>
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Bottom Ad Banner */}
            <div className="w-full relative z-20 bg-slate-900/50 backdrop-blur-md border-t border-white/5">
                <AdBanner position="bottom" showPlaceholder={true} />
            </div>
        </div>
    );
};

export default SponsoredDetails;
