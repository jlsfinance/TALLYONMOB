import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth, subDays, eachMonthOfInterval } from 'date-fns';
import {
    TrendingUp, TrendingDown, BarChart3, Users, Package, Calendar,
    ArrowUpRight, ArrowDownRight, IndianRupee, RefreshCw, Filter
} from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function SalesAnalyticsPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('year');
    const [salesData, setSalesData] = useState<any[]>([]);
    const [purchaseData, setPurchaseData] = useState<any[]>([]);
    const [topCustomers, setTopCustomers] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
    const [summary, setSummary] = useState({ totalSales: 0, totalPurchase: 0, invoiceCount: 0, avgTicket: 0, growth: 0 });

    const getDateRange = () => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        switch (period) {
            case 'month':
                return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
            case 'quarter': {
                const qStart = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
                return { from: format(qStart, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            }
            case 'year': {
                const fyStart = currentMonth >= 3 ? new Date(currentYear, 3, 1) : new Date(currentYear - 1, 3, 1);
                return { from: format(fyStart, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
            }
        }
    };

    useEffect(() => {
        if (selectedCompany?.id) loadAnalytics();
    }, [selectedCompany, period]);

    const loadAnalytics = async () => {
        setLoading(true);
        const { from, to } = getDateRange();

        try {
            // Fetch all sales vouchers for this period
            const { data: sales } = await supabase
                .from('vouchers')
                .select('id, voucher_date, party_name, total_amount, grand_total, voucher_number')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .order('voucher_date', { ascending: false })
                .limit(50000);

            // Fetch purchases
            const { data: purchases } = await supabase
                .from('vouchers')
                .select('voucher_date, total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Purchase')
                .eq('is_deleted', false)
                .gte('voucher_date', from)
                .lte('voucher_date', to)
                .limit(50000);

            // Fetch stock entries from vouchers for product analysis
            const { data: stockEntries } = await supabase
                .from('voucher_stock_entries')
                .select('stock_item_name, quantity, amount')
                .eq('company_id', selectedCompany.id)
                .limit(10000);

            const sData = sales || [];
            const pData = purchases || [];
            setSalesData(sData);
            setPurchaseData(pData);

            // Calculate totals
            const totalSales = sData.reduce((sum, v) => sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalPurchase = pData.reduce((sum, v) => sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);

            // Previous period for growth calc
            const prevFrom = format(subMonths(new Date(from), period === 'month' ? 1 : period === 'quarter' ? 3 : 12), 'yyyy-MM-dd');
            const { data: prevSales } = await supabase
                .from('vouchers')
                .select('grand_total, total_amount')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .gte('voucher_date', prevFrom)
                .lt('voucher_date', from)
                .limit(50000);

            const prevTotal = (prevSales || []).reduce((sum, v) => sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const growth = prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal) * 100 : 0;

            setSummary({
                totalSales,
                totalPurchase,
                invoiceCount: sData.length,
                avgTicket: sData.length > 0 ? totalSales / sData.length : 0,
                growth
            });

            // Top customers
            const customerMap: Record<string, { name: string; amount: number; count: number }> = {};
            sData.forEach(v => {
                const name = v.party_name || 'Cash';
                if (!customerMap[name]) customerMap[name] = { name, amount: 0, count: 0 };
                customerMap[name].amount += Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                customerMap[name].count++;
            });
            setTopCustomers(Object.values(customerMap).sort((a, b) => b.amount - a.amount).slice(0, 10));

            // Top products from stock entries
            const productMap: Record<string, { name: string; amount: number; qty: number }> = {};
            (stockEntries || []).forEach(e => {
                const name = e.stock_item_name || 'Unknown';
                if (!productMap[name]) productMap[name] = { name, amount: 0, qty: 0 };
                productMap[name].amount += Math.abs(Number(e.amount) || 0);
                productMap[name].qty += Math.abs(Number(e.quantity) || 0);
            });
            setTopProducts(Object.values(productMap).sort((a, b) => b.amount - a.amount).slice(0, 10));

            // Monthly trend
            const monthMap: Record<string, { month: string; sales: number; purchase: number; count: number }> = {};
            sData.forEach(v => {
                const m = format(new Date(v.voucher_date), 'yyyy-MM');
                if (!monthMap[m]) monthMap[m] = { month: m, sales: 0, purchase: 0, count: 0 };
                monthMap[m].sales += Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                monthMap[m].count++;
            });
            pData.forEach(v => {
                const m = format(new Date(v.voucher_date), 'yyyy-MM');
                if (!monthMap[m]) monthMap[m] = { month: m, sales: 0, purchase: 0, count: 0 };
                monthMap[m].purchase += Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
            });
            setMonthlyTrend(Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)));

        } catch (error) {
            console.error('Analytics error:', error);
        }
        setLoading(false);
    };

    if (!selectedCompany) return null;

    const maxMonthlyVal = Math.max(...monthlyTrend.map(m => Math.max(m.sales, m.purchase)), 1);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-[var(--on-surface)] tracking-tighter">Sales Analytics</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{selectedCompany.name} • Real-time business intelligence</p>
                </div>
                <div className="flex items-center gap-2">
                    {(['month', 'quarter', 'year'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${period === p
                                    ? 'bg-[var(--primary)] text-white shadow-lg'
                                    : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)] hover:bg-[var(--surface-active)]'
                                }`}
                        >
                            {p === 'month' ? 'This Month' : p === 'quarter' ? 'Quarter' : 'Full Year'}
                        </button>
                    ))}
                    <button onClick={loadAnalytics} className="p-2 rounded-xl bg-[var(--surface-variant)] text-[var(--text-muted)] hover:bg-[var(--surface-active)] border border-[var(--border)]">
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-32">
                    <div className="text-center">
                        <div className="w-10 h-10 border-[3px] border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs text-[var(--text-muted)] mt-4 uppercase tracking-widest font-bold">Analyzing data...</p>
                    </div>
                </div>
            ) : (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-5 text-white shadow-xl col-span-1">
                            <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">Total Sales</p>
                            <p className="text-2xl font-black mt-1">{formatCurrency(summary.totalSales)}</p>
                            <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${summary.growth >= 0 ? 'text-emerald-200' : 'text-red-300'}`}>
                                {summary.growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {Math.abs(summary.growth).toFixed(1)}% vs prev
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-2xl p-5 text-white shadow-xl">
                            <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">Purchase</p>
                            <p className="text-2xl font-black mt-1">{formatCurrency(summary.totalPurchase)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Net Margin</p>
                            <p className="text-2xl font-black mt-1 text-[var(--on-surface)]">{formatCurrency(summary.totalSales - summary.totalPurchase)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Invoices</p>
                            <p className="text-2xl font-black mt-1 text-[var(--on-surface)]">{summary.invoiceCount}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Avg Ticket</p>
                            <p className="text-2xl font-black mt-1 text-[var(--on-surface)]">{formatCurrency(summary.avgTicket)}</p>
                        </div>
                    </div>

                    {/* Monthly Trend Chart */}
                    <GlassCard className="p-6">
                        <h2 className="text-sm font-black text-[var(--on-surface)] mb-6 uppercase tracking-wider flex items-center gap-2">
                            <BarChart3 size={16} className="text-[var(--primary)]" /> Monthly Sales vs Purchase
                        </h2>
                        <div className="space-y-3">
                            {monthlyTrend.map((m, idx) => (
                                <div key={idx} className="group">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] w-16 shrink-0 uppercase">
                                            {format(new Date(m.month + '-01'), 'MMM yy')}
                                        </span>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-[var(--surface-active)] rounded-full h-5 overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${(m.sales / maxMonthlyVal) * 100}%` }}
                                                        transition={{ delay: idx * 0.05, duration: 0.5 }}
                                                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full flex items-center justify-end px-2"
                                                    >
                                                        <span className="text-[8px] font-black text-white">{formatCompact(m.sales)}</span>
                                                    </motion.div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-[var(--surface-active)] rounded-full h-3 overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${(m.purchase / maxMonthlyVal) * 100}%` }}
                                                        transition={{ delay: idx * 0.05 + 0.1, duration: 0.5 }}
                                                        className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full"
                                                    />
                                                </div>
                                                <span className="text-[8px] font-bold text-orange-500 w-12 text-right">{formatCompact(m.purchase)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {monthlyTrend.length === 0 && (
                                <p className="text-center text-sm text-[var(--text-muted)] py-8">No data available for this period</p>
                            )}
                        </div>
                        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[var(--border)]">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Sales</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-orange-500" />
                                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Purchase</span>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Top Customers & Products */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <GlassCard className="p-6">
                            <h2 className="text-sm font-black text-[var(--on-surface)] mb-5 uppercase tracking-wider flex items-center gap-2">
                                <Users size={16} className="text-[var(--primary)]" /> Top 10 Customers
                            </h2>
                            <div className="space-y-3">
                                {topCustomers.map((c, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex items-center gap-3"
                                    >
                                        <span className="text-[10px] font-black text-[var(--text-muted)] w-5">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-[var(--on-surface)] truncate">{c.name}</p>
                                            <div className="w-full bg-[var(--surface-active)] rounded-full h-1.5 mt-1">
                                                <div
                                                    className="bg-[var(--primary)] h-1.5 rounded-full transition-all"
                                                    style={{ width: `${(c.amount / (topCustomers[0]?.amount || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-black text-emerald-500">{formatCurrency(c.amount)}</p>
                                            <p className="text-[8px] text-[var(--text-muted)]">{c.count} inv</p>
                                        </div>
                                    </motion.div>
                                ))}
                                {topCustomers.length === 0 && (
                                    <p className="text-center text-xs text-[var(--text-muted)] py-6">No customer data yet</p>
                                )}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-sm font-black text-[var(--on-surface)] mb-5 uppercase tracking-wider flex items-center gap-2">
                                <Package size={16} className="text-orange-500" /> Top Products
                            </h2>
                            <div className="space-y-3">
                                {topProducts.map((p, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex items-center gap-3"
                                    >
                                        <span className="text-[10px] font-black text-[var(--text-muted)] w-5">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-[var(--on-surface)] truncate">{p.name}</p>
                                            <p className="text-[8px] text-[var(--text-muted)]">{p.qty} units</p>
                                        </div>
                                        <p className="text-xs font-black text-orange-500 shrink-0">{formatCurrency(p.amount)}</p>
                                    </motion.div>
                                ))}
                                {topProducts.length === 0 && (
                                    <p className="text-center text-xs text-[var(--text-muted)] py-6">No product data yet</p>
                                )}
                            </div>
                        </GlassCard>
                    </div>

                    {/* Recent Sales Table */}
                    <GlassCard className="overflow-hidden">
                        <div className="p-5 border-b border-[var(--border)]">
                            <h2 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-wider">Recent Invoices</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-[var(--surface-variant)]">
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Date</th>
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Invoice #</th>
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Party</th>
                                        <th className="text-right px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesData.slice(0, 20).map((v, idx) => (
                                        <tr key={idx} className="border-b border-[var(--border)]/30 hover:bg-[var(--surface-variant)]/50 transition-colors">
                                            <td className="px-5 py-3 text-xs text-[var(--on-surface)]">
                                                {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yy') : '-'}
                                            </td>
                                            <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{v.voucher_number || '-'}</td>
                                            <td className="px-5 py-3 text-xs text-[var(--on-surface)] font-semibold truncate max-w-[200px]">{v.party_name || 'Cash'}</td>
                                            <td className="px-5 py-3 text-xs text-emerald-500 font-black text-right">
                                                {formatCurrency(Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {salesData.length === 0 && (
                                <p className="text-center text-sm text-[var(--text-muted)] py-12">No sales data for this period</p>
                            )}
                        </div>
                    </GlassCard>
                </motion.div>
            )}
        </div>
    );
}
