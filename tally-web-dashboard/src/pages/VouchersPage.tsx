import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FixedSizeList as List } from 'react-window';
import { useAuth } from '../contexts/AuthContext';
import { supabase, pendingTransactionApi } from '../lib/insforge';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, isWithinInterval, subMonths, parseISO } from 'date-fns';
import { AnimatePresence } from 'framer-motion';
import {
    FileText, Search, ArrowUpRight, ArrowDownLeft,
    Zap, Activity, Plus, Minus, ChevronDown, X, Calendar,
    Filter, SlidersHorizontal, RefreshCw, AlertCircle, CheckCircle2,
    Clock, ChevronLeft, ChevronRight, IndianRupee
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Spinner, EmptyState } from '../components/ui/GlassUI';
import { SkeletonTable } from '../components/ui/Skeleton';
import TransactionCard from '../components/shared/TransactionCard';
import { HeaderPortal } from '../components/layout/HeaderPortal';

// ── Constants ──────────────────────────────────────────────
const VOUCHER_TYPES = [
    { key: 'all', label: 'All', icon: <FileText size={12} /> },
    { key: 'Sales', label: 'Sales', icon: <ArrowUpRight size={12} className="text-emerald-400" /> },
    { key: 'Purchase', label: 'Purchase', icon: <ArrowDownLeft size={12} className="text-rose-400" /> },
    { key: 'Receipt', label: 'Receipt', icon: <Plus size={12} className="text-blue-400" /> },
    { key: 'Payment', label: 'Payment', icon: <Minus size={12} className="text-amber-400" /> },
    { key: 'Journal', label: 'Journal', icon: <FileText size={12} className="text-violet-400" /> },
    { key: 'Contra', label: 'Contra', icon: <ArrowUpRight size={12} className="text-cyan-400" /> },
];

const DATE_RANGE_OPTIONS = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'thisWeek', label: 'This Week' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'custom', label: 'Custom' },
];

const SYNC_STATUS_OPTIONS = [
    { key: 'all', label: 'All' },
    { key: 'synced', label: 'Synced', icon: <CheckCircle2 size={10} className="text-emerald-400" /> },
    { key: 'pending', label: 'Pending', icon: <Clock size={10} className="text-amber-400" /> },
    { key: 'failed', label: 'Failed', icon: <AlertCircle size={10} className="text-rose-400" /> },
];

function getMonthKey(date: Date): string { return format(date, 'yyyy-MM'); }
function getFyRange(fyLabel: string): { start: string; end: string } {
    const parts = fyLabel.replace('FY ', '').split('-');
    const startY = parseInt(parts[0]);
    return { start: `${startY}-04-01`, end: `${startY + 1}-03-31` };
}

function formatCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount.toLocaleString('en-IN')}`;
}

// ── Month Aggregation ──────────────────────────────────────
interface MonthAgg {
    key: string;
    label: string;
    shortLabel: string;
    yearLabel: string;
    count: number;
    total: number;
    start: string;
    end: string;
}

// ── Main Component ─────────────────────────────────────────
export default function VouchersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const stateType = (location.state as any)?.type;

    // ── Core Filters ──
    const [searchTerm, setSearchTerm] = useState(searchParams.get('party') || '');
    const [selectedType, setSelectedType] = useState(stateType || searchParams.get('type') || 'all');
    const [selectedFy, setSelectedFy] = useState('');
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [showSearch, setShowSearch] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    // ── Additional Filters ──
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [dateRange, setDateRange] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [syncStatus, setSyncStatus] = useState('all');

    // ── FY Detection ──
    useEffect(() => {
        if (!selectedCompany?.id || selectedFy) return;
        const detectFy = async () => {
            try {
                const { data } = await supabase
                    .from('vouchers')
                    .select('voucher_date')
                    .eq('company_id', selectedCompany.id)
                    .eq('is_deleted', false)
                    .order('voucher_date', { ascending: false })
                    .limit(1);
                if (data?.length && data[0].voucher_date) {
                    const d = new Date(data[0].voucher_date);
                    const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
                    const fy = `FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`;
                    setSelectedFy(fy);
                    setSelectedMonth(getMonthKey(d));
                } else {
                    const now = new Date();
                    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
                    const fy = `FY ${y}-${(y + 1).toString().slice(-2)}`;
                    setSelectedFy(fy);
                    setSelectedMonth(getMonthKey(new Date(y, now.getMonth(), 1)));
                }
            } catch { 
                const now = new Date();
                const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
                setSelectedFy(`FY ${y}-${(y + 1).toString().slice(-2)}`);
                setSelectedMonth(getMonthKey(now));
            }
        };
        detectFy();
    }, [selectedCompany?.id]);

    // ── Generate Months for FY ──
    const monthsInFy = useMemo(() => {
        if (!selectedFy) return [];
        const { start } = getFyRange(selectedFy);
        const startYear = parseInt(start.split('-')[0]);
        const months: MonthAgg[] = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date(startYear, 3 + i, 1);
            const mKey = getMonthKey(date);
            months.push({
                key: mKey,
                label: format(date, 'MMM'),
                shortLabel: format(date, "MMM''yy"),
                yearLabel: format(date, 'MMMM yyyy'),
                count: 0,
                total: 0,
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd'),
            });
        }
        return months;
    }, [selectedFy]);

    // ── LOAD ALL VOUCHERS ONCE FOR THE FY ──
    const { data: rawVouchers = [], isLoading } = useQuery(
        ['vouchers-all', selectedCompany?.id, selectedFy],
        async () => {
            const companyId = selectedCompany?.id;
            if (!companyId || !selectedFy) return [];
            const { start, end } = getFyRange(selectedFy);
            const { data, error } = await supabase
                .from('vouchers')
                .select('id, voucher_number, party_name, voucher_type, voucher_date, total_amount, grand_total, narration, created_at', { count: 'exact' })
                .eq('company_id', companyId)
                .eq('is_deleted', false)
                .gte('voucher_date', start)
                .lte('voucher_date', end)
                .order('voucher_date', { ascending: false })
                .range(0, 99999);
            if (error) throw error;
            return (data || []).map((v: any) => ({
                ...v,
                total_amount: Number(v.total_amount ?? v.grand_total ?? 0),
                sync_status: 'synced',
            }));
        },
        { enabled: !!selectedCompany?.id && !!selectedFy, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
    );

    // ── Compute month aggregates ──
    const monthAggs = useMemo(() => {
        if (!monthsInFy.length || !rawVouchers.length) return monthsInFy;
        return monthsInFy.map((m) => {
            const vouchersInMonth = rawVouchers.filter((v: any) => {
                const d = v.voucher_date || v.vch_date;
                return d >= m.start && d <= m.end;
            });
            return {
                ...m,
                count: vouchersInMonth.length,
                total: vouchersInMonth.reduce((s: number, v: any) => s + (Number(v.total_amount) || 0), 0),
            };
        });
    }, [monthsInFy, rawVouchers]);

    // ── SMART FILTER: All filters combine locally ──
    const filteredVouchers = useMemo(() => {
        let result = [...rawVouchers];

        // 1. Search filter
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            result = result.filter((v: any) =>
                (v.party_name || '').toLowerCase().includes(q) ||
                (v.voucher_number || '').toLowerCase().includes(q) ||
                (v.narration || '').toLowerCase().includes(q)
            );
        }

        // 2. Voucher type filter
        if (selectedType !== 'all') {
            result = result.filter((v: any) => v.voucher_type === selectedType);
        }

        // 3. Month filter
        if (selectedMonth && selectedMonth !== 'all') {
            const month = monthsInFy.find((m) => m.key === selectedMonth);
            if (month) {
                result = result.filter((v: any) => {
                    const d = v.voucher_date || v.vch_date;
                    return d >= month.start && d <= month.end;
                });
            }
        }

        // 4. Date range filter
        if (dateRange !== 'all') {
            const now = new Date();
            let rangeStart: Date, rangeEnd: Date;
            switch (dateRange) {
                case 'today':
                    rangeStart = startOfDay(now); rangeEnd = endOfDay(now); break;
                case 'yesterday':
                    const yes = subDays(now, 1);
                    rangeStart = startOfDay(yes); rangeEnd = endOfDay(yes); break;
                case 'thisWeek':
                    rangeStart = startOfWeek(now, { weekStartsOn: 1 }); rangeEnd = endOfWeek(now, { weekStartsOn: 1 }); break;
                case 'thisMonth':
                    rangeStart = startOfMonth(now); rangeEnd = endOfMonth(now); break;
                case 'lastMonth':
                    const lm = subMonths(now, 1);
                    rangeStart = startOfMonth(lm); rangeEnd = endOfMonth(lm); break;
                case 'custom':
                    if (customStart && customEnd) {
                        rangeStart = new Date(customStart); rangeEnd = new Date(customEnd);
                    } else { rangeStart = new Date(0); rangeEnd = new Date(); }
                    break;
                default:
                    rangeStart = new Date(0); rangeEnd = new Date();
            }
            result = result.filter((v: any) => {
                const d = new Date(v.voucher_date || v.vch_date);
                return d >= rangeStart && d <= rangeEnd;
            });
        }

        // 5. Amount range filter
        if (minAmount) {
            result = result.filter((v: any) => (Number(v.total_amount) || 0) >= Number(minAmount));
        }
        if (maxAmount) {
            result = result.filter((v: any) => (Number(v.total_amount) || 0) <= Number(maxAmount));
        }

        // 6. Sync status filter
        if (syncStatus !== 'all') {
            result = result.filter((v: any) => (v.sync_status || 'synced') === syncStatus);
        }

        return result;
    }, [rawVouchers, searchTerm, selectedType, selectedMonth, monthsInFy, dateRange, customStart, customEnd, minAmount, maxAmount, syncStatus]);

    // ── Summary ──
    const summary = useMemo(() => {
        const total = filteredVouchers.length;
        const totalAmount = filteredVouchers.reduce((s: number, v: any) => s + (Number(v.total_amount) || 0), 0);
        return { total, totalAmount };
    }, [filteredVouchers]);

    // ── Active filter tags ──
    const activeFilters = useMemo(() => {
        const tags: { key: string; label: string }[] = [];
        if (selectedType !== 'all') tags.push({ key: 'type', label: selectedType });
        if (selectedMonth && selectedMonth !== 'all') {
            const m = monthsInFy.find((x) => x.key === selectedMonth);
            if (m) tags.push({ key: 'month', label: m.shortLabel });
        }
        if (searchTerm) tags.push({ key: 'search', label: `"${searchTerm}"` });
        if (dateRange !== 'all') {
            const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
            if (opt && dateRange !== 'all') tags.push({ key: 'dateRange', label: opt.label });
        }
        if (minAmount || maxAmount) {
            tags.push({ key: 'amount', label: `₹${minAmount || '0'}–₹${maxAmount || '∞'}` });
        }
        if (syncStatus !== 'all') tags.push({ key: 'sync', label: syncStatus });
        return tags;
    }, [selectedType, selectedMonth, monthsInFy, searchTerm, dateRange, minAmount, maxAmount, syncStatus]);

    const clearAllFilters = useCallback(() => {
        setSelectedType('all');
        setSelectedMonth(null);
        setSearchTerm('');
        setDateRange('all');
        setCustomStart('');
        setCustomEnd('');
        setMinAmount('');
        setMaxAmount('');
        setSyncStatus('all');
    }, []);

    const clearFilter = useCallback((key: string) => {
        switch (key) {
            case 'type': setSelectedType('all'); break;
            case 'month': setSelectedMonth(null); break;
            case 'search': setSearchTerm(''); setShowSearch(false); break;
            case 'dateRange': setDateRange('all'); setCustomStart(''); setCustomEnd(''); break;
            case 'amount': setMinAmount(''); setMaxAmount(''); break;
            case 'sync': setSyncStatus('all'); break;
        }
    }, []);

    const monthRowRef = useRef<HTMLDivElement>(null);
    const scrollMonth = (dir: 'left' | 'right') => {
        if (monthRowRef.current) {
            monthRowRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
        }
    };

    // ── Export CSV ──
    const handleExportCSV = useCallback(() => {
        if (filteredVouchers.length === 0) { toast.error('No data to export'); return; }
        const headers = [
            { key: 'voucher_number', label: 'Voucher No' },
            { key: 'voucher_type', label: 'Type' },
            { key: 'voucher_date', label: 'Date' },
            { key: 'party_name', label: 'Party Name' },
            { key: 'total_amount', label: 'Amount' }
        ];
        import('../lib/exportToCSV').then(({ exportToCSV }) => {
            exportToCSV(filteredVouchers, headers, `Vouchers_${selectedCompany.name}_${selectedFy}.csv`);
        }).catch(err => toast.error('Export failed: ' + err.message));
    }, [filteredVouchers, selectedCompany?.name, selectedFy]);

    // ── FY switcher state ──
    const [showFyDropdown, setShowFyDropdown] = useState(false);
    const fyRef = useRef<HTMLDivElement>(null);

    // Available FYs
    const availableFys = useMemo(() => {
        const currentYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
        const fys: string[] = [];
        for (let i = -2; i <= 1; i++) {
            const y = currentYear + i;
            fys.push(`FY ${y}-${(y + 1).toString().slice(-2)}`);
        }
        return fys;
    }, []);

    // Click outside to close FY dropdown
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (fyRef.current && !fyRef.current.contains(e.target as Node)) setShowFyDropdown(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    if (!selectedCompany) return null;

    return (
        <div className="pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Vouchers</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{selectedCompany.name}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="search">
                <div className="flex items-center gap-1.5">
                    <div className="relative">
                        <input
                            ref={searchRef}
                            placeholder="Search party, voucher..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-[140px] md:w-[200px] bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-1.5 pl-7 pr-2 text-[11px] font-medium text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] placeholder:text-[var(--text-muted)]"
                        />
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        {searchTerm && (
                            <button onClick={() => { setSearchTerm(''); searchRef.current?.focus(); }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        className={`p-1.5 rounded-lg transition-all ${showAdvancedFilters ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--surface-variant)] text-[var(--text-muted)]'}`}>
                        <SlidersHorizontal size={15} />
                    </button>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{selectedFy}</span>
                    <button onClick={handleExportCSV}
                        className="px-2 py-1 bg-[var(--surface-variant)] text-[var(--text-muted)] border border-[var(--border)] rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-[var(--surface-active)]">
                        CSV
                    </button>
                </div>
            </HeaderPortal>

            {/* ── VOUCHER TYPE ROW ── */}
            <div className="px-1 mb-2 sticky top-0 z-10 bg-[var(--surface)]/90 backdrop-blur-sm pt-0.5">
                <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0.5">
                    {VOUCHER_TYPES.map((type) => {
                        const isActive = selectedType === type.key;
                        return (
                            <button key={type.key} onClick={() => setSelectedType(type.key)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all shrink-0
                                    ${isActive
                                        ? 'bg-[var(--on-surface)] text-[var(--surface)] border-[var(--on-surface)] shadow-sm'
                                        : 'bg-[var(--surface)] border-[var(--border)]/50 text-[var(--text-muted)] hover:bg-[var(--surface-active)] hover:text-[var(--on-surface)]'
                                    }`}>
                                {type.icon}
                                {type.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── MONTH ROW — COMPACT ── */}
            <div className="px-1 mb-1.5 relative">
                <button onClick={() => scrollMonth('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-4 h-full flex items-center justify-center bg-gradient-to-r from-[var(--surface)] to-transparent text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                    <ChevronLeft size={12} />
                </button>
                <div ref={monthRowRef} className="flex gap-1 overflow-x-auto scrollbar-hide px-3">
                    {/* FY Switcher */}
                    <div ref={fyRef} className="relative shrink-0">
                        <button onClick={() => setShowFyDropdown(!showFyDropdown)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)]/40 bg-[var(--surface-variant)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                            {selectedFy}
                            <ChevronDown size={10} />
                        </button>
                        {showFyDropdown && (
                            <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)]/50 rounded-lg shadow-xl z-20 py-1 min-w-[120px]">
                                {availableFys.map((fy) => (
                                    <button key={fy} onClick={() => { setSelectedFy(fy); setSelectedMonth(null); setShowFyDropdown(false); }}
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
                            <button key={month.key} onClick={() => setSelectedMonth(isActive ? null : month.key)}
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
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-4 h-full flex items-center justify-center bg-gradient-to-l from-[var(--surface)] to-transparent text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                    <ChevronRight size={12} />
                </button>
            </div>

            {/* ── ADVANCED FILTERS PANEL ── */}
            <AnimatePresence>
                {showAdvancedFilters && (
                    <div className="px-1 mb-2">
                        <div className="bg-[var(--surface)] border border-[var(--border)]/50 rounded-xl p-3 space-y-3">
                            {/* Date Range */}
                            <div>
                                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Date Range</span>
                                <div className="flex flex-wrap gap-1">
                                    {DATE_RANGE_OPTIONS.map((opt) => (
                                        <button key={opt.key} onClick={() => setDateRange(opt.key)}
                                            className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all
                                                ${dateRange === opt.key
                                                    ? 'bg-[var(--primary)]/10 border-[var(--primary)]/40 text-[var(--primary)]'
                                                    : 'bg-[var(--surface-variant)] border-[var(--border)]/30 text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                                }`}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {dateRange === 'custom' && (
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                                            className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--on-surface)]" />
                                        <span className="text-[9px] text-[var(--text-muted)]">→</span>
                                        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                                            className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--on-surface)]" />
                                    </div>
                                )}
                            </div>

                            {/* Amount Range */}
                            <div>
                                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">
                                    <IndianRupee size={10} className="inline mr-0.5" /> Amount Range
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <input type="number" placeholder="Min" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
                                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--on-surface)] placeholder:text-[var(--text-muted)]" />
                                    <span className="text-[9px] text-[var(--text-muted)]">—</span>
                                    <input type="number" placeholder="Max" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
                                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--on-surface)] placeholder:text-[var(--text-muted)]" />
                                </div>
                            </div>

                            {/* Sync Status */}
                            <div>
                                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">
                                    <RefreshCw size={10} className="inline mr-0.5" /> Sync Status
                                </span>
                                <div className="flex gap-1">
                                    {SYNC_STATUS_OPTIONS.map((opt) => (
                                        <button key={opt.key} onClick={() => setSyncStatus(opt.key)}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all
                                                ${syncStatus === opt.key
                                                    ? 'bg-[var(--primary)]/10 border-[var(--primary)]/40 text-[var(--primary)]'
                                                    : 'bg-[var(--surface-variant)] border-[var(--border)]/30 text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                                }`}>
                                            {opt.icon}
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── FILTER SUMMARY BAR ── */}
            {activeFilters.length > 0 && (
                <div className="px-1 mb-2 flex items-center gap-1.5 flex-wrap">
                    {activeFilters.map((f) => (
                        <span key={f.key}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)]/40 rounded-full text-[9px] font-bold text-[var(--primary)]">
                            {f.label}
                            <button onClick={() => clearFilter(f.key)} className="hover:text-[var(--on-surface)]">
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                    {activeFilters.length > 1 && (
                        <button onClick={clearAllFilters}
                            className="text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--on-surface)] underline underline-offset-2">
                            Clear All
                        </button>
                    )}
                </div>
            )}

            {/* ── SUMMARY STRIP ── */}
            <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    {summary.total} Voucher{summary.total !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] font-bold text-[var(--text-muted)]">
                    {formatCurrency(summary.totalAmount)}
                </span>
            </div>

            {/* ── VOUCHER LIST ── */}
            <div className="px-[2px]">
                {isLoading ? (
                    <SkeletonTable rows={10} cols={3} />
                ) : filteredVouchers.length === 0 ? (
                    <EmptyState icon={<FileText size={40} />} title="No Vouchers"
                        description={activeFilters.length > 0 ? 'Try changing or clearing filters' : 'No vouchers found for this period'} />
                ) : (
                    <div className="h-[calc(100vh-220px)] min-h-[400px]" style={{ height: Math.min(filteredVouchers.length * 55 + 20, window.innerHeight - 220) }}>
                        <List
                            height={Math.min(filteredVouchers.length * 57, window.innerHeight - 220)}
                            itemCount={filteredVouchers.length}
                            itemSize={55}
                            width="100%"
                            overscanCount={15}
                        >
                            {({ index, style }) => {
                                const v = filteredVouchers[index];
                                return (
                                    <div style={{ ...style, paddingLeft: 2, paddingRight: 2, paddingBottom: 2 }}>
                                        <TransactionCard
                                            compact
                                            type={v.voucher_type}
                                            partyName={v.party_name || v.voucher_type}
                                            voucherNumber={v.voucher_number}
                                            date={v.voucher_date}
                                            amount={Number(v.total_amount) || 0}
                                            status={v.sync_status || 'Synced'}
                                            onClick={() => navigate(`/invoice/${encodeURIComponent(v.id)}`, { state: { voucher: v, from: '/vouchers' } })}
                                        />
                                    </div>
                                );
                            }}
                        </List>
                    </div>
                )}
            </div>
        </div>
    );
}
