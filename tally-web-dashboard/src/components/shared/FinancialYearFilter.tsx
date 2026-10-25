import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar } from 'lucide-react';

interface FYFilterProps {
    selectedFy: string;
    onFyChange: (fy: string) => void;
}

const formatFyRange = (fyLabel: string): string => {
    const match = fyLabel.match(/FY (\d{4})-(\d{2})/);
    if (!match) return fyLabel;
    const startYear = match[1];
    const endYear = String(Number(startYear) + 1);
    return `01 Apr ${startYear} - 31 Mar ${endYear}`;
};

const parseFyYear = (fyLabel: string): number => {
    const match = fyLabel.match(/FY (\d{4})/);
    return match ? parseInt(match[1]) : new Date().getFullYear();
};

const toFyLabel = (year: number): string => {
    const endYear = (year + 1).toString().slice(-2);
    return `FY ${year}-${endYear}`;
};

const getCurrentFyYear = (): number => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
};

export const FinancialYearFilter: React.FC<FYFilterProps> = ({ selectedFy, onFyChange }) => {
    const [animDir, setAnimDir] = useState<'left' | 'right' | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const currentYear = parseFyYear(selectedFy);
    const fyRange = formatFyRange(selectedFy);
    const isCurrentFy = currentYear === getCurrentFyYear();

    const changeFy = useCallback((dir: number) => {
        const newYear = currentYear + dir;
        setAnimDir(dir > 0 ? 'right' : 'left');
        setAnimKey(prev => prev + 1);
        onFyChange(toFyLabel(newYear));
    }, [currentYear, onFyChange]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') changeFy(-1);
            if (e.key === 'ArrowRight') changeFy(1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [changeFy]);

    return (
        <div className="w-full flex justify-center">
            <div
                className="inline-flex items-center gap-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm backdrop-blur-sm h-12 md:h-13 overflow-hidden"
            >
                {/* Left Arrow */}
                <button
                    ref={triggerRef}
                    onClick={() => changeFy(-1)}
                    className="w-11 h-full flex items-center justify-center text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)] hover:text-[var(--primary)] transition-all duration-150 active:scale-90"
                    aria-label="Previous financial year"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>

                {/* Center: Calendar Icon + Date Range */}
                <div className="flex items-center gap-2.5 px-3 md:px-4 select-none border-x border-[var(--border)] h-full">
                    <Calendar size={15} className="text-[var(--primary)] shrink-0" />
                    <span
                        key={animKey}
                        className={`text-[12px] md:text-[14px] font-extrabold text-[var(--on-surface)] tracking-tight whitespace-nowrap ${
                            animDir === 'left' ? 'animate-slide-left' : animDir === 'right' ? 'animate-slide-right' : ''
                        }`}
                        style={{ animationDuration: '200ms' }}
                    >
                        {fyRange}
                    </span>
                    {isCurrentFy && (
                        <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-[9px] font-bold uppercase tracking-wider">
                            Current
                        </span>
                    )}
                </div>

                {/* Right Arrow */}
                <button
                    onClick={() => changeFy(1)}
                    className="w-11 h-full flex items-center justify-center text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)] hover:text-[var(--primary)] transition-all duration-150 active:scale-90"
                    aria-label="Next financial year"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
