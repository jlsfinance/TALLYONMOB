import { useState, useEffect, useMemo } from 'react';
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
import TransactionSlider from '../components/shared/TransactionSlider';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { toast } from 'react-hot-toast';

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
                // Increased limit from 15 to 100 based on user feedback
                fetchRecentTransactions(sortedData.slice(0, 100));
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
                <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
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
                    <div className="flex flex-col items-center justify-center py-24">
                        <Spinner size="md" />
                        <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text-muted)] mt-4">Crunching Balances...</p>
                    </div>
                ) : filteredLedgers.length === 0 ? (
                    <EmptyState icon={<Users size={48} />} title="No Parties Found" description="Try clarifying your search" />
                ) : (
                    <div className="grid grid-cols-1 gap-1.5">
                        {filteredLedgers.map((ledger: any, idx) => {
                            const bal = formatCurrency(ledger.current_balance);
                            const transactions = partyTransactions[ledger.name] || [];

                            return (
                                <motion.div
                                    key={ledger.id || idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: (idx % 20) * 0.02 }}
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
                            );
                        })}
                    </div>
                )
            }
        </div >
    );
}

