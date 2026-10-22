import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, TrendingUp, DollarSign, Users, BarChart3,
    PieChart as PieChartIcon, Download, Calendar, Clock,
    AlertTriangle, CheckCircle2, Loader2, Share2,
    Banknote, Landmark, Activity, Percent, ArrowUpRight,
    ArrowDownRight, Wallet, HandCoins
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, LineChart, Line, AreaChart, Area,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { DashboardStats } from '../hooks/useTallyData';
import { Invoice, Customer } from '../types';

interface AnalyticsDashboardProps {
    onBack: () => void;
    // Tally mode data (optional — passed from AccountingApp)
    tallyDashboardStats?: DashboardStats | null;
    tallyLedgers?: any[];
    tallyVouchers?: any[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

type TabType = 'REVENUE' | 'LOANS' | 'CUSTOMERS';

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
    onBack,
    tallyDashboardStats,
    tallyLedgers,
    tallyVouchers,
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('REVENUE');
    const [period, setPeriod] = useState<'1M' | '3M' | '6M' | '12M'>('6M');
    const [loading, setLoading] = useState(false);
    const appMode = localStorage.getItem('app_mode') as 'TALLY' | 'NORMAL' | null;

    // ── Data ────────────────────────────────────────────────
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    useEffect(() => {
        if (appMode !== 'TALLY') {
            setInvoices(StorageService.getInvoices());
            setPayments(StorageService.getPayments());
            setCustomers(StorageService.getCustomers());
            setProducts(StorageService.getProducts());
        }
    }, [appMode]);

    // ── Revenue Chart Data ──────────────────────────────────
    const revenueChartData = useMemo(() => {
        const now = new Date();
        const months = period === '1M' ? 1 : period === '3M' ? 3 : period === '6M' ? 6 : 12;
        const data: { month: string; revenue: number; expenses: number; profit: number }[] = [];

        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthLabel = d.toLocaleString('en-US', { month: 'short' }) + " '" + d.getFullYear().toString().slice(-2);
            const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

            if (appMode === 'TALLY' && tallyVouchers) {
                const monthVouchers = tallyVouchers.filter((v: any) =>
                    (v.vch_date || v.date || '').startsWith(prefix)
                );
                const revenue = monthVouchers
                    .filter((v: any) => (v.voucher_type || v.type) === 'Sales' || (v.voucher_type || v.type) === 'Receipt')
                    .reduce((s: number, v: any) => s + (v.amount || 0), 0);
                const expenses = monthVouchers
                    .filter((v: any) => (v.voucher_type || v.type) === 'Purchase' || (v.voucher_type || v.type) === 'Payment')
                    .reduce((s: number, v: any) => s + (v.amount || 0), 0);
                data.push({ month: monthLabel, revenue: Math.round(revenue), expenses: Math.round(expenses), profit: Math.round(revenue - expenses) });
            } else {
                const monthInvoices = invoices.filter(inv => inv.date.startsWith(prefix));
                const revenue = monthInvoices.reduce((s, inv) => s + inv.total, 0);
                const expenses = monthInvoices.filter(inv => inv.status === 'PAID').reduce((s, inv) => s + inv.total, 0);
                data.push({ month: monthLabel, revenue: Math.round(revenue), expenses: Math.round(expenses), profit: Math.round(revenue - expenses) });
            }
        }
        return data;
    }, [period, invoices, tallyVouchers, appMode]);

    // ── Loan Portfolio Stats (from Sundry Debtors ledger) ───
    const loanStats = useMemo(() => {
        // Default stats
        const stats = {
            totalLoanBook: 0,
            totalDisbursed: 0,
            totalCollected: 0,
            activeLoans: 0,
            overdueAmount: 0,
            collectionRate: 0,
            npaRatio: 0,
            avgLoanSize: 0,
        };

        if (appMode === 'TALLY' && tallyLedgers) {
            // Sundry Debtors = Loan portfolio
            const debtors = tallyLedgers.filter((l: any) =>
                (l.parent_group || l.group) === 'Sundry Debtors'
            );
            stats.totalLoanBook = debtors.reduce((s: number, l: any) => s + Math.abs(l.balance || l.closing_balance || 0), 0);
            stats.activeLoans = debtors.length;

            // From vouchers: Receipt entries = collections
            if (tallyVouchers) {
                const receipts = tallyVouchers.filter((v: any) =>
                    (v.voucher_type || v.type) === 'Receipt'
                );
                stats.totalCollected = receipts.reduce((s: number, v: any) => s + (v.amount || 0), 0);

                // Disbursements = Payments to Sundry Debtors or Loan accounts
                const disbursements = tallyVouchers.filter((v: any) =>
                    (v.voucher_type || v.type) === 'Payment' || (v.voucher_type || v.type) === 'Journal'
                );
                stats.totalDisbursed = disbursements.reduce((s: number, v: any) => s + (v.amount || 0), 0);
            }

            stats.avgLoanSize = stats.activeLoans > 0 ? Math.round(stats.totalLoanBook / stats.activeLoans) : 0;
            stats.collectionRate = stats.totalDisbursed > 0
                ? Math.round((stats.totalCollected / stats.totalDisbursed) * 100)
                : 0;
            // NPA: estimate as overdue > 90 days (high-balance debtors as proxy)
            stats.npaRatio = stats.totalLoanBook > 0
                ? Math.min(Math.round((debtors.filter((l: any) => Math.abs(l.balance || 0) > 100000).length / Math.max(debtors.length, 1)) * 100), 100)
                : 0;
        } else {
            // NORMAL mode: use customer balances as loan book proxy
            const debtors = customers.filter(c => (c.balance || 0) > 0);
            stats.totalLoanBook = debtors.reduce((s, c) => s + (c.balance || 0), 0);
            stats.activeLoans = debtors.length;
            stats.totalCollected = payments.reduce((s, p) => s + (p.amount || 0), 0);
            stats.totalDisbursed = invoices.reduce((s, inv) => s + inv.total, 0);
            stats.avgLoanSize = stats.activeLoans > 0 ? Math.round(stats.totalLoanBook / stats.activeLoans) : 0;
            stats.collectionRate = stats.totalDisbursed > 0
                ? Math.round((stats.totalCollected / stats.totalDisbursed) * 100)
                : 0;
            stats.npaRatio = stats.totalLoanBook > 0
                ? Math.min(Math.round((debtors.filter(c => (c.balance || 0) > 50000).length / Math.max(debtors.length, 1)) * 100), 100)
                : 0;
        }

        return stats;
    }, [tallyLedgers, tallyVouchers, customers, invoices, payments, appMode]);

    // ── Customer Risk Distribution ──────────────────────────
    const customerRiskData = useMemo(() => {
        if (appMode === 'TALLY' && tallyLedgers) {
            const debtors = tallyLedgers.filter((l: any) =>
                (l.parent_group || l.group) === 'Sundry Debtors'
            );
            const low = debtors.filter((l: any) => Math.abs(l.balance || 0) < 50000).length;
            const med = debtors.filter((l: any) => Math.abs(l.balance || 0) >= 50000 && Math.abs(l.balance || 0) < 200000).length;
            const high = debtors.filter((l: any) => Math.abs(l.balance || 0) >= 200000).length;
            return [
                { name: 'Low Risk', value: low, color: '#10B981' },
                { name: 'Medium Risk', value: med, color: '#F59E0B' },
                { name: 'High Risk', value: high, color: '#EF4444' },
            ];
        } else {
            const low = customers.filter(c => (c.balance || 0) > 0 && (c.balance || 0) < 10000).length;
            const med = customers.filter(c => (c.balance || 0) >= 10000 && (c.balance || 0) < 50000).length;
            const high = customers.filter(c => (c.balance || 0) >= 50000).length;
            return [
                { name: 'Low Risk', value: low, color: '#10B981' },
                { name: 'Medium Risk', value: med, color: '#F59E0B' },
                { name: 'High Risk', value: high, color: '#EF4444' },
            ];
        }
    }, [tallyLedgers, customers, appMode]);

    // ── Top Customers ───────────────────────────────────────
    const topCustomers = useMemo(() => {
        if (appMode === 'TALLY' && tallyLedgers) {
            return tallyLedgers
                .filter((l: any) => (l.parent_group || l.group) === 'Sundry Debtors')
                .sort((a: any, b: any) => Math.abs(b.balance || b.closing_balance || 0) - Math.abs(a.balance || a.closing_balance || 0))
                .slice(0, 8)
                .map((l: any) => ({
                    name: l.name,
                    balance: Math.abs(l.balance || l.closing_balance || 0),
                    group: (l.parent_group || l.group) || 'Loan',
                }));
        } else {
            return customers
                .filter(c => (c.balance || 0) > 0)
                .sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0))
                .slice(0, 8)
                .map(c => ({
                    name: c.name,
                    balance: Math.abs(c.balance || 0),
                    group: 'Customer',
                }));
        }
    }, [tallyLedgers, customers, appMode]);

    const formatCurrency = (value: number) =>
        `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    return (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col h-full overflow-hidden">
            {/* ── Header ────────────────────────────────── */}
            <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-transform">
                        <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg text-slate-800 dark:text-white leading-none">Analytics Dashboard</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">Revenue &bull; Loans &bull; Customers</p>
                    </div>
                </div>
            </div>

            {/* ── Tab Bar ───────────────────────────────── */}
            <div className="flex bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['REVENUE', 'LOANS', 'CUSTOMERS'] as TabType[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-3 text-xs font-bold transition-all relative ${
                            activeTab === tab
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-400 dark:text-slate-500'
                        }`}
                    >
                        <div className="flex items-center justify-center gap-1.5">
                            {tab === 'REVENUE' && <TrendingUp className="w-3.5 h-3.5" />}
                            {tab === 'LOANS' && <Landmark className="w-3.5 h-3.5" />}
                            {tab === 'CUSTOMERS' && <Users className="w-3.5 h-3.5" />}
                            <span>{tab === 'REVENUE' ? 'Revenue' : tab === 'LOANS' ? 'Loans' : 'Customers'}</span>
                        </div>
                        {activeTab === tab && (
                            <motion.div
                                layoutId="analyticsTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* ── Content ──────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeTab === 'REVENUE' && (
                    <>
                        {/* Period Filter */}
                        <div className="flex gap-2">
                            {(['1M', '3M', '6M', '12M'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                                        period === p
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    {p === '1M' ? '1 Month' : p === '3M' ? '3 Months' : p === '6M' ? '6 Months' : '12 Months'}
                                </button>
                            ))}
                        </div>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Total Revenue</span>
                                </div>
                                <p className="text-2xl font-black">
                                    {formatCurrency(
                                        appMode === 'TALLY'
                                            ? tallyDashboardStats?.monthlyRevenue || revenueChartData.reduce((s, d) => s + d.revenue, 0)
                                            : revenueChartData.reduce((s, d) => s + d.revenue, 0)
                                    )}
                                </p>
                                <p className="text-[10px] opacity-70 mt-1">Selected period</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <DollarSign className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Net Profit</span>
                                </div>
                                <p className="text-2xl font-black">
                                    {formatCurrency(revenueChartData.reduce((s, d) => s + d.profit, 0))}
                                </p>
                                <p className="text-[10px] opacity-70 mt-1">
                                    {revenueChartData.length > 1
                                        ? `${((revenueChartData[revenueChartData.length - 1].profit - revenueChartData[0].profit) / Math.max(revenueChartData[0].profit, 1) * 100).toFixed(1)}% trend`
                                        : 'No trend data'}
                                </p>
                            </motion.div>
                        </div>

                        {/* Revenue Trend Chart */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-blue-500" />
                                Revenue vs Expenses
                            </h3>
                            {revenueChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={revenueChartData}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip
                                            formatter={(value: number) => [formatCurrency(value), '']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                        />
                                        <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Revenue" />
                                        <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="Expenses" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                                    No data for this period
                                </div>
                            )}
                        </div>

                        {/* Profit Trend Line */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-emerald-500" />
                                Profit Trend
                            </h3>
                            {revenueChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={180}>
                                    <AreaChart data={revenueChartData}>
                                        <defs>
                                            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip
                                            formatter={(value: number) => [formatCurrency(value), 'Profit']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="profit"
                                            stroke="#10B981"
                                            strokeWidth={2}
                                            fill="url(#profitGradient)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                                    No profit data
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'LOANS' && (
                    <>
                        {/* Loan Portfolio KPI Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <Landmark className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Loan Book</span>
                                </div>
                                <p className="text-2xl font-black">{formatCurrency(loanStats.totalLoanBook)}</p>
                                <p className="text-[10px] opacity-70 mt-1">{loanStats.activeLoans} active loans</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <HandCoins className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Collections</span>
                                </div>
                                <p className="text-2xl font-black">{formatCurrency(loanStats.totalCollected)}</p>
                                <p className="text-[10px] opacity-70 mt-1">{loanStats.collectionRate}% collection rate</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <Banknote className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Avg Loan</span>
                                </div>
                                <p className="text-2xl font-black">{formatCurrency(loanStats.avgLoanSize)}</p>
                                <p className="text-[10px] opacity-70 mt-1">Per customer average</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className={`bg-gradient-to-br rounded-2xl p-4 text-white ${
                                    loanStats.npaRatio > 20
                                        ? 'from-red-500 to-red-600'
                                        : loanStats.npaRatio > 10
                                        ? 'from-orange-500 to-orange-600'
                                        : 'from-emerald-500 to-emerald-600'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <Percent className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">NPA Ratio</span>
                                </div>
                                <p className="text-2xl font-black">{loanStats.npaRatio}%</p>
                                <p className="text-[10px] opacity-70 mt-1">
                                    {loanStats.npaRatio > 20 ? 'Needs attention' : loanStats.npaRatio > 10 ? 'Moderate risk' : 'Healthy portfolio'}
                                </p>
                            </motion.div>
                        </div>

                        {/* Disbursed vs Collected */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-indigo-500" />
                                Disbursed vs Collected
                            </h3>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart
                                    data={[
                                        { name: 'Disbursed', amount: loanStats.totalDisbursed },
                                        { name: 'Collected', amount: loanStats.totalCollected },
                                        { name: 'Outstanding', amount: Math.max(loanStats.totalLoanBook, 0) },
                                    ]}
                                >
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip
                                        formatter={(value: number) => [formatCurrency(value), 'Amount']}
                                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                    />
                                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                                        {[
                                            { name: 'Disbursed', fill: '#6366F1' },
                                            { name: 'Collected', fill: '#10B981' },
                                            { name: 'Outstanding', fill: '#F59E0B' },
                                        ].map((entry, idx) => (
                                            <Cell key={`cell-${idx}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Loan Portfolio Health */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <PieChartIcon className="w-4 h-4 text-purple-500" />
                                Portfolio Health
                            </h3>
                            <div className="grid grid-cols-3 gap-4 items-center">
                                <div className="text-center">
                                    <div className="text-2xl font-black text-emerald-600">{loanStats.activeLoans}</div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Active</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-black text-blue-600">{formatCurrency(loanStats.avgLoanSize)}</div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Avg Size</div>
                                </div>
                                <div className="text-center">
                                    <div className={`text-2xl font-black ${
                                        loanStats.collectionRate > 70 ? 'text-emerald-600' : 'text-red-600'
                                    }`}>{loanStats.collectionRate}%</div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Collection</div>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between text-xs text-slate-500 mb-2">
                                    <span>Collection Rate</span>
                                    <span className="font-bold">{loanStats.collectionRate}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(loanStats.collectionRate, 100)}%` }}
                                        transition={{ duration: 1, ease: 'easeOut' }}
                                        className={`h-2 rounded-full ${
                                            loanStats.collectionRate > 70
                                                ? 'bg-emerald-500'
                                                : loanStats.collectionRate > 40
                                                ? 'bg-yellow-500'
                                                : 'bg-red-500'
                                        }`}
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'CUSTOMERS' && (
                    <>
                        {/* Risk Distribution Pie */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <PieChartIcon className="w-4 h-4 text-purple-500" />
                                Customer Risk Distribution
                            </h3>
                            {customerRiskData.some(d => d.value > 0) ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={customerRiskData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={85}
                                            paddingAngle={3}
                                            dataKey="value"
                                        >
                                            {customerRiskData.map((entry, idx) => (
                                                <Cell key={`cell-${idx}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => [value, 'Customers']}
                                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                        />
                                        <Legend
                                            layout="horizontal"
                                            verticalAlign="bottom"
                                            wrapperStyle={{ fontSize: 10 }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                                    No customer data available
                                </div>
                            )}
                        </div>

                        {/* Top Customers Table */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Users className="w-4 h-4 text-orange-500" />
                                    Top Customers by Balance
                                </h3>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {topCustomers.length > 0 ? (
                                    topCustomers.map((c, idx) => (
                                        <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-xs">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800 dark:text-white">{c.name}</p>
                                                    <p className="text-[9px] text-slate-400">{c.group}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-slate-700 dark:text-slate-300">
                                                    {formatCurrency(c.balance)}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-slate-400 text-sm">
                                        No customers with outstanding balance
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-green-50 dark:bg-green-950/30 rounded-2xl p-3 text-center">
                                <p className="text-lg font-black text-green-600">{customerRiskData[0]?.value || 0}</p>
                                <p className="text-[9px] font-bold text-green-500 uppercase tracking-wider mt-0.5">Low Risk</p>
                            </div>
                            <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-2xl p-3 text-center">
                                <p className="text-lg font-black text-yellow-600">{customerRiskData[1]?.value || 0}</p>
                                <p className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider mt-0.5">Medium</p>
                            </div>
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-3 text-center">
                                <p className="text-lg font-black text-red-600">{customerRiskData[2]?.value || 0}</p>
                                <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mt-0.5">High Risk</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="text-center py-4 opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        Analytics by JLS Finance
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
