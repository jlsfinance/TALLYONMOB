import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Plus, IndianRupee, FileText, Filter, ArrowDownLeft, ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { StatCard, EmptyState, Spinner } from '@/components/ui/GlassUI';
import TransactionCard from '@/components/shared/TransactionCard';
import { CompactDateFilter } from '@/components/shared/CompactDateFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import PullToRefresh from '@/components/common/PullToRefresh';
import { useFY } from '@/contexts/FYContext';

export default function PurchasesPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const { selectedFY: selectedFy, setSelectedFY: setSelectedFy } = useFY();

    const [searchTerm, setSearchTerm] = useState('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showFyDropdown, setShowFyDropdown] = useState(false);
    const monthRowRef = useRef<HTMLDivElement>(null);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(() => format(new Date(), 'yyyy-MM'));
    const scrollMonth = useCallback((dir: 'left' | 'right') => {
        if (!monthRowRef.current) return;
        const scrollAmount = 120;
        monthRowRef.current.scrollBy({ left: dir === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }, []);
    const availableFys = useMemo(() => {
        const currentFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
        const fys: string[] = [];
        for (let i = 0; i < 4; i++) {
            const y = currentFY - 2 + i;
            fys.push(`FY ${y}-${String(y + 1).slice(2)}`);
        }
        return fys;
    }, []);
    // Generate months for the selected FY
    const monthsInFy = useMemo(() => {
        const startYearText = selectedFy.split(' ')[1].split('-')[0];
        const startYear = parseInt(startYearText);
        const months = [];

        for (let i = 0; i < 12; i++) {
            const date = new Date(startYear, 3 + i, 1);
            months.push({
                key: format(date, 'yyyy-MM'),
                label: format(date, 'MMM'),
                fullLabel: format(date, 'MMMM yyyy'),
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd')
            });
        }

        const allOption = {
            key: 'all',
            label: 'ALL',
            fullLabel: 'Full Financial Year',
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };

        return [allOption, ...months.reverse()];
    }, [selectedFy]);

    const dateRange = useMemo(() => {
        const monthObj = monthsInFy.find(m => m.key === selectedMonth);
        if (monthObj) {
            return {
                start: monthObj.start,
                end: monthObj.end
            };
        }
        // Fallback to full year
        const startYear = parseInt(selectedFy.split(' ')[1].split('-')[0]);
        return {
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };
    }, [selectedMonth, monthsInFy, selectedFy]);

    async function fetchAllRows(buildQuery: (fromIndex: number, toIndex: number) => any, pageSize = 1000, maxRows = 50000) {
        const rows: any[] = [];
        for (let fromIndex = 0; rows.length < maxRows; fromIndex += pageSize) {
            const { data, error } = await buildQuery(fromIndex, fromIndex + pageSize - 1);
            if (error) throw error;
            const batch = data || [];
            rows.push(...batch);
            if (batch.length < pageSize) break;
        }
        return rows;
    }

    const { data: purchases = [], isLoading: purchasesLoading, refetch } = useQuery(
        ['purchases', selectedCompany?.id, dateRange.start, dateRange.end],
        async () => {
            if (!selectedCompany?.id || !dateRange.start || !dateRange.end) return [];
            return await fetchAllRows((fromIndex, toIndex) => supabase.from('vouchers')
                .select('id, voucher_number, party_name, voucher_type, voucher_date, total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .or('is_deleted.eq.false,is_deleted.is.null')
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end)
                .order('voucher_date', { ascending: false })
                .range(fromIndex, toIndex));
        },
        {
            enabled: !!selectedCompany?.id && !!dateRange.start && !!dateRange.end,
            staleTime: 60 * 1000,
            refetchInterval: 60 * 1000,
            cacheTime: 60 * 60 * 1000,
            keepPreviousData: true,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
        }
    );

    const loading = purchasesLoading && purchases.length === 0;

    const stats = useMemo(() => {
        const total = purchases.reduce((s: number, v: any) => s + Math.abs(v.grand_total || v.total_amount || 0), 0);
        return {
            total,
            count: purchases.length,
            avgValue: purchases.length > 0 ? total / purchases.length : 0
        };
    }, [purchases]);

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredPurchases = purchases.filter(p =>
        p.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [showSearch, setShowSearch] = useState(false);

    const monthAggs = useMemo(() => {
        return monthsInFy.map((m) => {
            const vouchersInMonth = purchases.filter((v: any) => {
                const d = v.voucher_date;
                return d >= m.start && d <= m.end;
            });
            return {
                ...m,
                count: vouchersInMonth.length,
                total: vouchersInMonth.reduce((s: number, v: any) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0),
            };
        });
    }, [monthsInFy, purchases]);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Expense Stream</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{selectedCompany.name}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="search">
                <div className="flex items-center gap-2">
                    <AnimatePresence>
                        {showSearch ? (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: '200px', opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="relative overflow-hidden"
                            >
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)]" />
                                <input
                                    autoFocus
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onBlur={() => !searchTerm && setShowSearch(false)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-1.5 pl-9 pr-3 text-[11px] font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </motion.div>
                        ) : (
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-all"
                            >
                                <Search size={18} />
                            </button>
                        )}
                    </AnimatePresence>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        className={`p-2 rounded-xl transition-all ${showAdvancedFilters ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--surface-variant)] text-[var(--text-muted)]'}`}>
                        <SlidersHorizontal size={16} />
                    </button>
                    <button
                        onClick={() => navigate('/create-voucher?type=Purchase')}
                        className="w-9 h-9 flex items-center justify-center bg-[var(--primary)] text-white rounded-xl shadow-lg shadow-[var(--primary-glow)] hover:scale-105 transition-transform"
                        title="New Record"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </HeaderPortal>

            <PullToRefresh onRefresh={async () => { await refetch(); }}>
            {/* Performance Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Selected FY Total</p>
                    <p className="text-lg font-black text-red-500 mt-1">{formatCurrency(stats.total)}</p>
                </div>
                <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Bill Count</p>
                    <p className="text-lg font-black text-[var(--on-surface)] mt-1">{stats.count}</p>
                </div>
            </div>



            {/* ── MONTH ROW ── */}
            <div className="relative">
                <button onClick={() => scrollMonth('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-4 h-full flex items-center justify-center bg-gradient-to-r from-[var(--background)] to-transparent text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                    <ChevronLeft size={12} />
                </button>
                <div ref={monthRowRef} className="flex gap-1 overflow-x-auto scrollbar-hide px-3">
                    <div className="relative shrink-0">
                        <button onClick={() => setShowFyDropdown(!showFyDropdown)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)]/40 bg-[var(--surface-variant)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                            {selectedFy}
                            <ChevronDown size={10} />
                        </button>
                        {showFyDropdown && (
                            <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)]/50 rounded-lg shadow-xl z-20 py-1 min-w-[120px]">
                                {availableFys.map((fy) => (
                                    <button key={fy} onClick={() => { setSelectedFy(fy); setSelectedMonth('all'); setShowFyDropdown(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all
                                            ${fy === selectedFy
                                                ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-active)] hover:text-[var(--on-surface)]'
                                            }`}>
                                        {fy}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {monthAggs.map((month) => {
                        const isActive = selectedMonth === month.key;
                        return (
                            <button key={month.key} onClick={() => setSelectedMonth(isActive ? 'all' : month.key)}
                                className={`px-2 py-1 rounded-md border transition-all shrink-0 text-[10px] font-bold uppercase whitespace-nowrap
                                    ${isActive
                                        ? 'bg-[var(--primary)]/10 border-[var(--primary)]/40 text-[var(--primary)]'
                                        : 'bg-[var(--surface)] border-[var(--border)]/30 text-[var(--text-muted)] hover:bg-[var(--surface-active)] hover:text-[var(--on-surface)]'
                                    }`}>
                                {month.label}
                            </button>
                        );
                    })}
                </div>
                <button onClick={() => scrollMonth('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-4 h-full flex items-center justify-center bg-gradient-to-l from-[var(--background)] to-transparent text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                    <ChevronRight size={12} />
                </button>
            </div>

            {/* ── ADVANCED FILTERS ── */}
            <AnimatePresence>
                {showAdvancedFilters && (
                    <div className="px-1 mb-2">
                        <div className="bg-[var(--surface)] border border-[var(--border)]/50 rounded-xl p-3 space-y-3">
                            <div>
                                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Date Range</span>
                                <CompactDateFilter
                                    selectedFy={selectedFy}
                                    onFyChange={setSelectedFy}
                                    selectedMonth={selectedMonth}
                                    onMonthChange={setSelectedMonth}
                                    monthsInFy={monthsInFy}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* Transaction Logic */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Spinner size="md" />
                    </div>
                ) : filteredPurchases.length === 0 ? (
                    <EmptyState
                        icon={<ShoppingCart size={48} />}
                        title="No Records Found"
                        description="Try another Finance Year or search term."
                    />
                ) : (
                    <div className="purchase-app-list">
                        {filteredPurchases.map((purchase, idx) => (
                            <TransactionCard
                                key={purchase.id || purchase.voucher_id || [purchase.voucher_number, purchase.voucher_date, idx].filter(Boolean).join('-')}
                                type={purchase.voucher_type}
                                partyName={purchase.party_name}
                                voucherNumber={purchase.voucher_number}
                                date={purchase.voucher_date}
                                amount={purchase.total_amount}
                                status={purchase.sync_status || 'Synced'}
                                onClick={() => navigate(`/invoice/${encodeURIComponent(purchase.id)}`, { state: { voucher: purchase, from: '/purchases' } })}
                            />
                        ))}
                    </div>
                )}
            </AnimatePresence>
            </PullToRefresh>
        </div>
    );
}

