import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, User, Plus, ChevronRight, Package, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
    id: string;
    label: string;
    subLabel?: string;
    score?: number;
}

interface AutocompleteProps {
    options: Option[];
    value: string | null;
    onChange: (value: string) => void;
    onCreate?: (query: string) => void;
    placeholder?: string;
    className?: string;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    inputRef?: (el: HTMLInputElement | null) => void;
    autoFocus?: boolean;
    type?: 'customer' | 'product';
}

const levenshtein = (a: string, b: string): number => {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = new Array<number[]>(bn + 1);
    for (let i = 0; i <= bn; ++i) {
        let row = matrix[i] = new Array<number>(an + 1);
        row[0] = i;
    }
    const firstRow = matrix[0];
    for (let j = 1; j <= an; ++j) {
        firstRow[j] = j;
    }
    for (let i = 1; i <= bn; ++i) {
        for (let j = 1; j <= an; ++j) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1],
                    matrix[i][j - 1],
                    matrix[i - 1][j]
                ) + 1;
            }
        }
    }
    return matrix[bn][an];
};

const Autocomplete: React.FC<AutocompleteProps> = ({
    options,
    value,
    onChange,
    onCreate,
    placeholder = "Search...",
    className = "",
    onKeyDown,
    inputRef,
    autoFocus,
    type = 'customer'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(-1);

    useEffect(() => {
        const selected = options.find(o => o.id === value);
        if (selected) {
            setQuery(selected.label);
        } else if (!value) {
            setQuery('');
        }
    }, [value, options]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                const selected = options.find(o => o.id === value);
                if (selected) {
                    setQuery(selected.label);
                } else if (value === '' || value === null) {
                    setQuery('');
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef, value, options]);

    const filteredOptions = useMemo(() => {
        if (!query || (options.find(o => o.label === query) && !isOpen)) return options.slice(0, 10);

        const lowerQuery = query.toLowerCase().trim();
        const minLen = lowerQuery.length;
        const maxErrors = minLen > 5 ? 2 : minLen > 2 ? 1 : 0;

        return options
            .map((option) => {
                const label = option.label || '';
                const lowerLabel = label.toLowerCase();
                const subLabel = option.subLabel || '';
                const lowerSub = subLabel.toLowerCase();
                let score = 0;

                if (lowerLabel === lowerQuery) score = 100;
                else if (lowerLabel.startsWith(lowerQuery)) score = 80;
                else if (lowerLabel.split(/[\s-]+/).some(word => word.startsWith(lowerQuery))) score = 70;
                else if (lowerLabel.includes(lowerQuery)) score = 60;
                else if (lowerSub.includes(lowerQuery)) score = 50;
                else {
                    const dist = levenshtein(lowerQuery, lowerLabel);
                    if (dist <= maxErrors) score = 40 - dist;
                }

                return { ...option, score };
            })
            .filter((opt) => opt.score > 0)
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 8);
    }, [query, options, isOpen]);

    const handleSelect = (id: string) => {
        onChange(id);
        setIsOpen(false);
    };

    const handleKeyDownLocal = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > -1 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                e.preventDefault();
                handleSelect(filteredOptions[activeIndex].id);
            } else if (query && onCreate && !options.some(o => o.label.toLowerCase() === query.trim().toLowerCase())) {
                e.preventDefault();
                onCreate(query);
                setIsOpen(false);
            } else if (onKeyDown) {
                onKeyDown(e);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        } else if (onKeyDown) {
            onKeyDown(e);
        }
    };

    useEffect(() => {
        setActiveIndex(-1);
    }, [query]);

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors">
                    {type === 'customer' ? <User size={16} /> : <Package size={16} />}
                </div>
                <input
                    type="text"
                    className="w-full bg-[var(--surface-variant)] border-2 border-transparent focus:border-blue-500/50 rounded-2xl py-3 pl-10 pr-10 text-sm font-bold text-[var(--on-surface)] placeholder:text-[var(--text-muted)] outline-none transition-all shadow-sm focus:ring-4 focus:ring-blue-500/10"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        const val = e.target.value;
                        setQuery(val);
                        setIsOpen(true);
                        if (val === '') onChange('');
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDownLocal}
                    ref={inputRef}
                    autoFocus={autoFocus}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {query ? (
                        <button onClick={() => { setQuery(''); onChange(''); }} className="text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                            <X size={16} />
                        </button>
                    ) : (
                        <Search size={16} className="text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors" />
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98, y: 12 }}
                        className="absolute z-[110] left-0 right-0 mt-3 bg-[var(--surface-variant)] backdrop-blur-2xl border border-[var(--border)] rounded-[32px] shadow-2xl overflow-hidden p-2"
                    >
                        <div className="max-h-[280px] overflow-y-auto space-y-0.5 scrollbar-hide">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((option, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleSelect(option.id)}
                                        className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all relative group/item ${activeIndex === idx || value === option.id
                                            ? 'bg-blue-600 text-white shadow-lg'
                                            : 'hover:bg-[var(--surface-active)] text-[var(--on-surface)]'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${activeIndex === idx || value === option.id
                                            ? 'bg-white/20'
                                            : 'bg-[var(--surface-variant)] border border-[var(--border)]'
                                            }`}>
                                            {type === 'customer' ? <User size={14} /> : <Package size={14} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold truncate text-xs tracking-tight">{option.label}</div>
                                            {option.subLabel && (
                                                <div className={`text-[9px] font-bold uppercase tracking-widest ${activeIndex === idx || value === option.id ? 'opacity-80' : 'text-[var(--text-muted)]'
                                                    }`}>
                                                    {option.subLabel}
                                                </div>
                                            )}
                                        </div>
                                        <ChevronRight size={14} className={`transition-transform group-hover/item:translate-x-1 ${activeIndex === idx || value === option.id ? 'opacity-80' : 'text-[var(--text-muted)]/30'
                                            }`} />
                                    </button>
                                ))
                            ) : (
                                <div className="p-6 text-center">
                                    <p className="text-xs font-bold text-[var(--text-muted)] italic">No matches found</p>
                                </div>
                            )}

                            {query && onCreate && !options.some(o => o.label.toLowerCase() === query.trim().toLowerCase()) && (
                                <div className="mt-1 pt-1 border-t border-[var(--border)]">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onCreate(query);
                                            setIsOpen(false);
                                        }}
                                        className="w-full text-left p-3 rounded-2xl flex items-center gap-3 text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 transition-all group/create border border-blue-500/10"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center group-hover/create:scale-110 transition-transform">
                                            <Plus size={14} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-[9px] uppercase tracking-widest opacity-70">Add New</div>
                                            <div className="text-xs font-black text-[var(--on-surface)]">"{query}"</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Autocomplete;
