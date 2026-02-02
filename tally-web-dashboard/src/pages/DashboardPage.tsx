import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns';
import { motion } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Wallet, CreditCard, FileText, Users,
    BarChart3, Plus, RefreshCw, ArrowRight, Calendar
} from 'lucide-react';
import { Card, StatCard, Chip, Badge, Button, ListItem, Avatar, Fab, Spinner, EmptyState } from '@/components/ui/GlassUI';

export default function DashboardPage() {
    const { selectedCompany } = useAuth() as any;
    const { isDark } = useTheme();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod] = useState('month');
    const [stats, setStats] = useState({
        sales: 0, purchases: 0, receivables: 0, payables: 0, salesCount: 0, purchaseCount: 0
    });
    const [recentVouchers, setRecentVouchers] = useState<any[]>([]);

    const periodFilters = [
        { key: 'today', label: 'Today' },
        { key: 'month', label: 'This Month' },
        { key: '30days', label: 'Last 30 Days' },
        { key: 'year', label: 'This Year' },
    ];

    useEffect(() => {
        if (selectedCompany) loadDashboardData();
    }, [selectedCompany, period]);

    const getDateRange = () => {
        const now = new Date();
        switch (period) {
            case 'today':
                return { from: format(now, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            case 'month':
                return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
            case '30days':
                return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            case 'year':
                return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            default:
                return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
        }
    };

    const loadDashboardData = async () => {
        if (!selectedCompany) return;
        setLoading(true);
        const { from, to } = getDateRange();

        try {
            const [vouchersRes, ledgersRes, recentRes] = await Promise.all([
                supabase.from('vouchers').select('*').eq('company_id', selectedCompany.id)
                    .gte('voucher_date', from).lte('voucher_date', to),
                supabase.from('ledgers').select('*').eq('company_id', selectedCompany.id),
                supabase.from('vouchers').select('*').eq('company_id', selectedCompany.id)
                    .order('voucher_date', { ascending: false }).limit(5)
            ]);

            const vouchers = vouchersRes.data || [];
            const sales = vouchers.filter(v => v.voucher_type === 'Sales').reduce((s, v) => s + Math.abs(v.total_amount || 0), 0);
            const purchases = vouchers.filter(v => v.voucher_type === 'Purchase').reduce((s, v) => s + Math.abs(v.total_amount || 0), 0);
            const salesCount = vouchers.filter(v => v.voucher_type === 'Sales').length;
            const purchaseCount = vouchers.filter(v => v.voucher_type === 'Purchase').length;

            const ledgers = ledgersRes.data || [];
            const receivables = ledgers.filter((l: any) => l.parent_group === 'Sundry Debtors' && l.closing_balance > 0)
                .reduce((s: number, l: any) => s + l.closing_balance, 0);
            const payables = ledgers.filter((l: any) => l.parent_group === 'Sundry Creditors' && l.closing_balance < 0)
                .reduce((s: number, l: any) => s + Math.abs(l.closing_balance), 0);

            setStats({ sales, purchases, receivables, payables, salesCount, purchaseCount });
            setRecentVouchers(recentRes.data || []);
        } catch (error) {
            console.error('Dashboard load error:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadDashboardData();
        setRefreshing(false);
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)]">
                        Dashboard
                    </h1>
                    <p className="text-[var(--on-surface-variant)] mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
                        {selectedCompany?.name}
                    </p>
                </div>
                <Button
                    variant="secondary"
                    icon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}
                    onClick={handleRefresh}
                >
                    Refresh
                </Button>
            </div>

            {/* Period Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {periodFilters.map((filter) => (
                    <Chip
                        key={filter.key}
                        selected={period === filter.key}
                        onClick={() => setPeriod(filter.key)}
                    >
                        {filter.label}
                    </Chip>
                ))}
            </div>

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
                </div>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Total Sales"
                            value={formatCurrency(stats.sales)}
                            subtitle={`${stats.salesCount} invoices`}
                            icon={<TrendingUp size={22} />}
                            color="success"
                            onClick={() => navigate('/sales')}
                        />
                        <StatCard
                            title="Purchases"
                            value={formatCurrency(stats.purchases)}
                            subtitle={`${stats.purchaseCount} bills`}
                            icon={<TrendingDown size={22} />}
                            color="warning"
                            onClick={() => navigate('/purchases')}
                        />
                        <StatCard
                            title="Receivables"
                            value={formatCurrency(stats.receivables)}
                            icon={<Wallet size={22} />}
                            color="primary"
                            onClick={() => navigate('/ledgers?group=Sundry Debtors')}
                        />
                        <StatCard
                            title="Payables"
                            value={formatCurrency(stats.payables)}
                            icon={<CreditCard size={22} />}
                            color="error"
                            onClick={() => navigate('/ledgers?group=Sundry Creditors')}
                        />
                    </div>

                    {/* Quick Actions */}
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--on-surface)] mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'New Invoice', icon: <Plus size={20} />, to: '/create-invoice' },
                                { label: 'Day Book', icon: <FileText size={20} />, to: '/vouchers' },
                                { label: 'Parties', icon: <Users size={20} />, to: '/ledgers' },
                                { label: 'Reports', icon: <BarChart3 size={20} />, to: '/sales-analytics' },
                            ].map((action, idx) => (
                                <Link key={idx} to={action.to}>
                                    <Card hover className="flex flex-col items-center justify-center py-6 gap-3">
                                        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--primary)]/10 text-[var(--primary)]">
                                            {action.icon}
                                        </div>
                                        <span className="text-sm font-medium text-[var(--on-surface)]">{action.label}</span>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-[var(--on-surface)]">Recent Transactions</h2>
                            <Link to="/vouchers" className="text-sm text-[var(--primary)] font-medium flex items-center gap-1 hover:underline">
                                View All <ArrowRight size={14} />
                            </Link>
                        </div>
                        <Card padding="none">
                            {recentVouchers.length === 0 ? (
                                <EmptyState
                                    icon={<FileText size={40} />}
                                    title="No transactions"
                                    description="Your recent transactions will appear here"
                                />
                            ) : (
                                <div className="divide-y divide-[var(--border)]">
                                    {recentVouchers.map((voucher) => {
                                        const isCredit = voucher.voucher_type === 'Sales' || voucher.voucher_type === 'Receipt';
                                        const colorMap: Record<string, 'success' | 'error' | 'warning' | 'primary'> = {
                                            'Sales': 'success',
                                            'Purchase': 'warning',
                                            'Receipt': 'primary',
                                            'Payment': 'error'
                                        };

                                        return (
                                            <Link key={voucher.voucher_id} to={`/vouchers/${encodeURIComponent(voucher.voucher_id)}`}>
                                                <ListItem
                                                    title={voucher.party_name || 'Unknown Party'}
                                                    subtitle={`#${voucher.voucher_number} • ${format(new Date(voucher.voucher_date), 'dd MMM yyyy')}`}
                                                    leading={
                                                        <Avatar
                                                            name={voucher.voucher_type || 'V'}
                                                            color={colorMap[voucher.voucher_type] || 'primary'}
                                                        />
                                                    }
                                                    trailing={
                                                        <div className="text-right">
                                                            <p className={`font-semibold ${isCredit ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                                                                {isCredit ? '+' : '-'} {formatCurrency(Math.abs(voucher.total_amount || 0))}
                                                            </p>
                                                            <Badge variant={colorMap[voucher.voucher_type] || 'default'}>
                                                                {voucher.voucher_type}
                                                            </Badge>
                                                        </div>
                                                    }
                                                />
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>
                </>
            )}

            {/* FAB */}
            <div className="fixed bottom-20 md:bottom-6 right-6 z-50">
                <Fab icon={<Plus size={24} />} onClick={() => navigate('/create-invoice')} />
            </div>
        </div>
    );
}
