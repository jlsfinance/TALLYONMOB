import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, TrendingUp, DollarSign,
    Package, Calendar, PieChart as PieChartIcon,
    BarChart3, Share2
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { Invoice, Product } from '../types';
import { formatDate } from '../utils/dateUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { addBrandedFooter } from '../services/pdfFooterUtils';

interface ProfitLossDashboardProps {
    onBack: () => void;
}

interface ProductProfit {
    name: string;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
    quantity: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const ProfitLossDashboard: React.FC<ProfitLossDashboardProps> = ({ onBack }) => {
    // Date Range
    const [fromDate, setFromDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    );
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [datePreset, setDatePreset] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('MONTH');

    // Data
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [purchases, setPurchases] = useState<Invoice[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    useEffect(() => {
        loadData();
    }, [fromDate, toDate]);

    const loadData = () => {
        const allInvoices = StorageService.getInvoices();
        const allPurchases = StorageService.getPurchases();
        const allProducts = StorageService.getProducts();

        // Filter by date
        const filteredInvoices = allInvoices.filter(
            inv => inv.date >= fromDate && inv.date <= toDate && inv.type !== 'CREDIT_NOTE'
        );
        const filteredPurchases = allPurchases.filter(
            p => p.date >= fromDate && p.date <= toDate
        );

        setInvoices(filteredInvoices);
        setPurchases(filteredPurchases);
        setProducts(allProducts);
    };

    // Calculate P&L metrics
    const metrics = useMemo(() => {
        const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);

        // Calculate cost from purchases or estimate from product purchase prices
        let totalCost = 0;
        invoices.forEach(inv => {
            inv.items.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                const costPrice = product?.purchasePrice || (item.rate * 0.7); // 70% if no purchase price
                totalCost += costPrice * item.quantity;
            });
        });

        const grossProfit = totalRevenue - totalCost;
        const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        // Expenses from purchases
        const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);

        return {
            totalRevenue,
            totalCost,
            grossProfit,
            profitMargin,
            totalPurchases,
            netProfit: grossProfit - totalPurchases
        };
    }, [invoices, purchases, products]);

    // Product-wise profit analysis
    const productProfits = useMemo((): ProductProfit[] => {
        const profitMap: Record<string, ProductProfit> = {};

        invoices.forEach(inv => {
            inv.items.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                const costPrice = product?.purchasePrice || (item.rate * 0.7);
                const revenue = item.rate * item.quantity;
                const cost = costPrice * item.quantity;
                const profit = revenue - cost;

                if (!profitMap[item.productId]) {
                    profitMap[item.productId] = {
                        name: item.description || product?.name || 'Unknown',
                        revenue: 0,
                        cost: 0,
                        profit: 0,
                        margin: 0,
                        quantity: 0
                    };
                }

                profitMap[item.productId].revenue += revenue;
                profitMap[item.productId].cost += cost;
                profitMap[item.productId].profit += profit;
                profitMap[item.productId].quantity += item.quantity;
            });
        });

        // Calculate margins
        return Object.values(profitMap)
            .map(p => ({
                ...p,
                margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
            }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10); // Top 10
    }, [invoices, products]);

    // Best selling products chart data
    const bestSellingData = useMemo(() => {
        return productProfits.slice(0, 5).map(p => ({
            name: p.name.length > 12 ? p.name.substring(0, 12) + '...' : p.name,
            quantity: p.quantity,
            revenue: Math.round(p.revenue)
        }));
    }, [productProfits]);

    // Profit distribution for pie chart
    const profitDistribution = useMemo(() => {
        return productProfits.slice(0, 6).map((p, idx) => ({
            name: p.name.length > 10 ? p.name.substring(0, 10) + '...' : p.name,
            value: Math.round(p.profit),
            color: COLORS[idx % COLORS.length]
        }));
    }, [productProfits]);

    // Date preset handlers
    const handlePresetChange = (preset: 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM') => {
        setDatePreset(preset);
        const today = new Date();

        switch (preset) {
            case 'TODAY':
                setFromDate(today.toISOString().split('T')[0]);
                setToDate(today.toISOString().split('T')[0]);
                break;
            case 'WEEK':
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                setFromDate(weekAgo.toISOString().split('T')[0]);
                setToDate(today.toISOString().split('T')[0]);
                break;
            case 'MONTH':
                setFromDate(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
                setToDate(today.toISOString().split('T')[0]);
                break;
        }
    };

    // PDF Export
    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const company = StorageService.getCompanyProfile();

        // Header
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text(company.name, 105, 15, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(company.address, 105, 22, { align: "center" });
        doc.line(10, 28, 200, 28);

        // Title
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("PROFIT & LOSS STATEMENT", 105, 38, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 105, 45, { align: "center" });

        // Summary
        let yPos = 55;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Summary", 14, yPos);
        yPos += 8;

        const summaryData = [
            ['Total Revenue', `₹${metrics.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            ['Cost of Goods Sold', `₹${metrics.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            ['Gross Profit', `₹${metrics.grossProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            ['Profit Margin', `${metrics.profitMargin.toFixed(1)}%`],
        ];

        autoTable(doc, {
            startY: yPos,
            head: [['Description', 'Amount']],
            body: summaryData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 10 },
        });

        // Product-wise profit
        yPos = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Product-wise Profit Analysis", 14, yPos);
        yPos += 8;

        autoTable(doc, {
            startY: yPos,
            head: [['Product', 'Qty Sold', 'Revenue', 'Cost', 'Profit', 'Margin %']],
            body: productProfits.map(p => [
                p.name,
                p.quantity.toString(),
                `₹${p.revenue.toFixed(0)}`,
                `₹${p.cost.toFixed(0)}`,
                `₹${p.profit.toFixed(0)}`,
                `${p.margin.toFixed(1)}%`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [34, 197, 94] },
            styles: { fontSize: 9 },
        });

        addBrandedFooter(doc, { showDisclaimer: true });

        // Save/Share
        const fileName = `PnL_Report_${Date.now()}.pdf`;
        if (Capacitor.isNativePlatform()) {
            try {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });
                await Share.share({
                    title: 'Profit & Loss Report',
                    url: savedFile.uri,
                    dialogTitle: 'Share P&L Report'
                });
            } catch (e) {
                console.error("Share failed", e);
            }
        } else {
            doc.save(fileName);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                        <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg text-slate-800 dark:text-white leading-none">Profit & Loss</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">Real-time P&L Analysis</p>
                    </div>
                </div>

                <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
                >
                    <Share2 className="w-4 h-4" />
                    Export
                </button>
            </div>

            {/* Date Filter */}
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex gap-2 mb-3">
                    {(['TODAY', 'WEEK', 'MONTH', 'CUSTOM'] as const).map(preset => (
                        <button
                            key={preset}
                            onClick={() => handlePresetChange(preset)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${datePreset === preset
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>

                {datePreset === 'CUSTOM' && (
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">From</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="bg-transparent w-full text-xs font-bold outline-none text-slate-700 dark:text-slate-200"
                                />
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">To</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="bg-transparent w-full text-xs font-bold outline-none text-slate-700 dark:text-slate-200"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white"
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Revenue</span>
                        </div>
                        <p className="text-xl font-black">₹{metrics.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white"
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Gross Profit</span>
                        </div>
                        <p className="text-xl font-black">₹{metrics.grossProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white"
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <Package className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Cost</span>
                        </div>
                        <p className="text-xl font-black">₹{metrics.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className={`bg-gradient-to-br ${metrics.profitMargin >= 20 ? 'from-green-500 to-green-600' : metrics.profitMargin >= 10 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600'} rounded-2xl p-4 text-white`}
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <BarChart3 className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Margin</span>
                        </div>
                        <p className="text-xl font-black">{metrics.profitMargin.toFixed(1)}%</p>
                    </motion.div>
                </div>

                {/* Best Selling Products Chart */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-500" />
                        Best Selling Products
                    </h3>
                    {bestSellingData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={bestSellingData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis type="number" tick={{ fontSize: 10 }} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                                <Tooltip
                                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']}
                                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                />
                                <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                            No sales data for this period
                        </div>
                    )}
                </div>

                {/* Profit Distribution Pie Chart */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-purple-500" />
                        Profit Distribution
                    </h3>
                    {profitDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={profitDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {profitDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Profit']}
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
                            No profit data for this period
                        </div>
                    )}
                </div>

                {/* Product-wise Profit Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            Product Margin Analysis
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Product</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Qty</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Revenue</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Profit</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Margin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {productProfits.length > 0 ? productProfits.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="p-3 text-xs font-medium text-slate-700 dark:text-slate-300">{p.name}</td>
                                        <td className="p-3 text-xs font-bold text-slate-600 dark:text-slate-400 text-right">{p.quantity}</td>
                                        <td className="p-3 text-xs font-bold text-blue-600 text-right">₹{p.revenue.toFixed(0)}</td>
                                        <td className={`p-3 text-xs font-bold text-right ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            ₹{p.profit.toFixed(0)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.margin >= 30 ? 'bg-emerald-100 text-emerald-700' :
                                                p.margin >= 15 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                {p.margin.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                                            No sales data for this period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center py-4 opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        P&L Engine by Lavneet ❤️
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProfitLossDashboard;
