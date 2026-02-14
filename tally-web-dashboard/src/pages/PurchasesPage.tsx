import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Plus, IndianRupee, FileText, Filter, ArrowDownLeft } from 'lucide-react';
import { StatCard, EmptyState, Spinner } from '@/components/ui/GlassUI';
import TransactionCard from '@/components/shared/TransactionCard';
import { FinancialYearFilter } from '@/components/shared/FinancialYearFilter';

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

    // Initial state: Set correct dates immediately based on FY
    const getDatesForFy = (fy: string) => {
        const fyYear = parseInt(fy.split(' ')[1].split('-')[0]);
        return {
            start: format(new Date(fyYear, 3, 1), 'yyyy-MM-dd'),
            end: format(new Date(fyYear + 1, 2, 31), 'yyyy-MM-dd')
        };
    };

    const [dateRange, setDateRange] = useState(getDatesForFy(getCurrentFy()));
    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    useEffect(() => {
        // Update dates when FY changes
        setDateRange(getDatesForFy(selectedFy));
    }, [selectedFy]);

    useEffect(() => {
        if (selectedCompany) loadPurchases();
    }, [selectedCompany, dateRange]); // Dependency on dateRange object

    const loadPurchases = async () => {
        setLoading(true);
        try {

            const { data, error } = await supabase.from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end)
                .order('voucher_date', { ascending: false });

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

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)] tracking-tighter uppercase">Expense Stream</h1>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mt-1">{selectedCompany.name}</p>
                </div>
                {/* Link to Vouchers filtered by Purchase */}
                <button
                    onClick={() => navigate('/vouchers?type=Purchase')}
                    className="flex items-center gap-2 px-5 py-3 bg-[var(--primary)] text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-[var(--primary-glow)]"
                >
                    <Plus size={14} /> New Record
                </button>
            </header>

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

            {/* Global FY Slider */}
            <FinancialYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />

            {/* Filter Hub */}
            <div className="space-y-4">
                <div className="relative group/search">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within/search:text-[var(--primary)] transition-colors" />
                    <input
                        placeholder="Search Supplier or Bill Number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl py-4 pl-12 pr-6 text-xs font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] transition-all placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:text-[9px]"
                    />
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
                    <div className="space-y-3">
                        {filteredPurchases.map((purchase, idx) => (
                            <TransactionCard
                                key={purchase.voucher_id}
                                type={purchase.voucher_type}
                                partyName={purchase.party_name}
                                voucherNumber={purchase.voucher_number}
                                date={purchase.voucher_date}
                                amount={purchase.total_amount}
                                status={purchase.sync_status || 'Synced'}
                                onClick={() => navigate(`/vouchers/${encodeURIComponent(purchase.id)}`)}
                            />
                        ))}
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
