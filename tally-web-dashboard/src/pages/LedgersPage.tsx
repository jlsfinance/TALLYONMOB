import { useProgressiveList } from '@/hooks/useProgressiveList';
import './PartiesPolish.css';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi, supabase } from '../lib/insforge';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Search, Wallet, CreditCard, Building2,
    Star, ChevronRight, Phone, ArrowDownNarrowWide,
    ArrowUpNarrowWide, CheckCircle2, AlertCircle,
    FileSpreadsheet, ArrowUpRight, X, SlidersHorizontal
} from 'lucide-react';
import { EmptyState } from '../components/ui/GlassUI';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { useFY } from '../contexts/FYContext';
import { toast } from 'react-hot-toast';

type SortOption = 'balance-desc' | 'balance-asc' | 'name-asc';

function formatCompact(amount: number) {
    const n = Math.abs(amount || 0);
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${Math.round(n)}`;
}

export default function LedgersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'all');
    const [sortBy, setSortBy] = useState<SortOption>('name-asc');
    const { selectedFY: selectedFy, fyDates } = useFY();
    const queryClient = useQueryClient();
    const mobilePartyListRef = useRef<HTMLDivElement>(null);
    const [partyTransactions, setPartyTransactions] = useState<Record<string, any[]>>({});
    const [showSearch, setShowSearch] = useState(false);

    const handleExportCSV = () => {
        const headers = [
            { key: 'name', label: 'Ledger Name' },
            { key: 'parent_group', label: 'Group' },
            { key: 'opening_balance', label: 'Opening Balance' },
            { key: 'current_balance', label: 'Current Balance' },
            { key: 'gstin', label: 'GSTIN' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' }
        ];
        import('../lib/exportToCSV').then(({ exportToCSV }) => {
            exportToCSV(
                filteredLedgers,
                headers,
                `Ledgers_${selectedCompany?.name || 'Company'}_${selectedFy}.csv`
            );
        }).catch(err => {
            toast.error('Failed to export: ' + err.message);
        });
    };

    const { data: ledgersData, isLoading: ledgersLoading } = useQuery(
        ['ledgers', selectedCompany?.id],
        async () => {
            const { data, error } = await ledgerApi.list(selectedCompany.id, null);
            if (error) throw error;
            return data || [];
        },
        {
            enabled: !!selectedCompany?.id,
            staleTime: 5 * 60 * 1000,
            cacheTime: 60 * 60 * 1000,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            refetchOnReconnect: false,
            keepPreviousData: true
        }
    );

    const groupCounts = useMemo(() => {
        const all = ledgersData || [];
        let debtors = 0;
        let creditors = 0;
        let banks = 0;

        for (const l of all) {
            const parent = String(l.parent || l.parent_group || '').toLowerCase();
            if (parent.includes('debtor')) debtors++;
            else if (parent.includes('creditor')) creditors++;
            else if (parent.includes('bank')) banks++;
        }

        return {
            all: all.length,
            debtors,
            creditors,
            banks
        };
    }, [ledgersData]);

    const groupFilters = useMemo(() => [
        { key: 'all', label: 'ALL', icon: <Users size={11} />, count: groupCounts.all },
        { key: 'Sundry Debtors', label: 'DEBTORS', icon: <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />, count: groupCounts.debtors },
        { key: 'Sundry Creditors', label: 'CREDITORS', icon: <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />, count: groupCounts.creditors },
        { key: 'Bank Accounts', label: 'BANK', icon: <Building2 size={11} className="text-amber-400" />, count: groupCounts.banks },
        { key: 'recent', label: 'RECENT', icon: <Star size={11} className="text-sky-400" /> }
    ], [groupCounts]);

    const groupFilteredLedgers = useMemo(() => {
        const all = ledgersData || [];
        if (!selectedGroup || selectedGroup === 'all') return all;
        if (selectedGroup === 'recent') return all.slice(0, 30);
        return all.filter((l: any) => {
            const parent = String(l.parent || l.parent_group || '').toLowerCase();
            const target = selectedGroup.toLowerCase();
            if (target.includes('debtor')) return parent.includes('debtor');
            if (target.includes('creditor')) return parent.includes('creditor');
            if (target.includes('bank')) return parent.includes('bank');
            return parent.includes(target) || parent === target;
        });
    }, [ledgersData, selectedGroup]);

    const filteredLedgers = useMemo(() => {
        let list = groupFilteredLedgers;
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            list = list.filter((l: any) =>
                l.name?.toLowerCase().includes(q) ||
                l.gstin?.toLowerCase().includes(q) ||
                l.phone?.includes(q)
            );
        }

        return [...list].sort((a: any, b: any) => {
            if (sortBy === 'balance-desc') {
                return (b.current_balance || 0) - (a.current_balance || 0);
            }
            if (sortBy === 'balance-asc') {
                return (a.current_balance || 0) - (b.current_balance || 0);
            }
            if (sortBy === 'name-asc') {
                return (a.name || '').localeCompare(b.name || '');
            }
            return 0;
        });
    }, [groupFilteredLedgers, searchTerm, sortBy]);

    const partyList = useProgressiveList(filteredLedgers, JSON.stringify(['parties', selectedCompany?.id, selectedFy, selectedGroup, searchTerm, sortBy]));
    const loading = ledgersLoading && (!ledgersData || ledgersData.length === 0);

    const stats = useMemo(() => {
        const list = groupFilteredLedgers;
        let debitTotal = 0;
        let creditTotal = 0;

        for (const l of list) {
            const bal = Number(l.current_balance || 0);
            if (bal > 0) debitTotal += bal;
            else if (bal < 0) creditTotal += Math.abs(bal);
        }

        return {
            total: debitTotal - creditTotal,
            debit: debitTotal,
            credit: creditTotal,
            count: list.length
        };
    }, [groupFilteredLedgers]);

    // Load vouchers for the parties currently visible, scoped to the selected FY.
    const requestedPartyNames = useRef(new Set<string>());
    const transactionScope = useRef('');
    const scope = `${selectedCompany?.id || ''}:${selectedFy}`;
    if (transactionScope.current !== scope) {
        transactionScope.current = scope;
        requestedPartyNames.current = new Set();
    }
    useEffect(() => {
        const cached = queryClient.getQueriesData<any[]>({ queryKey: ['party-recent', selectedCompany?.id, selectedFy] });
        setPartyTransactions(Object.fromEntries(cached.filter(([, data]) => data).map(([key, data]) => [String(key[3]), data])));
    }, [scope, queryClient]);

    const fetchRecentTransactions = async (visibleLedgers: any[]) => {
        const names = [...new Set(visibleLedgers.map(l => String(l.name || '').trim()).filter(Boolean))]
            .filter(name => !requestedPartyNames.current.has(name));
        if (!selectedCompany?.id || !names.length) return;
        names.forEach(name => requestedPartyNames.current.add(name));
        const requestScope = scope;
        const results = await Promise.all(names.map(async name => {
            try {
                const data = await queryClient.fetchQuery({
                    queryKey: ['party-recent', selectedCompany.id, selectedFy, name],
                    staleTime: 3 * 60 * 1000,
                    queryFn: async () => {
                        const { data, error } = await supabase.from('vouchers').select('*')
                            .eq('company_id', selectedCompany.id).eq('party_name', name)
                            .gte('voucher_date', fyDates.from).lte('voucher_date', fyDates.to)
                            .order('voucher_date', { ascending: false }).limit(8);
                        if (error) throw error;
                        return (data || []).filter((voucher: any) => voucher.is_deleted !== true);
                    }
                });
                return { name, data, error: null };
            } catch (error) { return { name, data: [], error }; }
        }));
        if (transactionScope.current !== requestScope) return;
        const grouped: Record<string, any[]> = {};
        results.forEach(result => {
            if (result.error) requestedPartyNames.current.delete(result.name);
            else grouped[result.name] = result.data;
        });
        setPartyTransactions(prev => ({ ...prev, ...grouped }));
    };
    useEffect(() => {
        fetchRecentTransactions(filteredLedgers.slice(0, 20));
    }, [scope, filteredLedgers]);

    useEffect(() => {
        const handleDeleted = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.companyId !== selectedCompany?.id || !detail?.id) return;
            setPartyTransactions(previous => Object.fromEntries(Object.entries(previous).map(([name, rows]) => [name, rows.filter((row: any) => row.id !== detail.id)])));
        };
        window.addEventListener('voucher-soft-deleted', handleDeleted);
        return () => window.removeEventListener('voucher-soft-deleted', handleDeleted);
    }, [selectedCompany?.id]);

    const sendWhatsAppReminder = (ledger: any) => {
        if (!ledger.phone) {
            toast.error('No phone number found for this party');
            return;
        }
        const bal = Math.abs(ledger.current_balance || 0);
        const type = (ledger.current_balance || 0) >= 0 ? 'Dr' : 'Cr';
        const message = `Namaste ${ledger.name}, your outstanding balance with ${selectedCompany?.name || 'us'} is ₹${bal.toLocaleString('en-IN')} ${type}. Please settle at the earliest. Thank you!`;
        const url = `https://wa.me/${ledger.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const formatCurrency = (amount: number) => {
        const val = Number(amount) || 0;
        const absVal = Math.abs(val);
        const isSettled = absVal === 0;
        const suffix = val >= 0 ? 'DR' : 'CR';
        const color = isSettled ? 'text-slate-400' : val >= 0 ? 'text-sky-400' : 'text-rose-400';
        const badgeBg = isSettled
            ? 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
            : val >= 0
                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30';

        const formatted = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absVal);

        return { formatted, suffix, color, badgeBg, isSettled };
    };

    useEffect(() => {
        const container = mobilePartyListRef.current;
        if (!container || !filteredLedgers.length) return;
        const observer = new IntersectionObserver(entries => {
            const visible = entries.filter(entry => entry.isIntersecting)
                .map(entry => filteredLedgers[Number((entry.target as HTMLElement).dataset.partyIndex)])
                .filter(Boolean);
            if (visible.length) fetchRecentTransactions(visible);
        }, { rootMargin: '300px 0px' });
        container.querySelectorAll('[data-party-index]').forEach(row => observer.observe(row));
        return () => observer.disconnect();
    }, [filteredLedgers, scope, loading, partyList.count]);

    if (!selectedCompany) return null;

    return (
        <div className="parties-screen min-h-screen bg-[#070b14] text-slate-100 pb-24 selection:bg-cyan-500/20">
            {/* Header Portal for Top Bar Integration */}
            <HeaderPortal type="title">
                <div className="parties-header-title flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-sky-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
                        <Users size={16} />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm md:text-base font-extrabold text-white tracking-wide uppercase leading-none font-sans">
                                Global Ledger
                            </h1>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                SYNC
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px] md:max-w-xs mt-0.5">
                            {selectedCompany.name}
                        </p>
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="search">
                <div className="flex items-center gap-2">
                    {showSearch ? (
                        <div className="parties-header-search relative flex items-center">
                            <Search size={14} className="absolute left-3 text-cyan-400" />
                            <input
                                autoFocus
                                placeholder="Search party, GSTIN, phone..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-48 md:w-64 bg-[#10192e] border border-cyan-500/40 rounded-xl py-1.5 pl-8 pr-7 text-xs text-white placeholder-slate-400 focus:outline-none shadow-inner"
                            />
                            <button
                                onClick={() => { setSearchTerm(''); setShowSearch(false); }}
                                className="absolute right-2 text-slate-400 hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowSearch(true)}
                            className="w-9 h-9 rounded-xl bg-[#131e36] border border-[#213257] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all"
                            title="Search Parties"
                        >
                            <Search size={16} />
                        </button>
                    )}
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#131e36] hover:bg-[#1a2949] border border-[#23355e] text-xs font-semibold text-slate-200 transition-all"
                        title="Export CSV"
                    >
                        <FileSpreadsheet size={13} className="text-cyan-400" />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </HeaderPortal>

            <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-2.5 space-y-3.5">
                {/* 4-Card Financial Metric Strip (Stitch High-End Fintech UI) */}
                <section className="parties-metrics grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    {/* Metric 1: Total Parties */}
                    <div className="bg-[#0f172a]/90 backdrop-blur-md border border-[#1e293b] hover:border-slate-700 rounded-2xl p-3 flex flex-col justify-between shadow-sm transition-all group">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Parties</span>
                            <div className="w-6 h-6 rounded-lg bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-slate-300">
                                <Users size={12} />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-lg md:text-xl font-extrabold text-white font-mono leading-none tracking-tight">
                                {stats.count}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                active
                            </span>
                        </div>
                    </div>

                    {/* Metric 2: DR (Receivables) */}
                    <div className="bg-[#0f172a]/90 backdrop-blur-md border border-[#1e293b] hover:border-sky-500/30 rounded-2xl p-3 flex flex-col justify-between shadow-sm transition-all">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider text-sky-400 uppercase flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                                DR (To Collect)
                            </span>
                            <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                                <ArrowUpRight size={13} />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-lg md:text-xl font-extrabold text-sky-400 font-mono leading-none tracking-tight">
                                {formatCompact(stats.debit)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">Receivable</span>
                        </div>
                    </div>

                    {/* Metric 3: CR (Payables) */}
                    <div className="bg-[#0f172a]/90 backdrop-blur-md border border-[#1e293b] hover:border-rose-500/30 rounded-2xl p-3 flex flex-col justify-between shadow-sm transition-all">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider text-rose-400 uppercase flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                CR (To Pay)
                            </span>
                            <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                                <CreditCard size={12} />
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-lg md:text-xl font-extrabold text-rose-400 font-mono leading-none tracking-tight">
                                {formatCompact(stats.credit)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">Payable</span>
                        </div>
                    </div>

                    {/* Metric 4: Net Balance */}
                    <div className="bg-gradient-to-br from-[#101b33] to-[#0c1426] border border-cyan-500/30 rounded-2xl p-3 flex flex-col justify-between relative overflow-hidden shadow-sm">
                        <div className="absolute -right-3 -bottom-3 w-12 h-12 bg-cyan-500/10 rounded-full blur-sm pointer-events-none"></div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider text-cyan-300 uppercase">
                                {stats.total >= 0 ? 'Net Surplus (DR)' : 'Net Deficit (CR)'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                                {stats.total >= 0 ? '+DR' : '-CR'}
                            </span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-lg md:text-xl font-extrabold text-cyan-300 font-mono leading-none tracking-tight">
                                {formatCompact(stats.total)}
                            </span>
                            <span className="text-[10px] text-cyan-200/80 font-semibold">Overall</span>
                        </div>
                    </div>
                </section>

                {/* Filter Chips & In-Page Search Row */}
                <section className="space-y-2.5">
                    {/* Horizontal Filter Chips Scroller (Stitch Exact Styling) */}
                    <div className="parties-filters flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 text-xs font-semibold">
                        {groupFilters.map((filter) => {
                            const isActive = selectedGroup === filter.key;
                            return (
                                <button
                                    key={filter.key}
                                    onClick={() => setSelectedGroup(filter.key)}
                                    className={`
                                        px-3.5 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1.5 transition-all text-xs
                                        ${isActive
                                            ? 'bg-gradient-to-r from-cyan-500/20 to-sky-500/20 text-cyan-300 border border-cyan-400/60 shadow-glow-cyan'
                                            : 'bg-[#121c33] text-slate-300 border border-[#203055] hover:border-slate-500 active:bg-[#182645]'
                                        }
                                    `}
                                >
                                    {filter.icon}
                                    <span>{filter.label}</span>
                                    {filter.count !== undefined && (
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono ${isActive ? 'bg-cyan-500/30 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                            {filter.count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* List Header & Sorting Toolbar */}
                <section className="flex items-center justify-between pt-1 text-[11px] text-slate-400 font-medium">
                    <div className="flex items-center gap-1.5">
                        <span>Showing</span>
                        <span className="text-white font-bold font-mono">{filteredLedgers.length}</span>
                        <span>of {groupFilteredLedgers.length} Parties</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                if (sortBy === 'name-asc') setSortBy('balance-desc');
                                else if (sortBy === 'balance-desc') setSortBy('balance-asc');
                                else setSortBy('name-asc');
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#10192e] border border-[#1f2f53] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            {sortBy === 'balance-desc' && <ArrowDownNarrowWide size={13} className="text-cyan-400" />}
                            {sortBy === 'balance-asc' && <ArrowUpNarrowWide size={13} className="text-cyan-400" />}
                            {sortBy === 'name-asc' && <SlidersHorizontal size={13} className="text-cyan-400" />}
                            <span className="font-semibold text-[10px] uppercase">
                                {sortBy === 'balance-desc' ? 'Bal: High to Low' : sortBy === 'balance-asc' ? 'Bal: Low to High' : 'Name: A-Z'}
                            </span>
                        </button>
                    </div>
                </section>

                {/* Parties Ledger Feed / Cards */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-3">
                        <div className="w-9 h-9 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                        <p className="text-xs font-semibold text-slate-400">Loading party ledger balances...</p>
                    </div>
                ) : filteredLedgers.length === 0 ? (
                    <EmptyState
                        icon={<Users size={36} className="text-slate-500" />}
                        title="No Parties Found"
                        description="Try modifying your search or switching group filter."
                    />
                ) : (
                    <div>
                        {/* PC / Large View: Dense Table Rows with Expansion */}
                        <div className="hidden md:block space-y-1.5">
                            {/* Table Column Headers */}
                            <div className="grid grid-cols-[1fr_130px_140px_110px_90px] gap-3 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-[#0c1424] border border-[#1a2640] rounded-xl">
                                <div>Party & Details</div>
                                <div className="text-right">Opening Bal</div>
                                <div className="text-right">Current Balance</div>
                                <div className="text-center">Group</div>
                                <div className="text-right">Actions</div>
                            </div>

                            {partyList.visible.map((ledger: any, i: number) => {
                                const bal = formatCurrency(ledger.current_balance);
                                const opBal = formatCurrency(ledger.opening_balance || 0);
                                const transactions = partyTransactions[ledger.name] || [];

                                return (
                                    <motion.div
                                        key={ledger.id || i}
                                        initial={{ opacity: 0, y: 3 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(i * 0.008, 0.15) }}
                                        className="group bg-[#0f172a]/80 hover:bg-[#142038] border border-[#1b2848] hover:border-cyan-500/40 rounded-xl transition-all cursor-pointer shadow-sm"
                                        onClick={() => navigate(`/ledgers/${ledger.id}`)}
                                    >
                                        <div className="grid grid-cols-[1fr_130px_140px_110px_90px] gap-3 px-4 py-3 items-center">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                                                        {ledger.name || 'Unknown Party'}
                                                    </p>
                                                    {bal.isSettled && (
                                                        <span className="text-[9px] font-semibold text-emerald-400 flex items-center gap-0.5">
                                                            <CheckCircle2 size={10} /> Settled
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                    {ledger.parent_group?.replace('Sundry ', '') || 'Party'}
                                                    {ledger.gstin && <span className="font-mono text-slate-500 ml-1.5">• {ledger.gstin}</span>}
                                                    {ledger.phone && <span className="text-slate-500 ml-1.5">• 📞 {ledger.phone}</span>}
                                                </p>
                                            </div>

                                            <div className="text-right tabular-nums text-xs font-mono text-slate-400">
                                                {opBal.formatted}
                                            </div>

                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className={`text-xs font-extrabold font-mono tabular-nums ${bal.color}`}>
                                                    {bal.formatted}
                                                </span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-mono ${bal.badgeBg}`}>
                                                    {bal.suffix}
                                                </span>
                                            </div>

                                            <div className="text-center">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase px-2 py-0.5 bg-[#17233d] border border-[#23355a] rounded-md">
                                                    {ledger.parent_group?.replace('Sundry ', '') || '-'}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-end gap-1.5">
                                                {ledger.phone && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(ledger); }}
                                                        className="w-7 h-7 rounded-lg bg-[#142038] hover:bg-emerald-600/20 text-slate-400 hover:text-emerald-400 border border-[#223359] flex items-center justify-center transition-colors"
                                                        title="Send WhatsApp Reminder"
                                                    >
                                                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                    </button>
                                                )}
                                                <ChevronRight size={15} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                                            </div>
                                        </div>

                                        {/* Hover Transaction Drawer */}
                                        {transactions.length > 0 && (
                                            <div className="hidden group-hover:block border-t border-[#18243e] bg-[#0c1424]/70 px-4 py-2">
                                                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">
                                                        Recent:
                                                    </span>
                                                    {transactions.slice(0, 6).map((v: any, j: number) => {
                                                        const amt = Math.abs(Number(v.grand_total || v.total_amount || 0));
                                                        const isCredit = v.voucher_type === 'Sales' || v.voucher_type === 'Receipt';
                                                        return (
                                                            <div
                                                                key={j}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const tid = v.id || v.voucher_id;
                                                                    if (tid) navigate(`/invoice/${encodeURIComponent(tid)}`);
                                                                }}
                                                                className="flex items-center gap-1.5 bg-[#142038] hover:bg-[#1b2b4b] border border-[#223359] rounded-lg px-2 py-1 text-[10px] cursor-pointer transition-colors"
                                                            >
                                                                <span className="font-mono text-slate-400">#{v.voucher_number || j + 1}</span>
                                                                <span className={`font-semibold ${v.voucher_type === 'Sales' ? 'text-emerald-400' : v.voucher_type === 'Payment' ? 'text-orange-400' : 'text-blue-400'}`}>
                                                                    {v.voucher_type}
                                                                </span>
                                                                <span className={`font-mono font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    {isCredit ? '+' : '-'}₹{amt.toLocaleString('en-IN')}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Mobile rows share the page's vertical scroll. */}
                        <div className="md:hidden party-list-group" ref={mobilePartyListRef}>
                            {partyList.visible.map((ledger: any, index: number) => {
                                        const bal = formatCurrency(ledger.current_balance);
                                        const transactions = partyTransactions[ledger.name] || [];

                                        return (
                                            <div key={ledger.id || index} data-party-index={index} className="party-list-row">
                                                <div
                                                    className={`party-list-card ${bal.isSettled ? 'party-settled' : (ledger.current_balance || 0) >= 0 ? 'party-debit' : 'party-credit'} p-3.5 rounded-2xl bg-[#0f172a] border border-[#1b2848] hover:border-cyan-500/40 transition-all shadow-sm active:scale-[0.99] cursor-pointer`}
                                                    onClick={() => navigate(`/ledgers/${ledger.id}`)}
                                                >
                                                    {/* Top Row: Name and Balance */}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <h3 className="text-xs font-bold text-white tracking-tight truncate">
                                                                    {ledger.name || 'Unknown Party'}
                                                                </h3>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 mt-0.5 truncate font-normal">
                                                                <span>{ledger.parent_group?.replace('Sundry ', '') || 'Party'}</span>
                                                                {ledger.gstin ? (
                                                                    <span className="font-mono text-slate-500 ml-1.5">
                                                                        • {ledger.gstin}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-500 ml-1.5">• Unregistered</span>
                                                                )}
                                                            </p>
                                                        </div>

                                                        {/* Financial Amount & DR/CR Indicator */}
                                                        <div className="text-right flex-shrink-0">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <span className={`text-sm font-extrabold font-mono tracking-tight ${bal.color}`}>
                                                                    {bal.formatted}
                                                                </span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${bal.badgeBg}`}>
                                                                    {bal.suffix}
                                                                </span>
                                                            </div>
                                                            <span className="text-[9px] font-semibold text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                                                                {bal.isSettled ? (
                                                                    <span className="text-emerald-400 flex items-center gap-0.5">
                                                                        <CheckCircle2 size={9} /> Settled
                                                                    </span>
                                                                ) : (ledger.current_balance || 0) > 0 ? (
                                                                    <span className="text-sky-300">To Collect</span>
                                                                ) : (
                                                                    <span className="text-rose-300">To Pay</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>



                                                    {/* Recent Transactions Horizontal Slider Chips */}
                                                    {transactions.length > 0 && (
                                                        <div className="party-bills mt-2 pt-2 border-t border-[#152033] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                                                            {transactions.slice(0, 6).map((v: any, j: number) => {
                                                                const amt = Math.abs(Number(v.grand_total || v.total_amount || 0));
                                                                const isCredit = v.voucher_type === 'Sales' || v.voucher_type === 'Receipt';
                                                                return (
                                                                    <div
                                                                        key={j}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const tid = v.id || v.voucher_id;
                                                                            if (tid) navigate(`/invoice/${encodeURIComponent(tid)}`);
                                                                        }}
                                                                        className="party-bill flex-shrink-0 bg-[#142038] hover:bg-[#1a2948] border border-[#1e2e4c] rounded-lg px-2 py-1 text-[9px] transition-colors"
                                                                    >
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="font-semibold text-slate-400">{v.voucher_type?.slice(0, 4)}</span>
                                                                            <span className={`font-mono font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                {isCredit ? '+' : '-'}₹{amt.toLocaleString('en-IN')}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                            })}
                        </div>
                        {partyList.hasMore && <div ref={partyList.sentinelRef}><button type="button" onClick={partyList.loadMore} className="w-full py-3 text-xs text-[var(--text-muted)]">Load more</button></div>}
                    </div>
                )}
            </main>
        </div>
    );
}

