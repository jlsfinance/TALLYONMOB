import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi, supabase } from '../lib/supabase';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Search, Wallet, CreditCard, Building2,
    MessageCircle, FileText, ChevronRight, Star, Plus
} from 'lucide-react';
import {
    Badge, Spinner, EmptyState
} from '../components/ui/GlassUI';
import TransactionSlider from '../components/shared/TransactionSlider';
import { FinancialYearFilter } from '../components/shared/FinancialYearFilter';

export default function LedgersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
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
    const [stats, setStats] = useState({ total: 0, debit: 0, credit: 0, count: 0 });
    const [partyTransactions, setPartyTransactions] = useState<Record<string, any[]>>({});

    const groupFilters = [
        { key: 'all', label: 'All', icon: <Users size={12} /> },
        { key: 'Sundry Debtors', label: 'Customers', icon: <Wallet size={12} /> },
        { key: 'Sundry Creditors', label: 'Suppliers', icon: <CreditCard size={12} /> },
        { key: 'Bank Accounts', label: 'Banks', icon: <Building2 size={12} /> },
    ];

    useEffect(() => {
        if (selectedCompany) loadLedgers();
    }, [selectedCompany, selectedGroup]);

    const loadLedgers = async () => {
        setLoading(true);
        try {
            const { data, error } = await ledgerApi.list(
                selectedCompany.id,
                (selectedGroup !== 'all' && selectedGroup !== 'recent') ? selectedGroup : null
            );

            if (error) console.error('Ledger load error:', error);

            let sortedData = data || [];

            const debitTotal = sortedData.filter((l: any) => (l.current_balance || 0) > 0).reduce((s: number, l: any) => s + (l.current_balance || 0), 0);
            const creditTotal = sortedData.filter((l: any) => (l.current_balance || 0) < 0).reduce((s: number, l: any) => s + Math.abs(l.current_balance || 0), 0);

            setStats({
                total: debitTotal - creditTotal,
                debit: debitTotal,
                credit: creditTotal,
                count: sortedData.length
            });

            setLedgers(sortedData);

            if (sortedData.length > 0) {
                fetchRecentTransactions(sortedData.slice(0, 15));
            }
        } catch (error) {
            console.error('Error in loadLedgers:', error);
        }
        setLoading(false);
    };

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

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 pb-24 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)] tracking-tighter uppercase">Parties</h1>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                        Closing Net: <span className="text-[var(--primary)] font-black">₹{Math.abs(stats.total).toLocaleString()} {stats.total >= 0 ? 'Dr' : 'Cr'}</span>
                    </p>
                </div>
            </div>

            {/* FY Filter Slider */}
            <FinancialYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />

            {/* Search */}
            <div className="relative group">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors" />
                <input
                    placeholder="Search Customers, Suppliers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[var(--surface-variant)]/50 border border-[var(--border)] rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] transition-all placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:text-[9px]"
                />
            </div>

            {/* High-Density Filters */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {groupFilters.map((filter) => (
                    <button
                        key={filter.key}
                        onClick={() => setSelectedGroup(filter.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${selectedGroup === filter.key ? 'bg-[var(--primary)] text-white shadow-lg' : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'}`}
                    >
                        {filter.icon} {filter.label}
                    </button>
                ))}
            </div>

            {/* Parties List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-24">
                    <Spinner size="md" />
                    <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text-muted)] mt-4">Crunching Balances...</p>
                </div>
            ) : filteredLedgers.length === 0 ? (
                <EmptyState icon={<Users size={48} />} title="No Parties Found" description="Try clarifying your search" />
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filteredLedgers.map((ledger: any, idx) => {
                        const bal = formatCurrency(ledger.current_balance);
                        const transactions = partyTransactions[ledger.name] || [];

                        return (
                            <motion.div
                                key={ledger.id || idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: (idx % 20) * 0.02 }}
                                className="group bg-[var(--surface-variant)]/40 border border-[var(--border)] rounded-[24px] overflow-hidden hover:border-[var(--primary)]/40 transition-all"
                            >
                                <div className="p-4" onClick={() => navigate(`/ledgers/${ledger.id}`)}>
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-black text-[var(--on-surface)] uppercase truncate tracking-tight mb-1">{ledger.name || `Ledger (${ledger.parent || 'Unknown Group'})`}</h3>
                                            {/* Prominent Balance Below Name */}
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-base font-black ${bal.color}`}>
                                                    {bal.formatted}
                                                </span>
                                                <Badge variant={ledger.current_balance >= 0 ? 'info' : 'error'} className="text-[8px] font-black px-1.5 py-0.5 border-none">
                                                    {bal.suffix}
                                                </Badge>
                                            </div>
                                        </div>
                                        <button className="p-2 rounded-xl bg-[var(--surface-active)] text-[var(--on-surface-variant)] border border-[var(--border)]">
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex items-center gap-2 mt-4">
                                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase">
                                            <MessageCircle size={12} /> WhatsApp
                                        </button>
                                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 text-[9px] font-black uppercase">
                                            <FileText size={12} /> Statement
                                        </button>
                                    </div>
                                </div>

                                {/* Compact Transaction Slider */}
                                {transactions.length > 0 && (
                                    <div className="bg-[var(--surface)]/20 border-t border-[var(--border)] pt-2 pb-0">
                                        <div className="px-4 flex justify-between items-center mb-2">
                                            <span className="text-[7px] font-black uppercase tracking-[2px] text-[var(--text-muted)]">Recent Stream</span>
                                            <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{transactions.length} items</span>
                                        </div>
                                        <TransactionSlider transactions={transactions} compact={true} />
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
