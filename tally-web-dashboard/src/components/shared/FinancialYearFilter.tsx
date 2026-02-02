import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface FYFilterProps {
    selectedFy: string;
    onFyChange: (fy: string) => void;
}

export const FinancialYearFilter: React.FC<FYFilterProps> = ({ selectedFy, onFyChange }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

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

    return (
        <div className="relative bg-[var(--surface-variant)]/30 backdrop-blur-md border border-[var(--border)] rounded-2xl p-1 md:p-1.5 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 mb-1.5 opacity-60">
                <Calendar size={10} className="text-[var(--primary)]" />
                <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest">Financial Year</span>
            </div>

            <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1 pb-1"
            >
                {fys.map((fy) => {
                    const isActive = selectedFy === fy;
                    return (
                        <button
                            key={fy}
                            onClick={() => onFyChange(fy)}
                            className={`
                                flex-shrink-0 snap-center min-w-[100px] md:min-w-[120px] py-2 md:py-2.5 rounded-xl text-[10px] md:text-[11px] font-black uppercase tracking-wider transition-all
                                ${isActive
                                    ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary-glow)] scale-100'
                                    : 'bg-[var(--surface)] text-[var(--on-surface-variant)] border border-[var(--border)] opacity-60'
                                }
                            `}
                        >
                            {fy}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
