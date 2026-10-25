import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function SmoothLoader() {
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log('SmoothLoader initialized');
        const interval = setInterval(() => {
            setProgress(prev => {
                const next = prev + (Math.random() * 15 + 2);
                console.log('Loader Progress:', next);
                if (next >= 100) {
                    clearInterval(interval);
                    console.log('Loader complete, fading out...');
                    setTimeout(() => setLoading(false), 500);
                    return 100;
                }
                return next;
            });
        }, 80);

        return () => {
            console.log('SmoothLoader cleanup');
            clearInterval(interval);
        };
    }, []);

    return (
        <AnimatePresence>
            {loading && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
                    transition={{ duration: 1, ease: 'easeInOut' }}
                    className="fixed inset-0 z-[10000] bg-[#030712] flex flex-col items-center justify-center p-6"
                >
                    {/* 3D-like Rotating Cube/Element */}
                    <div className="relative w-24 h-24 mb-12 perspective-1000">
                        <motion.div
                            animate={{
                                rotateX: [0, 360],
                                rotateY: [0, 360],
                                scale: [1, 1.1, 1]
                            }}
                            transition={{
                                duration: 4,
                                repeat: Infinity,
                                ease: "linear"
                            }}
                            className="w-full h-full relative preserve-3d"
                        >
                            {/* Inner Glow */}
                            <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-xl animate-pulse" />

                            {/* Glass Face 1 */}
                            <div className="absolute inset-0 bg-white/5 border border-white/20 rounded-2xl backdrop-blur-md" />

                            {/* Content */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-cyan-400 font-black text-xs tracking-widest uppercase">TL</span>
                            </div>
                        </motion.div>
                    </div>

                    <div className="w-64 max-w-full">
                        <div className="flex justify-between items-end mb-3">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Initializing</h3>
                                <p className="text-[10px] font-bold text-gray-600 uppercase mt-1 tracking-widest">Quantum Engine 2.9.7</p>
                            </div>
                            <span className="text-xl font-black text-white tabular-nums">{Math.floor(progress)}%</span>
                        </div>

                        {/* Progress Track */}
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 p-[1px]">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 rounded-full"
                            />
                        </div>
                    </div>

                    <p className="fixed bottom-12 text-[9px] font-bold text-gray-700 uppercase tracking-[0.5em] animate-pulse">
                        Synchronizing Secure Tally Tunnels
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
