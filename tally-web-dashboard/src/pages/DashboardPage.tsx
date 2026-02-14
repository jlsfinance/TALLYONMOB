import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns';
import {
    TrendingUp, TrendingDown, Wallet, CreditCard, FileText, Users,
    BarChart3, Plus, RefreshCw, ArrowRight, Activity, Calendar, Zap,
    ArrowUpRight, ArrowDownRight, IndianRupee
} from 'lucide-react';
import { Spinner } from '../components/ui/GlassUI';
import { BarChart3D } from '../components/3d';
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

    const periodFilters = [
        { key: 'today', label: 'Today' },
        { key: 'month', label: 'Month' },
        { key: '30days', label: '30 Days' },
        { key: 'year', label: 'FY' },
    ];

    useEffect(() => {
        if (selectedCompany) loadDashboardData();
    }, [selectedCompany, period]);

    useEffect(() => {
        const handleGlobalRefresh = () => { handleRefresh(); };
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
            let sales = 0, purchases = 0, salesCount = 0, purchaseCount = 0, receivables = 0, payables = 0;

            const { data: vSales } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .eq('is_deleted', false)
                .limit(50000);

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

            const { data: debtorLedgers } = await supabase
                .from('ledgers')
                .select('current_balance')
                .eq('company_id', selectedCompany.id)
                .eq('parent', 'Sundry Debtors');
            receivables = (debtorLedgers || []).reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);

            const { data: creditorLedgers } = await supabase
                .from('ledgers')
                .select('current_balance')
                .eq('company_id', selectedCompany.id)
                .eq('parent', 'Sundry Creditors');
            payables = (creditorLedgers || []).reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);

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
                monthlyData.push({ label: format(month, 'MMM'), value: monthSales });
            }
            setMonthlySales(monthlyData);

            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const { data: tSales } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('voucher_date', todayStr)
                .eq('is_deleted', false);
            setTodaySales((tSales || []).reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0));

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
                    setSalesTrend({ value: Math.abs(Math.round(diff * 10) / 10), direction: diff >= 0 ? 'up' : 'down' });
                }
            } catch (e) { console.error("Trend calculation failed", e); }

            const { data: recent } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .order('voucher_date', { ascending: false })
                .limit(6);

            setStats({ sales, purchases, receivables, payables, salesCount, purchaseCount });
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

    // Stat Card Component
    const MetricCard = ({ title, value, icon, subtitle, trend, onClick, color = 'blue' }: any) => {
        const colorMap: any = {
            blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'hover:border-blue-200 dark:hover:border-blue-800' },
            teal: { bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', border: 'hover:border-teal-200 dark:hover:border-teal-800' },
            amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'hover:border-amber-200 dark:hover:border-amber-800' },
            red: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'hover:border-red-200 dark:hover:border-red-800' },
        };
        const c = colorMap[color] || colorMap.blue;

        return (
            <div
                onClick={onClick}
                className={`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 cursor-pointer ${c.border} hover:shadow-[var(--shadow-md)] transition-all duration-200 group`}
            >
                <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-[var(--radius-md)] ${c.bg} ${c.text} flex items-center justify-center`}>
                        {icon}
                    </div>
                    {trend && trend.value !== 0 && (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${trend.direction === 'up'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                            }`}>
                            {trend.direction === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {trend.value}%
                        </span>
                    )}
                </div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-1">{title}</p>
                <p className="text-xl font-bold text-[var(--on-surface)] tracking-tight">{formatCurrency(value)}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">{subtitle}</p>
            </div>
        );
    };

    // Quick Action
    const QuickAction = ({ title, icon, to }: any) => (
        <Link to={to} className="group">
            <div className="bg-[var(--surface)] border border-dashed border-[var(--outline-variant)] rounded-[var(--radius-md)] p-4 flex flex-col items-center justify-center gap-2 h-24 hover:border-solid hover:border-[var(--primary)] hover:bg-[var(--primary-glow)] transition-all duration-150">
                <span className="text-[var(--primary)] group-hover:scale-110 transition-transform">{icon}</span>
                <span className="text-xs font-medium text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]">{title}</span>
            </div>
        </Link>
    );

    return (
        <div className="max-w-[1400px] mx-auto space-y-6">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-[var(--on-surface)] tracking-tight">
                        Dashboard
                    </h1>
                    <p className="text-[var(--text-muted)] text-sm mt-0.5">
                        Overview for <span className="font-medium text-[var(--on-surface)]">{selectedCompany.name}</span>
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    {/* Period Filter */}
                    <div className="flex bg-[var(--surface-container)] rounded-[var(--radius-md)] p-0.5 border border-[var(--border)]">
                        {periodFilters.map((filter) => (
                            <button
                                key={filter.key}
                                onClick={() => setPeriod(filter.key)}
                                className={`
                                    px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all
                                    ${period === filter.key
                                        ? 'bg-[var(--surface)] text-[var(--on-surface)] shadow-[var(--shadow-xs)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'
                                    }
                                `}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleRefresh}
                        className="stitch-icon-btn border border-[var(--border)]"
                        title="Refresh"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={() => navigate('/create-invoice')}
                        className="stitch-button"
                    >
                        <Plus size={16} />
                        <span className="hidden sm:inline">New Invoice</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-3">
                    <Spinner size="lg" />
                    <p className="text-[var(--text-muted)] text-sm">Loading financial data...</p>
                </div>
            ) : appMode === 'billing' ? (
                <BillingDashboard />
            ) : (
                <div className="space-y-6 animate-fadeIn">

                    {/* COMPANY INFO BANNER */}
                    {(selectedCompany.gstin || selectedCompany.address || selectedCompany.phone || selectedCompany.email) && (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                {selectedCompany.gstin && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">GSTIN</span>
                                        <span className="text-sm font-semibold text-[var(--on-surface)] font-mono bg-[var(--surface-container)] px-2 py-0.5 rounded">{selectedCompany.gstin}</span>
                                    </div>
                                )}
                                {selectedCompany.address && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Address</span>
                                        <span className="text-sm text-[var(--on-surface-variant)] truncate max-w-[300px]">{selectedCompany.address}</span>
                                    </div>
                                )}
                                {selectedCompany.phone && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Phone</span>
                                        <span className="text-sm text-[var(--on-surface-variant)]">{selectedCompany.phone}</span>
                                    </div>
                                )}
                                {selectedCompany.email && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Email</span>
                                        <span className="text-sm text-[var(--on-surface-variant)]">{selectedCompany.email}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* KEY METRICS */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 stagger-children">
                        <MetricCard
                            title="Total Sales"
                            value={stats.sales}
                            icon={<TrendingUp size={18} />}
                            trend={salesTrend}
                            subtitle={`${stats.salesCount} invoices`}
                            color="blue"
                            onClick={() => navigate('/sales')}
                        />
                        <MetricCard
                            title="Total Purchases"
                            value={stats.purchases}
                            icon={<TrendingDown size={18} />}
                            subtitle={`${stats.purchaseCount} bills`}
                            color="teal"
                            onClick={() => navigate('/purchases')}
                        />
                        <MetricCard
                            title="Receivables"
                            value={stats.receivables}
                            icon={<Wallet size={18} />}
                            subtitle="Pending collection"
                            color="amber"
                            onClick={() => navigate('/ledgers?group=Sundry Debtors')}
                        />
                        <MetricCard
                            title="Payables"
                            value={stats.payables}
                            icon={<CreditCard size={18} />}
                            subtitle="Outstanding"
                            color="red"
                            onClick={() => navigate('/ledgers?group=Sundry Creditors')}
                        />
                    </div>

                    {/* MAIN CONTENT */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                        {/* Chart */}
                        <div className="lg:col-span-2">
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-semibold text-[var(--on-surface)]">Revenue Trend</h3>
                                    <span className="text-xs text-[var(--text-muted)]">Last 6 months</span>
                                </div>
                                <div className="h-[280px] w-full rounded-[var(--radius-md)] bg-[var(--surface-container)] border border-[var(--border)] p-3">
                                    <BarChart3D
                                        data={monthlySales}
                                        height={260}
                                        barColor={isDark ? '#60A5FA' : '#1A56DB'}
                                        animated
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-5">

                            {/* Quick Actions */}
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Quick Actions</h3>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <QuickAction title="Invoice" icon={<FileText size={20} />} to="/create-invoice" />
                                    <QuickAction title="Vouchers" icon={<CreditCard size={20} />} to="/vouchers" />
                                    <QuickAction title="Parties" icon={<Users size={20} />} to="/ledgers" />
                                    <QuickAction title="Reports" icon={<BarChart3 size={20} />} to="/sales-dashboard" />
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-[var(--border)]">
                                    <h3 className="text-sm font-semibold text-[var(--on-surface)]">Recent Transactions</h3>
                                </div>
                                <div className="divide-y divide-[var(--border)]">
                                    {recentVouchers.length === 0 ? (
                                        <div className="p-8 text-center text-[var(--text-muted)] text-sm">No recent activity</div>
                                    ) : (
                                        recentVouchers.map((v, idx) => (
                                            <div
                                                key={v.id || idx}
                                                onClick={() => navigate(`/vouchers/${v.id}`)}
                                                className="px-5 py-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-bold flex-shrink-0 ${v.voucher_type === 'Sales'
                                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                                                        : 'bg-[var(--surface-container)] text-[var(--on-surface-variant)]'
                                                        }`}>
                                                        {v.party_name?.[0] || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-[var(--on-surface)] truncate group-hover:text-[var(--primary)] transition-colors">
                                                            {v.party_name || 'Unknown'}
                                                        </p>
                                                        <p className="text-[11px] text-[var(--text-muted)]">
                                                            {v.voucher_type} • {format(new Date(v.voucher_date), 'MMM d')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-sm font-semibold text-[var(--on-surface)] flex-shrink-0 ml-3">
                                                    {formatCurrency(v.total_amount)}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="px-5 py-3 border-t border-[var(--border)] text-center">
                                    <button
                                        onClick={() => navigate('/vouchers')}
                                        className="text-xs font-medium text-[var(--primary)] hover:underline"
                                    >
                                        View All Transactions →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
