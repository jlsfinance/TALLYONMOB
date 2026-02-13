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
import SmartInsights from '../components/dashboard/SmartInsights';
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

            // Fetch Sales vouchers
            const { data: vSales } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .eq('is_deleted', false)
                .limit(50000);

            // Fetch Purchase vouchers
            const { data: vPurchases } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .eq('is_deleted', false)
                .limit(50000);

            const sData = vSales || [];
            const pData = vPurchases || [];
            sales = sData.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            purchases = pData.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            salesCount = sData.length;
            purchaseCount = pData.length;

            // Fetch Receivables from Sundry Debtors ledgers
            const { data: debtorLedgers } = await supabase
                .from('ledgers')
                .select('current_balance')
                .eq('company_id', selectedCompany.id)
                .eq('parent', 'Sundry Debtors');
            receivables = (debtorLedgers || []).reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);

            // Fetch Payables from Sundry Creditors ledgers
            const { data: creditorLedgers } = await supabase
                .from('ledgers')
                .select('current_balance')
                .eq('company_id', selectedCompany.id)
                .eq('parent', 'Sundry Creditors');
            payables = (creditorLedgers || []).reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);


            // Calculate KPI Ratios
            const { data: vReceipts } = await supabase
                .from('vouchers')
                .select('total_amount')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Receipt')
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .eq('is_deleted', false);

            const receipts = (vReceipts || []).reduce((sum, v) => sum + Math.abs(Number(v.total_amount) || 0), 0);
            const collectionRate = sales > 0 ? (receipts / sales) * 100 : 0;
            const expenseRate = sales > 0 ? (purchases / sales) * 100 : 0;
            const profitMargin = sales > 0 ? ((sales - purchases) / sales) * 100 : 0;

            setKpiRatios({
                collection: Math.min(collectionRate, 100),
                expense: Math.min(expenseRate, 100),
                profit: profitMargin
            });

            // Fetch 6-month trend data from vouchers
            const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
            const { data: trendData } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', sixMonthsAgo)
                .eq('is_deleted', false)
                .limit(10000);

            const monthlyData: any[] = [];
            for (let i = 5; i >= 0; i--) {
                const month = subMonths(new Date(), i);
                const ms = format(startOfMonthDate(month), 'yyyy-MM-dd');
                const me = format(endOfMonthDate(month), 'yyyy-MM-dd');

                const monthSales = (trendData || [])
                    .filter(s => s.voucher_date >= ms && s.voucher_date <= me)
                    .reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);

                monthlyData.push({
                    label: format(month, 'MMM'),
                    value: monthSales
                });
            }
            setMonthlySales(monthlyData);

            // Today's sales
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const { data: tSales } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('voucher_date', todayStr)
                .eq('is_deleted', false);
            setTodaySales((tSales || []).reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0));

            // Calculate sales trend (current vs last month)
            try {
                const today = new Date();
                const lastMonth = subMonths(today, 1);
                const lmStart = format(startOfMonthDate(lastMonth), 'yyyy-MM-dd');
                const lmEnd = format(endOfMonthDate(lastMonth), 'yyyy-MM-dd');

                const { data: lmSales } = await supabase
                    .from('vouchers')
                    .select('total_amount, grand_total')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Sales')
                    .gte('voucher_date', lmStart)
                    .lte('voucher_date', lmEnd)
                    .eq('is_deleted', false);

                const pastSales = (lmSales || []).reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);
                if (pastSales > 0) {
                    const diff = ((sales - pastSales) / pastSales) * 100;
                    setSalesTrend({
                        value: Math.abs(Math.round(diff * 10) / 10),
                        direction: diff >= 0 ? 'up' : 'down'
                    });
                }
            } catch (e) {
                console.error("Trend calculation failed", e);
            }

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

    // STITCH DESIGN SYSTEM - LOCAL COMPONENTS
    const StitchStatCard = ({ title, value, icon, subtitle, trend, onClick, colorClass = "text-[var(--primary)]", bgClass = "bg-[var(--primary-container)]" }: any) => (
        <div
            onClick={onClick}
            className="stitch-card p-5 cursor-pointer hover:-translate-y-1 transition-transform relative overflow-hidden group"
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-full ${bgClass} flex items-center justify-center ${colorClass}`}>
                    <span className="text-xl">{icon}</span>
                </div>
                {trend && trend.value !== 0 && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend.direction === 'up' ? 'bg-[var(--tertiary-container)] text-[var(--tertiary)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
                        {trend.direction === 'up' ? '↑' : '↓'} {trend.value}%
                    </span>
                )}
            </div>
            <div>
                <h3 className="text-[var(--text-muted)] text-sm font-medium mb-1">{title}</h3>
                <div className="text-2xl font-bold text-[var(--on-surface)] tracking-tight">
                    {formatCurrency(value)}
                </div>
                <p className="text-xs text-[var(--on-surface-variant)] mt-2 opacity-80">{subtitle}</p>
            </div>
        </div>
    );

    const StitchQuickAction = ({ title, icon, onClick, to }: any) => {
        const Wrapper = to ? Link : 'div';
        return (
            <Wrapper to={to} onClick={onClick} className="group">
                <div className="stitch-card p-4 flex flex-col items-center justify-center gap-3 h-28 border border-dashed border-[var(--outline-variant)] hover:border-solid hover:border-[var(--primary)] transition-all bg-[var(--background)]">
                    <div className="text-[var(--primary)] group-hover:scale-110 transition-transform">
                        {icon}
                    </div>
                    <span className="text-sm font-medium text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]">{title}</span>
                </div>
            </Wrapper>
        )
    };

    if (!selectedCompany) return null;

    return (
        <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">

            {/* Header Section - Google Design Style */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--outline-variant)] pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-normal text-display text-[var(--on-surface)]">
                        Dashboard
                    </h1>
                    <p className="text-[var(--text-muted)] text-sm mt-1">
                        Overview for <span className="font-medium text-[var(--on-surface)]">{selectedCompany.name}</span>
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-[var(--surface-container)] rounded-full p-1 border border-[var(--outline-variant)]">
                        {periodFilters.map((filter) => (
                            <button
                                key={filter.key}
                                onClick={() => setPeriod(filter.key)}
                                className={`
                                    px-4 py-1.5 rounded-full text-xs font-medium transition-all
                                    ${period === filter.key
                                        ? 'bg-[var(--surface)] text-[var(--on-surface)] shadow-sm'
                                        : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)]'
                                    }
                                `}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleRefresh}
                        className="stitch-icon-btn bg-[var(--primary-container)] text-[var(--on-primary-container)]"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={() => navigate('/create-invoice')}
                        className="stitch-button flex items-center gap-2"
                    >
                        <Plus size={18} />
                        <span className="hidden sm:inline">New Invoice</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <Spinner size="lg" />
                    <p className="text-[var(--text-muted)] animate-pulse font-medium">Syncing financial data...</p>
                </div>
            ) : appMode === 'billing' ? (
                <BillingDashboard />
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">

                    {/* KEY METRICS GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StitchStatCard
                            title="Total Sales"
                            value={stats.sales}
                            icon={<TrendingUp size={20} />}
                            trend={salesTrend}
                            subtitle={`${stats.salesCount} Invoices generated`}
                            colorClass="text-[var(--primary)]"
                            bgClass="bg-[var(--primary-container)]"
                            onClick={() => navigate('/sales')}
                        />
                        <StitchStatCard
                            title="Total Purchases"
                            value={stats.purchases}
                            icon={<TrendingDown size={20} />}
                            subtitle={`${stats.purchaseCount} Bills recorded`}
                            colorClass="text-[var(--secondary)]"
                            bgClass="bg-[var(--secondary-container)]"
                            onClick={() => navigate('/purchases')}
                        />
                        <StitchStatCard
                            title="Receivables"
                            value={stats.receivables}
                            icon={<Wallet size={20} />}
                            subtitle="Total Pending Collection"
                            colorClass="text-[var(--warning)]"
                            bgClass="bg-[var(--warning-bg)]"
                            onClick={() => navigate('/ledgers?group=Sundry Debtors')}
                        />
                        <StitchStatCard
                            title="Payables"
                            value={stats.payables}
                            icon={<CreditCard size={20} />}
                            subtitle="Total Outstanding Payments"
                            colorClass="text-[var(--error)]"
                            bgClass="bg-[var(--error-bg)]"
                            onClick={() => navigate('/ledgers?group=Sundry Creditors')}
                        />
                    </div>

                    {/* MAIN CONTENT GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* CHART SECTION */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="stitch-card p-6 min-h-[400px]">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-normal text-[var(--on-surface)]">Financial Performance</h3>
                                    <div className="flex gap-2">
                                        <Badge variant="outline">Revenue</Badge>
                                        <Badge variant="outline">Expenses</Badge>
                                    </div>
                                </div>

                                {/* Chart Placeholder - Reusing BarChart3D but constrained */}
                                <div className="h-[300px] w-full rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] border-opacity-20 p-4">
                                    <BarChart3D data={monthlySales} height={280} barColor="#0B57D0" animated />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT SIDEBAR / ACTIONS */}
                        <div className="space-y-6">

                            {/* Quick Actions Panel */}
                            <div className="stitch-card p-5">
                                <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Quick Actions</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <StitchQuickAction
                                        title="Invoice"
                                        icon={<FileText size={24} />}
                                        to="/create-invoice"
                                    />
                                    <StitchQuickAction
                                        title="Vouchers"
                                        icon={<CreditCard size={24} />}
                                        to="/vouchers"
                                    />
                                    <StitchQuickAction
                                        title="Parties"
                                        icon={<Users size={24} />}
                                        to="/ledgers"
                                    />
                                    <StitchQuickAction
                                        title="Reports"
                                        icon={<BarChart3 size={24} />}
                                        to="/sales-dashboard"
                                    />
                                </div>
                            </div>

                            {/* Recent Activity List */}
                            <div className="stitch-card overflow-hidden">
                                <div className="p-4 border-b border-[var(--outline-variant)] bg-[var(--surface-container)] bg-opacity-30">
                                    <h3 className="text-sm font-medium text-[var(--on-surface)]">Recent Transactions</h3>
                                </div>
                                <div className="divide-y divide-[var(--outline-variant)] divide-opacity-20">
                                    {recentVouchers.length === 0 ? (
                                        <div className="p-8 text-center text-[var(--text-muted)]">No recent activity</div>
                                    ) : (
                                        recentVouchers.map((v, idx) => (
                                            <div
                                                key={v.id || idx}
                                                onClick={() => navigate(`/vouchers/${v.id}`)}
                                                className="p-4 hover:bg-[var(--surface-container)] transition-colors cursor-pointer flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${v.voucher_type === 'Sales' ? 'bg-[var(--primary-container)] text-[var(--primary)]' : 'bg-[var(--surface-variant)] text-[var(--on-surface)]'}`}>
                                                        {v.party_name?.[0] || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-[var(--on-surface)] group-hover:text-[var(--primary)] transition-colors">{v.party_name || 'Unknown'}</p>
                                                        <p className="text-xs text-[var(--text-muted)]">{v.voucher_type} • {format(new Date(v.voucher_date), 'MMM d')}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-[var(--on-surface)]">
                                                        {formatCurrency(v.total_amount)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="p-3 bg-[var(--surface-container)] bg-opacity-30 text-center">
                                    <button onClick={() => navigate('/vouchers')} className="text-xs font-medium text-[var(--primary)] hover:underline">View All Transactions</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
