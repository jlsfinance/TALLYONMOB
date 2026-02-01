import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, TrendingUp, Sun } from 'lucide-react';
import { NotificationService } from '../services/notificationService';

interface DailyBriefingProps {
    onClose: () => void;
}

export const DailyBriefing: React.FC<DailyBriefingProps> = ({ onClose }) => {
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAndLoad = async () => {
            // Check if already seen today
            const lastSeen = localStorage.getItem('last_seen_daily_briefing');
            const today = new Date().toISOString().split('T')[0];

            if (lastSeen === today) {
                onClose();
                return;
            }

            try {
                const data = await NotificationService.getYesterdaySalesSummary();
                setSummary(data);
                // Mark as seen ONLY after successfully loading and about to show
                localStorage.setItem('last_seen_daily_briefing', today);
            } catch (e) {
                console.error("Failed to load briefing", e);
                onClose(); // Close if error
            } finally {
                setLoading(false);
            }
        };

        checkAndLoad();

        // Auto dismiss after 5 seconds
        const timer = setTimeout(() => {
            onClose();
        }, 5000);

        return () => clearTimeout(timer);
    }, [onClose]);

    if (loading || !summary) return null;

    const isGoodDay = summary.totalSales > 0;

    // Catchy/Flirty Lines (Professional but Engaging)
    const successLines = [
        "Yesterday was 🔥! Use that heat today!",
        "Killing it! 🚀 Keep the momentum going!",
        "Paisa hi Paisa! 💸 Let's break record today!",
        "Your business is glowing! ✨ Good job!",
        "Uff! Your sales are looking hot today! 🥵",
        "Business magnet ho aap! 🧲 Customers khiche chale aate hain!",
        "Kya baat hai! Chaap diya kal toh! 🤑",
        "Money looks good on you! 💅 Keep earning!"
    ];

    const motivationalLines = [
        "New Day, New Hustle! 💪 Let's make it count.",
        "A quiet yesterday means a loud today! 🚀",
        "Opportunities are knocking! 🚪 Open the shop!",
        "Tere bina system adhoora hai! 😉 Get to work!",
        "Missing you at the top! 📉 Let's climb today!",
        "Kal thoda low tha, par aaj High Voltage hoga! ⚡",
        "Sabr ka phal... Profit hota hai! 🍎 Lage raho!",
        "Business is a crush that needs daily attention! 💖"
    ];

    const randomLine = isGoodDay
        ? successLines[Math.floor(Math.random() * successLines.length)]
        : motivationalLines[Math.floor(Math.random() * motivationalLines.length)];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -100, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="fixed top-4 left-4 right-4 z-50 flex justify-center pointer-events-none"
            >
                <motion.div
                    // Allow tapping to dismiss
                    onClick={onClose}
                    className="pointer-events-auto bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-2xl border border-white/20 dark:border-slate-700 p-4 rounded-2xl w-full max-w-sm cursor-pointer hover:scale-105 transition-transform"
                    whileTap={{ scale: 0.95 }}
                >
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${isGoodDay ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            {isGoodDay ? <TrendingUp size={24} /> : <Sun size={24} />}
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                                {isGoodDay ? "Yesterday's Report 📊" : "Good Morning! ☀️"}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {isGoodDay ? `You made ₹${summary.totalSales.toLocaleString()} yesterday.` : "Ready to start billing?"}
                            </p>
                            <p className="text-xs font-medium text-rose-500 mt-2 italic">
                                "{randomLine}"
                            </p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-slate-400 hover:text-slate-600">
                            <X size={16} />
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
