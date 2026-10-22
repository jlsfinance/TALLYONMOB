// Redesigned: JLS-4 CRED-style premium dashboard
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns';
import {
    TrendingUp, TrendingDown, Wallet, CreditCard, FileText, Users,
    BarChart3, Plus, RefreshCw, ArrowRight, Activity, Calendar, Zap,
    ArrowUpRight, ArrowDownRight, IndianRupee, MessageCircle, Clock,
    Sun, Moon, Sunrise, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spinner } from '../components/ui/GlassUI';
import { BarChart3D } from '../components/3d';
import BillingDashboard from './BillingDashboard';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { subMonths, startOfMonth as startOfMonthDate, endOfMonth as endOfMonthDate } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend
} from 'recharts';
import { toast } from 'react-hot-toast';
import { sendEodReport } from '../lib/whatsapp';

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

// ── Stagger animation variants ──
const staggerContainer = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.08 }
    }
};

const fadeUpItem = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

// ── Daily Briefing Widget ──
function DailyBriefing({ companyName, todaySales }: { companyName: string; todaySales: number }) {
    const now = new Date();
    const hour = now.getHours();
    let greeting: string;
    let GreetingIcon: any;

    if (hour < 12) {
        greeting = 'Good Morning';
        GreetingIcon = Sunrise;
    } else if (hour < 17) {
        greeting = 'Good Afternoon';
        GreetingIcon = Sun;
    } else if (hour < 21) {
        greeting = 'Good Evening';
        GreetingIcon = Moon;
    } else {
        greeting = 'Good Night';
        GreetingIcon = Moon;
    }

    const dateStr = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const formatCurrency = (amount: number) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-600/20 via-indigo-600/10 to-purple-600/20 p-5 backdrop-blur-xl"
        >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-purple-500/10 blur-xl" />

            <div className="relative z-10 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                            <GreetingIcon size={18} className="text-blue-300" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-white">{greeting}</p>
                            <p className="text-xs font-medium text-white/50">{dateStr}</p>
                        </div>
                    </div>
                    <div className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 sm:flex">
                        <Sparkles size={12} className="text-amber-300" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                            Daily Briefing
                        </span>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                            {companyName}
                        </p>
                        <p className="mt-1 text-base font-semibold text-white/90">
                            Here's your financial snapshot for today
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2">
                        <IndianRupee size={16} className="text-emerald-400" />
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70">
                                Today's Sales
                            </p>
                            <p className="text-lg font-bold text-emerald-300">
                                {formatCurrency(todaySales)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ── Glass Metric Card ──
function GlassMetricCard({ title, value, icon, subtitle, trend, onClick, color = 'blue' }: any) {
    const gradMap: any = {
        blue: 'from-blue-600/80 to-blue-900/60',
        teal: 'from-teal-600/80 to-teal-900/60',
        amber: 'from-amber-600/80 to-amber-900/60',
        red: 'from-red-600/80 to-red-900/60',
    };

    return (
        <motion.div
            variants={fadeUpItem}
            onClick={onClick}
            className="relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-5 backdrop-blur-xl transition-transform duration-200 hover:scale-[1.02] hover:shadow-xl"
            style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }}
        >
            <div className={`absolute inset-0 bg-gradient-to-br ${gradMap[color] || gradMap.blue}`} />
            <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-white/5" />
            <div className="absolute -bottom-8 -right-8 h-16 w-16 rounded-full bg-white/5" />

            <div className="relative z-10">
                <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium uppercase tracking-wider text-white/70">{title}</p>
                        <p className="text-2xl font-bold text-white">{formatCurrencyCurried(value)}</p>
                        {subtitle && <p className="text-xs text-white/60">{subtitle}</p>}
                    </div>
                    <div className="rounded-lg bg-white/10 p-2.5 backdrop-blur-sm">{icon}</div>
                </div>
                {trend && trend.value !== 0 && (
                    <div className="mt-3 flex items-center gap-1.5">
                        {trend.direction === 'up' ? (
                            <ArrowUpRight size={14} className="text-green-300" />
                        ) : (
                            <ArrowDownRight size={14} className="text-red-300" />
                        )}
                        <span className={`text-xs font-medium ${trend.direction === 'up' ? 'text-green-300' : 'text-red-300'}`}>
                            {Math.abs(trend.value)}%
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

const formatCurrencyCurried = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

// ── Glass Chart Card ──
function GlassChartCard({ title, icon, children, className = '' }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl ${className}`}
        >
            <div className="mb-4 flex items-center gap-2">
                <div className="text-blue-400">{icon}</div>
                <h3 className="text-sm font-semibold text-white/90">{title}</h3>
            </div>
            {children}
        </motion.div>
    );
}

// ── Glass Quick Action ──
function GlassQuickAction({ title, icon, to }: any) {
    return (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to={to} className="group block">
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition-all duration-200 hover:border-blue-500/30 hover:bg-blue-500/10 hover:shadow-lg">
                    <span className="text-blue-400 transition-transform group-hover:scale-110">{icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 group-hover:text-white/90">
                        {title}
                    </span>
                </div>
            </Link>
        </motion.div>
    );
}

export default function DashboardPage() {
    const { selectedCompany, user, appMode } = useAuth() as any;
    const { t } = useLanguage();
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
    const [expenseGroups, setExpenseGroups] = useState<any[]>([]);
    const [cashFlowTrend, setCashFlowTrend] = useState<any[]>([]);

    const periodFilters = [
        { key: 'today', label: 'Today', icon: <Clock size={12} /> },
        { key: 'month', label: 'Month', icon: <Calendar size={12} /> },
        { key: '30days', label: '30 Days', icon: <Activity size={12} /> },
        { key: 'year', label: 'FY', icon: <TrendingUp size={12} /> },
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

            const { data: vSales, count: sCount } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date', { count: 'exact' })
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .eq('is_deleted', false)
                .limit(50000);

            const { data: vPurchases, count: pCount } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date', { count: 'exact' })
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
            salesCount = sCount || 0;
            purchaseCount = pCount || 0;

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
                .limit(50000);

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

            // Fetch Expense Groups for Pie Chart
            const { data: expenseEntries } = await supabase
                .from('voucher_ledger_entries')
                .select('ledger_name, amount, vouchers!inner(voucher_type, voucher_date)')
                .eq('company_id', selectedCompany.id)
                .in('vouchers.voucher_type', ['Payment', 'Purchase'])
                .gte('vouchers.voucher_date', from)
                .lte('vouchers.voucher_date', to)
                .eq('is_debit', true)
                .limit(1000);

            const groupedExpenses = (expenseEntries || []).reduce((acc: any, entry: any) => {
                let name = entry.ledger_name;
                // Basic characterization
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

            // Fetch Cash Flow Trend (Last 30 days)
            const { data: cfData } = await supabase
                .from('vouchers')
                .select('voucher_date, voucher_type, total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .in('voucher_type', ['Receipt', 'Payment'])
                .gte('voucher_date', subDays(new Date(), 30).toISOString())
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: true });

            const dailyFlow: any = {};
            // Initialize last 30 days
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

    return (
        <div className="min-h-screen bg-black px-4 pb-20 pt-6 sm:px-6 lg:px-8">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-bold text-white tracking-tight">
                        {t('dashboard.title')}
                    </h1>
                    <p className="hidden md:block text-white/50 text-[9px] font-bold uppercase tracking-widest mt-0.5">
                        {selectedCompany.name}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex overflow-hidden rounded-lg border border-white/10 bg-black/60">
                    {periodFilters.map((filter) => (
                        <button
                            key={filter.key}
                            onClick={() => setPeriod(filter.key)}
                            className={`
                                flex items-center gap-1 px-2.5 py-1.5 text-[9px] md:text-[10px] font-black uppercase transition-all whitespace-nowrap
                                ${period === filter.key
                                    ? 'bg-blue-600 text-white'
                                    : 'text-white/60 hover:text-white/90'
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
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white/90 transition-colors md:h-9 md:w-9"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={() => navigate('/create-invoice')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg hover:scale-105 transition-transform md:h-9 md:w-9"
                        title={t('dashboard.new_invoice')}
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </HeaderPortal>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <p className="text-white/50 text-sm">Loading financial data...</p>
                </div>
            ) : appMode === 'billing' ? (
                <BillingDashboard />
            ) : (
                <div className="space-y-6">
                    {/* ── DAILY BRIEFING ── */}
                    <DailyBriefing
                        companyName={selectedCompany.name}
                        todaySales={todaySales}
                    />

                    {/* ── COMPANY INFO BANNER ── */}
                    {(selectedCompany.gstin || selectedCompany.address || selectedCompany.phone || selectedCompany.email) && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                            className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl"
                        >
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                {selectedCompany.gstin && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">GSTIN</span>
                                        <span className="rounded bg-white/10 px-2 py-0.5 text-sm font-semibold font-mono text-white/80">{selectedCompany.gstin}</span>
                                    </div>
                                )}
                                {selectedCompany.address && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Address</span>
                                        <span className="truncate max-w-[300px] text-sm text-white/60">{selectedCompany.address}</span>
                                    </div>
                                )}
                                {selectedCompany.phone && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Phone</span>
                                        <span className="text-sm text-white/60">{selectedCompany.phone}</span>
                                    </div>
                                )}
                                {selectedCompany.email && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Email</span>
                                        <span className="text-sm text-white/60">{selectedCompany.email}</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── KEY METRICS (Staggered Animated) ── */}
                    <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
                    >
                        <GlassMetricCard
                            title={t('dashboard.total_sales')}
                            value={stats.sales}
                            icon={<TrendingUp size={18} className="text-white" />}
                            trend={salesTrend}
                            subtitle={`${stats.salesCount} invoices`}
                            color="blue"
                            onClick={() => navigate('/sales')}
                        />
                        <GlassMetricCard
                            title={t('dashboard.total_purchases')}
                            value={stats.purchases}
                            icon={<TrendingDown size={18} className="text-white" />}
                            subtitle={`${stats.purchaseCount} bills`}
                            color="teal"
                            onClick={() => navigate('/purchases')}
                        />
                        <GlassMetricCard
                            title={t('dashboard.receivable')}
                            value={stats.receivables}
                            icon={<Wallet size={18} className="text-white" />}
                            subtitle="Pending collection"
                            color="amber"
                            onClick={() => navigate('/ledgers?group=Sundry Debtors')}
                        />
                        <GlassMetricCard
                            title={t('dashboard.payable')}
                            value={stats.payables}
                            icon={<CreditCard size={18} className="text-white" />}
                            subtitle="Outstanding"
                            color="red"
                            onClick={() => navigate('/ledgers?group=Sundry Creditors')}
                        />
                    </motion.div>

                    {/* ── MAIN CONTENT ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Left + Center: Charts */}
                        <div className="lg:col-span-2 space-y-5">
                            {/* Revenue Trend (BarChart3D) */}
                            <GlassChartCard title={t('dashboard.revenue_trend')} icon={<BarChart3 size={16} />}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs text-white/50">{t('dashboard.last_6_months')}</span>
                                </div>
                                <div className="h-[280px] w-full rounded-xl bg-white/5 border border-white/10 p-3">
                                    <BarChart3D
                                        data={monthlySales}
                                        height={260}
                                        barColor="#60A5FA"
                                        animated
                                    />
                                </div>
                            </GlassChartCard>

                            {/* Cash Flow + Expense Distribution */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Cash Flow Trend */}
                                <GlassChartCard title="Cash Flow (Last 30 Days)" icon={<Activity size={16} />}>
                                    <div className="h-[250px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={cashFlowTrend}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                                <XAxis
                                                    dataKey="date"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                                                    interval={6}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                                                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                                                />
                                                <RechartsTooltip
                                                    contentStyle={{
                                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '8px',
                                                        fontSize: '11px',
                                                        color: '#fff'
                                                    }}
                                                />
                                                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }} />
                                                <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={3} dot={false} animationDuration={1500} />
                                                <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={3} dot={false} animationDuration={1500} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </GlassChartCard>

                                {/* Expense Distribution */}
                                <GlassChartCard title="Expense Distribution" icon={<BarChart3 size={16} />}>
                                    <div className="h-[250px] w-full flex items-center">
                                        <div className="w-1/2 h-full">
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
                                                        {expenseGroups.map((_entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <RechartsTooltip
                                                        contentStyle={{
                                                            backgroundColor: 'rgba(0,0,0,0.8)',
                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                            borderRadius: '8px',
                                                            fontSize: '11px',
                                                            color: '#fff'
                                                        }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="w-1/2 flex flex-col gap-2 pl-4">
                                            {expenseGroups.map((group, idx) => {
                                                const total = expenseGroups.reduce((s: number, g: any) => s + g.value, 0) || 1;
                                                return (
                                                    <div key={group.name} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                                            <span className="text-[10px] font-bold text-white/60 truncate max-w-[80px]">{group.name}</span>
                                                        </div>
                                                        <span className="text-[10px] font-black text-white/90">
                                                            {((group.value / total) * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </GlassChartCard>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-5">
                            {/* Quick Actions (Glass Grid) */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.2 }}
                                className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl"
                            >
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
                                    {t('dashboard.quick_actions')}
                                </h3>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <GlassQuickAction title={t('sales.invoice')} icon={<FileText size={20} />} to="/create-invoice" />
                                    <GlassQuickAction title={t('nav.vouchers')} icon={<CreditCard size={20} />} to="/vouchers" />
                                    <GlassQuickAction title="Sync Status" icon={<RefreshCw size={20} />} to="/sync-history" />
                                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                        <button
                                            onClick={() => sendEodReport(selectedCompany.id, selectedCompany.phone || '', selectedCompany.name)}
                                            className="flex flex-col items-center justify-center w-full h-full p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:shadow-lg transition-all"
                                        >
                                            <div className="p-2 rounded-lg bg-emerald-500 text-white shadow-lg mb-2">
                                                <MessageCircle size={20} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-wider">Send EOD</span>
                                        </button>
                                    </motion.div>
                                </div>
                            </motion.div>

                            {/* Recent Activity (Glass Animated Feed) */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.3 }}
                                className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden"
                            >
                                <div className="px-5 py-3.5 border-b border-white/10">
                                    <h3 className="text-sm font-semibold text-white/90">{t('dashboard.recent_vouchers')}</h3>
                                </div>
                                <div className="divide-y divide-white/10">
                                    {recentVouchers.length === 0 ? (
                                        <div className="p-8 text-center text-white/40 text-sm">{t('dashboard.no_recent')}</div>
                                    ) : (
                                        recentVouchers.map((v, idx) => (
                                            <motion.div
                                                key={v.id || idx}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                onClick={() => navigate(`/vouchers/${v.id}`)}
                                                className="px-5 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                        v.voucher_type === 'Sales'
                                                            ? 'bg-blue-500/20 text-blue-400'
                                                            : 'bg-white/10 text-white/60'
                                                    }`}>
                                                        {v.party_name?.[0] || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-white/80 truncate group-hover:text-blue-400 transition-colors">
                                                            {v.party_name || 'Unknown'}
                                                        </p>
                                                        <p className="text-[11px] text-white/40">
                                                            {v.voucher_type} • {format(new Date(v.voucher_date), 'MMM d')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-sm font-semibold text-white/90 shrink-0 ml-3">
                                                    {formatCurrency(v.total_amount)}
                                                </p>
                                            </motion.div>
                                        ))
                                    )}
                                </div>
                                <div className="px-5 py-3 border-t border-white/10 text-center">
                                    <button
                                        onClick={() => navigate('/vouchers')}
                                        className="text-xs font-medium text-blue-400 hover:underline"
                                    >
                                        {t('dashboard.view_all_transactions')} →
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
