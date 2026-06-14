import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { VariableSizeList as List } from 'react-window';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi, supabase } from '../lib/insforge';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Search, Wallet, CreditCard, Building2,
    MessageCircle, FileText, ChevronRight, Star, Plus
} from 'lucide-react';
import {
    Badge, Spinner, EmptyState
} from '../components/ui/GlassUI';
import { SkeletonTable } from '../components/ui/Skeleton';
import TransactionSlider from '../components/shared/TransactionSlider';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { toast } from 'react-hot-toast';

export default function LedgersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'all');

    // Calculate current FY dynamically (FY starts in April)
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
        const color = val >= 0 ? 'text-blue-500' : 'text-red-500';

        const formatted = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absVal);

        return { formatted, suffix, color };
    };

    const filteredLedgers = useMemo(() => {
        return ledgers.filter((l: any) =>
            l.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [ledgers, searchTerm]);

    const getItemSize = (index: number) => {
        const ledger = filteredLedgers[index];
        const transactions = partyTransactions[ledger.name] || [];
        return transactions.length > 0 ? 132 : 68;
    };

    // Reset VariableSizeList sizes cache when data or transaction load changes
    useEffect(() => {
        if (listRef.current) {
            listRef.current.resetAfterIndex(0);
        }
    }, [filteredLedgers, partyTransactions]);

    const [showSearch, setShowSearch] = useState(false);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24 px-4">
            <HeaderPortal type="title">
                <div className="flex flex-col">
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Global Ledger</h1>
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

            <HeaderPortal type="filters">
                <div className="flex items-center gap-2">
                    <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                        Export CSV
                    </button>
                </div>
            </HeaderPortal>

            {/* High-Density Filters */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {groupFilters.map((filter) => {
                    const isActive = selectedGroup === filter.key;
                    return (
                        <button
                            key={filter.key}
                            onClick={() => setSelectedGroup(filter.key)}
                            className={`
                                flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                ${isActive
                                    ? 'bg-[var(--primary)] text-white shadow-lg scale-105'
                                    : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                }
                            `}
                        >
                            {filter.icon}
                            <span className={isActive ? 'block' : 'hidden md:block'}>
                                {filter.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Parties List */}
            {
                loading ? (
                    <SkeletonTable rows={8} cols={4} />
                ) : filteredLedgers.length === 0 ? (
                    <EmptyState icon={<Users size={48} />} title="No Parties Found" description="Try clarifying your search" />
                ) : (
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
                                    <div style={style} className="pr-2 pb-1.5">
                                        <motion.div
                                            key={ledger.id || index}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="group bg-[var(--surface-variant)]/40 border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--primary)]/40 transition-all"
                                        >
                                            <div className="p-2.5" onClick={() => navigate(`/ledgers/${ledger.id}`)}>
                                                <div className="flex justify-between items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="text-[10px] md:text-sm font-black text-[var(--on-surface)] uppercase truncate tracking-tight mb-0.5">{ledger.name || `Ledger (${ledger.parent || 'Unknown Group'})`}</h3>
                                                        {/* Prominent Balance Below Name */}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-[12px] md:text-base font-black ${bal.color}`}>
                                                                {bal.formatted}
                                                            </span>
                                                            <Badge variant={ledger.current_balance >= 0 ? 'info' : 'error'} className="text-[7px] md:text-[8px] font-black px-1 md:px-1.5 py-0 h-3 md:h-4 border-none">
                                                                {bal.suffix}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <button className="p-1 md:p-2 rounded-lg md:rounded-xl bg-[var(--surface-active)] text-[var(--on-surface-variant)] border border-[var(--border)]">
                                                        <ChevronRight size={10} className="md:w-[14px] md:h-[14px]" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Compact Transaction Slider Integrated */}
                                            {transactions.length > 0 && (
                                                <div className="-mt-1">
                                                    <TransactionSlider transactions={transactions} compact={true} />
                                                </div>
                                            )}
                                        </motion.div>
                                    </div>
                                );
                            }}
                        </List>
                    </div>
                )
            }
        </div >
    );
}

