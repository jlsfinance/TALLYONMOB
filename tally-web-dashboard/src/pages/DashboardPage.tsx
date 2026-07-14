import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns';
import {
    TrendingUp, TrendingDown, Wallet, CreditCard, FileText, Users,
    BarChart3, Plus, RefreshCw, ArrowRight, Activity, Calendar, Zap,
    ArrowUpRight, ArrowDownRight, IndianRupee, MessageCircle, Clock
} from 'lucide-react';
import { Spinner } from '../components/ui/GlassUI';
import { BarChart3D } from '../components/3d';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { subMonths, startOfMonth as startOfMonthDate, endOfMonth as endOfMonthDate } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend
} from 'recharts';
import { toast } from 'react-hot-toast';
import { sendEodReport } from '../lib/whatsapp';
import SafeLink from '../components/common/SafeLink';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

export default function DashboardPage() {
    const { selectedCompany, user } = useAuth() as any;
    const { t } = useLanguage();
    const { isDark } = useTheme();
    const { navigate } = useSafeNavigate();
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
    const [expenseGroups, setExpenseGroups] = useState<any[]>([]);
    const [cashFlowTrend, setCashFlowTrend] = useState<any[]>([]);
    const [dataFyStart, setDataFyStart] = useState<string | null>(null);

    const periodFilters = [
        { key: 'today', label: 'Today', icon: <Clock size={12} /> },
        { key: 'month', label: 'Month', icon: <Calendar size={12} /> },
        { key: '30days', label: '30 Days', icon: <Activity size={12} /> },
        { key: 'year', label: 'FY', icon: <TrendingUp size={12} /> },
    ];

    const openVoucher = (voucher: any) => {
        const targetId = voucher?.id || voucher?.voucher_id;
        if (!targetId) return;

        const type = String(voucher?.voucher_type || voucher?.transaction_type || '').trim().toLowerCase();
        const encodedId = encodeURIComponent(targetId);
        navigate(`/invoice/${encodedId}`, {
            state: { voucher, from: '/dashboard' }
        });
    };

    useEffect(() => {
        if (selectedCompany) detectDataFy();
    }, [selectedCompany]);

    useEffect(() => {
        if (selectedCompany) loadDashboardData();
    }, [selectedCompany, period, dataFyStart]);

    const detectDataFy = async () => {
        if (!selectedCompany) return;
        try {
            const { data } = await supabase
                .from('vouchers')
                .select('voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(1);
            if (data && data.length > 0 && data[0].voucher_date) {
                const latestDate = new Date(data[0].voucher_date);
                const month = latestDate.getMonth();
                const year = latestDate.getFullYear();
                const fyStartYear = month >= 3 ? year : year - 1;
                const fyStart = `${fyStartYear}-04-01`;
                const currentFyStart = (() => {
                    const now = new Date();
                    const cm = now.getMonth();
                    const cy = now.getFullYear();
                    const sy = cm < 3 ? cy - 1 : cy;
                    return `${sy}-04-01`;
                })();
                if (fyStart !== currentFyStart) {
                    setDataFyStart(fyStart);
                }
            }
        } catch (e) {
            console.error('FY detection failed', e);
        }
    };

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
                if (dataFyStart) {
                    const fyEnd = `${parseInt(dataFyStart.substring(0, 4)) + 1}-03-31`;
                    const to = fyEnd < format(now, 'yyyy-MM-dd') ? fyEnd : format(now, 'yyyy-MM-dd');
                    return { from: dataFyStart, to };
                }
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const startYear = currentMonth < 3 ? currentYear - 1 : currentYear;
                const fyStart = new Date(startYear, 3, 1);
                return { from: format(fyStart, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            }
            default: return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
        }
    };

    const resolveRows = async (query: any) => {
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    };

    const fetchAllRows = async (buildQuery: (fromIndex: number, toIndex: number) => any, pageSize = 1000) => {
        const rows: any[] = [];
        for (let fromIndex = 0; ; fromIndex += pageSize) {
            const batch = await resolveRows(buildQuery(fromIndex, fromIndex + pageSize - 1));
            rows.push(...batch);
            if (batch.length < pageSize) break;
        }
        return rows;
    };

    const loadDashboardData = async () => {
        if (!selectedCompany) return;
        setLoading(true);
        const { from, to } = getDateRange();

        try {
            let sales = 0, purchases = 0, salesCount = 0, purchaseCount = 0, receivables = 0, payables = 0;
            const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const last30DaysFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd');
            const lastMonth = subMonths(new Date(), 1);
            const lmStart = format(startOfMonthDate(lastMonth), 'yyyy-MM-dd');
            const lmEnd = format(endOfMonthDate(lastMonth), 'yyyy-MM-dd');

            const [
                vSales,
                vPurchases,
                debtorLedgers,
                creditorLedgers,
                vReceipts,
                trendData,
                expenseEntries,
                cfData,
                tSales,
                lmSales,
                recent
            ] = await Promise.all([
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, total_amount, grand_total, voucher_date')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Sales')
                        .gte('voucher_date', from)
                        .lte('voucher_date', to)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, total_amount, grand_total, voucher_date')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Purchase')
                        .gte('voucher_date', from)
                        .lte('voucher_date', to)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('ledgers')
                        .select('id, current_balance')
                        .eq('company_id', selectedCompany.id)
                        .eq('parent', 'Sundry Debtors')
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('ledgers')
                        .select('id, current_balance')
                        .eq('company_id', selectedCompany.id)
                        .eq('parent', 'Sundry Creditors')
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, total_amount')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Receipt')
                        .gte('voucher_date', from)
                        .lte('voucher_date', to)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, total_amount, grand_total, voucher_date')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Sales')
                        .gte('voucher_date', sixMonthsAgo)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('voucher_ledger_entries')
                        .select('id, ledger_name, amount, voucher_id')
                        .eq('company_id', selectedCompany.id)
                        .eq('is_debit', true)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, voucher_date, voucher_type, total_amount, grand_total')
                        .eq('company_id', selectedCompany.id)
                        .in('voucher_type', ['Receipt', 'Payment'])
                        .gte('voucher_date', last30DaysFrom)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, total_amount, grand_total')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Sales')
                        .eq('voucher_date', todayStr)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                fetchAllRows((fromIndex, toIndex) =>
                    supabase
                        .from('vouchers')
                        .select('id, total_amount, grand_total')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Sales')
                        .gte('voucher_date', lmStart)
                        .lte('voucher_date', lmEnd)
                        .eq('is_deleted', false)
                        .order('id', { ascending: true })
                        .range(fromIndex, toIndex)
                ),
                resolveRows(
                    supabase
                        .from('vouchers')
                        .select('*')
                        .eq('company_id', selectedCompany.id)
                        .order('voucher_date', { ascending: false })
                        .limit(6)
                )
            ]);

            const sData = vSales || [];
            const pData = vPurchases || [];
            sales = sData.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            purchases = pData.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            salesCount = sData.length;
            purchaseCount = pData.length;

            receivables = (debtorLedgers || []).reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);
            payables = (creditorLedgers || []).reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);

            const receipts = (vReceipts || []).reduce((sum, v) => sum + Math.abs(Number(v.total_amount) || 0), 0);
            const collectionRate = sales > 0 ? (receipts / sales) * 100 : 0;
            const expenseRate = sales > 0 ? (purchases / sales) * 100 : 0;
            const profitMargin = sales > 0 ? ((sales - purchases) / sales) * 100 : 0;

            setKpiRatios({
                collection: Math.min(collectionRate, 100),
                expense: Math.min(expenseRate, 100),
                profit: profitMargin
            });

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

            const expenseVoucherRows = await fetchAllRows((fromIndex, toIndex) =>
                supabase
                    .from('vouchers')
                    .select('id')
                    .eq('company_id', selectedCompany.id)
                    .in('voucher_type', ['Payment', 'Purchase'])
                    .gte('voucher_date', from)
                    .lte('voucher_date', to)
                    .eq('is_deleted', false)
                    .order('id', { ascending: true })
                    .range(fromIndex, toIndex)
            );

            const allowedExpenseVoucherIds = new Set((expenseVoucherRows || []).map((row: any) => row.id));
            const filteredExpenseEntries = (expenseEntries || []).filter((entry: any) => (
                allowedExpenseVoucherIds.size === 0 || allowedExpenseVoucherIds.has(entry.voucher_id)
            ));

            const groupedExpenses = filteredExpenseEntries.reduce((acc: any, entry: any) => {
                let name = entry.ledger_name;
                if (name.toLowerCase().includes('salary')) name = 'Salaries';
                else if (name.toLowerCase().includes('rent')) name = 'Rent';
                else if (name.toLowerCase().includes('electricity') || name.toLowerCase().includes('power')) name = 'Utilities';
                else if (name.toLowerCase().includes('purchase')) name = 'Purchases';
                else if (name.toLowerCase().includes('tax') || name.toLowerCase().includes('gst')) name = 'Taxes';
                else if (name.toLowerCase().includes('travel') || name.toLowerCase().includes('conveyance')) name = 'Travel';

                acc[name] = (acc[name] || 0) + Math.abs(Number(entry.amount) || 0);
                return acc;
            }, {});

            const pieData = Object.entries(groupedExpenses)
                .map(([name, value]) => ({ name, value }))
                .sort((a: any, b: any) => (b.value as number) - (a.value as number))
                .slice(0, 6);
            setExpenseGroups(pieData);

            const dailyFlow: any = {};
            for (let i = 29; i >= 0; i--) {
                const date = format(subDays(new Date(), i), 'MMM dd');
                dailyFlow[date] = { date, income: 0, expense: 0 };
            }

            (cfData || []).forEach(v => {
                const dateKey = format(new Date(v.voucher_date), 'MMM dd');
                if (dailyFlow[dateKey]) {
                    const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                    if (v.voucher_type === 'Receipt') dailyFlow[dateKey].income += amt;
                    else dailyFlow[dateKey].expense += amt;
                }
            });
            setCashFlowTrend(Object.values(dailyFlow));

            setTodaySales((tSales || []).reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0));

            try {
                const pastSales = (lmSales || []).reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);
                if (pastSales > 0) {
                    const diff = ((sales - pastSales) / pastSales) * 100;
                    setSalesTrend({ value: Math.abs(Math.round(diff * 10) / 10), direction: diff >= 0 ? 'up' : 'down' });
                }
            } catch (e) {
                console.error('Trend calculation failed', e);
            }

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
        if (refreshing) return;
        setRefreshing(true);
        await loadDashboardData();
        setRefreshing(false);
    };

    if (!selectedCompany) return null;

    // Stat Card Component (Native App styled)
    const MetricCard = ({ title, value, icon, subtitle, trend, onClick, color = 'blue' }: any) => {
        const colorMap: any = {
            blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'hover:border-blue-200 dark:hover:border-blue-800', accent: 'bg-blue-500' },
            teal: { bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', border: 'hover:border-teal-200 dark:hover:border-teal-800', accent: 'bg-teal-500' },
            amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'hover:border-amber-200 dark:hover:border-amber-800', accent: 'bg-amber-500' },
            red: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'hover:border-red-200 dark:hover:border-red-800', accent: 'bg-red-500' },
        };
        const c = colorMap[color] || colorMap.blue;

        return (
            <div
                onClick={onClick}
                className={`bg-[var(--surface)] border border-[var(--border)] rounded-3xl md:rounded-[var(--radius-lg)] p-4 md:p-5 flex flex-col justify-between cursor-pointer ${c.border} shadow-sm hover:shadow-[var(--shadow-md)] transition-all duration-300 group relative overflow-hidden w-full h-full min-h-[120px] md:min-h-auto`}
            >
                {/* Subtle Glow Effect */}
                <div className={`absolute -right-4 -top-4 w-16 h-16 opacity-10 blur-2xl rounded-full ${c.accent} group-hover:opacity-20 transition-opacity`}></div>

                <div className="flex items-start justify-between relative z-10">
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-2xl ${c.bg} ${c.text} flex items-center justify-center shadow-inner`}>
                        {icon}
                    </div>
                    {trend && trend.value !== 0 && (
                        <span className={`inline-flex items-center gap-0.5 text-[10px] md:text-[11px] font-black px-2 py-1 rounded-full ${trend.direction === 'up'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400'
                            }`}>
                            {trend.direction === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {trend.value}%
                        </span>
                    )}
                </div>

                <div className="relative z-10 mt-3 md:mt-4">
                    <p className="text-[10px] md:text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5 truncate">{title}</p>
                    <p className="text-lg md:text-2xl font-black text-[var(--on-surface)] tracking-tighter truncate leading-none mb-1">{formatCurrency(value)}</p>
                    <p className="text-[9px] md:text-[11px] text-[var(--text-muted)] font-medium truncate opacity-70">{subtitle}</p>
                </div>
            </div>
        );
    };

    // Quick Action
    const QuickAction = ({ title, icon, to }: any) => (
        <SafeLink to={to} className="group">
            <div className="bg-[var(--surface)] border border-dashed border-[var(--outline-variant)] rounded-[var(--radius-md)] p-4 flex flex-col items-center justify-center gap-2 h-24 hover:border-solid hover:border-[var(--primary)] hover:bg-[var(--primary-glow)] transition-all duration-150">
                <span className="text-[var(--primary)] group-hover:scale-110 transition-transform">{icon}</span>
                <span className="text-xs font-medium text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]">{title}</span>
            </div>
        </SafeLink>
    );

    return (
        <div className="max-w-[1400px] mx-auto space-y-4 md:space-y-6">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-bold text-[var(--on-surface)] tracking-tight">
                        {t('dashboard.title')}
                    </h1>
                    <p className="hidden md:block text-[var(--text-muted)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
                        {selectedCompany.name}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="hidden md:flex max-w-full overflow-x-auto bg-[var(--surface-container)] rounded-[var(--radius-md)] p-0.5 border border-[var(--border)] mr-1 scale-95 md:scale-100 origin-right [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {periodFilters.map((filter) => (
                        <button
                            key={filter.key}
                            onClick={() => setPeriod(filter.key)}
                            className={`
                                flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 rounded-[var(--radius-sm)] text-[9px] md:text-[10px] font-black uppercase transition-all whitespace-nowrap
                                ${period === filter.key
                                    ? 'bg-[var(--surface)] text-[var(--on-surface)] shadow-[var(--shadow-xs)] scale-105'
                                    : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'
                                }
                            `}
                        >
                            {filter.icon}
                            <span className={period === filter.key ? 'block' : 'hidden md:block'}>
                                {filter.label}
                            </span>
                        </button>
                    ))}
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="hidden md:flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={() => navigate('/create-invoice')}
                        className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-[var(--primary)] text-white rounded-xl shadow-lg shadow-[var(--primary-glow)] hover:scale-105 transition-transform"
                        title={t('dashboard.new_invoice')}
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </HeaderPortal>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-3">
                    <Spinner size="lg" />
                    <p className="text-[var(--text-muted)] text-sm">Loading financial data...</p>
                </div>
            ) : (
                <div className="space-y-6 animate-fadeIn w-full min-w-0 overflow-x-hidden">

                    {/* COMPANY INFO BANNER */}
                    {(selectedCompany.gstin || selectedCompany.address || selectedCompany.phone || selectedCompany.email) && (
                        <div className="hidden md:block bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
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

                    {/* MOBILE FILTERS INLINE */}
                    <div className="md:hidden flex overflow-x-auto gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden w-full pb-1">
                        {periodFilters.map((filter) => (
                            <button
                                key={filter.key}
                                onClick={() => setPeriod(filter.key)}
                                className={`
                                    flex items-center justify-center flex-1 min-w-[70px] gap-1 px-3 py-2 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap
                                    ${period === filter.key
                                        ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.1)]'
                                        : 'bg-[var(--surface)] text-[var(--text-muted)] border border-transparent shadow-sm'
                                    }
                                `}
                            >
                                {filter.icon}
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    {/* MOBILE QUICK ACTIONS (Native App Wallet Style) */}
                    <div className="md:hidden flex justify-between items-center gap-2 px-1 mb-2 mt-2">
                        <SafeLink to="/create-invoice" className="flex flex-col items-center gap-2 focus:scale-95 transition-transform">
                            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 flex items-center justify-center shadow-sm border border-blue-100 dark:border-blue-900/50">
                                <FileText size={22} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-bold text-[var(--on-surface-variant)]">{t('sales.invoice')}</span>
                        </SafeLink>
                        <SafeLink to="/vouchers" className="flex flex-col items-center gap-2 focus:scale-95 transition-transform">
                            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 flex items-center justify-center shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                                <CreditCard size={22} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-bold text-[var(--on-surface-variant)]">{t('nav.vouchers')}</span>
                        </SafeLink>
                        <SafeLink to="/sync-history" className="flex flex-col items-center gap-2 focus:scale-95 transition-transform">
                            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center shadow-sm border border-slate-200 dark:border-slate-700">
                                <RefreshCw size={22} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-bold text-[var(--on-surface-variant)]">Sync</span>
                        </SafeLink>
                        <button onClick={() => sendEodReport(selectedCompany.id, selectedCompany.phone || '', selectedCompany.name)} className="flex flex-col items-center gap-2 focus:scale-95 transition-transform">
                            <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/30">
                                <MessageCircle size={22} strokeWidth={2.5} fill="currentColor" className="text-white" />
                            </div>
                            <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-500">Report</span>
                        </button>
                    </div>

                    {/* KEY METRICS */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pb-2 w-full min-w-0">
                        <MetricCard
                            title={t('dashboard.total_sales')}
                            value={stats.sales}
                            icon={<TrendingUp size={18} />}
                            trend={salesTrend}
                            subtitle={`${stats.salesCount} invoices`}
                            color="blue"
                            onClick={() => navigate('/sales')}
                        />
                        <MetricCard
                            title={t('dashboard.total_purchases')}
                            value={stats.purchases}
                            icon={<TrendingDown size={18} />}
                            subtitle={`${stats.purchaseCount} bills`}
                            color="teal"
                            onClick={() => navigate('/purchases')}
                        />
                        <MetricCard
                            title={t('dashboard.receivable')}
                            value={stats.receivables}
                            icon={<Wallet size={18} />}
                            subtitle="Pending collection"
                            color="amber"
                            onClick={() => navigate('/ledgers?group=Sundry Debtors')}
                        />
                        <MetricCard
                            title={t('dashboard.payable')}
                            value={stats.payables}
                            icon={<CreditCard size={18} />}
                            subtitle="Outstanding"
                            color="red"
                            onClick={() => navigate('/ledgers?group=Sundry Creditors')}
                        />
                    </div>

                    {/* MAIN CONTENT */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full min-w-0">

                        {/* Chart */}
                        <div className="lg:col-span-2 min-w-0 w-full">
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-5 w-full min-w-0 overflow-hidden">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-semibold text-[var(--on-surface)] truncate">{t('dashboard.revenue_trend')}</h3>
                                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{t('dashboard.last_6_months')}</span>
                                </div>
                                <div className="h-[220px] md:h-[280px] w-full rounded-[var(--radius-md)] bg-[var(--surface-container)] border border-[var(--border)] p-2.5 md:p-3 relative">
                                    <BarChart3D
                                        data={monthlySales}
                                        height={220}
                                        barColor={isDark ? '#60A5FA' : '#1A56DB'}
                                        animated
                                    />
                                </div>
                            </div>

                            {/* New Row: Cash Flow & Expenses */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mt-4 md:mt-5 w-full min-w-0">
                                {/* Cash Flow Trend */}
                                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-5 w-full min-w-0 overflow-hidden">
                                    <div className="flex items-center justify-between mb-5">
                                        <h3 className="text-sm font-semibold text-[var(--on-surface)] truncate">Cash Flow (Last 30 Days)</h3>
                                        <Activity size={16} className="text-blue-500 flex-shrink-0" />
                                    </div>
                                    <div className="h-[220px] md:h-[250px] w-full relative">
                                        <div className="absolute inset-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={cashFlowTrend}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#E2E8F0'} />
                                                    <XAxis
                                                        dataKey="date"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 10, fill: isDark ? '#94A3B8' : '#64748B' }}
                                                        interval={6}
                                                    />
                                                    <YAxis
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 10, fill: isDark ? '#94A3B8' : '#64748B' }}
                                                        tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                                                    />
                                                    <RechartsTooltip
                                                        contentStyle={{
                                                            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                                                            border: '1px solid #334155',
                                                            borderRadius: '8px',
                                                            fontSize: '11px'
                                                        }}
                                                    />
                                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                                    <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={3} dot={false} animationDuration={1500} />
                                                    <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={3} dot={false} animationDuration={1500} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Expense Breakdown */}
                                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-5 w-full min-w-0 overflow-hidden">
                                        <div className="flex items-center justify-between mb-5">
                                            <h3 className="text-sm font-semibold text-[var(--on-surface)] truncate">Expense Distribution</h3>
                                            <BarChart3 size={16} className="text-amber-500 flex-shrink-0" />
                                        </div>
                                        <div className="h-[220px] md:h-[250px] w-full flex flex-col sm:flex-row items-center relative">
                                            <div className="w-full sm:w-1/2 h-[120px] sm:h-full relative">
                                                <div className="absolute inset-0">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={expenseGroups}
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={50}
                                                                outerRadius={80}
                                                                paddingAngle={5}
                                                                dataKey="value"
                                                            >
                                                                {expenseGroups.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                                ))}
                                                            </Pie>
                                                            <RechartsTooltip />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                            <div className="w-full sm:w-1/2 grid grid-cols-2 sm:grid-cols-1 gap-2 pt-2 sm:pt-0 sm:pl-4 overflow-hidden min-w-0">
                                                {expenseGroups.map((group, idx) => (
                                                    <div key={group.name} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}></div>
                                                            <span className="text-[10px] font-bold text-[var(--on-surface-variant)] truncate max-w-[120px] text-left">{group.name}</span>
                                                        </div>
                                                        <span className="text-[10px] font-black text-[var(--on-surface)]">
                                                            {(group.value / (expenseGroups.reduce((s, g) => s + g.value, 0) || 1) * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-5">

                                {/* Quick Actions (Desktop only since mobile has it at top) */}
                                <div className="hidden md:block bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">{t('dashboard.quick_actions')}</h3>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <QuickAction title={t('sales.invoice')} icon={<FileText size={20} />} to="/create-invoice" />
                                        <QuickAction title={t('nav.vouchers')} icon={<CreditCard size={20} />} to="/vouchers" />
                                        <QuickAction title="Sync Status" icon={<RefreshCw size={20} />} to="/sync-history" />
                                        <button
                                            onClick={() => sendEodReport(selectedCompany.id, selectedCompany.phone || '', selectedCompany.name)}
                                            className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 transition-all"
                                        >
                                            <div className="p-2 rounded-lg bg-emerald-500 text-white shadow-lg mb-2">
                                                <MessageCircle size={20} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase">Send EOD</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Recent Activity */}
                                <div className="bg-[var(--surface)] border-t border-b md:border border-[var(--border)] md:rounded-[var(--radius-lg)] overflow-hidden -mx-4 md:mx-0 mt-2 md:mt-0">
                                    <div className="px-4 md:px-5 py-3.5 border-b border-[var(--border)] flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/10 md:bg-transparent">
                                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">{t('dashboard.recent_vouchers')}</h3>
                                        <button onClick={() => navigate('/vouchers')} className="md:hidden text-xs font-bold text-[var(--primary)] uppercase tracking-wide">
                                            View All
                                        </button>
                                    </div>
                                    <div className="divide-y divide-[var(--border)]">
                                        {recentVouchers.length === 0 ? (
                                            <div className="p-8 text-center text-[var(--text-muted)] text-sm">{t('dashboard.no_recent')}</div>
                                        ) : (
                                            recentVouchers.map((v, idx) => (
                                                <div
                                                    key={v.id || idx}
                                                    onClick={() => openVoucher(v)}
                                                    className="px-4 md:px-5 py-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex items-center justify-between group active:bg-[var(--surface-active)]"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`w-10 h-10 md:w-8 md:h-8 rounded-full md:rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-bold flex-shrink-0 ${v.voucher_type === 'Sales'
                                                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                                                            : 'bg-[var(--surface-container)] text-[var(--on-surface-variant)]'
                                                            }`}>
                                                            {v.party_name?.[0] || '?'}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold md:font-medium text-[var(--on-surface)] truncate group-hover:text-[var(--primary)] transition-colors">
                                                                {v.party_name || 'Unknown'}
                                                            </p>
                                                            <p className="text-[11px] text-[var(--text-muted)] font-medium md:font-normal mt-0.5">
                                                                {v.voucher_type} • {format(new Date(v.voucher_date), 'MMM d, yyyy')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold md:font-semibold text-[var(--on-surface)] flex-shrink-0 ml-3 tracking-tight">
                                                            {formatCurrency(v.total_amount)}
                                                        </p>
                                                        <ArrowRight size={14} className="inline-block md:hidden text-gray-300 dark:text-gray-600 mt-1" />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="hidden md:block px-5 py-3 border-t border-[var(--border)] text-center">
                                        <button
                                            onClick={() => navigate('/vouchers')}
                                            className="text-xs font-medium text-[var(--primary)] hover:underline flex items-center justify-center gap-1 mx-auto"
                                        >
                                            {t('dashboard.view_all_transactions')} <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};




