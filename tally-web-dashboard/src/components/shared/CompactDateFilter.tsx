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

    return (
        <div className="relative">
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 py-2 md:px-4 md:py-2 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl md:rounded-2xl hover:bg-[var(--surface-hover)] transition-all group"
            >
                <div className="p-1 md:p-1.5 bg-[var(--primary)]/10 rounded-lg group-hover:bg-[var(--primary)]/20 transition-colors">
                    <Calendar size={14} className="text-[var(--primary)]" />
                </div>
                <div className="hidden md:flex flex-col items-start leading-none">
                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-0.5">Period</span>
                    <span className="text-[11px] font-black text-[var(--on-surface)] uppercase">{selectedFy} • {activeMonthLabel}</span>
                </div>
                <ChevronDown size={14} className={`hidden md:block text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                <div className="md:hidden flex items-center gap-0.5">
                    <ChevronDown size={10} className={`text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
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
                            className="absolute right-0 mt-3 w-[280px] bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                        >
                            <div className="p-5 space-y-6">
                                {/* Year Selection */}
                                <div>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[3px]">Financial Year</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {fys.map(fy => (
                                            <button
                                                key={fy}
                                                onClick={() => onFyChange(fy)}
                                                className={`
                                                    py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border
                                                    ${selectedFy === fy
                                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                                                        : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                                    }
                                                `}
                                            >
                                                {fy}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Month Selection */}
                                <div>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[3px]">Month</span>
                                        {selectedMonth !== 'all' && (
                                            <button
                                                onClick={() => onMonthChange('all')}
                                                className="text-[9px] font-black text-[var(--primary)] uppercase hover:underline"
                                            >
                                                Select All
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {monthsInFy.map(m => (
                                            <button
                                                key={m.key}
                                                onClick={() => {
                                                    onMonthChange(m.key);
                                                    if (m.key !== 'all') setIsOpen(false);
                                                }}
                                                className={`
                                                    py-3 rounded-xl text-[9px] font-black uppercase transition-all border relative
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
                            <div className="bg-[var(--surface-variant)] p-3 border-t border-[var(--border)]">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-full py-2.5 bg-[var(--on-surface)] text-[var(--surface)] text-[10px] font-black uppercase rounded-xl hover:opacity-90 transition-opacity"
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
