import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';

export default function SalesDashboardPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('thisMonth');
    const [salesData, setSalesData] = useState(null);
    const [topCustomers, setTopCustomers] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [dailySales, setDailySales] = useState([]);
    const [comparison, setComparison] = useState({ current: 0, previous: 0, change: 0 });

    const getPeriodDates = () => {
        const today = new Date();
        switch (period) {
            case 'today':
                return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisWeek':
                return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisMonth':
                return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
            case 'lastMonth':
                const lastMonth = subMonths(today, 1);
                return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
            case 'thisQuarter':
                const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
                return { start: format(quarterStart, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisYear':
                // Indian Financial Year (April to March)
                const fyStart = today.getMonth() >= 3
                    ? new Date(today.getFullYear(), 3, 1)
                    : new Date(today.getFullYear() - 1, 3, 1);
                return { start: format(fyStart, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            default:
                return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
        }
    };

    useEffect(() => {
        if (selectedCompany?.id) {
            loadDashboardData();
        }
    }, [selectedCompany, period]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const { start, end } = getPeriodDates();

            // Get sales data
            const { data: sales } = await supabase
                .from('sales')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', start)
                .lte('invoice_date', end)
                .eq('is_cancelled', false);

            // Get sales items for product analysis
            const { data: salesItems } = await supabase
                .from('sales_items')
                .select('*')
                .eq('company_id', selectedCompany.id);

            // Calculate summary
            const totalSales = (sales || []).reduce((sum, s) => sum + (s.net_amount || 0), 0);
            const totalInvoices = (sales || []).length;
            const avgInvoice = totalInvoices > 0 ? totalSales / totalInvoices : 0;
            const totalTax = (sales || []).reduce((sum, s) => sum + (s.cgst_amount || 0) + (s.sgst_amount || 0) + (s.igst_amount || 0), 0);

            setSalesData({
                totalSales,
                totalInvoices,
                avgInvoice,
                totalTax,
                taxableAmount: (sales || []).reduce((sum, s) => sum + (s.taxable_amount || 0), 0)
            });

            // Top Customers
            const customerMap = new Map();
            (sales || []).forEach(s => {
                const name = s.party_ledger_name || 'Unknown';
                customerMap.set(name, (customerMap.get(name) || 0) + (s.net_amount || 0));
            });
            const topCust = Array.from(customerMap.entries())
                .map(([name, amount]) => ({ name, amount }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10);
            setTopCustomers(topCust);

            // Top Products (from sales_items)
            const productMap = new Map();
            (salesItems || []).forEach(item => {
                const name = item.item_name || 'Unknown';
                productMap.set(name, {
                    name,
                    qty: (productMap.get(name)?.qty || 0) + (item.quantity || 0),
                    amount: (productMap.get(name)?.amount || 0) + (item.amount || 0)
                });
            });
            const topProd = Array.from(productMap.values())
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10);
            setTopProducts(topProd);

            // Daily Sales Trend
            const dailyMap = new Map();
            (sales || []).forEach(s => {
                const date = s.invoice_date;
                dailyMap.set(date, (dailyMap.get(date) || 0) + (s.net_amount || 0));
            });
            const dailyData = Array.from(dailyMap.entries())
                .map(([date, amount]) => ({ date, amount }))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(-30);
            setDailySales(dailyData);

            // Period comparison
            const prevPeriod = getPreviousPeriodDates();
            const { data: prevSales } = await supabase
                .from('sales')
                .select('net_amount')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', prevPeriod.start)
                .lte('invoice_date', prevPeriod.end)
                .eq('is_cancelled', false);

            const prevTotal = (prevSales || []).reduce((sum, s) => sum + (s.net_amount || 0), 0);
            const change = prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal * 100) : 0;

            setComparison({ current: totalSales, previous: prevTotal, change });

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
        setLoading(false);
    };

    const getPreviousPeriodDates = () => {
        const today = new Date();
        switch (period) {
            case 'thisMonth':
                const lastMonth = subMonths(today, 1);
                return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
            case 'thisQuarter':
                const prevQStart = subMonths(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1), 3);
                return { start: format(prevQStart, 'yyyy-MM-dd'), end: format(subMonths(today, 3), 'yyyy-MM-dd') };
            default:
                const prev = subMonths(today, 1);
                return { start: format(startOfMonth(prev), 'yyyy-MM-dd'), end: format(endOfMonth(prev), 'yyyy-MM-dd') };
        }
    };

    const formatCurrency = (amount) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getMaxDailySale = () => {
        return Math.max(...dailySales.map(d => d.amount), 1);
    };

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">📊 Sales Dashboard</h1>
                    <p className="text-gray-500">{selectedCompany.name}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {['today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${period === p
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {p === 'today' && 'Today'}
                            {p === 'thisWeek' && 'This Week'}
                            {p === 'thisMonth' && 'This Month'}
                            {p === 'lastMonth' && 'Last Month'}
                            {p === 'thisQuarter' && 'Quarter'}
                            {p === 'thisYear' && 'FY'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
                </div>
            ) : (
                <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                            <p className="text-white/80 text-sm">Total Sales</p>
                            <p className="text-3xl font-bold mt-1">{formatCurrency(salesData?.totalSales)}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className={`text-sm ${comparison.change >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                                    {comparison.change >= 0 ? '↑' : '↓'} {Math.abs(comparison.change).toFixed(1)}%
                                </span>
                                <span className="text-white/60 text-xs">vs prev period</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border">
                            <p className="text-gray-500 text-sm">Invoices</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">{salesData?.totalInvoices}</p>
                            <p className="text-xs text-gray-400 mt-2">Total count</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border">
                            <p className="text-gray-500 text-sm">Avg. Invoice</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(salesData?.avgInvoice)}</p>
                            <p className="text-xs text-gray-400 mt-2">Per invoice</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border">
                            <p className="text-gray-500 text-sm">Total GST</p>
                            <p className="text-3xl font-bold text-orange-600 mt-1">{formatCurrency(salesData?.totalTax)}</p>
                            <p className="text-xs text-gray-400 mt-2">CGST + SGST + IGST</p>
                        </div>
                    </div>

                    {/* Daily Sales Chart */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border mb-6">
                        <h2 className="font-semibold text-gray-900 mb-4">📈 Daily Sales Trend</h2>
                        <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
                            {dailySales.map((day, idx) => (
                                <div key={idx} className="flex flex-col items-center min-w-[24px] group">
                                    <div className="relative flex flex-col justify-end h-32">
                                        <div
                                            className="w-5 bg-gradient-to-t from-indigo-600 to-purple-500 rounded-t transition-all hover:from-indigo-500"
                                            style={{ height: `${(day.amount / getMaxDailySale()) * 100}%`, minHeight: '4px' }}
                                        ></div>
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                            {formatCurrency(day.amount)}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1 rotate-[-45deg] origin-top-left">
                                        {format(new Date(day.date), 'dd')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Customers & Products */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Top Customers */}
                        <div className="bg-white rounded-2xl p-6 shadow-sm border">
                            <h2 className="font-semibold text-gray-900 mb-4">🏆 Top Customers</h2>
                            <div className="space-y-3">
                                {topCustomers.slice(0, 5).map((cust, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'
                                            }`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{cust.name}</p>
                                            <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                                                <div
                                                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full"
                                                    style={{ width: `${(cust.amount / (topCustomers[0]?.amount || 1)) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <p className="font-bold text-emerald-600">{formatCurrency(cust.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Top Products */}
                        <div className="bg-white rounded-2xl p-6 shadow-sm border">
                            <h2 className="font-semibold text-gray-900 mb-4">📦 Top Products</h2>
                            <div className="space-y-3">
                                {topProducts.slice(0, 5).map((prod, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold ${idx === 0 ? 'bg-purple-500' : idx === 1 ? 'bg-indigo-400' : idx === 2 ? 'bg-blue-400' : 'bg-gray-300'
                                            }`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{prod.name}</p>
                                            <p className="text-xs text-gray-400">Qty: {prod.qty}</p>
                                        </div>
                                        <p className="font-bold text-purple-600">{formatCurrency(prod.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
