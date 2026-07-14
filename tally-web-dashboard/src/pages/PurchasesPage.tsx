import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Plus, IndianRupee, FileText, Filter, ArrowDownLeft } from 'lucide-react';
import { StatCard, EmptyState, Spinner } from '@/components/ui/GlassUI';
import TransactionCard from '@/components/shared/TransactionCard';
import { CompactDateFilter } from '@/components/shared/CompactDateFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

export default function PurchasesPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [selectedMonth, setSelectedMonth] = useState<string | null>(() => format(new Date(), 'yyyy-MM'));

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

    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    useEffect(() => {
        if (selectedCompany) loadPurchases();
    }, [selectedCompany, dateRange]); // Dependency on dateRange object

    const loadPurchases = async () => {
        setLoading(true);
        try {

            const { data, error } = await supabase.from('vouchers')
                .select('id, voucher_number, party_name, voucher_type, voucher_date, total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end)
                .order('voucher_date', { ascending: false })
                .range(0, 99999);

            if (error) throw error;

            const purchaseData = data || [];

            setPurchases(purchaseData);

            const total = purchaseData.reduce((s, v) => s + Math.abs(v.total_amount || 0), 0);
            setStats({
                total,
                count: purchaseData.length,
                avgValue: purchaseData.length > 0 ? total / purchaseData.length : 0
            });
        } catch (error) {
            console.error('Error loading purchases:', error);
        }
        setLoading(false);
    };

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
                    <CompactDateFilter
                        selectedFy={selectedFy}
                        onFyChange={setSelectedFy}
                        selectedMonth={selectedMonth}
                        onMonthChange={setSelectedMonth}
                        monthsInFy={monthsInFy}
                    />
                    <button
                        onClick={() => navigate('/vouchers?type=Purchase')}
                        className="w-9 h-9 flex items-center justify-center bg-[var(--primary)] text-white rounded-xl shadow-lg shadow-[var(--primary-glow)] hover:scale-105 transition-transform"
                        title="New Record"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </HeaderPortal>

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
                    <div className="space-y-1.5">
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
        </div>
    );
}

