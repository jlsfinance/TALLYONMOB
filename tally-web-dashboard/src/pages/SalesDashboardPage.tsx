import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { TrendingUp, FileText, DollarSign, BarChart3, Users, Package } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';

export default function SalesDashboardPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('thisMonth');
    const [salesData, setSalesData] = useState<any>(null);
    const [topCustomers, setTopCustomers] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [dailySales, setDailySales] = useState<any[]>([]);
    const [comparison, setComparison] = useState({ current: 0, previous: 0, change: 0 });

    const getPeriodDates = () => {
        const today = new Date();
        switch (period) {
            case 'today': return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisWeek': return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisMonth': return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
            case 'lastMonth': const lastMonth = subMonths(today, 1); return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
            case 'thisQuarter': const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1); return { start: format(quarterStart, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisYear': const fyStart = today.getMonth() >= 3 ? new Date(today.getFullYear(), 3, 1) : new Date(today.getFullYear() - 1, 3, 1); return { start: format(fyStart, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            default: return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
        }
    };

    const getPreviousPeriodDates = () => {
        const today = new Date();
        switch (period) {
            case 'thisMonth': const lastMonth = subMonths(today, 1); return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
            case 'thisQuarter': const prevQStart = subMonths(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1), 3); return { start: format(prevQStart, 'yyyy-MM-dd'), end: format(subMonths(today, 3), 'yyyy-MM-dd') };
            default: const prev = subMonths(today, 1); return { start: format(startOfMonth(prev), 'yyyy-MM-dd'), end: format(endOfMonth(prev), 'yyyy-MM-dd') };
        }
    };

    useEffect(() => {
        if (selectedCompany?.id) loadDashboardData();
    }, [selectedCompany, period]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const { start, end } = getPeriodDates();

            const { data: sales } = await supabase
                .from('sales')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', start)
                .lte('invoice_date', end)
                .eq('is_cancelled', false);

            const { data: salesItems } = await supabase
                .from('sales_items')
                .select('*')
                .eq('company_id', selectedCompany.id);

            const totalSales = (sales || []).reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0);
            const totalInvoices = (sales || []).length;
            const avgInvoice = totalInvoices > 0 ? totalSales / totalInvoices : 0;
            const totalTax = (sales || []).reduce((sum: number, s: any) => sum + (s.cgst_amount || 0) + (s.sgst_amount || 0) + (s.igst_amount || 0), 0);

            setSalesData({ totalSales, totalInvoices, avgInvoice, totalTax, taxableAmount: (sales || []).reduce((sum: number, s: any) => sum + (s.taxable_amount || 0), 0) });

            // Top Customers
            const customerMap = new Map();
            (sales || []).forEach((s: any) => {
                const name = s.party_ledger_name || 'Unknown';
                customerMap.set(name, (customerMap.get(name) || 0) + (s.net_amount || 0));
            });
            setTopCustomers(Array.from(customerMap.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10));

            // Top Products
            const productMap = new Map();
            (salesItems || []).forEach((item: any) => {
                const name = item.item_name || 'Unknown';
                productMap.set(name, { name, qty: (productMap.get(name)?.qty || 0) + (item.quantity || 0), amount: (productMap.get(name)?.amount || 0) + (item.amount || 0) });
            });
            setTopProducts(Array.from(productMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 10));

            // Daily Sales
            const dailyMap = new Map();
            (sales || []).forEach((s: any) => { dailyMap.set(s.invoice_date, (dailyMap.get(s.invoice_date) || 0) + (s.net_amount || 0)); });
            setDailySales(Array.from(dailyMap.entries()).map(([date, amount]) => ({ date, amount })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-30));

            // Comparison
            const prevPeriod = getPreviousPeriodDates();
            const { data: prevSales } = await supabase
                .from('sales')
                .select('net_amount')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', prevPeriod.start)
                .lte('invoice_date', prevPeriod.end)
                .eq('is_cancelled', false);

            const prevTotal = (prevSales || []).reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0);
            const change = prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal * 100) : 0;
            setComparison({ current: totalSales, previous: prevTotal, change });

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
    };

    const getMaxDailySale = () => Math.max(...dailySales.map(d => d.amount), 1);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Sales Dashboard</h1>
                    <p className="text-gray-500 mt-1">Performance analytics</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {['today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${period === p ? 'bg-white text-black border-transparent' : 'bg-[#121214] text-gray-400 border-white/10 hover:bg-[#1C1C1F]'}`}
                        >
                            {p === 'today' && 'Today'}
                            {p === 'thisWeek' && 'Week'}
                            {p === 'thisMonth' && 'Month'}
                            {p === 'lastMonth' && 'Last Month'}
                            {p === 'thisQuarter' && 'Quarter'}
                            {p === 'thisYear' && 'FY'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-500">Loading analytics...</p>
                </div>
            ) : (
                <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/20 rounded-2xl p-5">
                            <p className="text-emerald-400/80 text-sm">Total Sales</p>
                            <p className="text-3xl font-bold text-white mt-1">{formatCurrency(salesData?.totalSales)}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className={`text-sm font-semibold ${comparison.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {comparison.change >= 0 ? '↑' : '↓'} {Math.abs(comparison.change).toFixed(1)}%
                                </span>
                                <span className="text-gray-500 text-xs">vs prior</span>
                            </div>
                        </div>
                        <MetricCard title="Invoices" value={salesData?.totalInvoices?.toString()} icon={<FileText size={20} />} color="blue" />
                        <MetricCard title="Avg. Invoice" value={formatCurrency(salesData?.avgInvoice)} icon={<DollarSign size={20} />} color="purple" />
                        <MetricCard title="Total GST" value={formatCurrency(salesData?.totalTax)} icon={<TrendingUp size={20} />} color="orange" />
                    </div>

                    {/* Daily Sales Chart */}
                    <GlassCard className="p-6">
                        <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 size={18} /> Daily Sales Trend</h2>
                        <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
                            {dailySales.map((day, idx) => (
                                <div key={idx} className="flex flex-col items-center min-w-[24px] group">
                                    <div className="relative flex flex-col justify-end h-32">
                                        <div
                                            className="w-5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-t transition-all hover:from-blue-400"
                                            style={{ height: `${(day.amount / getMaxDailySale()) * 100}%`, minHeight: '4px' }}
                                        />
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10">
                                            {formatCurrency(day.amount)}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">{format(new Date(day.date), 'dd')}</p>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Top Customers & Products */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <GlassCard className="p-6">
                            <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><Users size={18} /> Top Customers</h2>
                            <div className="space-y-4">
                                {topCustomers.slice(0, 5).map((cust, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-600'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white truncate">{cust.name}</p>
                                            <div className="w-full bg-white/5 rounded-full h-1.5 mt-1">
                                                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full" style={{ width: `${(cust.amount / (topCustomers[0]?.amount || 1)) * 100}%` }} />
                                            </div>
                                        </div>
                                        <p className="font-bold text-emerald-400 font-mono">{formatCurrency(cust.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><Package size={18} /> Top Products</h2>
                            <div className="space-y-4">
                                {topProducts.slice(0, 5).map((prod, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold ${idx === 0 ? 'bg-purple-500' : idx === 1 ? 'bg-blue-500' : idx === 2 ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white truncate">{prod.name}</p>
                                            <p className="text-xs text-gray-500">Qty: {prod.qty}</p>
                                        </div>
                                        <p className="font-bold text-purple-400 font-mono">{formatCurrency(prod.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </div>
                </>
            )}
        </div>
    );
}
