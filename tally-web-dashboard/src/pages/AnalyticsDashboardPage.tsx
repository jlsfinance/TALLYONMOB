import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth, subDays, eachMonthOfInterval } from 'date-fns';
import {
    TrendingUp, TrendingDown, BarChart3, Users, Wallet, Landmark,
    ArrowUpRight, ArrowDownRight, IndianRupee, RefreshCw, Filter, Download,
    FileBarChart, BadgePercent, Banknote, PiggyBank
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';

const formatCurrency = (amount: number) => {
    const absAmount = Math.abs(amount || 0);
    if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)} Cr`;
    if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
};

const formatCompact = (amount: number) => {
    const absAmount = Math.abs(amount || 0);
    if (absAmount >= 10000000) return `${(absAmount / 10000000).toFixed(1)}Cr`;
    if (absAmount >= 100000) return `${(absAmount / 100000).toFixed(1)}L`;
    if (absAmount >= 1000) return `${(absAmount / 1000).toFixed(1)}K`;
    return absAmount.toFixed(0);
};

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#06B6D4'];

interface KpiCardProps {
    title: string;
    value: string;
    subValue?: string;
    trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
    icon: React.ReactNode;
    color: string;
    loading?: boolean;
}

function KpiCard({ title, value, subValue, trend, icon, color, loading }: KpiCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${color} p-5 backdrop-blur-xl`}
        >
            <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                    <p className="text-xs font-medium text-white/70 uppercase tracking-wider">{title}</p>
                    {loading ? (
                        <div className="h-8 w-28 animate-pulse rounded bg-white/20" />
                    ) : (
                        <p className="text-2xl font-bold text-white">{value}</p>
                    )}
                    {subValue && <p className="text-xs text-white/60">{subValue}</p>}
                </div>
                <div className="rounded-lg bg-white/10 p-2.5 backdrop-blur-sm">
                    {icon}
                </div>
            </div>
            {trend && (
                <div className="mt-3 flex items-center gap-1.5">
                    {trend.direction === 'up' ? (
                        <ArrowUpRight size={14} className="text-green-300" />
                    ) : trend.direction === 'down' ? (
                        <ArrowDownRight size={14} className="text-red-300" />
                    ) : null}
                    <span className={`text-xs font-medium ${trend.direction === 'up' ? 'text-green-300' : trend.direction === 'down' ? 'text-red-300' : 'text-white/60'}`}>
                        {trend.direction !== 'neutral' ? `${Math.abs(trend.value)}%` : '—'}
                    </span>
                </div>
            )}
            <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-white/5" />
            <div className="absolute -bottom-8 -right-8 h-16 w-16 rounded-full bg-white/5" />
        </motion.div>
    );
}

interface ChartCardProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

function ChartCard({ title, icon, children, className = '' }: ChartCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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

interface LoanAccount {
    name: string;
    type: string;
    balance: number;
    status: 'active' | 'settled' | 'overdue';
    lastTransaction?: string;
}

interface TopCustomer {
    name: string;
    totalSales: number;
    invoiceCount: number;
    outstanding: number;
    lastPurchase?: string;
}

interface MonthlyRevenue {
    month: string;
    revenue: number;
    expenses: number;
    profit: number;
    invoiceCount: number;
}

export default function AnalyticsDashboardPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'quarter' | 'year' | 'all'>('year');
    const [monthlyData, setMonthlyData] = useState<MonthlyRevenue[]>([]);
    const [loanAccounts, setLoanAccounts] = useState<LoanAccount[]>([]);
    const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
    const [summary, setSummary] = useState({
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        totalOutstanding: 0,
        activeLoans: 0,
        customerCount: 0,
        revenueGrowth: 0,
        collectionRate: 0,
    });
    const [customerCategoryData, setCustomerCategoryData] = useState<any[]>([]);
    const [revenueCategoryData, setRevenueCategoryData] = useState<any[]>([]);

    const getDateRange = () => {
        const now = new Date();
        switch (period) {
            case 'quarter': {
                const qStart = subMonths(now, 3);
                return { from: format(qStart, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            }
            case 'year': {
                const fyStart = now.getMonth() >= 3
                    ? new Date(now.getFullYear(), 3, 1)
                    : new Date(now.getFullYear() - 1, 3, 1);
                return { from: format(fyStart, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            }
            case 'all':
            default:
                return { from: '2020-01-01', to: format(now, 'yyyy-MM-dd') };
        }
    };

    useEffect(() => {
        if (selectedCompany) loadData();
    }, [selectedCompany, period]);

    const loadData = async () => {
        if (!selectedCompany) return;
        setLoading(true);

        try {
            const { from, to } = getDateRange();

            // ── 1. Monthly Revenue / Expenses (from vouchers) ──
            const { data: allVouchers } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_type, voucher_date')
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .order('voucher_date', { ascending: true });

            // ── 2. Customer data from ledgers ──
            const { data: customerLedgers } = await supabase
                .from('ledgers')
                .select('id, name, current_balance, type')
                .eq('company_id', selectedCompany.id)
                .in('type', ['Sundry Debtors', 'Sundry Creditors'])
                .order('current_balance', { ascending: false });

            // ── 3. All ledgers to identify loan-type accounts ──
            const { data: allLedgers } = await supabase
                .from('ledgers')
                .select('id, name, current_balance, type, opening_balance')
                .eq('company_id', selectedCompany.id)
                .order('current_balance', { ascending: false });

            // ── Process monthly revenue data ──
            const monthlyMap = new Map<string, { revenue: number; expenses: number; count: number }>();
            const batchSize = 50;
            const allEntries: any[] = [];

            if (allVouchers) {
                for (let i = 0; i < allVouchers.length; i += batchSize) {
                    const batch = allVouchers.slice(i, i + batchSize);
                    const vIds = batch.map(v => v.id);
                    const { data: entries } = await supabase
                        .from('voucher_ledger_entries')
                        .select('voucher_id, amount, ledger_name')
                        .eq('company_id', selectedCompany.id)
                        .in('voucher_id', vIds);

                    if (entries) allEntries.push(...entries);
                }
            }

            // Aggregate by month
            allVouchers?.forEach((v: any) => {
                const monthKey = format(new Date(v.voucher_date), 'yyyy-MM');
                const existing = monthlyMap.get(monthKey) || { revenue: 0, expenses: 0, count: 0 };
                const type = (v.voucher_type || '').toLowerCase();
                if (type.includes('sale') || type === 'sales' || type === 'si') {
                    existing.revenue += Number(v.grand_total || v.total_amount || 0);
                } else if (type.includes('purchase') || type === 'pi') {
                    existing.expenses += Number(v.grand_total || v.total_amount || 0);
                }
                existing.count += 1;
                monthlyMap.set(monthKey, existing);
            });

            // Build monthly array
            const months = eachMonthOfInterval({
                start: new Date(allVouchers?.[0]?.voucher_date || from),
                end: new Date(to),
            });

            const monthly: MonthlyRevenue[] = months.map(m => {
                const key = format(m, 'yyyy-MM');
                const data = monthlyMap.get(key) || { revenue: 0, expenses: 0, count: 0 };
                return {
                    month: format(m, 'MMM yy'),
                    revenue: data.revenue,
                    expenses: data.expenses,
                    profit: data.revenue - data.expenses,
                    invoiceCount: data.count,
                };
            });

            setMonthlyData(monthly);

            // ── Process loan accounts ──
            const loanKeywords = ['loan', 'loan & advance', 'loan and advance', 'bank loan', 'personal loan',
                'business loan', 'loan payable', 'loan receivable', 'advance', 'secured loan', 'unsecured loan'];
            const loanAccts: LoanAccount[] = (allLedgers || [])
                .filter((l: any) => {
                    const name = (l.name || '').toLowerCase();
                    const type = (l.type || '').toLowerCase();
                    return loanKeywords.some(kw => name.includes(kw) || type.includes(kw))
                        && Math.abs(Number(l.current_balance || 0)) > 0;
                })
                .map((l: any) => ({
                    name: l.name,
                    type: l.type,
                    balance: Number(l.current_balance || 0),
                    status: Number(l.current_balance || 0) !== 0 ? 'active' : 'settled',
                    lastTransaction: undefined,
                }));

            // If no specific loan accounts found, derive from debtors/creditors with large balances
            if (loanAccts.length === 0 && allLedgers) {
                const topDebtors = allLedgers
                    .filter((l: any) => l.type === 'Sundry Debtors' && Math.abs(Number(l.current_balance || 0)) > 100000)
                    .slice(0, 5);
                const topCreditors = allLedgers
                    .filter((l: any) => l.type === 'Sundry Creditors' && Math.abs(Number(l.current_balance || 0)) > 100000)
                    .slice(0, 5);
                topDebtors.forEach((l: any) => loanAccts.push({
                    name: l.name, type: 'Loan Receivable', balance: Number(l.current_balance || 0), status: 'active'
                }));
                topCreditors.forEach((l: any) => loanAccts.push({
                    name: l.name, type: 'Loan Payable', balance: Number(l.current_balance || 0), status: 'active'
                }));
            }

            setLoanAccounts(loanAccts);

            // ── Process top customers ──
            const customerInvoices: Map<string, { total: number; count: number }> = new Map();
            if (allVouchers) {
                for (const v of allVouchers) {
                    const type = (v.voucher_type || '').toLowerCase();
                    if (type.includes('sale') || type === 'sales' || type === 'si') {
                        // Find customer name from ledger entries
                        const matchingEntries = allEntries.filter(e => e.voucher_id === v.id);
                        for (const e of matchingEntries) {
                            const name = e.ledger_name || 'Unknown';
                            if (name !== 'Unknown') {
                                const curr = customerInvoices.get(name) || { total: 0, count: 0 };
                                curr.total += Number(v.grand_total || v.total_amount || 0);
                                curr.count += 1;
                                customerInvoices.set(name, curr);
                            }
                        }
                    }
                }
            }

            // Fallback: use debtor ledgers directly
            const topCust: TopCustomer[] = (customerLedgers || [])
                .filter((l: any) => Math.abs(Number(l.current_balance || 0)) > 0)
                .slice(0, 10)
                .map((l: any) => ({
                    name: l.name,
                    totalSales: Math.abs(Number(l.current_balance || 0)),
                    invoiceCount: customerInvoices.get(l.name)?.count || 0,
                    outstanding: Number(l.current_balance || 0),
                }));

            setTopCustomers(topCust);

            // ── Compute summary ──
            const totalRev = monthly.reduce((s, m) => s + m.revenue, 0);
            const totalExp = monthly.reduce((s, m) => s + m.expenses, 0);
            const totalOut = (customerLedgers || []).reduce((s: number, l: any) => s + Math.abs(Number(l.current_balance || 0)), 0);
            const prevMonths = monthly.slice(0, Math.floor(monthly.length / 2));
            const currMonths = monthly.slice(Math.floor(monthly.length / 2));
            const prevRev = prevMonths.reduce((s, m) => s + m.revenue, 0);
            const currRev = currMonths.reduce((s, m) => s + m.revenue, 0);
            const growth = prevRev > 0 ? ((currRev - prevRev) / prevRev) * 100 : 0;

            setSummary({
                totalRevenue: totalRev,
                totalExpenses: totalExp,
                netProfit: totalRev - totalExp,
                totalOutstanding: totalOut,
                activeLoans: loanAccts.length,
                customerCount: customerLedgers?.length || 0,
                revenueGrowth: growth,
                collectionRate: totalRev > 0 ? Math.min(100, ((totalRev - totalOut) / totalRev) * 100) : 0,
            });

            // ── Category breakdowns ──
            setCustomerCategoryData([
                { name: 'High Value (>1L)', value: (customerLedgers || []).filter((l: any) => Math.abs(Number(l.current_balance || 0)) > 100000).length, color: '#3B82F6' },
                { name: 'Medium (10K-1L)', value: (customerLedgers || []).filter((l: any) => { const b = Math.abs(Number(l.current_balance || 0)); return b > 10000 && b <= 100000; }).length, color: '#10B981' },
                { name: 'Small (<10K)', value: (customerLedgers || []).filter((l: any) => { const b = Math.abs(Number(l.current_balance || 0)); return b > 0 && b <= 10000; }).length, color: '#F59E0B' },
                { name: 'Zero Balance', value: (customerLedgers || []).filter((l: any) => Number(l.current_balance || 0) === 0).length, color: '#6366F1' },
            ]);

            setRevenueCategoryData([
                { name: 'Sales Revenue', value: totalRev, color: '#3B82F6' },
                { name: 'Outstanding', value: totalOut, color: '#F59E0B' },
                { name: 'Expenses', value: totalExp, color: '#EF4444' },
                { name: 'Net Profit', value: Math.max(0, totalRev - totalExp), color: '#10B981' },
            ]);

        } catch (err) {
            console.error('Analytics Dashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Aggregate customer by region/type for pie
    const loanBalanceTotal = useMemo(() =>
        loanAccounts.reduce((s, l) => s + Math.abs(l.balance), 0),
        [loanAccounts]
    );

    const loanReceivables = useMemo(() =>
        loanAccounts.filter(l => l.balance > 0).reduce((s, l) => s + l.balance, 0),
        [loanAccounts]
    );

    const loanPayables = useMemo(() =>
        loanAccounts.filter(l => l.balance < 0).reduce((s, l) => s + Math.abs(l.balance), 0),
        [loanAccounts]
    );

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload) return null;
        return (
            <div className="rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs backdrop-blur-xl">
                <p className="mb-1 font-medium text-white/90">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}: {formatCurrency(p.value)}
                    </p>
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-black px-4 pb-20 pt-6 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
                    <p className="mt-0.5 text-sm text-white/50">Revenue, Loan & Customer Analytics</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex overflow-hidden rounded-lg border border-white/10 bg-black/60">
                        {(['quarter', 'year', 'all'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                    period === p
                                        ? 'bg-blue-600 text-white'
                                        : 'text-white/60 hover:text-white/90'
                                }`}
                            >
                                {p === 'quarter' ? 'Quarter' : p === 'year' ? 'FY' : 'All'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={loadData}
                        className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:text-white/90"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiCard
                    title="Total Revenue"
                    value={formatCurrency(summary.totalRevenue)}
                    trend={{ value: Math.round(summary.revenueGrowth), direction: summary.revenueGrowth >= 0 ? 'up' : 'down' }}
                    icon={<IndianRupee size={18} className="text-white" />}
                    color="from-emerald-600/80 to-emerald-900/60"
                    loading={loading}
                />
                <KpiCard
                    title="Net Profit"
                    value={formatCurrency(summary.netProfit)}
                    subValue={summary.totalRevenue > 0 ? `${((summary.netProfit / summary.totalRevenue) * 100).toFixed(1)}% margin` : undefined}
                    icon={<TrendingUp size={18} className="text-white" />}
                    color="from-blue-600/80 to-blue-900/60"
                    loading={loading}
                />
                <KpiCard
                    title="Total Expenses"
                    value={formatCurrency(summary.totalExpenses)}
                    icon={<Wallet size={18} className="text-white" />}
                    color="from-orange-600/80 to-orange-900/60"
                    loading={loading}
                />
                <KpiCard
                    title="Loan Portfolio"
                    value={formatCurrency(loanBalanceTotal)}
                    subValue={`${loanAccounts.length} active loans`}
                    icon={<Landmark size={18} className="text-white" />}
                    color="from-purple-600/80 to-purple-900/60"
                    loading={loading}
                />
                <KpiCard
                    title="Customers"
                    value={summary.customerCount.toString()}
                    subValue={`${topCustomers.length} top by value`}
                    icon={<Users size={18} className="text-white" />}
                    color="from-cyan-600/80 to-cyan-900/60"
                    loading={loading}
                />
                <KpiCard
                    title="Collection Rate"
                    value={`${summary.collectionRate.toFixed(0)}%`}
                    trend={{ value: Math.round(summary.collectionRate), direction: summary.collectionRate >= 60 ? 'up' : 'down' }}
                    icon={<BadgePercent size={18} className="text-white" />}
                    color="from-rose-600/80 to-rose-900/60"
                    loading={loading}
                />
            </div>

            {/* Revenue Chart */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <ChartCard title="Revenue vs Expenses Trend" icon={<BarChart3 size={16} />} className="lg:col-span-2">
                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={monthlyData} barGap={4}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }} />
                                <Bar dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expenses" name="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard title="Revenue Distribution" icon={<FileBarChart size={16} />}>
                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={revenueCategoryData}
                                    cx="50%" cy="50%"
                                    innerRadius={50}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {revenueCategoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}
                                    formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            {/* Loan Stats */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ChartCard title="Loan Portfolio Overview" icon={<Landmark size={16} />}>
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : loanAccounts.length === 0 ? (
                        <div className="flex h-48 items-center justify-center text-sm text-white/40">
                            No loan accounts found in this period
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-full bg-green-500/20 p-1.5">
                                        <ArrowUpRight size={14} className="text-green-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/50">Loan Receivables</p>
                                        <p className="text-sm font-semibold text-green-400">{formatCurrency(loanReceivables)}</p>
                                    </div>
                                </div>
                                <div className="h-12 w-24">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={[
                                                { name: 'Receivables', value: loanReceivables || 1 },
                                                { name: 'Payables', value: loanPayables || 1 }
                                            ]} cx="50%" cy="50%" innerRadius={15} outerRadius={25} dataKey="value">
                                                <Cell fill="#10B981" />
                                                <Cell fill="#EF4444" />
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="rounded-full bg-red-500/20 p-1.5">
                                        <ArrowDownRight size={14} className="text-red-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-white/50">Loan Payables</p>
                                        <p className="text-sm font-semibold text-red-400">{formatCurrency(loanPayables)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="max-h-52 space-y-1.5 overflow-y-auto">
                                {loanAccounts.slice(0, 8).map((loan, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`h-2 w-2 rounded-full ${
                                                loan.balance > 0 ? 'bg-green-400' : 'bg-red-400'
                                            }`} />
                                            <div>
                                                <p className="text-xs font-medium text-white/80">{loan.name}</p>
                                                <p className="text-[10px] text-white/40">{loan.type}</p>
                                            </div>
                                        </div>
                                        <p className={`text-xs font-semibold ${
                                            loan.balance > 0 ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                            {formatCurrency(loan.balance)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </ChartCard>

                {/* Monthly profit trend */}
                <ChartCard title="Profit Trend (Monthly)" icon={<TrendingUp size={16} />}>
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={monthlyData}>
                                <defs>
                                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="profit" name="Net Profit" stroke="#10B981" fill="url(#profitGradient)" strokeWidth={2} />
                                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            {/* Customer Metrics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <ChartCard title="Top Customers" icon={<Users size={16} />} className="lg:col-span-2">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : topCustomers.length === 0 ? (
                        <div className="flex h-48 items-center justify-center text-sm text-white/40">
                            No customer data available
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="mb-2 grid grid-cols-4 gap-2 px-3 text-[10px] font-medium uppercase tracking-wider text-white/40">
                                <span className="col-span-2">Customer</span>
                                <span className="text-right">Sales</span>
                                <span className="text-right">Outstanding</span>
                            </div>
                            {topCustomers.slice(0, 8).map((cust, i) => {
                                const maxVal = Math.max(...topCustomers.map(c => c.totalSales), 1);
                                const barWidth = (cust.totalSales / maxVal) * 100;
                                return (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="relative grid grid-cols-4 gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]"
                                    >
                                        <div className="col-span-2 flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                                                {cust.name.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-medium text-white/80">{cust.name}</p>
                                                <p className="text-[10px] text-white/40">{cust.invoiceCount} invoices</p>
                                            </div>
                                        </div>
                                        <div className="relative flex items-center justify-end">
                                            <div
                                                className="absolute right-0 h-5 rounded-l-full bg-blue-500/20"
                                                style={{ width: `${barWidth}%`, maxWidth: '100%' }}
                                            />
                                            <span className="relative text-xs font-medium text-white">{formatCompact(cust.totalSales)}</span>
                                        </div>
                                        <div className="flex items-center justify-end">
                                            <span className={`text-xs font-medium ${
                                                cust.outstanding > 0 ? 'text-amber-400' : 'text-green-400'
                                            }`}>
                                                {formatCompact(Math.abs(cust.outstanding))}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </ChartCard>

                <ChartCard title="Customer Distribution" icon={<PiggyBank size={16} />}>
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={customerCategoryData}
                                    cx="50%" cy="50%"
                                    innerRadius={50}
                                    outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {customerCategoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend
                                    wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}
                                    formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>
        </div>
    );
}
