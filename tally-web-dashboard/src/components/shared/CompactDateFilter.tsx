import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, Check } from 'lucide-react';

interface CompactDateFilterProps {
    selectedFy: string;
    onFyChange: (fy: string) => void;
    selectedMonth: string | null;
    onMonthChange: (month: string) => void;
    monthsInFy: { key: string; label: string; fullLabel: string }[];
}

export const CompactDateFilter: React.FC<CompactDateFilterProps> = ({
    selectedFy,
    onFyChange,
    selectedMonth,
    onMonthChange,
    monthsInFy
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const generateFys = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fys = [];
        for (let i = 0; i < 4; i++) {
            const startYear = currentYear - i;
            const endYear = (startYear + 1).toString().slice(2);
            fys.push(`FY ${startYear}-${endYear}`);
        }
        return fys;
    };

    const fys = generateFys();
    const activeMonthLabel = monthsInFy.find(m => m.key === selectedMonth)?.label || 'ALL';

    const shortFy = selectedFy.replace('FY ', '');

    return (
        <div className="relative">
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-1.5 py-1.5 md:px-3 md:py-1.5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl md:rounded-2xl hover:bg-[var(--surface-hover)] transition-all group"
            >
                <div className="p-0.5 md:p-1 bg-[var(--primary)]/10 rounded-lg group-hover:bg-[var(--primary)]/20 transition-colors">
                    <Calendar size={12} className="text-[var(--primary)]" />
                </div>
                <div className="hidden md:flex flex-col items-start leading-none">
                    <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-0.5">Period</span>
                    <span className="text-[10px] font-black text-[var(--on-surface)] uppercase">{shortFy} ? {activeMonthLabel}</span>
                </div>
                <ChevronDown size={12} className={`hidden md:block text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                <div className="md:hidden flex items-center gap-0.5">
                    <ChevronDown size={8} className={`text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown Popover */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute right-0 mt-2 w-[180px] max-md:w-[calc(100vw-32px)] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                        >
                            <div className="p-2 space-y-2">
                                {/* Year Selection */}
                                <div>
                                    <div className="flex items-center justify-between mb-1 px-0.5">
                                        <span className="text-[7px] font-black text-[var(--text-muted)] uppercase tracking-[1.5px]">Year</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {fys.map(fy => (
                                            <button
                                                key={fy}
                                                onClick={() => onFyChange(fy)}
                                                className={`
                                                    py-0.5 px-1 rounded-lg text-[7px] font-black tracking-wider transition-all border
                                                    ${selectedFy === fy
                                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                                                        : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                                    }
                                                `}
                                            >
                                                    fy.replace('FY ', '')
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Month Selection */}
                                <div>
                                    <div className="flex items-center justify-between mb-1 px-0.5">
                                        <span className="text-[7px] font-black text-[var(--text-muted)] uppercase tracking-[1.5px]">Month</span>
                                        {selectedMonth !== 'all' && (
                                            <button
                                                onClick={() => onMonthChange('all')}
                                                className="text-[6px] font-black text-[var(--primary)] uppercase hover:underline"
                                            >
                                                All
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-4 gap-0.5">
                                        {monthsInFy.map(m => (
                                            <button
                                                key={m.key}
                                                onClick={() => {
                                                    onMonthChange(m.key);
                                                    if (m.key !== 'all') setIsOpen(false);
                                                }}
                                                className={`
                                                    py-1 rounded-md text-[6px] font-black uppercase transition-all border relative
                                                    ${selectedMonth === m.key
                                                        ? 'bg-[var(--on-surface)] border-[var(--on-surface)] text-[var(--surface)]'
                                                        : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                                    }
                                                `}
                                            >
                                                {m.label === 'ALL' ? 'ALL' : m.label}
                                                {selectedMonth === m.key && (
                                                    <div className="absolute -top-1 -right-1 bg-[var(--primary)] text-white rounded-full p-0.5 shadow-sm">
                                                        <Check size={6} strokeWidth={4} />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Action */}
                            <div className="bg-[var(--surface-variant)] p-1.5 border-t border-[var(--border)]">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-full py-1 bg-[var(--on-surface)] text-[var(--surface)] text-[7px] font-black uppercase rounded-lg hover:opacity-90 transition-opacity"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
