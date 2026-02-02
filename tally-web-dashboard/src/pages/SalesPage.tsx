import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { TrendingUp, Search, Plus, Calendar, IndianRupee, Receipt } from 'lucide-react';
import { Card, StatCard, Chip, Button, Input, ListItem, Avatar, Fab, Spinner, EmptyState } from '@/components/ui/GlassUI';

export default function SalesPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [sales, setSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    const dateFilters = [
        { label: 'This Month', from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
        { label: 'Last Month', from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
        { label: 'Last 3 Months', from: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
    ];

    useEffect(() => {
        if (selectedCompany) loadSales();
    }, [selectedCompany, fromDate, toDate]);

    const loadSales = async () => {
        setLoading(true);
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

        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)} Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredSales = sales.filter(s =>
        s.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-[var(--radius-md)] bg-[var(--success-bg)] text-[var(--success)]">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)]">Sales</h1>
                        <p className="text-[var(--on-surface-variant)]">
                            {format(new Date(fromDate), 'dd MMM')} - {format(new Date(toDate), 'dd MMM yyyy')}
                        </p>
                    </div>
                </div>
                <Link to="/create-invoice">
                    <Button icon={<Plus size={18} />}>New Invoice</Button>
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <StatCard
                    title="Total Sales"
                    value={formatCurrency(stats.total)}
                    icon={<IndianRupee size={20} />}
                    color="success"
                />
                <StatCard
                    title="Invoices"
                    value={stats.count.toString()}
                    icon={<Receipt size={20} />}
                    color="primary"
                />
                <StatCard
                    title="Avg Value"
                    value={formatCurrency(stats.avgValue)}
                    icon={<TrendingUp size={20} />}
                    color="default"
                />
            </div>

            {/* Date Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {dateFilters.map((filter) => {
                    const isActive = fromDate === filter.from && toDate === filter.to;
                    return (
                        <Chip
                            key={filter.label}
                            selected={isActive}
                            onClick={() => { setFromDate(filter.from); setToDate(filter.to); }}
                        >
                            {filter.label}
                        </Chip>
                    );
                })}
            </div>

            {/* Custom Date Pickers */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-[var(--on-surface-variant)] mb-1.5 block">From</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface-variant)] text-[var(--on-surface)] border-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-[var(--on-surface-variant)] mb-1.5 block">To</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface-variant)] text-[var(--on-surface)] border-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                    />
                </div>
            </div>

            {/* Search */}
            <Input
                placeholder="Search invoice or party..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search size={18} />}
            />

            {/* Sales List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
                </div>
            ) : filteredSales.length === 0 ? (
                <EmptyState
                    icon={<TrendingUp size={48} />}
                    title="No sales found"
                    description="Try adjusting your date range"
                />
            ) : (
                <Card padding="none">
                    <div className="divide-y divide-[var(--border)]">
                        {filteredSales.map((sale) => (
                            <Link key={sale.voucher_id} to={`/vouchers/${encodeURIComponent(sale.voucher_id)}`}>
                                <ListItem
                                    title={sale.party_name || 'Cash Sale'}
                                    subtitle={`#${sale.voucher_number} • ${format(new Date(sale.voucher_date), 'dd MMM yyyy')}`}
                                    leading={<Avatar name={sale.party_name || 'C'} color="success" />}
                                    trailing={
                                        <p className="font-semibold text-[var(--success)]">
                                            + {formatCurrency(Math.abs(sale.total_amount || 0))}
                                        </p>
                                    }
                                />
                            </Link>
                        ))}
                    </div>
                </Card>
            )}

            {/* FAB */}
            <div className="fixed bottom-20 md:bottom-6 right-6 z-50">
                <Fab icon={<Plus size={24} />} onClick={() => navigate('/create-invoice')} />
            </div>
        </div>
    );
}
