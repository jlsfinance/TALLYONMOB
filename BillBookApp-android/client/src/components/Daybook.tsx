import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Calendar, ChevronLeft, ChevronDown, Filter, FileText, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import { HapticService } from '@/services/hapticService';
import { motion } from 'framer-motion';
import { formatDate } from '../utils/dateUtils';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

interface DaybookProps {
    initialDate?: string | null;
    onViewCustomerLedger?: (customerId: string) => void;
    onBack?: () => void;
}

const Daybook: React.FC<DaybookProps> = ({ initialDate, onViewCustomerLedger, onBack }) => {
    const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [summary, setSummary] = useState({
        total: 0,
        moneyIn: 0,
        moneyOut: 0
    });

    useEffect(() => {
        const invoices = StorageService.getInvoices() || [];
        const payments = StorageService.getPayments() || [];

        // Filter by selected date
        const dayInvoices = invoices.filter(i => i.date === selectedDate);
        const dayPayments = payments.filter(p => p.date === selectedDate);

        // Separate sales from credit notes
        const daySales = dayInvoices.filter(i => i.type !== 'CREDIT_NOTE');
        const dayCreditNotes = dayInvoices.filter(i => i.type === 'CREDIT_NOTE');

        // Calculate summary
        const totalSales = daySales.reduce((sum, i) => sum + i.total, 0);
        const totalPaymentsIn = dayPayments.reduce((sum, p) => sum + p.amount, 0);
        const totalReturns = dayCreditNotes.reduce((sum, i) => sum + i.total, 0);

        setSummary({
            total: totalSales,
            moneyIn: totalPaymentsIn,
            moneyOut: totalReturns
        });

        // Combine transactions
        const combined = [
            ...daySales.map(i => ({
                id: i.id,
                type: 'Sale',
                party: i.customerName,
                customerId: i.customerId,
                total: i.total,
                moneyIn: i.status === 'PAID' ? i.total : 0,
                moneyOut: 0
            })),
            ...dayCreditNotes.map(i => ({
                id: i.id,
                type: 'Sale Return',
                party: i.customerName,
                customerId: i.customerId,
                total: i.total,
                moneyIn: 0,
                moneyOut: i.total
            })),
            ...dayPayments.map(p => {
                const cust = StorageService.getCustomers().find(c => c.id === p.customerId);
                return {
                    id: p.id,
                    type: 'Payment In',
                    party: cust?.company || cust?.name || 'Customer',
                    customerId: p.customerId,
                    total: p.amount,
                    moneyIn: p.amount,
                    moneyOut: 0
                };
            })
        ];

        setTransactions(combined);
    }, [selectedDate]);

    const downloadPDF = async () => {
        HapticService.medium();
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const company = StorageService.getCompanyProfile();
            const pageWidth = doc.internal.pageSize.getWidth();
            let yPos = 15;

            // Header - Company Name
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text(company?.name || 'Day Book', pageWidth / 2, yPos, { align: 'center' });
            yPos += 7;

            // Subtitle
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(`Day Book Report - ${formatDate(selectedDate)}`, pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;

            // Summary Box
            doc.setFillColor(248, 250, 252);
            doc.rect(15, yPos, pageWidth - 30, 12, 'F');
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text(`Total: Rs ${summary.total.toLocaleString('en-IN')}`, 20, yPos + 8);
            doc.setTextColor(16, 185, 129);
            doc.text(`Money In: Rs ${summary.moneyIn.toLocaleString('en-IN')}`, 80, yPos + 8);
            doc.setTextColor(239, 68, 68);
            doc.text(`Money Out: Rs ${summary.moneyOut.toLocaleString('en-IN')}`, 140, yPos + 8);
            yPos += 18;

            // Table Header
            doc.setFillColor(241, 245, 249);
            doc.rect(15, yPos, pageWidth - 30, 8, 'F');
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Type", 18, yPos + 5.5);
            doc.text("Party Name", 45, yPos + 5.5);
            doc.text("Total", 110, yPos + 5.5, { align: 'right' });
            doc.text("Money In", 145, yPos + 5.5, { align: 'right' });
            doc.text("Money Out", 185, yPos + 5.5, { align: 'right' });
            yPos += 10;

            // Table Rows
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            transactions.forEach((tx, idx) => {
                if (yPos > 275) {
                    doc.addPage();
                    yPos = 15;
                }

                // Alternate row background
                if (idx % 2 === 0) {
                    doc.setFillColor(255, 255, 255);
                } else {
                    doc.setFillColor(250, 250, 250);
                }
                doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');

                doc.setTextColor(30, 41, 59);
                doc.text(tx.type, 18, yPos);

                // Truncate long party names
                const partyName = tx.party.length > 25 ? tx.party.slice(0, 23) + '..' : tx.party;
                doc.text(partyName, 45, yPos);

                doc.text(`Rs ${tx.total.toLocaleString('en-IN')}`, 110, yPos, { align: 'right' });

                doc.setTextColor(16, 185, 129);
                doc.text(`Rs ${tx.moneyIn.toLocaleString('en-IN')}`, 145, yPos, { align: 'right' });

                doc.setTextColor(239, 68, 68);
                doc.text(tx.moneyOut > 0 ? `Rs ${tx.moneyOut.toLocaleString('en-IN')}` : '-', 185, yPos, { align: 'right' });

                yPos += 7;
            });

            // Footer line
            yPos += 3;
            doc.setDrawColor(200, 200, 200);
            doc.line(15, yPos, pageWidth - 15, yPos);
            yPos += 5;

            // Generated text
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(`Generated from JLS Bill App on ${new Date().toLocaleDateString()}`, 15, yPos);

            const fileName = `daybook-${selectedDate}.pdf`;

            if (Capacitor.isNativePlatform()) {
                const pdfBase64 = doc.output('datauristring').split(',')[1];

                const cacheResult = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });

                const wantsToShare = confirm(`✅ ${fileName} saved!\n\nTap OK to SHARE/OPEN\nTap Cancel to just SAVE.`);

                if (wantsToShare) {
                    try {
                        await Share.share({
                            title: fileName,
                            url: cacheResult.uri,
                            dialogTitle: 'Share or Open with...'
                        });
                    } catch (shareErr) {
                        console.warn('Share cancelled or failed:', shareErr);
                    }
                }
            } else {
                doc.save(fileName);
            }
        } catch (e) { alert("PDF Save failed"); }
    };

    const downloadExcel = () => {
        HapticService.medium();
        // Simple CSV export
        let csv = 'Type,Customer,Total,Money In,Money Out\n';
        transactions.forEach(tx => {
            csv += `${tx.type},"${tx.party}",${tx.total},${tx.moneyIn},${tx.moneyOut}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daybook-${selectedDate}.csv`;
        a.click();
    };

    const formatDisplayDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* Header */}
            <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onBack ? onBack() : window.history.back()}
                            className="p-2 -ml-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                        >
                            <ChevronLeft className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                        </button>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Day Book</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={downloadPDF}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-md flex items-center gap-1"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            Pdf
                        </button>
                        <button
                            onClick={downloadExcel}
                            className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-md flex items-center gap-1"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            xls
                        </button>
                    </div>
                </div>
            </div>

            {/* Date Selector */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="flex items-center gap-2 text-slate-700 dark:text-slate-300"
                >
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span className="text-sm">Select Date: {formatDisplayDate(selectedDate)}</span>
                    <ChevronDown className="w-4 h-4 text-blue-500 ml-auto" />
                </button>
                {showDatePicker && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-3"
                    >
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => {
                                setSelectedDate(e.target.value);
                                setShowDatePicker(false);
                            }}
                            className="w-full p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-200 text-sm font-medium"
                        />
                    </motion.div>
                )}
            </div>

            {/* Filters Applied */}
            <div className="px-4 py-3 flex items-center justify-between bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-600 dark:text-slate-400">Filters Applied:</span>
                <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400">
                    <Filter className="w-4 h-4" />
                    Filters
                </button>
            </div>

            {/* Firm Filter Chip */}
            <div className="px-4 py-1.5 bg-white dark:bg-slate-950">
                <span className="inline-flex items-center px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-medium text-slate-600 dark:text-slate-400">
                    Firm - All Firms
                </span>
            </div>

            {/* Summary Cards - Full Width Merged Dark Card */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-800 dark:to-slate-900 border-y border-slate-700/50">
                <div className="grid grid-cols-3 divide-x divide-slate-700/50">
                    {/* Total */}
                    <div className="p-2.5 text-center">
                        <p className="text-[9px] text-slate-400 mb-0.5">Total</p>
                        <p className="text-[10px] text-slate-300">₹</p>
                        <p className="text-base font-bold text-white leading-tight">{summary.total.toLocaleString('en-IN')}</p>
                    </div>
                    {/* Money In */}
                    <div className="p-2.5 text-center">
                        <p className="text-[9px] text-slate-400 mb-0.5">Money In</p>
                        <p className="text-[10px] text-emerald-400">₹ {summary.moneyIn.toLocaleString('en-IN')}</p>
                    </div>
                    {/* Money Out */}
                    <div className="p-2.5 text-center">
                        <p className="text-[9px] text-slate-400 mb-0.5">Money Out</p>
                        <p className="text-[10px] text-red-400">₹ {summary.moneyOut.toLocaleString('en-IN')}</p>
                    </div>
                </div>
            </div>

            {/* Transaction List - Compact Single Line */}
            <div>
                {transactions.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                        <p className="text-slate-400 dark:text-slate-500 text-xs">No transactions for this date</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {transactions.map((tx, idx) => (
                            <motion.div
                                key={tx.id || idx}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.02 }}
                                onClick={() => tx.customerId && onViewCustomerLedger?.(tx.customerId)}
                                className="bg-white dark:bg-slate-950 px-3 py-2 flex items-center justify-between active:bg-slate-50 dark:active:bg-slate-900"
                            >
                                {/* Left: Type & Party */}
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-[11px] font-bold text-slate-900 dark:text-white shrink-0">{tx.type}</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{tx.party}</span>
                                </div>

                                {/* Right: Amounts in single row */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                        <p className="text-[8px] text-slate-400 leading-none">Total</p>
                                        <p className="text-[10px] font-medium text-slate-700 dark:text-slate-300">₹{tx.total.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] text-slate-400 leading-none">In</p>
                                        <p className="text-[10px] font-medium text-emerald-500">₹{tx.moneyIn.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] text-slate-400 leading-none">Out</p>
                                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                            {tx.moneyOut > 0 ? `₹${tx.moneyOut.toLocaleString('en-IN')}` : '-'}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Safe Area Padding */}
            <div className="h-20" />
        </div>
    );
};

export default Daybook;
