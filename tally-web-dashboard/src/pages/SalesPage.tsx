import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Search, Plus, IndianRupee, Receipt, Filter } from 'lucide-react';
import { StatCard, EmptyState, Spinner } from '@/components/ui/GlassUI';
import TransactionCard from '@/components/shared/TransactionCard';
import { FinancialYearFilter } from '@/components/shared/FinancialYearFilter';

export default function SalesPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [sales, setSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFy, setSelectedFy] = useState('FY 2024-25');
    const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    useEffect(() => {
        // Update dates when FY changes
        const fyYear = parseInt(selectedFy.split(' ')[1].split('-')[0]);
        setFromDate(format(new Date(fyYear, 3, 1), 'yyyy-MM-dd'));
        setToDate(format(new Date(fyYear + 1, 2, 31), 'yyyy-MM-dd'));
    }, [selectedFy]);

    useEffect(() => {
        if (selectedCompany) loadSales();
    }, [selectedCompany, fromDate, toDate]);

    const loadSales = async () => {
        setLoading(true);
        try {
            const { data } = await supabase.from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .order('voucher_date', { ascending: false });

            const salesData = data || [];
            setSales(salesData);

            const total = salesData.reduce((s, v) => s + Math.abs(v.total_amount || 0), 0);
            setStats({
                total,
                count: salesData.length,
                avgValue: salesData.length > 0 ? total / salesData.length : 0
            });
        } catch (error) {
            console.error('Error loading sales:', error);
        }
        setLoading(false);
    };

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

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)] tracking-tighter uppercase">Revenue Feed</h1>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mt-1">{selectedCompany.name}</p>
                </div>
                <button
                    onClick={() => navigate('/create-invoice')}
                    className="flex items-center gap-2 px-5 py-3 bg-[var(--primary)] text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-[var(--primary-glow)]"
                >
                    <Plus size={14} /> New Invoice
                </button>
            </header>

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

            {/* Global FY Slider */}
            <FinancialYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />

            {/* Filter Hub */}
            <div className="space-y-4">
                <div className="relative group/search">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within/search:text-[var(--primary)] transition-colors" />
                    <input
                        placeholder="Search Party or Bill Number..."
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
                ) : filteredSales.length === 0 ? (
                    <EmptyState
                        icon={<TrendingUp size={48} />}
                        title="No Records Found"
                        description="Try another Finance Year or search term."
                    />
                ) : (
                    <div className="space-y-3">
                        {filteredSales.map((sale, idx) => (
                            <TransactionCard
                                key={sale.voucher_id}
                                type={sale.voucher_type}
                                partyName={sale.party_name}
                                voucherNumber={sale.voucher_number}
                                date={sale.voucher_date}
                                amount={sale.total_amount}
                                status={sale.sync_status || 'Synced'}
                                onClick={() => navigate(`/vouchers/${encodeURIComponent(sale.voucher_id)}`)}
                            />
                        ))}
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
