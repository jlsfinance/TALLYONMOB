import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { companyApi, supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';

const formatCurrency = (amount) => {
    const absAmount = Math.abs(amount || 0);
    if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(1)} Cr`;
    if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(1)} L`;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(absAmount);
};

const formatCompact = (amount) => {
    const absAmount = Math.abs(amount || 0);
    if (absAmount >= 10000000) return `${(absAmount / 10000000).toFixed(1)}Cr`;
    if (absAmount >= 100000) return `${(absAmount / 100000).toFixed(1)}L`;
    if (absAmount >= 1000) return `${(absAmount / 1000).toFixed(1)}K`;
    return absAmount.toFixed(0);
};

const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white rounded-lg shadow-lg border border-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-800 mb-1">{label}</p>
                {payload.map((entry, i) => (
                    <p key={i} className="text-sm" style={{ color: entry.color }}>
                        {entry.name}: {formatCurrency(entry.value)}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function DashboardPage() {
    const { selectedCompany, companies, selectCompany } = useAuth();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [monthlyRevenue, setMonthlyRevenue] = useState([]);

    useEffect(() => {
        if (selectedCompany) {
            loadSummary();
            loadMonthlyRevenue();
        }
    }, [selectedCompany]);

    const loadSummary = async () => {
        setLoading(true);
        const data = await companyApi.getSummary(selectedCompany.id);
        setSummary(data);
        setLoading(false);
    };

    const loadMonthlyRevenue = async () => {
        try {
            const now = new Date();
            const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total, voucher_date, voucher_type')
                .eq('company_id', selectedCompany.id)
                .in('voucher_type', ['Sales', 'Purchase'])
                .eq('is_deleted', false)
                .gte('voucher_date', from)
                .order('voucher_date', { ascending: true });

            if (!vouchers) return;

            // Group by month
            const byMonth = {};
            vouchers.forEach(v => {
                const monthKey = v.voucher_date.substring(0, 7); // YYYY-MM
                if (!byMonth[monthKey]) byMonth[monthKey] = { revenue: 0, expenses: 0 };
                const amount = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                if (v.voucher_type === 'Sales') {
                    byMonth[monthKey].revenue += amount;
                } else {
                    byMonth[monthKey].expenses += amount;
                }
            });

            const months = Object.entries(byMonth)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, val]) => {
                    const [y, m] = key.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return {
                        month: `${monthNames[parseInt(m) - 1]} '${y.slice(2)}`,
                        revenue: Math.round(val.revenue),
                        expenses: Math.round(val.expenses),
                    };
                });

            setMonthlyRevenue(months);
        } catch (err) {
            console.error('Error loading monthly revenue:', err);
        }
    };

    if (!selectedCompany) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">🏢</div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">No Company Selected</h2>
                    <p className="text-gray-600">Please sync your first company from the Tally Sync App</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Company Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-4 sm:p-6 text-white shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold">{selectedCompany.name}</h1>
                        {selectedCompany.formal_name && (
                            <p className="text-blue-100 mt-1 text-sm sm:text-base">{selectedCompany.formal_name}</p>
                        )}
                        <p className="text-blue-200 text-xs sm:text-sm mt-2">
                            Last Sync: {formatDate(selectedCompany.last_sync_at)}
                        </p>
                    </div>
                    {companies.length > 1 && (
                        <select
                            value={selectedCompany.id}
                            onChange={(e) => {
                                const c = companies.find(c => c.id === e.target.value);
                                if (c) selectCompany(c);
                            }}
                            className="hidden lg:block bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                        >
                            {companies.map(c => (
                                <option key={c.id} value={c.id} className="text-gray-800">
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-white rounded-xl p-6 shadow animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-20 mb-3"></div>
                            <div className="h-8 bg-gray-200 rounded w-24"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <Link to="/ledgers" className="bg-white rounded-xl p-4 sm:p-6 shadow hover:shadow-lg active:bg-gray-50 group">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition">
                                📒
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Ledgers</p>
                                <p className="text-xl sm:text-2xl font-bold text-gray-800">{summary?.ledgerCount || 0}</p>
                            </div>
                        </div>
                    </Link>

                    <Link to="/vouchers" className="bg-white rounded-xl p-4 sm:p-6 shadow hover:shadow-lg active:bg-gray-50 group">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition">
                                📝
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Vouchers</p>
                                <p className="text-xl sm:text-2xl font-bold text-gray-800">{summary?.voucherCount || 0}</p>
                            </div>
                        </div>
                    </Link>

                    <Link to="/stock" className="bg-white rounded-xl p-4 sm:p-6 shadow hover:shadow-lg active:bg-gray-50 group">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition">
                                📦
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Stock Items</p>
                                <p className="text-xl sm:text-2xl font-bold text-gray-800">{summary?.stockCount || 0}</p>
                            </div>
                        </div>
                    </Link>

                    <div className="bg-white rounded-xl p-4 sm:p-6 shadow">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center text-2xl">
                                🔄
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Synced</p>
                                <p className="text-lg font-bold text-green-600">Active</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sales & Purchase Summary */}
            {!loading && summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <Link to="/sales" className="bg-white rounded-xl p-4 sm:p-6 shadow hover:shadow-lg active:bg-gray-50">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Total Sales</h3>
                            <span className="text-3xl">📈</span>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(summary.totalSales)}</p>
                        <p className="text-sm text-gray-500 mt-2">Click to view all sales invoices</p>
                    </Link>

                    <Link to="/purchases" className="bg-white rounded-xl p-4 sm:p-6 shadow hover:shadow-lg active:bg-gray-50">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Total Purchases</h3>
                            <span className="text-3xl">📉</span>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-red-600">{formatCurrency(summary.totalPurchases)}</p>
                        <p className="text-sm text-gray-500 mt-2">Click to view all purchase invoices</p>
                    </Link>
                </div>
            )}

            {/* Revenue Line Chart */}
            {monthlyRevenue.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="bg-white rounded-xl p-4 sm:p-6 shadow"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl">📊</span>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800">Revenue Trend (Last 6 Months)</h3>
                    </div>
                    <div className="h-64 sm:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={monthlyRevenue}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="month"
                                    tick={{ fontSize: 11, fill: '#888' }}
                                    axisLine={{ stroke: '#e5e7eb' }}
                                />
                                <YAxis
                                    tickFormatter={formatCompact}
                                    tick={{ fontSize: 11, fill: '#888' }}
                                    axisLine={{ stroke: '#e5e7eb' }}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Line
                                    type="monotone"
                                    dataKey="revenue"
                                    name="Revenue"
                                    stroke="#22c55e"
                                    strokeWidth={2.5}
                                    dot={{ r: 4, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 6, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
                                    animationBegin={0}
                                    animationDuration={1200}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="expenses"
                                    name="Expenses"
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 5, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                                    animationBegin={300}
                                    animationDuration={1200}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <Link to="/ledgers" className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-blue-50 active:bg-blue-100">
                        <span className="text-2xl mb-2">👥</span>
                        <span className="text-sm font-medium text-gray-700">Parties</span>
                    </Link>
                    <Link to="/sales" className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-green-50 active:bg-green-100">
                        <span className="text-2xl mb-2">🧾</span>
                        <span className="text-sm font-medium text-gray-700">Invoices</span>
                    </Link>
                    <Link to="/stock" className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-purple-50 active:bg-purple-100">
                        <span className="text-2xl mb-2">📊</span>
                        <span className="text-sm font-medium text-gray-700">Stock Report</span>
                    </Link>
                    <Link to="/reports" className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-yellow-50 active:bg-yellow-100">
                        <span className="text-2xl mb-2">📋</span>
                        <span className="text-sm font-medium text-gray-700">Reports</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
