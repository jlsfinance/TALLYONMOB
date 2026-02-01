/**
 * GlobalSearch Component
 * Scroll-direction based animated search bar
 * Shows on scroll DOWN, hides on scroll UP
 */

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, FileText, Users, Package } from 'lucide-react';
import { useSearch } from '../contexts/SearchContext';
import { useScrollDirection } from '../hooks/useScrollDirection';

interface GlobalSearchProps {
    onSelectInvoice?: (invoice: any) => void;
    onSelectCustomer?: (customer: any) => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectInvoice, onSelectCustomer }) => {
    const {
        isSearchVisible,
        setSearchVisible,
        searchQuery,
        setSearchQuery,
        searchResults,
        clearSearch
    } = useSearch();

    const scrollDirection = useScrollDirection({ threshold: 10 });
    const inputRef = useRef<HTMLInputElement>(null);

    // Show/hide based on scroll direction - ONLY on Dashboard and Invoices
    useEffect(() => {
        // Get current view from parent or context if possible, 
        // but since we want to limit it, we'll check the URL or a prop if available.
        // For now, let's just ensure it doesn't auto-show if it's already hidden.
        if (scrollDirection === 'down' && !isSearchVisible && !searchQuery) {
            // Only auto-show on specific conditions if needed
            // setSearchVisible(true); // Disabling auto-show to prevent annoyance
        } else if (scrollDirection === 'up' && isSearchVisible && !searchQuery) {
            setSearchVisible(false);
        }
    }, [scrollDirection, isSearchVisible, searchQuery, setSearchVisible]);

    // Focus input when visible
    useEffect(() => {
        if (isSearchVisible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isSearchVisible]);

    const handleResultClick = (result: any) => {
        if (result.type === 'invoice' && onSelectInvoice) {
            onSelectInvoice(result.data);
        } else if (result.type === 'customer' && onSelectCustomer) {
            onSelectCustomer(result.data);
        }
        clearSearch();
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'invoice': return <FileText className="w-4 h-4" />;
            case 'customer': return <Users className="w-4 h-4" />;
            case 'product': return <Package className="w-4 h-4" />;
            default: return <Search className="w-4 h-4" />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'invoice': return 'bg-google-blue/10 text-google-blue';
            case 'customer': return 'bg-google-green/10 text-google-green';
            case 'product': return 'bg-orange-500/10 text-orange-500';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    };

    return (
        <AnimatePresence>
            {isSearchVisible && (
                <motion.div
                    initial={{ y: -60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -60, opacity: 0 }}
                    transition={{
                        duration: 0.2,
                        ease: [0.4, 0, 0.2, 1] // Material easing
                    }}
                    className="fixed top-0 left-0 right-0 z-[200] bg-surface/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-lg"
                >
                    {/* Search Input */}
                    <div className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search bills, customers, products..."
                                className="w-full pl-12 pr-10 py-3 bg-surface-container-high rounded-full text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:ring-2 focus:ring-google-blue/30 transition-all"
                            />
                            {searchQuery && (
                                <motion.button
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-12 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-on-surface-variant/10 flex items-center justify-center"
                                >
                                    <X className="w-3 h-3 text-on-surface-variant" />
                                </motion.button>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-google-red/10 flex items-center justify-center border border-google-red/20"
                            >
                                <X className="w-4 h-4 text-google-red" />
                            </motion.button>
                        </div>
                    </div>

                    {/* Search Results */}
                    {searchQuery && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-h-[60vh] overflow-y-auto border-t border-outline-variant/20"
                        >
                            {searchResults.length === 0 ? (
                                <div className="p-8 text-center">
                                    <p className="text-sm text-on-surface-variant">No results found</p>
                                </div>
                            ) : (
                                <motion.div
                                    className="divide-y divide-outline-variant/20"
                                    initial="hidden"
                                    animate="visible"
                                    variants={{
                                        visible: { transition: { staggerChildren: 0.05 } }
                                    }}
                                >
                                    {searchResults.map((result) => (
                                        <motion.div
                                            key={`${result.type}-${result.id}`}
                                            variants={{
                                                hidden: { opacity: 0, y: 10 },
                                                visible: { opacity: 1, y: 0 }
                                            }}
                                            whileTap={{ backgroundColor: 'rgba(0,0,0,0.05)' }}
                                            onClick={() => handleResultClick(result)}
                                            className="px-4 py-4 flex items-center gap-4 cursor-pointer active:bg-surface-container-high transition-colors"
                                        >
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getTypeColor(result.type)}`}>
                                                {getIcon(result.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm text-on-surface truncate">{result.title}</p>
                                                <p className="text-xs text-on-surface-variant truncate">{result.subtitle}</p>
                                            </div>
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 bg-surface-container-highest px-2 py-1 rounded-full">
                                                {result.type}
                                            </span>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default GlobalSearch;
