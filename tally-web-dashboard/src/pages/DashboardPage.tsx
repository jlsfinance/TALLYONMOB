import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns';
import {
    TrendingUp, TrendingDown, Wallet, CreditCard, FileText, Users,
    BarChart3, Plus, RefreshCw, ArrowRight, Activity, Calendar, Zap
} from 'lucide-react';
import { Card, StatCard, Chip, Badge, Button, ListItem, Avatar, Fab, Spinner, EmptyState } from '../components/ui/GlassUI';
import { KPICard, ProgressRing, BarChart3D, GlassCard as GlassCard3D } from '../components/3d';
import GSTReminders from '../components/dashboard/GSTReminders';
import BillingDashboard from './BillingDashboard';
import { subMonths, startOfMonth as startOfMonthDate, endOfMonth as endOfMonthDate } from 'date-fns';

export default function DashboardPage() {
    const { selectedCompany, user, appMode } = useAuth() as any;
    const { isDark } = useTheme();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod] = useState('year');
    const [stats, setStats] = useState({
        sales: 0, purchases: 0, receivables: 0, payables: 0, salesCount: 0, purchaseCount: 0
    });
    const [recentVouchers, setRecentVouchers] = useState<any[]>([]);
    const [monthlySales, setMonthlySales] = useState<any[]>([]);
    const [kpiRatios, setKpiRatios] = useState({ collection: 0, expense: 0, profit: 0 });
    const [todaySales, setTodaySales] = useState(0);
    const [salesTrend, setSalesTrend] = useState({ value: 0, direction: 'neutral' });

    // Greeting based on time
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const periodFilters = [
        { key: 'today', label: 'Today', icon: <Activity size={10} /> },
        { key: 'month', label: 'Month', icon: <Calendar size={10} /> },
        { key: '30days', label: '30D', icon: <Activity size={10} /> },
        { key: 'year', label: 'Year', icon: <BarChart3 size={10} /> },
    ];

    useEffect(() => {
        if (selectedCompany) loadDashboardData();
    }, [selectedCompany, period]);

    // Listen for Global Refresh
    useEffect(() => {
        const handleGlobalRefresh = () => {
            handleRefresh();
        };
        window.addEventListener('app-refresh-trigger', handleGlobalRefresh);
        return () => window.removeEventListener('app-refresh-trigger', handleGlobalRefresh);
    }, [selectedCompany, period]);

    const getDateRange = () => {
        const now = new Date();
        switch (period) {
            case 'today': return { from: format(now, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            case 'month': return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
            case '30days': return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            case 'year': {
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const startYear = currentMonth < 3 ? currentYear - 1 : currentYear;
                const fyStart = new Date(startYear, 3, 1);
                return { from: format(fyStart, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            }
            default: return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
        }
    };

    const loadDashboardData = async () => {
        if (!selectedCompany) return;
        setLoading(true);
        const { from, to } = getDateRange();

        try {
            let sales = 0;
            let purchases = 0;
            let salesCount = 0;
            let purchaseCount = 0;
            let receivables = 0;
            let payables = 0;

            const { data: rpcStats, error: rpcError } = await supabase.rpc('get_dashboard_stats', {
                p_company_id: selectedCompany.id,
                p_start_date: from,
                p_end_date: to
            });

            if (!rpcError && rpcStats) {
                sales = rpcStats.sales_gross || 0;
                purchases = rpcStats.purchases_gross || 0;
                salesCount = rpcStats.sales_count || 0;
                purchaseCount = rpcStats.purchases_count || 0;
                receivables = rpcStats.receivables || 0;
                payables = rpcStats.payables || 0;

                const receipts = rpcStats.receipts_total || 0;
                const collectionRate = sales > 0 ? (receipts / sales) * 100 : 0;
                const expenseRate = sales > 0 ? (purchases / sales) * 100 : 0;
                const netProfit = sales - purchases;
                const profitMargin = sales > 0 ? (netProfit / sales) * 100 : 0;

                setKpiRatios({
                    collection: Math.min(collectionRate, 100),
                    expense: Math.min(expenseRate, 100),
                    profit: profitMargin
                });

                try {
                    const today = new Date();
                    const lastMonth = subMonths(today, 1);
                    const lmStart = format(startOfMonthDate(lastMonth), 'yyyy-MM-dd');
                    const lmEnd = format(endOfMonthDate(lastMonth), 'yyyy-MM-dd');

                    const { data: lmData } = await supabase.rpc('get_dashboard_stats', {
                        p_company_id: selectedCompany.id,
                        p_start_date: lmStart,
                        p_end_date: lmEnd
                    });

                    if (lmData) {
                        const pastSales = lmData.sales_gross || 0;
                        if (pastSales > 0) {
                            const diff = ((sales - pastSales) / pastSales) * 100;
                            setSalesTrend({
                                value: Math.abs(Math.round(diff * 10) / 10),
                                direction: diff >= 0 ? 'up' : 'down'
                            });
                        }
                    }
                } catch (e) {
                    console.error("Trend calculation failed", e);
                }
            } else {
                const { data: vSales } = await supabase
                    .from('sales')
                    .select('gross_amount, invoice_date')
                    .eq('company_id', selectedCompany.id)
                    .gte('invoice_date', from)
                    .lte('invoice_date', to)
                    .eq('is_cancelled', false)
                    .limit(50000);

                const { data: vPurchases } = await supabase
                    .from('purchases')
                    .select('gross_amount, invoice_date')
                    .eq('company_id', selectedCompany.id)
                    .gte('invoice_date', from)
                    .lte('invoice_date', to)
                    .eq('is_cancelled', false)
                    .limit(50000);

                const sData = vSales || [];
                const pData = vPurchases || [];
                sales = sData.reduce((s, v) => s + (Number(v.gross_amount) || 0), 0);
                purchases = pData.reduce((s, v) => s + (Number(v.gross_amount) || 0), 0);
                salesCount = sData.length;
                purchaseCount = pData.length;

                // Improved Fallback: Fetch Receipts for Collection Rate
                const { data: vReceipts } = await supabase
                    .from('vouchers')
                    .select('total_amount')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Receipt')
                    .gte('voucher_date', from)
                    .lte('voucher_date', to);

                const receipts = (vReceipts || []).reduce((sum, v) => sum + Math.abs(Number(v.total_amount) || 0), 0);
                const collectionRate = sales > 0 ? (receipts / sales) * 100 : 0;
                const expenseRate = sales > 0 ? (purchases / sales) * 100 : 0;
                const profitMargin = sales > 0 ? ((sales - purchases) / sales) * 100 : 0;

                setKpiRatios({
                    collection: Math.min(collectionRate, 100),
                    expense: Math.min(expenseRate, 100),
                    profit: profitMargin
                });
            }

            const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
            const { data: trendData } = await supabase
                .from('sales')
                .select('gross_amount, invoice_date')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', sixMonthsAgo)
                .eq('is_cancelled', false)
                .limit(10000);

            const monthlyData: any[] = [];
            for (let i = 5; i >= 0; i--) {
                const month = subMonths(new Date(), i);
                const ms = format(startOfMonthDate(month), 'yyyy-MM-dd');
                const me = format(endOfMonthDate(month), 'yyyy-MM-dd');

                const monthSales = (trendData || [])
                    .filter(s => s.invoice_date >= ms && s.invoice_date <= me)
                    .reduce((sum, s) => sum + (Number(s.gross_amount) || 0), 0);

                monthlyData.push({
                    label: format(month, 'MMM'),
                    value: monthSales
                });
            }
            setMonthlySales(monthlyData);

            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const { data: tSales } = await supabase
                .from('sales')
                .select('gross_amount')
                .eq('company_id', selectedCompany.id)
                .eq('invoice_date', todayStr)
                .eq('is_cancelled', false);
            setTodaySales((tSales || []).reduce((sum, s) => sum + (Number(s.gross_amount) || 0), 0));

            const { data: recent } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .order('voucher_date', { ascending: false })
                .limit(6);

            setStats({
                sales,
                purchases,
                receivables,
                payables,
                salesCount,
                purchaseCount
            });

            setRecentVouchers(recent || []);
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
        <div className="space-y-4 max-w-7xl mx-auto">
            {/* Hero Section (Desktop Only) */}
            <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-[var(--on-background)] tracking-tight">
                        {getGreeting()}, <span className="text-[var(--primary)]">{user?.email?.split('@')[0]}</span>
                    </h1>
                    <p className="text-[var(--text-muted)] mt-2 text-lg">
                        Here's what's happening with <span className="font-semibold text-[var(--on-surface)]">{selectedCompany.name}</span> today.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={handleRefresh} icon={<RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />}>
                        Sync Now
                    </Button>
                    <Button variant="glow" onClick={() => navigate('/create-invoice')} icon={<Plus size={18} />} size="lg">
                        New Invoice
                    </Button>
                </div>
            </div>

            {/* Condant Controls (Pills) */}
            <div className="flex items-center justify-between gap-2 bg-[var(--surface-variant)]/30 p-1.5 rounded-2xl md:bg-transparent md:p-0">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                    {periodFilters.map((filter) => (
                        <button
                            key={filter.key}
                            onClick={() => setPeriod(filter.key)}
                            className={`
                                flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                                ${period === filter.key
                                    ? 'bg-[var(--primary)] text-white shadow-lg'
                                    : 'bg-[var(--surface)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                }
                            `}
                        >
                            {filter.icon}
                            {filter.label}
                        </button>
                    ))}
                </div>
                {refreshing && (
                    <div className="pr-2">
                        <RefreshCw size={14} className="animate-spin text-[var(--primary)]" />
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <Spinner size="lg" />
                    <p className="text-[var(--text-muted)] animate-pulse">Analyzing financial data...</p>
                </div>
            ) : appMode === 'billing' ? (
                <BillingDashboard />
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                    {/* Bento Grid Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard title="Sales" value={stats.sales} icon="💰" variant="sales" trend={salesTrend} subtitle={`${stats.salesCount} Bills`} onClick={() => navigate('/sales')} />
                        <KPICard title="Purchase" value={stats.purchases} icon="🛒" variant="purchases" trend={{ value: 0, direction: 'neutral' }} subtitle={`${stats.purchaseCount} Bills`} onClick={() => navigate('/purchases')} />
                        <KPICard title="Collect" value={stats.receivables} icon="📋" variant="outstanding" trend={{ value: 0, direction: 'neutral' }} subtitle="Receivables" onClick={() => navigate('/ledgers?group=Sundry Debtors')} />
                        <KPICard title="Profit" value={stats.sales - stats.purchases} icon="📈" variant="profit" trend={{ value: 0, direction: 'neutral' }} subtitle="Margin" onClick={() => { }} />
                    </div>

                    {/* Health & Trends */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card glass className="p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--primary)] opacity-[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:opacity-[0.08] transition-opacity" />
                            <h3 className="text-[10px] font-black text-[var(--on-surface)] mb-6 uppercase tracking-[3px] flex items-center gap-3">
                                <span className="w-6 h-6 rounded-lg bg-[var(--primary-glow)] flex items-center justify-center">
                                    <Activity size={12} className="text-[var(--primary)]" />
                                </span>
                                Business Health
                            </h3>
                            <div className="flex justify-around items-end py-4">
                                <ProgressRing value={kpiRatios.collection} label="Collection" color="emerald" size={90} />
                                <ProgressRing value={kpiRatios.expense} label="Expense" color="blue" size={90} />
                                <ProgressRing value={kpiRatios.profit} label="Profit" color="purple" size={90} />
                            </div>
                        </Card>

                        <Card glass className="p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--info)] opacity-[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:opacity-[0.08] transition-opacity" />
                            <h3 className="text-[10px] font-black text-[var(--on-surface)] mb-6 uppercase tracking-[3px] flex items-center gap-3">
                                <span className="w-6 h-6 rounded-lg bg-[var(--info-glow)] flex items-center justify-center">
                                    <BarChart3 size={12} className="text-[var(--info)]" />
                                </span>
                                Sales Trend
                            </h3>
                            <div className="h-[140px] flex items-end justify-around gap-1 mt-4">
                                <BarChart3D data={monthlySales} height={120} barColor="purple" animated />
                            </div>
                        </Card>
                    </div>

                    {/* Quick Access */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <h2 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-widest">Access</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Invoice', icon: <Plus className="text-[var(--primary)]" />, to: '/create-invoice' },
                                    { label: 'Parties', icon: <Users className="text-[var(--info)]" />, to: '/ledgers' },
                                    { label: 'Vouchers', icon: <FileText className="text-[var(--success)]" />, to: '/vouchers' },
                                    { label: 'Reports', icon: <BarChart3 className="text-[var(--warning)]" />, to: '/sales-dashboard' },
                                ].map((action, idx) => (
                                    <Link key={idx} to={action.to} className="block group">
                                        <Card hover padding="none" className="flex flex-col items-center justify-center p-4 border-[var(--border)] hover:border-[var(--primary)] transition-all h-24">
                                            <div className="p-2 rounded-lg bg-[var(--surface-variant)] group-hover:bg-[var(--primary-glow)] transition-colors mb-2">
                                                {action.icon}
                                            </div>
                                            <h3 className="font-bold text-[var(--on-surface)] text-[10px] uppercase tracking-wider">{action.label}</h3>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-widest">Activity</h2>
                            <Card padding="none">
                                {recentVouchers.length === 0 ? (
                                    <EmptyState icon={<Activity />} title="No data" />
                                ) : (
                                    <div className="divide-y divide-[var(--dividers)]">
                                        {recentVouchers.map((v) => (
                                            <Link key={v.voucher_id} to={`/vouchers/${encodeURIComponent(v.voucher_id)}`} className="block hover:bg-[var(--surface-hover)] transition-colors">
                                                <div className="flex items-center gap-3 p-3">
                                                    <Avatar name={v.party_name || '?'} size="sm" color={v.voucher_type === 'Sales' ? 'success' : v.voucher_type === 'Purchase' ? 'warning' : 'default'} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-bold text-[var(--on-surface)] truncate">{v.party_name}</p>
                                                        <p className="text-[9px] text-[var(--text-muted)] uppercase">{v.voucher_type} • {format(new Date(v.voucher_date), 'd MMM')}</p>
                                                    </div>
                                                    <div className="text-right whitespace-nowrap">
                                                        <p className={`text-[11px] font-black ${['Sales', 'Receipt'].includes(v.voucher_type) ? 'text-[var(--success)]' : 'text-[var(--on-surface)]'}`}>
                                                            {formatCurrency(v.total_amount)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
