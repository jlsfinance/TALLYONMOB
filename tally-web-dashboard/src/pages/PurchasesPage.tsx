import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { purchasesApi } from '@/lib/supabase';
import { Link } from 'react-router-dom';
import { format, startOfYear } from 'date-fns';
import { ShoppingCart, Search, Calendar, FileText, TrendingDown } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';

export default function PurchasesPage() {
    const { selectedCompany } = useAuth() as any;
    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [filterType, setFilterType] = useState('All');
    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    useEffect(() => {
        if (selectedCompany && fromDate && toDate) {
            loadPurchases();
        }
    }, [selectedCompany, fromDate, toDate]);

    const loadPurchases = async () => {
        setLoading(true);
        const { data } = await purchasesApi.list(selectedCompany.id, { fromDate, toDate });
        setPurchases(data || []);

        const total = data?.reduce((s: number, p: any) => s + (p.net_amount || 0), 0) || 0;
        setStats({
            total,
            count: data?.length || 0,
            avgValue: data?.length ? Math.round(total / data.length) : 0
        });

        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredPurchases = purchases.filter((p: any) => {
        const matchesSearch = p.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase());
        if (filterType === 'All') return matchesSearch;
        return matchesSearch && p.voucher_type?.includes(filterType);
    });

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Purchase Register</h1>
                    <p className="text-gray-500 mt-1">{stats.count} bills in selected period</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <MetricCard title="Total Purchases" value={formatCurrency(stats.total)} icon={<ShoppingCart size={20} />} color="purple" />
                <MetricCard title="Bill Count" value={stats.count.toString()} icon={<FileText size={20} />} color="blue" />
                <MetricCard title="Avg. Value" value={formatCurrency(stats.avgValue)} icon={<TrendingDown size={20} />} color="orange" />
            </div>

            {/* Date Range & Search */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex items-center gap-2 bg-[#121214] border border-white/10 rounded-2xl px-4 py-3">
                    <Calendar size={16} className="text-gray-500" />
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent text-white text-sm focus:outline-none" />
                    <span className="text-gray-500">→</span>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent text-white text-sm focus:outline-none" />
                </div>
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search party or invoice..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#121214] border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/20"
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {['All', 'Purchase', 'Debit Note'].map(type => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`
                            px-4 py-2 rounded-xl text-sm font-medium transition-all border
                            ${filterType === type
                                ? 'bg-white text-black border-transparent'
                                : 'bg-[#121214] text-gray-400 border-white/10 hover:bg-[#1C1C1F]'}
                        `}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Purchases List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-500">Loading purchases...</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredPurchases.map((purchase: any) => (
                        <Link key={purchase.id} to={`/purchases/${purchase.id}`} className="block">
                            <GlassCard className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold">
                                        {purchase.party_ledger_name?.charAt(0)?.toUpperCase() || '₹'}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-white">{purchase.party_ledger_name || 'Cash Purchase'}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            #{purchase.invoice_number} • {format(new Date(purchase.invoice_date), 'dd MMM yyyy')}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-purple-400 font-mono">{formatCurrency(purchase.net_amount)}</p>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                        {purchase.voucher_type}
                                    </span>
                                </div>
                            </GlassCard>
                        </Link>
                    ))}
                    {filteredPurchases.length === 0 && (
                        <div className="text-center py-16 text-gray-500">
                            <ShoppingCart size={48} className="mx-auto mb-4 opacity-30" />
                            <p className="font-medium">No purchases found</p>
                            <p className="text-sm">Try adjusting the date range</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
