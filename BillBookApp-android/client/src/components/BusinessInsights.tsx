/**
 * Business Insights Dashboard Component
 * Shows visual analytics with charts and graphs for sales, inventory, and business metrics
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    X, TrendingUp, TrendingDown, BarChart3, PieChart as PieChartIcon,
    DollarSign, Users, Package, ArrowUpRight, ArrowDownRight,
    RefreshCw, ShoppingCart
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { StorageService } from '../services/storageService';
import { Invoice } from '../types';

interface BusinessInsightsProps {
    onClose: () => void;
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const BusinessInsights: React.FC<BusinessInsightsProps> = ({ onClose }) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<'7D' | '30D' | '90D' | '1Y'>('30D');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const inv = await StorageService.getInvoices();
            setInvoices(inv);
        } catch (error) {
            console.error('Failed to load data:', error);
        }
        setLoading(false);
    };

    // Calculate date range
    const dateRange = useMemo(() => {
        const now = new Date();
        const days = timeRange === '7D' ? 7 : timeRange === '30D' ? 30 : timeRange === '90D' ? 90 : 365;
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        return { start, end: now, days };
    }, [timeRange]);

    // Filter invoices by date range
    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            const invDate = new Date(inv.date);
            return invDate >= dateRange.start && invDate <= dateRange.end;
        });
    }, [invoices, dateRange]);

    // Sales Trend Data (for Area Chart)
    const salesTrendData = useMemo(() => {
        const data: { [key: string]: { date: string; sales: number; invoices: number } } = {};

        filteredInvoices.forEach(inv => {
            const date = new Date(inv.date).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric'
            });
            if (!data[date]) {
                data[date] = { date, sales: 0, invoices: 0 };
            }
            data[date].sales += inv.total;
            data[date].invoices += 1;
        });

        return Object.values(data).slice(-15); // Last 15 data points
    }, [filteredInvoices]);

    // Revenue by Payment Mode (for Pie Chart)
    const paymentModeData = useMemo(() => {
        const data: { [key: string]: number } = {};

        filteredInvoices.forEach(inv => {
            const mode = inv.paymentMode || 'CREDIT';
            data[mode] = (data[mode] || 0) + inv.total;
        });

        return Object.entries(data).map(([name, value]) => ({
            name: name === 'CASH' ? 'Cash' : name === 'ONLINE' ? 'Online' : 'Credit',
            value,
        }));
    }, [filteredInvoices]);

    // Top Customers (for Bar Chart)
    const topCustomersData = useMemo(() => {
        const customerSales: { [key: string]: { name: string; sales: number; invoices: number } } = {};

        filteredInvoices.forEach(inv => {
            if (!customerSales[inv.customerId]) {
                customerSales[inv.customerId] = { name: inv.customerName, sales: 0, invoices: 0 };
            }
            customerSales[inv.customerId].sales += inv.total;
            customerSales[inv.customerId].invoices += 1;
        });

        return Object.values(customerSales)
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5);
    }, [filteredInvoices]);

    // Top Products by Revenue
    const topProductsData = useMemo(() => {
        const productSales: { [key: string]: { name: string; revenue: number; quantity: number } } = {};

        filteredInvoices.forEach(inv => {
            inv.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = { name: item.description, revenue: 0, quantity: 0 };
                }
                productSales[item.productId].revenue += item.totalAmount || item.baseAmount;
                productSales[item.productId].quantity += item.quantity;
            });
        });

        return Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
    }, [filteredInvoices]);

    // Summary Stats
    const stats = useMemo(() => {
        const totalSales = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0);
        const totalInvoices = filteredInvoices.length;
        const paidInvoices = filteredInvoices.filter(inv => inv.status === 'PAID').length;
        const avgInvoiceValue = totalInvoices > 0 ? totalSales / totalInvoices : 0;
        const pendingAmount = filteredInvoices
            .filter(inv => inv.status !== 'PAID')
            .reduce((sum, inv) => sum + (inv.balanceDue || inv.total), 0);

        // Compare with previous period
        const prevStart = new Date(dateRange.start.getTime() - dateRange.days * 24 * 60 * 60 * 1000);
        const prevInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.date);
            return invDate >= prevStart && invDate < dateRange.start;
        });
        const prevSales = prevInvoices.reduce((sum, inv) => sum + inv.total, 0);
        const salesGrowth = prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : 0;

        return {
            totalSales,
            totalInvoices,
            paidInvoices,
            avgInvoiceValue,
            pendingAmount,
            salesGrowth,
            collectionRate: totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0,
        };
    }, [filteredInvoices, invoices, dateRange]);

    const formatCurrency = (value: number) => {
        if (value >= 100000) {
            return `₹${(value / 100000).toFixed(1)}L`;
        } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(1)}K`;
        }
        return `₹${value.toFixed(0)}`;
    };

    const formatFullCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center">
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-2xl max-h-[95vh] overflow-hidden"
            >
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <BarChart3 className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">Business Insights</h2>
                                <p className="text-xs text-slate-500">Visual analytics & trends</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Time Range Selector */}
                    <div className="flex gap-2 mt-4">
                        {(['7D', '30D', '90D', '1Y'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${timeRange === range
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                    }`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(95vh-150px)] pb-8">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <div className="p-4 grid grid-cols-2 gap-3">
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                                    <div className="flex items-center justify-between mb-2">
                                        <DollarSign className="w-5 h-5 opacity-80" />
                                        <div className={`flex items-center gap-1 text-xs font-bold ${stats.salesGrowth >= 0 ? 'text-emerald-300' : 'text-red-300'
                                            }`}>
                                            {stats.salesGrowth >= 0 ? (
                                                <ArrowUpRight className="w-3 h-3" />
                                            ) : (
                                                <ArrowDownRight className="w-3 h-3" />
                                            )}
                                            {Math.abs(stats.salesGrowth).toFixed(1)}%
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black">{formatCurrency(stats.totalSales)}</p>
                                    <p className="text-xs opacity-80">Total Revenue</p>
                                </div>

                                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white">
                                    <div className="flex items-center justify-between mb-2">
                                        <ShoppingCart className="w-5 h-5 opacity-80" />
                                        <span className="text-xs font-bold text-white/80">
                                            {stats.collectionRate.toFixed(0)}% paid
                                        </span>
                                    </div>
                                    <p className="text-2xl font-black">{stats.totalInvoices}</p>
                                    <p className="text-xs opacity-80">Invoices</p>
                                </div>

                                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
                                    <Users className="w-5 h-5 opacity-80 mb-2" />
                                    <p className="text-2xl font-black">{formatCurrency(stats.avgInvoiceValue)}</p>
                                    <p className="text-xs opacity-80">Avg. Invoice</p>
                                </div>

                                <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-4 text-white">
                                    <TrendingDown className="w-5 h-5 opacity-80 mb-2" />
                                    <p className="text-2xl font-black">{formatCurrency(stats.pendingAmount)}</p>
                                    <p className="text-xs opacity-80">Pending</p>
                                </div>
                            </div>

                            {/* Sales Trend Chart */}
                            <div className="px-4 mb-4">
                                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-blue-500" />
                                        Sales Trend
                                    </h3>
                                    <div className="h-48">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={salesTrendData}>
                                                <defs>
                                                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis
                                                    dataKey="date"
                                                    tick={{ fontSize: 10 }}
                                                    stroke="#94a3b8"
                                                />
                                                <YAxis
                                                    tick={{ fontSize: 10 }}
                                                    stroke="#94a3b8"
                                                    tickFormatter={(value) => formatCurrency(value)}
                                                />
                                                <Tooltip
                                                    formatter={(value: number) => [formatFullCurrency(value), 'Sales']}
                                                    contentStyle={{
                                                        backgroundColor: '#1e293b',
                                                        border: 'none',
                                                        borderRadius: '12px',
                                                        color: 'white',
                                                    }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="sales"
                                                    stroke="#3B82F6"
                                                    strokeWidth={2}
                                                    fill="url(#salesGradient)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Mode Pie Chart */}
                            <div className="px-4 mb-4">
                                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <PieChartIcon className="w-4 h-4 text-purple-500" />
                                        Revenue by Payment Mode
                                    </h3>
                                    <div className="h-48 flex items-center">
                                        <ResponsiveContainer width="50%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={paymentModeData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={40}
                                                    outerRadius={70}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {paymentModeData.map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="flex-1 space-y-2">
                                            {paymentModeData.map((entry, index) => (
                                                <div key={entry.name} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-3 h-3 rounded-full"
                                                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                                        />
                                                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                                            {entry.name}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                                        {formatCurrency(entry.value)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Top Customers */}
                            <div className="px-4 mb-4">
                                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-emerald-500" />
                                        Top Customers
                                    </h3>
                                    <div className="space-y-2">
                                        {topCustomersData.map((customer, index) => (
                                            <div key={index} className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                        {customer.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {customer.invoices} invoices
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                        {formatCurrency(customer.sales)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        {topCustomersData.length === 0 && (
                                            <p className="text-center text-sm text-slate-500 py-4">No data available</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Top Products */}
                            <div className="px-4 mb-4">
                                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-orange-500" />
                                        Top Products
                                    </h3>
                                    <div className="space-y-2">
                                        {topProductsData.map((product, index) => (
                                            <div key={index} className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-xs">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                        {product.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {product.quantity} units sold
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                        {formatCurrency(product.revenue)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        {topProductsData.length === 0 && (
                                            <p className="text-center text-sm text-slate-500 py-4">No data available</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default BusinessInsights;
