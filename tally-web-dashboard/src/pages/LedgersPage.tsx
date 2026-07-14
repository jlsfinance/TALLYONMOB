import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { VariableSizeList as List } from 'react-window';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi, supabase } from '../lib/insforge';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Users, Search, Wallet, CreditCard, Building2,
    Star, ChevronRight
} from 'lucide-react';
import {
    Spinner, EmptyState
} from '../components/ui/GlassUI';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { toast } from 'react-hot-toast';

const groupFilters = [
    { key: 'all', label: 'All', icon: <Users size={11} /> },
    { key: 'Sundry Debtors', label: 'Debtors', icon: <Wallet size={11} /> },
    { key: 'Sundry Creditors', label: 'Creditors', icon: <CreditCard size={11} /> },
    { key: 'Bank Accounts', label: 'Bank', icon: <Building2 size={11} /> },
    { key: 'recent', label: 'Recent', icon: <Star size={11} /> }
];

export default function LedgersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'all');
    const listRef = useRef<any>(null);

    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [partyTransactions, setPartyTransactions] = useState<Record<string, any[]>>({});

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
                `Ledgers_${selectedCompany.name}_${selectedFy}.csv`
            );
        }).catch(err => {
            toast.error('Failed to export: ' + err.message);
        });
    };

    const { data: ledgersData, isLoading: ledgersLoading } = useQuery(
        ['ledgers', selectedCompany?.id, selectedGroup],
        async () => {
            const { data, error } = await ledgerApi.list(
                selectedCompany.id,
                (selectedGroup !== 'all' && selectedGroup !== 'recent') ? selectedGroup : null
            );
            if (error) throw error;
            return data || [];
        },
        {
            enabled: !!selectedCompany?.id,
            staleTime: 3 * 60 * 1000,
            refetchOnWindowFocus: false,
            onSuccess: (data) => {
                if (data.length > 0) {
                    fetchRecentTransactions(data.slice(0, 100));
                }
            }
        }
    );

    const ledgers = ledgersData || [];
    const loading = ledgersLoading;

    const stats = useMemo(() => {
        const debitTotal = ledgers.filter((l: any) => (l.current_balance || 0) > 0).reduce((s: number, l: any) => s + (l.current_balance || 0), 0);
        const creditTotal = ledgers.filter((l: any) => (l.current_balance || 0) < 0).reduce((s: number, l: any) => s + Math.abs(l.current_balance || 0), 0);
        return {
            total: debitTotal - creditTotal,
            debit: debitTotal,
            credit: creditTotal,
            count: ledgers.length
        };
    }, [ledgers]);

    const fetchRecentTransactions = async (visibleLedgers: any[]) => {
        const ledgerNames = visibleLedgers.map(l => l.name);
        const { data } = await supabase
            .from('vouchers')
            .select('*')
            .in('party_name', ledgerNames)
            .order('voucher_date', { ascending: false })
            .limit(150);

        if (data) {
            const grouped = data.reduce((acc: any, v: any) => {
                if (!acc[v.party_name]) acc[v.party_name] = [];
                if (acc[v.party_name].length < 10) acc[v.party_name].push(v);
                return acc;
            }, {});
            setPartyTransactions(prev => ({ ...prev, ...grouped }));
        }
    };

    const sendWhatsAppReminder = (ledger: any) => {
        if (!ledger.phone) {
            toast.error('No phone number found for this party');
            return;
        }
        const bal = Math.abs(ledger.current_balance || 0);
        const type = ledger.current_balance >= 0 ? 'Dr' : 'Cr';
        const message = `Namaste ${ledger.name}, your outstanding balance with ${selectedCompany.name} is ₹${bal.toLocaleString('en-IN')} ${type}. Please settle at the earliest. Thank you!`;
        const url = `https://wa.me/${ledger.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const formatCurrency = (amount: number) => {
        const val = Number(amount) || 0;
        const absVal = Math.abs(val);
        const suffix = val >= 0 ? 'Dr' : 'Cr';
        const color = val >= 0 ? 'text-blue-400' : 'text-red-400';
        const bgColor = val >= 0 ? 'bg-blue-500/10' : 'bg-red-500/10';

        const formatted = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absVal);

        return { formatted, suffix, color, bgColor };
    };

    const filteredLedgers = useMemo(() => {
        return ledgers.filter((l: any) =>
            l.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [ledgers, searchTerm]);

    const getItemSize = (index: number) => {
        const ledger = filteredLedgers[index];
        const transactions = partyTransactions[ledger.name] || [];
        return transactions.length > 0 ? 120 : 72;
    };

    useEffect(() => {
        if (listRef.current) {
            listRef.current.resetAfterIndex(0);
        }
    }, [filteredLedgers, partyTransactions]);

    const [showSearch, setShowSearch] = useState(false);

    if (!selectedCompany) return null;

    return (
        <div className="min-h-screen bg-zinc-950 pb-24">
            <div className="px-[2px]">
                <HeaderPortal type="title">
                    <div className="flex flex-col">
                        <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Global Ledger</h1>
                        <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{selectedCompany.name}</p>
                    </div>
                </HeaderPortal>

                <HeaderPortal type="search">
                    <div className="flex items-center gap-2">
                        {showSearch ? (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)]" />
                                <input
                                    autoFocus
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onBlur={() => !searchTerm && setShowSearch(false)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-1.5 pl-9 pr-3 text-[11px] font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-all"
                            >
                                <Search size={18} />
                            </button>
                        )}
                    </div>
                </HeaderPortal>

                <HeaderPortal type="filters">
                    <div className="flex items-center gap-2">
                        <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                            Export
                        </button>
                    </div>
                </HeaderPortal>

                {/* Summary strip */}
                <div className="grid grid-cols-4 gap-1.5 mt-3 mb-3">
                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2 text-center">
                        <p className="text-[8px] font-bold text-zinc-500 uppercase mb-0.5">Parties</p>
                        <p className="text-xs font-black text-white">{stats.count}</p>
                    </div>
                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2 text-center">
                        <p className="text-[8px] font-bold text-zinc-500 uppercase mb-0.5">Dr</p>
                        <p className="text-xs font-black text-blue-400">₹{(stats.debit / 1000).toFixed(1)}K</p>
                    </div>
                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2 text-center">
                        <p className="text-[8px] font-bold text-zinc-500 uppercase mb-0.5">Cr</p>
                        <p className="text-xs font-black text-red-400">₹{(stats.credit / 1000).toFixed(1)}K</p>
                    </div>
                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2 text-center">
                        <p className="text-[8px] font-bold text-zinc-500 uppercase mb-0.5">Net</p>
                        <p className="text-xs font-black text-cyan-400">₹{(stats.total / 1000).toFixed(1)}K</p>
                    </div>
                </div>

                {/* Group filter chips — full-width */}
                <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                    {groupFilters.map((filter) => {
                        const isActive = selectedGroup === filter.key;
                        return (
                            <button
                                key={filter.key}
                                onClick={() => setSelectedGroup(filter.key)}
                                className={`
                                    flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap
                                    ${isActive
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                        : 'bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                                    }
                                `}
                            >
                                {filter.icon}
                                {filter.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Parties List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                </div>
            ) : filteredLedgers.length === 0 ? (
                <EmptyState icon={<Users size={40} />} title="No Parties Found" description="Try clarifying your search" />
            ) : (
            <div className="px-[2px]">
                    {/* PC: Dense table-like rows */}
                    <div className="hidden md:block">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_100px_100px_110px_80px] gap-2 px-[2px] py-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50">
                            <div>Party Name</div>
                            <div className="text-right">Opening</div>
                            <div className="text-right">Balance</div>
                            <div className="text-center">Group</div>
                            <div className="text-right"></div>
                        </div>

                        {filteredLedgers.map((ledger: any, i: number) => {
                            const bal = formatCurrency(ledger.current_balance);
                            const transactions = partyTransactions[ledger.name] || [];

                            return (
                                <motion.div
                                    key={ledger.id || i}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(i * 0.01, 0.2) }}
                                    className="group border-b border-zinc-800/30 last:border-b-0 hover:bg-zinc-800/40 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/ledgers/${ledger.id}`)}
                                >
                                    <div className="grid grid-cols-[1fr_100px_100px_110px_80px] gap-2 px-[2px] py-2.5 items-center">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-zinc-200 truncate">{ledger.name || 'Unknown'}</p>
                                            <p className="text-[9px] text-zinc-600 truncate">{ledger.gstin || ''}</p>
                                        </div>
                                        <div className="text-xs text-zinc-400 text-right tabular-nums">
                                            {formatCurrency(ledger.opening_balance || 0).formatted}
                                        </div>
                                        <div className="flex items-center justify-end gap-1.5">
                                            <span className={`text-xs font-bold tabular-nums ${bal.color}`}>{bal.formatted}</span>
                                            <span className={`text-[7px] font-black px-1 py-px rounded ${bal.bgColor} ${bal.color}`}>{bal.suffix}</span>
                                        </div>
                                        <div className="text-center">
                                            <span className="text-[9px] font-bold text-zinc-500 uppercase px-2 py-0.5 bg-zinc-800/50 rounded">
                                                {ledger.parent_group?.replace('Sundry ', '') || '-'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-end gap-1">
                                            {ledger.phone && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(ledger); }}
                                                    className="p-1 rounded-lg hover:bg-green-500/10 text-zinc-600 hover:text-green-400 transition-colors"
                                                    title="WhatsApp reminder"
                                                >
                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                </button>
                                            )}
                                            <ChevronRight size={14} className="text-zinc-600 group-hover:text-cyan-400 transition-colors" />
                                        </div>
                                    </div>

                                    {/* Expanded transactions on hover / always visible */}
                                    {transactions.length > 0 && (
                                        <div className="hidden group-hover:block border-t border-zinc-800/30 bg-zinc-900/30">
                                            <div className="grid grid-cols-[70px_80px_1fr_100px] gap-2 px-[2px] py-1 text-[8px] font-bold text-zinc-600 uppercase">
                                                <span>#</span>
                                                <span>Type</span>
                                                <span>Date</span>
                                                <span className="text-right">Amount</span>
                                            </div>
                                            {transactions.slice(0, 5).map((v: any, j: number) => {
                                                const amt = Math.abs(Number(v.grand_total || v.total_amount || 0));
                                                const isCredit = v.voucher_type === 'Sales' || v.voucher_type === 'Receipt';
                                                return (
                                                    <div
                                                        key={j}
                                                        className="grid grid-cols-[70px_80px_1fr_100px] gap-2 px-[2px] py-1.5 text-[10px] border-t border-zinc-800/20 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const tid = v.id || v.voucher_id;
                                                            if (tid) navigate(`/invoice/${encodeURIComponent(tid)}`);
                                                        }}
                                                    >
                                                        <span className="font-mono font-bold">#{v.voucher_number || j + 1}</span>
                                                        <span className={`font-bold ${v.voucher_type === 'Sales' ? 'text-emerald-500' : v.voucher_type === 'Payment' ? 'text-orange-500' : v.voucher_type === 'Receipt' ? 'text-blue-500' : 'text-zinc-500'}`}>
                                                            {v.voucher_type || 'N/A'}
                                                        </span>
                                                        <span className="text-zinc-500 whitespace-nowrap">{v.voucher_date ? new Date(v.voucher_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}</span>
                                                        <span className={`text-right font-bold ${isCredit ? 'text-emerald-500' : 'text-red-400'}`}>
                                                            {isCredit ? '+' : '-'}₹{amt.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            {transactions.length > 5 && (
                                                <div className="px-[2px] py-1 text-[9px] font-bold text-[var(--primary)] text-center border-t border-zinc-800/20">
                                                    +{transactions.length - 5} more
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Mobile: Dense full-width cards */}
                    <div className="md:hidden">
                        <div className="h-[650px] overflow-hidden">
                            <List
                                ref={listRef}
                                height={650}
                                itemCount={filteredLedgers.length}
                                itemSize={getItemSize}
                                width="100%"
                            >
                                {({ index, style }) => {
                                    const ledger = filteredLedgers[index];
                                    const bal = formatCurrency(ledger.current_balance);
                                    const transactions = partyTransactions[ledger.name] || [];

                                    return (
                                        <div style={style} className="pr-[1px] pb-1.5">
                                            <motion.div
                                                key={ledger.id || index}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="group bg-zinc-900/40 border border-zinc-800/60 rounded-2xl overflow-hidden hover:border-cyan-500/20 transition-all cursor-pointer active:scale-[0.99]"
                                                onClick={() => navigate(`/ledgers/${ledger.id}`)}
                                            >
                                                {/* Main row — party name + balance */}
                                                <div className="flex items-center justify-between px-[4px] py-3">
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="text-[11px] font-black text-zinc-100 uppercase truncate tracking-tight leading-none">{ledger.name || 'Unknown'}</h3>
                                                        <p className="text-[8px] text-zinc-600 mt-0.5">{ledger.parent_group?.replace('Sundry ', '') || ''}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 ml-3">
                                                        <span className={`text-[12px] font-black tabular-nums ${bal.color}`}>{bal.formatted}</span>
                                                        <span className={`text-[7px] font-black px-1 py-px rounded ${bal.bgColor} ${bal.color}`}>{bal.suffix}</span>
                                                        <ChevronRight size={12} className="text-zinc-600 group-hover:text-cyan-400 transition-colors ml-1" />
                                                    </div>
                                                </div>

                                                {/* Transaction slider */}
                                                {transactions.length > 0 && (
                                                    <div className="border-t border-zinc-800/30 -mt-0.5">
                                                        <div className="flex gap-1.5 overflow-x-auto px-[2px] py-2 scrollbar-hide">
                                                            {transactions.slice(0, 8).map((v: any, j: number) => {
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
                                                                        className="flex-shrink-0 bg-zinc-800/40 rounded-lg px-2 py-1.5 min-w-[120px] cursor-pointer hover:bg-zinc-800/60 transition-colors"
                                                                    >
                                                                        <div className="flex items-center justify-between mb-0.5">
                                                                            <span className="text-[8px] font-bold text-zinc-600 uppercase">{v.voucher_type}</span>
                                                                            <span className="text-[7px] text-zinc-600">{v.voucher_date ? new Date(v.voucher_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}</span>
                                                                        </div>
                                                                        <p className={`text-[10px] font-black tabular-nums ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                            {isCredit ? '+' : '-'}₹{amt.toLocaleString('en-IN')}
                                                                        </p>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        </div>
                                    );
                                }}
                            </List>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
