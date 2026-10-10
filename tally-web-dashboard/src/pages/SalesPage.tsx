import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FixedSizeList as List } from 'react-window';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { fetchAllSupabaseRows } from '@/lib/supabasePagination';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Search, Plus, IndianRupee, Receipt, Filter } from 'lucide-react';
import { StatCard, EmptyState, Spinner } from '@/components/ui/GlassUI';
import { SkeletonTable } from '@/components/ui/Skeleton';
import TransactionCard from '@/components/shared/TransactionCard';
import FinancialPeriodSelector from '@/components/shared/FinancialPeriodSelector';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { getStoredFyYear } from '@/lib/dashboardPeriod';

export default function SalesPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [selectedMonth, setSelectedMonth] = useState<string | null>('all');
    const [periodLoadedFor, setPeriodLoadedFor] = useState<string | null>(null);

    // Keep the user's period per company. Do not replace it with the latest voucher
    // when the page remounts after opening a bill and pressing Back.
    useEffect(() => {
        if (!selectedCompany?.id) return;
        const key = `sales-period:${selectedCompany.id}`;
        try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            const sharedPeriod = localStorage.getItem('dashboard_period');
            const now = new Date();
            const defaultStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            const sharedStartYear = getStoredFyYear(defaultStartYear);
            const sharedFy = `FY ${sharedStartYear}-${String(sharedStartYear + 1).slice(-2)}`;
            const sharedMonth = sharedPeriod === 'month' || sharedPeriod === 'today' || sharedPeriod === '30days'
                ? format(now, 'yyyy-MM')
                : 'all';
            setSelectedFy(sharedPeriod ? sharedFy : (typeof saved?.fy === 'string' ? saved.fy : getCurrentFy()));
            setSelectedMonth(sharedPeriod ? sharedMonth : (typeof saved?.month === 'string' ? saved.month : 'all'));
        } catch {
            setSelectedFy(getCurrentFy());
            setSelectedMonth('all');
        }
        setPeriodLoadedFor(selectedCompany.id);
    }, [selectedCompany?.id]);

    useEffect(() => {
        if (!selectedCompany?.id || periodLoadedFor !== selectedCompany.id) return;
        localStorage.setItem(`sales-period:${selectedCompany.id}`, JSON.stringify({
            fy: selectedFy,
            month: selectedMonth || 'all'
        }));
    }, [selectedCompany?.id, periodLoadedFor, selectedFy, selectedMonth]);

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
        const startYear = parseInt(selectedFy.split(' ')[1].split('-')[0]);
        return {
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };
    }, [selectedMonth, monthsInFy, selectedFy]);

    const { data: salesData, isLoading: salesLoading } = useQuery(
        ['sales', selectedCompany?.id, dateRange.start, dateRange.end],
        async () => {
            if (!selectedCompany?.id) return [];
            
            const syncedData = await fetchAllSupabaseRows((from, to) => supabase.from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end)
                .order('voucher_date', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to));

            const pendingData = await fetchAllSupabaseRows((from, to) => supabase.from('pending_transactions')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('transaction_type', 'Sales')
                .in('status', ['pending', 'failed'])
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to));

            const pendingSales = (pendingData || []).map(p => {
                const { id, ...rest } = p.voucher_data || {};
                return {
                    id: p.id,
                    party_name: rest.customerName || 'Pending Customer',
                    voucher_number: rest.invoiceNumber || 'NEW',
                    voucher_date: rest.date || p.created_at,
                    grand_total: rest.total,
                    status: p.status
                };
            }).filter(sale => {
                // pending_transactions has no voucher_date column; apply the same
                // inclusive FY/month range after unpacking voucher_data.
                const date = String(sale.voucher_date || '').slice(0, 10);
                return date >= dateRange.start && date <= dateRange.end;
            });

            return [...pendingSales, ...syncedData];
        },
        {
            enabled: !!selectedCompany?.id && periodLoadedFor === selectedCompany.id,
            staleTime: 3 * 60 * 1000,
            refetchOnWindowFocus: false,
        }
    );

    const sales = salesData || [];
    const loading = salesLoading;

    const stats = useMemo(() => {
        const total = sales.reduce((s, v) => s + Math.abs(v.grand_total || v.total_amount || 0), 0);
        return {
            total,
            count: sales.length,
            avgValue: sales.length > 0 ? total / sales.length : 0
        };
    }, [sales]);

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredSales = sales.filter(s =>
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

            {/* Period selector is rendered in page content so it remains usable on
                mobile and desktop even when the shell header is remounted. */}
            <div className="flex justify-end relative z-20">
                <FinancialPeriodSelector
                    selectedFy={selectedFy}
                    onFyChange={(fy) => {
                        setSelectedFy(fy);
                        // A month belongs to the previous FY; reset to the
                        // complete selected financial year immediately.
                        setSelectedMonth('all');
                    }}
                    selectedMonth={selectedMonth}
                    onMonthChange={setSelectedMonth}
                    monthsInFy={monthsInFy}
                />
            </div>

            {/* Performance Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Selected FY Total</p>
                    <p className="text-lg font-black text-emerald-500 mt-1">{formatCurrency(stats.total)}</p>
                </div>
                <div className="bg-[var(--surface-variant)] p-4 rounded-2xl border border-[var(--border)]">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Bill Count</p>
                    <p className="text-lg font-black text-[var(--on-surface)] mt-1">{stats.count}</p>
                </div>
            </div>

            {/* Transaction Logic */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <SkeletonTable rows={8} cols={4} />
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
                                            type={sale.voucher_type || 'Sales'} // default to Sales for pending
                                            partyName={sale.party_name}
                                            voucherNumber={sale.voucher_number}
                                            date={sale.voucher_date}
                                            amount={sale.grand_total || sale.total_amount || 0}
                                            status={sale.status === 'pending' ? 'Pending' : (sale.sync_status === 'failed' ? 'Failed' : 'Synced')}
                                            highlighted={sale.status === 'pending'}
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
