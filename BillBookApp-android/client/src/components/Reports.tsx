import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, TrendingUp, BookOpen, Package,
    Scale, Users, PackageSearch, ShieldCheck,
    Download, Calendar, BarChart3, FileText,
    ShoppingCart, Share2, ChevronRight, AlertOctagon
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { formatDate } from '../utils/dateUtils';
import { addBrandedFooter } from '../services/pdfFooterUtils';
import ProfitLossDashboard from './ProfitLossDashboard';
import GSTReports from './GSTReports';
import CustomerAnalytics from './CustomerAnalytics';

interface ReportsProps {
    onBack: () => void;
}

type ReportItem = {
    id: string;
    label: string;
    sub?: string;
    icon: any;
    color: string;
    bgColor: string;
    type: 'DIRECT' | 'CATEGORY';
    children?: ReportItem[];
};

type ReportData = {
    headers: string[];
    rows: (string | number)[][];
    summary?: { label: string; value: string | number }[];
};

const Reports: React.FC<ReportsProps> = ({ onBack }) => {
    const [activeCategory, setActiveCategory] = useState<ReportItem | null>(null);
    const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

    // Global Date State (Defaults to Current Month)
    const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

    // Data State
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(false);

    // ═══════════════════════════════════════════════════════════
    // REPORT CONFIGURATION
    // ═══════════════════════════════════════════════════════════
    const mainReports: ReportItem[] = [
        { id: 'profit_loss', label: 'Profit/Loss Dashboard', sub: 'Real-time P&L Analysis', icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-50', type: 'DIRECT' },
        { id: 'customer_analytics', label: 'Customer Analytics', sub: 'Credit Risk & Behavior', icon: Users, color: 'text-purple-600', bgColor: 'bg-purple-50', type: 'DIRECT' },
        { id: 'bill_profit', label: 'Bill wise profit', sub: 'Profit per invoice', icon: TrendingUp, color: 'text-blue-600', bgColor: 'bg-blue-50', type: 'DIRECT' },
        { id: 'sales_summary', label: 'Sales Summary', sub: 'Total sales & tax', icon: BarChart3, color: 'text-indigo-600', bgColor: 'bg-indigo-50', type: 'DIRECT' },
        { id: 'daybook', label: 'Daybook', sub: 'Daily transaction log', icon: BookOpen, color: 'text-violet-600', bgColor: 'bg-violet-50', type: 'DIRECT' },
        { id: 'stock_summary', label: 'Stock Summary', sub: 'Inventory status', icon: Package, color: 'text-pink-600', bgColor: 'bg-pink-50', type: 'DIRECT' },
        { id: 'balance_sheet', label: 'Balance Sheet', sub: 'Assets & Liabilities', icon: Scale, color: 'text-emerald-600', bgColor: 'bg-emerald-50', type: 'DIRECT' },
    ];

    const categoryReports: ReportItem[] = [
        {
            id: 'cat_party', label: 'Party Reports', sub: 'Outstanding, Ledger, etc.', icon: Users, color: 'text-orange-600', bgColor: 'bg-orange-50', type: 'CATEGORY',
            children: [
                { id: 'party_outstanding', label: 'Party Wise Outstanding', sub: 'Who owes you money', icon: AlertOctagon, color: 'text-red-600', bgColor: 'bg-red-50', type: 'DIRECT' },
                { id: 'inactive_parties', label: 'Inactive Parties', sub: 'No recent transactions', icon: Users, color: 'text-slate-500', bgColor: 'bg-slate-100', type: 'DIRECT' },
            ]
        },
        {
            id: 'cat_item', label: 'Item/Stock Reports', sub: 'Profit, Low Stock, etc.', icon: PackageSearch, color: 'text-teal-600', bgColor: 'bg-teal-50', type: 'CATEGORY',
            children: [
                { id: 'item_sales', label: 'Item Wise Sales', sub: 'Most sold items', icon: ShoppingCart, color: 'text-blue-600', bgColor: 'bg-blue-50', type: 'DIRECT' },
                { id: 'low_stock', label: 'Low Stock Report', sub: 'Reorder alerts', icon: AlertOctagon, color: 'text-red-500', bgColor: 'bg-red-50', type: 'DIRECT' },
            ]
        },
        {
            id: 'cat_gst', label: 'GST Reports', sub: 'GSTR-1, 3B, Tax Summary', icon: ShieldCheck, color: 'text-indigo-600', bgColor: 'bg-indigo-50', type: 'CATEGORY',
            children: [
                { id: 'gstr1', label: 'GSTR-1 (Sales)', sub: 'B2B & B2C invoices', icon: FileText, color: 'text-indigo-600', bgColor: 'bg-indigo-50', type: 'DIRECT' },
            ]
        },
    ];

    // ═══════════════════════════════════════════════════════════
    // DATA GENERATION ENGINE
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (selectedReport) {
            setLoading(true);
            setTimeout(() => { // Simulate calc delay for UI feedback
                const data = generateReportData(selectedReport.id);
                setReportData(data);
                setLoading(false);
            }, 300);
        }
    }, [selectedReport, fromDate, toDate]);

    const generateReportData = (reportId: string): ReportData => {
        const invoices = StorageService.getInvoices();
        const customers = StorageService.getCustomers();
        const products = StorageService.getProducts();

        // Filter invoices by date
        const filteredInvoices = invoices.filter(inv => inv.date >= fromDate && inv.date <= toDate);

        switch (reportId) {
            case 'bill_profit':
                return {
                    headers: ['Date', 'Bill No', 'Customer', 'Sale Amt', 'Cost', 'Profit'],
                    rows: filteredInvoices.map(inv => {
                        // Estimated cost logic (mock: 70% of sale if profit not tracked per item yet)
                        const cost = inv.items.reduce((s, i) => s + ((i.rate * 0.7) * i.quantity), 0);
                        const profit = inv.total - cost;
                        return [
                            formatDate(inv.date), inv.invoiceNumber, inv.customerName,
                            inv.total.toFixed(2), cost.toFixed(2), profit.toFixed(2)
                        ];
                    }),
                    summary: [{ label: 'Total Profit', value: `₹${filteredInvoices.reduce((s, inv) => s + (inv.total * 0.3), 0).toFixed(2)}` }]
                };

            case 'sales_summary':
                return {
                    headers: ['Date', 'Bill No', 'Customer', 'Taxable', 'Tax', 'Total'],
                    rows: filteredInvoices.map(inv => [
                        formatDate(inv.date), inv.invoiceNumber, inv.customerName,
                        inv.subtotal.toFixed(2),
                        ((inv.totalCgst || 0) + (inv.totalSgst || 0) + (inv.totalIgst || 0)).toFixed(2),
                        inv.total.toFixed(2)
                    ]),
                    summary: [{ label: 'Total Sales', value: `₹${filteredInvoices.reduce((s, i) => s + i.total, 0).toFixed(2)}` }]
                };

            case 'daybook':
                // Combine Payments and Invoices
                const payments = StorageService.getPayments().filter(p => p.date >= fromDate && p.date <= toDate);
                const daybookEntries = [
                    ...filteredInvoices.map(i => ({ date: i.date, desc: `Sale - ${i.customerName}`, in: i.total, out: 0, type: 'SALE' })),
                    ...payments.map(p => {
                        const isOut = p.type === 'PAID';
                        return {
                            date: p.date,
                            desc: `${isOut ? 'Payment Out' : 'Payment In'} - ${customers.find(c => c.id === p.customerId)?.company || customers.find(c => c.id === p.customerId)?.name || 'Unknown'}`,
                            in: isOut ? 0 : p.amount,
                            out: isOut ? p.amount : 0,
                            type: isOut ? 'PAYMENT' : 'RECEIPT'
                        };
                    })
                ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                return {
                    headers: ['Date', 'Particulars', 'Amount In', 'Amount Out'],
                    rows: daybookEntries.map(e => [formatDate(e.date), e.desc, e.in || '-', e.out || '-']),
                    summary: [
                        { label: 'Total In', value: `₹${daybookEntries.reduce((s, e) => s + e.in, 0)}` },
                        { label: 'Total Out', value: `₹${daybookEntries.reduce((s, e) => s + e.out, 0)}` }
                    ]
                };

            case 'party_outstanding':
                const outstandingDefaults = customers.filter(c => c.balance > 0);
                return {
                    headers: ['Party Name', 'Phone', 'Balance'],
                    rows: outstandingDefaults.map(c => [c.name, c.phone, c.balance.toFixed(2)]),
                    summary: [{ label: 'Total Receivable', value: `₹${outstandingDefaults.reduce((s, c) => s + c.balance, 0).toFixed(2)}` }]
                };

            case 'stock_summary':
                return {
                    headers: ['Item Name', 'Category', 'Stock Qty', 'Value'],
                    rows: products.map(p => [p.name || 'N/A', p.category || '-', p.stock, (p.stock * p.price).toFixed(2)]),
                    summary: [{ label: 'Total Stock Value', value: `₹${products.reduce((s, p) => s + (p.stock * p.price), 0).toFixed(2)}` }]
                };

            case 'low_stock':
                const lowStockItems = products.filter(p => p.stock < 10);
                return {
                    headers: ['Item Name', 'Stock Qty', 'Reorder Level'],
                    rows: lowStockItems.map(p => [p.name, p.stock, '10']),
                    summary: [{ label: 'Items to Order', value: lowStockItems.length }]
                };

            case 'balance_sheet':
                const totalReceivable = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
                const totalPayable = customers.reduce((s, c) => s + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
                const stockVal = products.reduce((s, p) => s + (p.stock * p.price), 0);
                return {
                    headers: ['Asset Type', 'Amount'],
                    rows: [
                        ['Total Receivables', `₹${totalReceivable.toFixed(2)}`],
                        ['Total Payables', `₹${totalPayable.toFixed(2)}`],
                        ['Inventory Value', `₹${stockVal.toFixed(2)}`],
                        ['Net Worth (Estim.)', `₹${(totalReceivable + stockVal - totalPayable).toFixed(2)}`]
                    ],
                    summary: [{ label: 'Estimated Assets', value: `₹${(totalReceivable + stockVal).toFixed(2)}` }]
                };

            case 'inactive_parties':
                const activeIds = new Set([
                    ...filteredInvoices.map(i => i.customerId),
                    ...StorageService.getPayments().filter(p => p.date >= fromDate && p.date <= toDate).map(p => p.customerId)
                ]);
                const inactive = customers.filter(c => !activeIds.has(c.id));
                return {
                    headers: ['Party Name', 'Phone', 'Closing Balance'],
                    rows: inactive.map(c => [c.name, c.phone, c.balance.toFixed(2)]),
                    summary: [{ label: 'Inactive Count', value: inactive.length }]
                };

            case 'item_sales':
                const itemMap: Record<string, { qty: number, amt: number, name: string }> = {};
                filteredInvoices.forEach(inv => {
                    inv.items.forEach(item => {
                        if (!itemMap[item.productId]) itemMap[item.productId] = { qty: 0, amt: 0, name: item.description };
                        itemMap[item.productId].qty += item.quantity;
                        itemMap[item.productId].amt += (item.totalAmount || (item.rate * item.quantity));
                    });
                });
                const itemRows = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
                return {
                    headers: ['Item Name', 'Qty Sold', 'Total Amount'],
                    rows: itemRows.map(i => [i.name, i.qty, i.amt.toFixed(2)]),
                    summary: [{ label: 'Total Items Sold', value: itemRows.reduce((s, i) => s + i.qty, 0) }]
                };

            case 'gstr1':
                const gstInvoices = filteredInvoices.filter(i => i.gstEnabled);
                return {
                    headers: ['Date', 'Invoice No', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
                    rows: gstInvoices.map(i => [
                        formatDate(i.date), i.invoiceNumber, i.customerGstin || 'URD',
                        (i.subtotal || 0).toFixed(2),
                        (i.totalCgst || 0).toFixed(2),
                        (i.totalSgst || 0).toFixed(2),
                        (i.totalIgst || 0).toFixed(2),
                        (i.total || 0).toFixed(2)
                    ]),
                    summary: [
                        { label: 'Total Tax', value: `₹${gstInvoices.reduce((s, i) => s + (i.totalCgst || 0) + (i.totalSgst || 0) + (i.totalIgst || 0), 0).toFixed(2)}` }
                    ]
                };

            default:
                return { headers: ['Message'], rows: [['Report logic not implemented yet for ' + reportId]] };
        }
    };

    // ═══════════════════════════════════════════════════════════
    // PDF GENERATION (Using Data from State)
    // ═══════════════════════════════════════════════════════════
    const handleDownloadPDF = async () => {
        if (!selectedReport || !reportData) return;

        const doc = new jsPDF();
        const company = StorageService.getCompanyProfile();

        // 1. Header
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text(company.name, 105, 15, { align: "center" });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(company.address, 105, 22, { align: "center" });
        doc.text(`${(company.email || '')} | ${(company.phone || '')}`, 105, 27, { align: "center" });

        doc.line(10, 32, 200, 32);

        // 2. Report Details
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(selectedReport.label.toUpperCase(), 14, 42);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 14, 48);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 53);
        doc.text(`App Powered by Lavneet ❤️`, 14, 58);

        // 3. Table
        autoTable(doc, {
            startY: 60,
            head: [reportData.headers],
            body: reportData.rows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: [245, 247, 250] },
        });

        // 4. Summary Footer (if any)
        if (reportData.summary) {
            let finalY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            reportData.summary.forEach((item) => {
                doc.text(`${item.label}: ${item.value}`, 14, finalY);
                finalY += 6;
            });
        }

        // 5. BRANDED FOOTER WATERMARK
        addBrandedFooter(doc, { showDisclaimer: true });

        // 6. Save/Share Logic
        const fileName = `${selectedReport.id}_${Date.now()}.pdf`;
        if (Capacitor.isNativePlatform()) {
            try {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });
                await Share.share({
                    title: selectedReport.label,
                    url: savedFile.uri,
                    dialogTitle: 'Share Report'
                });
            } catch (e) {
                console.error("Share failed", e);
                alert("Failed to share PDF");
            }
        } else {
            doc.save(fileName);
        }
    };

    // ═══════════════════════════════════════════════════════════
    // UI RENDERING
    // ═══════════════════════════════════════════════════════════

    // --- SPECIAL DASHBOARDS ---
    if (selectedReport?.id === 'profit_loss') {
        return <ProfitLossDashboard onBack={() => setSelectedReport(null)} />;
    }

    if (selectedReport?.id === 'customer_analytics') {
        return <CustomerAnalytics onBack={() => setSelectedReport(null)} />;
    }

    if (selectedReport?.id === 'gst_reports' || selectedReport?.id === 'gstr1') {
        return <GSTReports onBack={() => setSelectedReport(null)} />;
    }

    // --- MODE 1: REPORT PREVIEW ---
    if (selectedReport) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col h-full overflow-hidden">
                {/* 1. Header with Download */}
                <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedReport(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                        </button>
                        <div>
                            <h2 className="font-bold text-lg text-slate-800 dark:text-white leading-none">{selectedReport.label}</h2>
                            <p className="text-[10px] text-slate-400 mt-0.5">Preview Mode</p>
                        </div>
                    </div>

                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
                    >
                        <Share2 className="w-4 h-4" />
                        Download
                    </button>
                </div>

                {/* 2. Sticky Date Filter */}
                <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-sm shrink-0 flex items-center gap-4">
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

                {/* 3. Report Content (Scrollable Table) */}
                <div className="flex-1 overflow-auto p-4 content-container">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-3">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-bold text-slate-400">Loading Report Data...</p>
                        </div>
                    ) : reportData && reportData.rows.length > 0 ? (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                            {/* Summary Cards Row */}
                            {reportData.summary && (
                                <div className="flex flex-wrap gap-2 p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                    {reportData.summary.map((item, idx) => (
                                        <div key={idx} className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{item.label}</p>
                                            <p className="text-sm font-black text-slate-800 dark:text-white">{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Detailed Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                            {reportData.headers.map((h, i) => (
                                                <th key={i} className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {reportData.rows.map((row, rIdx) => (
                                            <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                {row.map((cell, cIdx) => (
                                                    <td key={cIdx} className="p-3 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-60 text-center">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">No Data Found</h3>
                            <p className="text-xs text-slate-400 mt-1">Try changing the date range</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- MODE 2: MAIN GRID (Default) ---
    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                        <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <span className="font-black text-lg text-slate-800 dark:text-white uppercase tracking-tight">Reports Central</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-24">
                {/* 1. Category Tabs / Grid */}
                <AnimatePresence>
                    {!activeCategory && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

                            {/* Popular Section */}
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 ml-1">Popular Reports</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {mainReports.map((report) => (
                                        <motion.button
                                            key={report.id}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setSelectedReport(report)}
                                            className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all text-left group"
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${report.bgColor} group-hover:scale-110 transition-transform`}>
                                                <report.icon className={`w-6 h-6 ${report.color}`} />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-sm text-slate-800 dark:text-white">{report.label}</h4>
                                                <p className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-wide">{report.sub}</p>
                                            </div>
                                            <Download className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* Categories */}
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 ml-1">More Categories</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    {categoryReports.map((cat) => (
                                        <motion.button
                                            key={cat.id}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setActiveCategory(cat)}
                                            className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all text-left"
                                        >
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cat.bgColor}`}>
                                                <cat.icon className={`w-5 h-5 ${cat.color}`} />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-sm text-slate-800 dark:text-white">{cat.label}</h4>
                                                <p className="text-[10px] font-medium text-slate-400">{cat.sub}</p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-slate-300" />
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-12 mb-8 text-center opacity-30">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                                    Report Engine by Lavneet ❤️
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 2. Sub-Category View */}
                <AnimatePresence>
                    {activeCategory && (
                        <motion.div
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            className="fixed inset-0 z-30 bg-slate-50 dark:bg-slate-950 flex flex-col"
                        >
                            <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
                                <button onClick={() => setActiveCategory(null)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                                </button>
                                <span className="font-black text-lg text-slate-800 dark:text-white">{activeCategory.label}</span>
                            </div>

                            <div className="p-4 space-y-3 overflow-y-auto">
                                {activeCategory.children?.map((report) => (
                                    <motion.button
                                        key={report.id}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setSelectedReport(report)}
                                        className="w-full flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-left"
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${report.bgColor}`}>
                                            <report.icon className={`w-5 h-5 ${report.color}`} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-slate-800 dark:text-white">{report.label}</h4>
                                            <p className="text-[10px] text-slate-400">{report.sub}</p>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Reports;
