import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, AlertTriangle, TrendingUp, Clock,
    Star, DollarSign, BarChart3, Share2
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { Customer, Invoice, Payment } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { addBrandedFooter } from '../services/pdfFooterUtils';

interface CustomerAnalyticsProps {
    onBack: () => void;
}

interface CustomerScore {
    customer: Customer;
    totalPurchases: number;
    totalPayments: number;
    avgDaysToPayment: number;
    purchaseFrequency: number; // purchases per month
    outstandingBalance: number;
    creditRiskScore: number; // 0-100, higher = riskier
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    lastPurchaseDate: string | null;
    invoiceCount: number;
}

const CustomerAnalytics: React.FC<CustomerAnalyticsProps> = ({ onBack }) => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LATE_PAYERS' | 'TOP_CUSTOMERS'>('OVERVIEW');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        setCustomers(StorageService.getCustomers());
        setInvoices(StorageService.getInvoices());
        setPayments(StorageService.getPayments());
    };

    // Calculate customer scores
    const customerScores = useMemo((): CustomerScore[] => {
        return customers.map(customer => {
            const customerInvoices = invoices.filter(inv => inv.customerId === customer.id && inv.type !== 'CREDIT_NOTE');
            const customerPayments = payments.filter(p => p.customerId === customer.id && p.type !== 'PAID');

            const totalPurchases = customerInvoices.reduce((sum, inv) => sum + inv.total, 0);
            const totalPayments = customerPayments.reduce((sum, p) => sum + p.amount, 0);

            // Calculate avg days to payment
            let totalDays = 0;
            let paymentCount = 0;
            customerPayments.forEach(payment => {
                const relatedInvoice = customerInvoices.find(inv =>
                    new Date(payment.date) >= new Date(inv.date)
                );
                if (relatedInvoice) {
                    const daysDiff = Math.floor(
                        (new Date(payment.date).getTime() - new Date(relatedInvoice.date).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (daysDiff >= 0 && daysDiff < 365) {
                        totalDays += daysDiff;
                        paymentCount++;
                    }
                }
            });
            const avgDaysToPayment = paymentCount > 0 ? totalDays / paymentCount : 30;

            // Purchase frequency (purchases per month over last 6 months)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const recentInvoices = customerInvoices.filter(inv => new Date(inv.date) >= sixMonthsAgo);
            const purchaseFrequency = recentInvoices.length / 6;

            // Last purchase date
            const sortedInvoices = [...customerInvoices].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const lastPurchaseDate = sortedInvoices[0]?.date || null;

            // Credit Risk Score (0-100, higher = riskier)
            let riskScore = 0;

            // Factor 1: Outstanding balance (40% weight)
            const balanceRatio = customer.balance / Math.max(totalPurchases, 1);
            riskScore += Math.min(balanceRatio * 100, 40);

            // Factor 2: Avg days to pay (30% weight)
            if (avgDaysToPayment > 60) riskScore += 30;
            else if (avgDaysToPayment > 30) riskScore += 20;
            else if (avgDaysToPayment > 15) riskScore += 10;

            // Factor 3: Purchase frequency (30% weight) - lower frequency = higher risk if balance exists
            if (customer.balance > 0 && purchaseFrequency < 0.5) riskScore += 30;
            else if (customer.balance > 0 && purchaseFrequency < 1) riskScore += 15;

            const creditRiskScore = Math.min(Math.round(riskScore), 100);
            const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
                creditRiskScore >= 60 ? 'HIGH' :
                    creditRiskScore >= 30 ? 'MEDIUM' : 'LOW';

            return {
                customer,
                totalPurchases,
                totalPayments,
                avgDaysToPayment: Math.round(avgDaysToPayment),
                purchaseFrequency: Math.round(purchaseFrequency * 10) / 10,
                outstandingBalance: customer.balance,
                creditRiskScore,
                riskLevel,
                lastPurchaseDate,
                invoiceCount: customerInvoices.length
            };
        }).filter(cs => cs.invoiceCount > 0); // Only customers with transactions
    }, [customers, invoices, payments]);

    // Late payers (sorted by avg days)
    const latePayers = useMemo(() =>
        [...customerScores]
            .filter(cs => cs.avgDaysToPayment > 15 || cs.outstandingBalance > 0)
            .sort((a, b) => b.avgDaysToPayment - a.avgDaysToPayment)
            .slice(0, 10),
        [customerScores]
    );

    // Top customers by revenue
    const topCustomers = useMemo(() =>
        [...customerScores]
            .sort((a, b) => b.totalPurchases - a.totalPurchases)
            .slice(0, 10),
        [customerScores]
    );

    // Chart data for top customers
    const topCustomersChartData = useMemo(() =>
        topCustomers.slice(0, 5).map(cs => ({
            name: cs.customer.name.length > 10 ? cs.customer.name.substring(0, 10) + '...' : cs.customer.name,
            revenue: Math.round(cs.totalPurchases)
        })),
        [topCustomers]
    );

    // Summary stats
    const summaryStats = useMemo(() => {
        const highRiskCount = customerScores.filter(cs => cs.riskLevel === 'HIGH').length;
        const totalOutstanding = customerScores.reduce((sum, cs) => sum + Math.max(cs.outstandingBalance, 0), 0);
        const avgPaymentDays = customerScores.length > 0
            ? Math.round(customerScores.reduce((sum, cs) => sum + cs.avgDaysToPayment, 0) / customerScores.length)
            : 0;
        const regularBuyers = customerScores.filter(cs => cs.purchaseFrequency >= 1).length;

        return { highRiskCount, totalOutstanding, avgPaymentDays, regularBuyers };
    }, [customerScores]);

    // Export PDF
    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const company = StorageService.getCompanyProfile();

        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text(company.name, 105, 15, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Customer Behavior Analytics", 105, 22, { align: "center" });
        doc.line(10, 28, 200, 28);

        // Summary
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Summary", 14, 38);

        autoTable(doc, {
            startY: 42,
            head: [['Metric', 'Value']],
            body: [
                ['Total Outstanding', `₹${summaryStats.totalOutstanding.toLocaleString()}`],
                ['High Risk Customers', summaryStats.highRiskCount.toString()],
                ['Avg. Payment Days', `${summaryStats.avgPaymentDays} days`],
                ['Regular Buyers (1+/month)', summaryStats.regularBuyers.toString()]
            ],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
        });

        let yPos = (doc as any).lastAutoTable.finalY + 15;

        // High Risk Customers
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("High Risk Customers", 14, yPos);

        const highRiskCustomers = customerScores.filter(cs => cs.riskLevel === 'HIGH');
        autoTable(doc, {
            startY: yPos + 5,
            head: [['Customer', 'Outstanding', 'Avg Days', 'Risk Score']],
            body: highRiskCustomers.map(cs => [
                cs.customer.name,
                `₹${cs.outstandingBalance.toFixed(0)}`,
                `${cs.avgDaysToPayment} days`,
                `${cs.creditRiskScore}%`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [239, 68, 68] },
            styles: { fontSize: 9 },
        });

        addBrandedFooter(doc, { showDisclaimer: true });

        const fileName = `Customer_Analytics_${Date.now()}.pdf`;
        if (Capacitor.isNativePlatform()) {
            try {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });
                await Share.share({ title: 'Customer Analytics', url: savedFile.uri });
            } catch (e) {
                console.error("Share failed", e);
            }
        } else {
            doc.save(fileName);
        }
    };

    const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    const getRiskBadge = (level: 'LOW' | 'MEDIUM' | 'HIGH') => {
        switch (level) {
            case 'HIGH': return 'bg-red-100 text-red-700';
            case 'MEDIUM': return 'bg-yellow-100 text-yellow-700';
            case 'LOW': return 'bg-green-100 text-green-700';
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
                        <h2 className="font-bold text-lg text-slate-800 dark:text-white leading-none">Customer Analytics</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">Behavior & Credit Risk</p>
                    </div>
                </div>

                <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold active:scale-95 transition-transform"
                >
                    <Share2 className="w-4 h-4" />
                    Export
                </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['OVERVIEW', 'LATE_PAYERS', 'TOP_CUSTOMERS'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-3 text-xs font-bold transition-all relative ${activeTab === tab ? 'text-blue-600' : 'text-slate-400'
                            }`}
                    >
                        {tab === 'OVERVIEW' ? 'Overview' : tab === 'LATE_PAYERS' ? 'Late Payers' : 'Top Buyers'}
                        {activeTab === tab && (
                            <motion.div
                                layoutId="analyticsTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {activeTab === 'OVERVIEW' && (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">High Risk</span>
                                </div>
                                <p className="text-2xl font-black">{summaryStats.highRiskCount}</p>
                                <p className="text-[10px] opacity-70">customers need attention</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <DollarSign className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Outstanding</span>
                                </div>
                                <p className="text-xl font-black">{formatCurrency(summaryStats.totalOutstanding)}</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <Clock className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Avg Payment</span>
                                </div>
                                <p className="text-2xl font-black">{summaryStats.avgPaymentDays}</p>
                                <p className="text-[10px] opacity-70">days avg</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white"
                            >
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    <Star className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Regular</span>
                                </div>
                                <p className="text-2xl font-black">{summaryStats.regularBuyers}</p>
                                <p className="text-[10px] opacity-70">active buyers</p>
                            </motion.div>
                        </div>

                        {/* Top Customers Chart */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-blue-500" />
                                Top Customers by Revenue
                            </h3>
                            {topCustomersChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={topCustomersChartData} layout="vertical">
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
                                    No customer data available
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'LATE_PAYERS' && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Clock className="w-4 h-4 text-orange-500" />
                                Late Payers (by avg days)
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {latePayers.length > 0 ? latePayers.map((cs, idx) => (
                                <div key={idx} className="p-4 flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">{cs.customer.name}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-[10px] text-slate-400">
                                                Avg: <span className="font-bold text-orange-600">{cs.avgDaysToPayment} days</span>
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                Due: <span className="font-bold text-red-600">{formatCurrency(cs.outstandingBalance)}</span>
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getRiskBadge(cs.riskLevel)}`}>
                                        {cs.riskLevel}
                                    </span>
                                </div>
                            )) : (
                                <div className="p-8 text-center text-slate-400 text-sm">
                                    No late payers found 🎉
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'TOP_CUSTOMERS' && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                Top Customers by Revenue
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {topCustomers.length > 0 ? topCustomers.map((cs, idx) => (
                                <div key={idx} className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-sm">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{cs.customer.name}</p>
                                            <p className="text-[10px] text-slate-400">
                                                {cs.invoiceCount} orders • {cs.purchaseFrequency}/month
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-emerald-600">{formatCurrency(cs.totalPurchases)}</p>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${getRiskBadge(cs.riskLevel)}`}>
                                            {cs.riskLevel} RISK
                                        </span>
                                    </div>
                                </div>
                            )) : (
                                <div className="p-8 text-center text-slate-400 text-sm">
                                    No customer data available
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center py-4 opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        Analytics by Lavneet ❤️
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CustomerAnalytics;
