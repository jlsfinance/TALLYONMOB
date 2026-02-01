import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, FileText, Download, Calendar,
    FileSpreadsheet, Building2, Calculator, ChevronDown
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { Invoice } from '../types';
import { formatDate } from '../utils/dateUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { addBrandedFooter } from '../services/pdfFooterUtils';

interface GSTReportsProps {
    onBack: () => void;
}

interface GSTR1B2B {
    gstin: string;
    partyName: string;
    invoiceNo: string;
    date: string;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
}

interface GSTR1B2C {
    date: string;
    invoiceNo: string;
    taxableValue: number;
    cgst: number;
    sgst: number;
    total: number;
}

interface GSTR3BSummary {
    totalTaxableValue: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTax: number;
    b2bCount: number;
    b2cCount: number;
}

const GSTReports: React.FC<GSTReportsProps> = ({ onBack }) => {
    // Date Range
    const [fromDate, setFromDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    );
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [activeTab, setActiveTab] = useState<'GSTR1' | 'GSTR3B'>('GSTR1');
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Data
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    useEffect(() => {
        loadData();
    }, [fromDate, toDate]);

    const loadData = () => {
        const allInvoices = StorageService.getInvoices();
        const filtered = allInvoices.filter(
            inv => inv.date >= fromDate && inv.date <= toDate && inv.gstEnabled && inv.type !== 'CREDIT_NOTE'
        );
        setInvoices(filtered);
    };

    // GSTR-1 B2B (Registered parties with GSTIN)
    const b2bData = useMemo((): GSTR1B2B[] => {
        return invoices
            .filter(inv => inv.customerGstin && inv.customerGstin.length >= 15)
            .map(inv => ({
                gstin: inv.customerGstin || '',
                partyName: inv.customerName,
                invoiceNo: inv.invoiceNumber,
                date: inv.date,
                taxableValue: inv.subtotal || 0,
                cgst: inv.totalCgst || 0,
                sgst: inv.totalSgst || 0,
                igst: inv.totalIgst || 0,
                total: inv.total
            }));
    }, [invoices]);

    // GSTR-1 B2C (Unregistered parties)
    const b2cData = useMemo((): GSTR1B2C[] => {
        return invoices
            .filter(inv => !inv.customerGstin || inv.customerGstin.length < 15)
            .map(inv => ({
                date: inv.date,
                invoiceNo: inv.invoiceNumber,
                taxableValue: inv.subtotal || 0,
                cgst: inv.totalCgst || 0,
                sgst: inv.totalSgst || 0,
                total: inv.total
            }));
    }, [invoices]);

    // GSTR-3B Summary
    const gstr3bSummary = useMemo((): GSTR3BSummary => {
        return invoices.reduce((acc, inv) => ({
            totalTaxableValue: acc.totalTaxableValue + (inv.subtotal || 0),
            totalCgst: acc.totalCgst + (inv.totalCgst || 0),
            totalSgst: acc.totalSgst + (inv.totalSgst || 0),
            totalIgst: acc.totalIgst + (inv.totalIgst || 0),
            totalTax: acc.totalTax + (inv.totalCgst || 0) + (inv.totalSgst || 0) + (inv.totalIgst || 0),
            b2bCount: acc.b2bCount + (inv.customerGstin && inv.customerGstin.length >= 15 ? 1 : 0),
            b2cCount: acc.b2cCount + (!inv.customerGstin || inv.customerGstin.length < 15 ? 1 : 0)
        }), {
            totalTaxableValue: 0,
            totalCgst: 0,
            totalSgst: 0,
            totalIgst: 0,
            totalTax: 0,
            b2bCount: 0,
            b2cCount: 0
        });
    }, [invoices]);

    // HSN Summary
    const hsnSummary = useMemo(() => {
        const hsnMap: Record<string, { hsn: string; description: string; qty: number; taxableValue: number; cgst: number; sgst: number; igst: number }> = {};

        invoices.forEach(inv => {
            inv.items.forEach(item => {
                const hsn = item.hsn || 'N/A';
                if (!hsnMap[hsn]) {
                    hsnMap[hsn] = {
                        hsn,
                        description: item.description,
                        qty: 0,
                        taxableValue: 0,
                        cgst: 0,
                        sgst: 0,
                        igst: 0
                    };
                }
                hsnMap[hsn].qty += item.quantity;
                hsnMap[hsn].taxableValue += item.baseAmount || (item.rate * item.quantity);
                hsnMap[hsn].cgst += item.cgstAmount || 0;
                hsnMap[hsn].sgst += item.sgstAmount || 0;
                hsnMap[hsn].igst += item.igstAmount || 0;
            });
        });

        return Object.values(hsnMap);
    }, [invoices]);

    // Export to Excel
    const handleExportExcel = async () => {
        const wb = XLSX.utils.book_new();

        // B2B Sheet
        if (b2bData.length > 0) {
            const b2bSheet = XLSX.utils.json_to_sheet(b2bData.map(row => ({
                'GSTIN': row.gstin,
                'Party Name': row.partyName,
                'Invoice No': row.invoiceNo,
                'Date': formatDate(row.date),
                'Taxable Value': row.taxableValue,
                'CGST': row.cgst,
                'SGST': row.sgst,
                'IGST': row.igst,
                'Total': row.total
            })));
            XLSX.utils.book_append_sheet(wb, b2bSheet, 'B2B');
        }

        // B2C Sheet
        if (b2cData.length > 0) {
            const b2cSheet = XLSX.utils.json_to_sheet(b2cData.map(row => ({
                'Invoice No': row.invoiceNo,
                'Date': formatDate(row.date),
                'Taxable Value': row.taxableValue,
                'CGST': row.cgst,
                'SGST': row.sgst,
                'Total': row.total
            })));
            XLSX.utils.book_append_sheet(wb, b2cSheet, 'B2C');
        }

        // HSN Summary Sheet
        if (hsnSummary.length > 0) {
            const hsnSheet = XLSX.utils.json_to_sheet(hsnSummary.map(row => ({
                'HSN Code': row.hsn,
                'Description': row.description,
                'Quantity': row.qty,
                'Taxable Value': row.taxableValue.toFixed(2),
                'CGST': row.cgst.toFixed(2),
                'SGST': row.sgst.toFixed(2),
                'IGST': row.igst.toFixed(2)
            })));
            XLSX.utils.book_append_sheet(wb, hsnSheet, 'HSN Summary');
        }

        // GSTR-3B Summary Sheet
        const summarySheet = XLSX.utils.json_to_sheet([{
            'Total Taxable Value': gstr3bSummary.totalTaxableValue.toFixed(2),
            'Total CGST': gstr3bSummary.totalCgst.toFixed(2),
            'Total SGST': gstr3bSummary.totalSgst.toFixed(2),
            'Total IGST': gstr3bSummary.totalIgst.toFixed(2),
            'Total Tax': gstr3bSummary.totalTax.toFixed(2),
            'B2B Invoices': gstr3bSummary.b2bCount,
            'B2C Invoices': gstr3bSummary.b2cCount
        }]);
        XLSX.utils.book_append_sheet(wb, summarySheet, 'GSTR-3B Summary');

        const fileName = `GST_Report_${fromDate}_to_${toDate}.xlsx`;

        if (Capacitor.isNativePlatform()) {
            try {
                const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: excelBuffer,
                    directory: Directory.Cache
                });
                await Share.share({
                    title: 'GST Report',
                    url: savedFile.uri,
                    dialogTitle: 'Share GST Excel Report'
                });
            } catch (e) {
                console.error("Excel share failed", e);
            }
        } else {
            XLSX.writeFile(wb, fileName);
        }
    };

    // Export to PDF
    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const company = StorageService.getCompanyProfile();

        // Header
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text(company.name, 105, 15, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`GSTIN: ${company.gstin || company.gst || 'N/A'}`, 105, 22, { align: "center" });
        doc.text(company.address, 105, 27, { align: "center" });
        doc.line(10, 32, 200, 32);

        // Title
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(activeTab === 'GSTR1' ? 'GSTR-1 REPORT' : 'GSTR-3B SUMMARY', 105, 42, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 105, 48, { align: "center" });

        let yPos = 58;

        if (activeTab === 'GSTR1') {
            // B2B Section
            if (b2bData.length > 0) {
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text("B2B Invoices (Registered)", 14, yPos);
                yPos += 5;

                autoTable(doc, {
                    startY: yPos,
                    head: [['GSTIN', 'Party', 'Invoice', 'Date', 'Taxable', 'CGST', 'SGST', 'Total']],
                    body: b2bData.map(r => [
                        r.gstin,
                        r.partyName.substring(0, 15),
                        r.invoiceNo,
                        formatDate(r.date),
                        r.taxableValue.toFixed(0),
                        r.cgst.toFixed(0),
                        r.sgst.toFixed(0),
                        r.total.toFixed(0)
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
                    styles: { fontSize: 7 },
                });
                yPos = (doc as any).lastAutoTable.finalY + 10;
            }

            // B2C Section
            if (b2cData.length > 0 && yPos < 250) {
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text("B2C Invoices (Unregistered)", 14, yPos);
                yPos += 5;

                autoTable(doc, {
                    startY: yPos,
                    head: [['Invoice No', 'Date', 'Taxable Value', 'CGST', 'SGST', 'Total']],
                    body: b2cData.map(r => [
                        r.invoiceNo,
                        formatDate(r.date),
                        r.taxableValue.toFixed(0),
                        r.cgst.toFixed(0),
                        r.sgst.toFixed(0),
                        r.total.toFixed(0)
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [34, 197, 94], fontSize: 8 },
                    styles: { fontSize: 8 },
                });
            }
        } else {
            // GSTR-3B Summary
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("Tax Liability Summary", 14, yPos);
            yPos += 8;

            autoTable(doc, {
                startY: yPos,
                head: [['Description', 'Amount (₹)']],
                body: [
                    ['Total Taxable Value', gstr3bSummary.totalTaxableValue.toFixed(2)],
                    ['Central Tax (CGST)', gstr3bSummary.totalCgst.toFixed(2)],
                    ['State Tax (SGST)', gstr3bSummary.totalSgst.toFixed(2)],
                    ['Integrated Tax (IGST)', gstr3bSummary.totalIgst.toFixed(2)],
                    ['Total Tax Payable', gstr3bSummary.totalTax.toFixed(2)],
                ],
                theme: 'grid',
                headStyles: { fillColor: [139, 92, 246] },
                styles: { fontSize: 10 },
            });

            yPos = (doc as any).lastAutoTable.finalY + 15;
            doc.text(`B2B Invoices: ${gstr3bSummary.b2bCount} | B2C Invoices: ${gstr3bSummary.b2cCount}`, 14, yPos);
        }

        addBrandedFooter(doc, { showDisclaimer: true });

        const fileName = `${activeTab}_Report_${Date.now()}.pdf`;
        if (Capacitor.isNativePlatform()) {
            try {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });
                await Share.share({
                    title: `${activeTab} Report`,
                    url: savedFile.uri,
                    dialogTitle: 'Share GST Report'
                });
            } catch (e) {
                console.error("Share failed", e);
            }
        } else {
            doc.save(fileName);
        }
    };

    const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    return (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                        <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg text-slate-800 dark:text-white leading-none">GST Reports</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">GSTR-1 & GSTR-3B Ready</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded-full text-xs font-bold active:scale-95 transition-transform"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-full text-xs font-bold active:scale-95 transition-transform"
                    >
                        <Download className="w-4 h-4" />
                        PDF
                    </button>
                </div>
            </div>

            {/* Date Filter */}
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="w-full flex items-center justify-between bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3"
                >
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {formatDate(fromDate)} - {formatDate(toDate)}
                        </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                </button>

                {showDatePicker && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="flex gap-4 mt-3"
                    >
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">From</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs font-bold outline-none text-slate-700 dark:text-slate-200"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">To</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs font-bold outline-none text-slate-700 dark:text-slate-200"
                            />
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['GSTR1', 'GSTR3B'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-3 text-sm font-bold transition-all relative ${activeTab === tab ? 'text-blue-600' : 'text-slate-400'
                            }`}
                    >
                        {tab === 'GSTR1' ? 'GSTR-1' : 'GSTR-3B'}
                        {activeTab === tab && (
                            <motion.div
                                layoutId="gstTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {activeTab === 'GSTR1' ? (
                    <>
                        {/* B2B Section */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-blue-500" />
                                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">B2B Invoices</h3>
                                </div>
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                    {b2bData.length}
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800">
                                            <th className="p-3 text-[10px] font-black uppercase text-slate-500">GSTIN</th>
                                            <th className="p-3 text-[10px] font-black uppercase text-slate-500">Party</th>
                                            <th className="p-3 text-[10px] font-black uppercase text-slate-500 text-right">Taxable</th>
                                            <th className="p-3 text-[10px] font-black uppercase text-slate-500 text-right">Tax</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {b2bData.length > 0 ? b2bData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="p-3 text-[10px] font-mono text-slate-600 dark:text-slate-400">{row.gstin}</td>
                                                <td className="p-3 text-xs font-medium text-slate-700 dark:text-slate-300">{row.partyName}</td>
                                                <td className="p-3 text-xs font-bold text-slate-700 dark:text-slate-300 text-right">{formatCurrency(row.taxableValue)}</td>
                                                <td className="p-3 text-xs font-bold text-blue-600 text-right">{formatCurrency(row.cgst + row.sgst + row.igst)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-slate-400 text-sm">
                                                    No B2B invoices in this period
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* B2C Section */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-emerald-500" />
                                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">B2C Invoices</h3>
                                </div>
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                                    {b2cData.length}
                                </span>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Taxable</p>
                                        <p className="text-lg font-black text-slate-800 dark:text-white">
                                            {formatCurrency(b2cData.reduce((s, r) => s + r.taxableValue, 0))}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Tax</p>
                                        <p className="text-lg font-black text-emerald-600">
                                            {formatCurrency(b2cData.reduce((s, r) => s + r.cgst + r.sgst, 0))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* GSTR-3B Summary */}
                        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
                            <div className="flex items-center gap-2 mb-4 opacity-80">
                                <Calculator className="w-5 h-5" />
                                <span className="text-xs font-bold uppercase tracking-wider">Tax Liability</span>
                            </div>
                            <p className="text-3xl font-black">{formatCurrency(gstr3bSummary.totalTax)}</p>
                            <p className="text-xs opacity-70 mt-1">Total tax payable for this period</p>
                        </div>

                        {/* Tax Breakdown */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Tax Breakdown</h3>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                <div className="flex justify-between p-4">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Total Taxable Value</span>
                                    <span className="text-sm font-bold text-slate-800 dark:text-white">{formatCurrency(gstr3bSummary.totalTaxableValue)}</span>
                                </div>
                                <div className="flex justify-between p-4">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Central Tax (CGST)</span>
                                    <span className="text-sm font-bold text-blue-600">{formatCurrency(gstr3bSummary.totalCgst)}</span>
                                </div>
                                <div className="flex justify-between p-4">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">State Tax (SGST)</span>
                                    <span className="text-sm font-bold text-emerald-600">{formatCurrency(gstr3bSummary.totalSgst)}</span>
                                </div>
                                <div className="flex justify-between p-4">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Integrated Tax (IGST)</span>
                                    <span className="text-sm font-bold text-orange-600">{formatCurrency(gstr3bSummary.totalIgst)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Invoice Counts */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">B2B Invoices</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-white">{gstr3bSummary.b2bCount}</p>
                            </div>
                            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">B2C Invoices</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-white">{gstr3bSummary.b2cCount}</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="text-center py-4 opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        GST Reports by Lavneet ❤️
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GSTReports;
