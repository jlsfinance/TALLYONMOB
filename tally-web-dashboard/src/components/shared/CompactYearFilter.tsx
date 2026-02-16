import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Check, ChevronDown } from 'lucide-react';

interface CompactYearFilterProps {
    selectedFy: string;
    onFyChange: (fy: string) => void;
}

export const CompactYearFilter: React.FC<CompactYearFilterProps> = ({ selectedFy, onFyChange }) => {
    const [isOpen, setIsOpen] = useState(false);

    const generateFys = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fys = [];
        for (let i = 0; i < 5; i++) {
            const startYear = currentYear - i;
            const endYear = (startYear + 1).toString().slice(2);
            fys.push(`FY ${startYear}-${endYear}`);
        }
        return fys;
    };

    const fys = generateFys();

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2 py-2 md:px-3 md:py-1.5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface-hover)] transition-all"
            >
                <Calendar size={14} className="text-[var(--primary)]" />
                <span className="hidden md:block text-[10px] font-black uppercase tracking-widest text-[var(--on-surface)]">{selectedFy}</span>
                <ChevronDown size={10} className={`text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 mt-2 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-2 space-y-1">
                                {fys.map((fy) => (
                                    <button
                                        key={fy}
                                        onClick={() => {
                                            onFyChange(fy);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${selectedFy === fy
                                            ? 'bg-[var(--primary)] text-white'
                                            : 'text-[var(--on-surface)] hover:bg-[var(--surface-variant)]'
                                            }`}
                                    >
                                        {fy}
                                        {selectedFy === fy && <Check size={12} />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
