import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FixedSizeList as List } from 'react-window';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Search, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { EmptyState } from '@/components/ui/GlassUI';
import { SkeletonTable } from '@/components/ui/Skeleton';
import TransactionCard from '@/components/shared/TransactionCard';
import { CompactDateFilter } from '@/components/shared/CompactDateFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { useFY } from '@/contexts/FYContext';

const MAX_ROWS = 1000;

export default function SalesPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const { selectedFY: selectedFy, setSelectedFY: setSelectedFy } = useFY();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMonth, setSelectedMonth] = useState<string | null>('all');
    const [showFyDropdown, setShowFyDropdown] = useState(false);
    const monthRowRef = useRef<HTMLDivElement>(null);

    const scrollMonth = useCallback((dir: 'left' | 'right') => {
        if (!monthRowRef.current) return;
        const scrollAmount = 120;
        monthRowRef.current.scrollBy({ left: dir === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }, []);

    const availableFys = useMemo(() => {
        const currentFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
        const fys: string[] = [];
        for (let i = 0; i < 4; i++) {
            const y = currentFY - i;
            fys.push(`FY ${y}-${String(y + 1).slice(2)}`);
        }
        return fys;
    }, []);

    // Generate months for the selected FY
    const monthsInFy = useMemo(() => {
        const cleanFy = selectedFy.replace('FY ', '');
        const yearPart = parseInt(cleanFy.split('-')[0]);
        const startYear = yearPart < 100 ? 2000 + yearPart : yearPart;
        const today = new Date();
        const yesterday = subDays(today, 1);

        const months = [];

        for (let i = 0; i < 12; i++) {
            const date = new Date(startYear, 3 + i, 1);
            const monthEnd = endOfMonth(date);
            // Only include months that have fully passed (month end <= yesterday)
            if (monthEnd > yesterday) break;
            months.push({
                key: format(date, 'yyyy-MM'),
                label: format(date, 'MMM'),
                fullLabel: format(date, 'MMMM yyyy'),
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(monthEnd > yesterday ? yesterday : monthEnd, 'yyyy-MM-dd')
            });
        }

        const allOption = {
            key: 'all',
            label: 'ALL',
            fullLabel: 'Full Financial Year Till Date',
            start: `${startYear}-04-01`,
            // FY end tak, warna aaj ka voucher (aur current FY ke baad wale) list se chhut jate the
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
        const cleanFy2 = selectedFy.replace('FY ', '');
        const startYear = parseInt(cleanFy2.split('-')[0]) < 100 ? 2000 + parseInt(cleanFy2.split('-')[0]) : parseInt(cleanFy2.split('-')[0]);
        return {
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };
    }, [selectedMonth, monthsInFy, selectedFy]);

    // ── Aggregate stats (lightweight) ──
    const { data: statsCount, isLoading: statsLoading } = useQuery(
        ['sales-count', selectedCompany?.id, dateRange.start, dateRange.end],
        async () => {
            if (!selectedCompany?.id) return 0;
            const { count, error } = await supabase.from('vouchers')
                .select('*', { count: 'exact', head: true })
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end);
            if (error) throw error;
            return count || 0;
        },
        {
            enabled: !!selectedCompany?.id,
            staleTime: 3 * 60 * 1000,
            refetchOnWindowFocus: false,
        }
    );

    // ── Sales list (capped at MAX_ROWS for fast loading) ──
    const { data: allSales = [], isLoading: salesLoading, isError: salesError } = useQuery(
        ['sales', selectedCompany?.id, dateRange.start, dateRange.end],
        async () => {
            if (!selectedCompany?.id) return [];

            const { data: syncedData, error } = await supabase.from('vouchers')
                .select('id, party_name, voucher_number, voucher_date, voucher_type, grand_total, total_amount')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end)
                .order('voucher_date', { ascending: false })
                .limit(MAX_ROWS);

            if (error) throw error;

            const { data: pendingData, error: pendingError } = await supabase.from('pending_transactions')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('transaction_type', 'Sales')
                .in('status', ['pending', 'failed']);

            if (pendingError) throw pendingError;

            const pendingSales = (pendingData || []).map(p => {
                const { id, ...rest } = p.voucher_data || {};
                return {
                    id: p.id,
                    party_name: rest.customerName || 'Pending Customer',
                    voucher_number: rest.invoiceNumber || 'NEW',
                    voucher_date: rest.date || p.created_at,
                    grand_total: rest.total,
                    total_amount: rest.total,
                    sync_status: p.status,
                    status: p.status,
                    voucher_type: 'Sales',
                };
            });
            return [...pendingSales, ...(syncedData || [])];
        },
        {
            enabled: !!selectedCompany?.id,
            staleTime: 3 * 60 * 1000,
            refetchOnWindowFocus: false,
        }
    );

    const loading = salesLoading && !allSales;

    const totalFromLoaded = useMemo(() =>
        allSales.reduce((s: number, v: any) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0),
    [allSales]);

    // ── Month aggregates: single-pass from loaded data ──
    const monthAggs = useMemo(() => {
        const monthBuckets = monthsInFy.reduce((acc, m) => {
            acc[m.key] = { count: 0, total: 0, ...m };
            return acc;
        }, {} as Record<string, any>);

        for (const v of allSales) {
            const d = v.voucher_date;
            if (!d) continue;
            for (const m of monthsInFy) {
                if (d >= m.start && d <= m.end) {
                    monthBuckets[m.key].count++;
                    monthBuckets[m.key].total += Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                    break;
                }
            }
        }

        return monthsInFy.map(m => monthBuckets[m.key]);
    }, [monthsInFy, allSales]);

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredSales = allSales.filter(s =>
        s.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [showSearch, setShowSearch] = useState(false);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Revenue Feed</h1>
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
                    <CompactDateFilter
                        selectedFy={selectedFy}
                        onFyChange={setSelectedFy}
                        selectedMonth={selectedMonth}
                        onMonthChange={setSelectedMonth}
                        monthsInFy={monthsInFy}
                    />
                </div>
            </HeaderPortal>

            {/* Performance Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Selected FY Total</p>
                    <p className="text-lg font-black text-emerald-500 mt-1">{formatCurrency(totalFromLoaded)}</p>
                </div>
                <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Bill Count</p>
                    <p className="text-lg font-black text-[var(--on-surface)] mt-1">{statsLoading ? '...' : statsCount}</p>
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

            {/* Transaction Logic */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <SkeletonTable rows={8} cols={4} />
                ) : salesError ? (
                    <EmptyState
                        icon={<TrendingUp size={48} />}
                        title="Failed to Load"
                        description="Something went wrong. Try changing the filter or refresh."
                    />
                ) : filteredSales.length === 0 ? (
                    <EmptyState
                        icon={<TrendingUp size={48} />}
                        title="No Records Found"
                        description="Try another Finance Year or search term."
                    />
                ) : (
                    <div className="space-y-1.5 h-[650px] overflow-hidden">
                        <List
                            height={650}
                            itemCount={filteredSales.length}
                            itemSize={74}
                            width="100%"
                        >
                            {({ index, style }) => {
                                const sale = filteredSales[index];
                                return (
                                    <div style={style} className="pr-2 pb-1.5">
                                        <TransactionCard
                                            key={sale.id || index}
                                            type={sale.voucher_type || 'Sales'}
                                            partyName={sale.party_name}
                                            voucherNumber={sale.voucher_number}
                                            date={sale.voucher_date}
                                            amount={sale.grand_total || sale.total_amount || 0}
                                            status={(sale as any).status === 'pending' ? 'Pending' : ((sale as any).status === 'failed' ? 'Failed' : 'Synced')}
                                            highlighted={(sale as any).status === 'pending'}
                                            onClick={() => {
                                                navigate(`/invoice/${encodeURIComponent(sale.id)}`, { state: { voucher: sale, from: '/sales' } });
                                            }}
                                        />
                                    </div>
                                );
                            }}
                        </List>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
