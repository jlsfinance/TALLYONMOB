import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { X, Printer, Download, Share2, MessageCircle, FileText, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import toast from 'react-hot-toast';

interface TShapeLedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    ledger: any;
    company: any;
    transactions: any[];
    openingBalance: number;
    closingBalance: number;
    dateRange?: { from: string; to: string };
}

function formatCurrency(amount: number) {
    return '₹' + new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    }).format(Math.abs(amount || 0));
}

export const TShapeLedgerModal: React.FC<TShapeLedgerModalProps> = ({
    isOpen,
    onClose,
    ledger,
    company,
    transactions,
    openingBalance,
    closingBalance,
    dateRange
}) => {
    if (!isOpen || !ledger) return null;

    // Build Dr and Cr lists
    const { drList, crList, grandTotal, netBalance, isDebitBalance } = useMemo(() => {
        const dr: any[] = [];
        const cr: any[] = [];

        // 1. Opening Balance
        const openBalNum = Number(openingBalance) || 0;
        if (openBalNum > 0) {
            dr.push({
                date: dateRange?.from || 'Start of FY',
                particulars: 'To Opening Balance (b/f)',
                voucher_type: 'Opening',
                voucher_number: '---',
                amount: openBalNum,
                isOpening: true
            });
        } else if (openBalNum < 0) {
            cr.push({
                date: dateRange?.from || 'Start of FY',
                particulars: 'By Opening Balance (b/f)',
                voucher_type: 'Opening',
                voucher_number: '---',
                amount: Math.abs(openBalNum),
                isOpening: true
            });
        }

        // 2. Sort transactions chronologically
        const sorted = [...transactions].sort((a, b) => {
            const dA = new Date(a.voucher_date || a.created_at || 0).getTime();
            const dB = new Date(b.voucher_date || b.created_at || 0).getTime();
            return dA - dB;
        });

        sorted.forEach(v => {
            const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
            const dateStr = v.voucher_date ? format(new Date(v.voucher_date), 'dd-MM-yyyy') : '---';
            const vType = v.voucher_type || 'Journal';
            const vNo = v.voucher_number || '---';

            // Debit side: Sales, Sales Invoice, Payment made to party, Debit Note
            if (vType === 'Sales' || vType === 'Sales Invoice' || vType === 'Payment' || vType === 'Debit Note') {
                const part = (vType === 'Sales' || vType === 'Sales Invoice')
                    ? 'To Sales A/c'
                    : vType === 'Payment'
                        ? 'To Bank / Cash A/c'
                        : 'To Debit Note A/c';

                dr.push({
                    date: dateStr,
                    particulars: part,
                    voucher_type: vType,
                    voucher_number: vNo,
                    amount: amt,
                    id: v.id
                });
            } else {
                // Credit side: Receipt, Purchase, Purchase Invoice, Credit Note
                const part = vType === 'Receipt'
                    ? 'By Bank / Cash A/c'
                    : (vType === 'Purchase' || vType === 'Purchase Invoice')
                        ? 'By Purchases A/c'
                        : 'By Credit Note A/c';

                cr.push({
                    date: dateStr,
                    particulars: part,
                    voucher_type: vType,
                    voucher_number: vNo,
                    amount: amt,
                    id: v.id
                });
            }
        });

        const subtotalDr = dr.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const subtotalCr = cr.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        let gTotal = 0;
        let diff = 0;
        let isDr = true;

        if (subtotalDr > subtotalCr) {
            diff = subtotalDr - subtotalCr;
            isDr = true;
            gTotal = subtotalDr;
            cr.push({
                date: dateRange?.to || format(new Date(), 'dd-MM-yyyy'),
                particulars: 'By Balance c/d (Closing Balance)',
                voucher_type: 'Closing',
                voucher_number: '---',
                amount: diff,
                isClosing: true
            });
        } else if (subtotalCr > subtotalDr) {
            diff = subtotalCr - subtotalDr;
            isDr = false;
            gTotal = subtotalCr;
            dr.push({
                date: dateRange?.to || format(new Date(), 'dd-MM-yyyy'),
                particulars: 'To Balance c/d (Closing Balance)',
                voucher_type: 'Closing',
                voucher_number: '---',
                amount: diff,
                isClosing: true
            });
        } else {
            gTotal = subtotalDr;
            diff = 0;
        }

        // Equalize array lengths for symmetrical T-shape
        const maxLen = Math.max(dr.length, cr.length);
        while (dr.length < maxLen) {
            dr.push({ empty: true });
        }
        while (cr.length < maxLen) {
            cr.push({ empty: true });
        }

        return {
            drList: dr,
            crList: cr,
            grandTotal: gTotal,
            netBalance: diff,
            isDebitBalance: isDr
        };
    }, [transactions, openingBalance, dateRange]);

    // Printable PDF Handler
    const handleDownloadPDF = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Pop-up blocked. Please allow pop-ups to print or download PDF.');
            return;
        }

        const compName = company?.name || 'Company Account';
        const partyName = ledger?.name || 'Party';
        const dateStr = dateRange?.from && dateRange?.to
            ? `${dateRange.from} to ${dateRange.to}`
            : `Financial Year FY 2025-26`;

        const drRowsHtml = drList.map(item => {
            if (item.empty) {
                return `<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td class="num">&nbsp;</td></tr>`;
            }
            return `<tr class="${item.isClosing ? 'highlight-row' : ''}">
                <td>${item.date}</td>
                <td><strong>${item.particulars}</strong></td>
                <td>${item.voucher_type}</td>
                <td>${item.voucher_number}</td>
                <td class="num">${formatCurrency(item.amount)}</td>
            </tr>`;
        }).join('');

        const crRowsHtml = crList.map(item => {
            if (item.empty) {
                return `<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td class="num">&nbsp;</td></tr>`;
            }
            return `<tr class="${item.isClosing ? 'highlight-row' : ''}">
                <td>${item.date}</td>
                <td><strong>${item.particulars}</strong></td>
                <td>${item.voucher_type}</td>
                <td>${item.voucher_number}</td>
                <td class="num">${formatCurrency(item.amount)}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Ledger Statement - ${partyName}</title>
    <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; color: #111; padding: 15px; }
        .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; }
        .header h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; }
        .header p { font-size: 11px; color: #444; }
        .statement-title { font-size: 14px; font-weight: 700; margin-top: 4px; text-transform: uppercase; color: #000; letter-spacing: 1px; }
        .meta-bar { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 11px; padding: 6px 10px; background: #f4f6f8; border: 1px solid #dcdfe4; border-radius: 4px; }
        .meta-bar strong { color: #000; }
        .t-table-wrap { display: flex; width: 100%; border: 2px solid #000; }
        .t-side { flex: 1; width: 50%; }
        .t-side:first-child { border-right: 2px solid #000; }
        .side-header { background: #e9ecef; text-align: center; font-weight: 800; font-size: 11px; padding: 5px; border-bottom: 1px solid #000; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { background: #f8f9fa; border-bottom: 1px solid #000; padding: 5px 6px; text-align: left; font-weight: 700; font-size: 9.5px; text-transform: uppercase; }
        td { padding: 4.5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
        .num { text-align: right; font-family: "Courier New", Courier, monospace; font-weight: 600; white-space: nowrap; }
        .highlight-row { background: #fffbe6; font-weight: 700; }
        .total-row { background: #e9ecef; font-weight: 800; border-top: 2px solid #000; border-bottom: 2px double #000; }
        .total-row td { padding: 7px 6px; font-size: 11px; }
        .footer-note { margin-top: 15px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #555; }
        .sign-box { border-top: 1px solid #333; padding-top: 5px; width: 200px; text-align: center; }
        @media print {
            body { padding: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${compName}</h1>
        <p>${company?.address || 'GST Registered Enterprise'} • ${company?.gstin ? 'GSTIN: ' + company.gstin : 'Tally Connected Books'}</p>
        <div class="statement-title">T-SHAPE LEDGER ACCOUNT STATEMENT</div>
    </div>

    <div class="meta-bar">
        <div><strong>Party:</strong> ${partyName} ${ledger?.phone ? '(' + ledger.phone + ')' : ''}</div>
        <div><strong>Group:</strong> ${ledger?.parent_group || 'Sundry Debtors'}</div>
        <div><strong>Period:</strong> ${dateStr}</div>
        <div><strong>Closing Balance:</strong> ${formatCurrency(closingBalance)} ${closingBalance >= 0 ? 'Dr (To Receive)' : 'Cr (Payable)'}</div>
    </div>

    <div class="t-table-wrap">
        <!-- DR SIDE -->
        <div class="t-side">
            <div class="side-header">Dr. (Debit Side)</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 16%;">Date</th>
                        <th style="width: 44%;">Particulars</th>
                        <th style="width: 18%;">Vch Type</th>
                        <th style="width: 10%;">Vch #</th>
                        <th style="width: 12%; text-align: right;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${drRowsHtml}
                    <tr class="total-row">
                        <td colspan="4" style="text-align: right;"><strong>TOTAL Dr.</strong></td>
                        <td class="num"><strong>${formatCurrency(grandTotal)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- CR SIDE -->
        <div class="t-side">
            <div class="side-header">Cr. (Credit Side)</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 16%;">Date</th>
                        <th style="width: 44%;">Particulars</th>
                        <th style="width: 18%;">Vch Type</th>
                        <th style="width: 10%;">Vch #</th>
                        <th style="width: 12%; text-align: right;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${crRowsHtml}
                    <tr class="total-row">
                        <td colspan="4" style="text-align: right;"><strong>TOTAL Cr.</strong></td>
                        <td class="num"><strong>${formatCurrency(grandTotal)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="footer-note">
        <div>
            <p><strong>Note:</strong> Generated from TallyLink Cloud ERP. This statement reflects balanced double-entry ledger accounts.</p>
            <p>Generated on ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}</p>
        </div>
        <div class="sign-box">
            For <strong>${compName}</strong><br><br><br>
            Authorized Signatory
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
        };
    </script>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        toast.success('Print / Save PDF dialog opened!');
    };

    // Share via WhatsApp
    const handleShareWhatsApp = () => {
        const phone = ledger?.phone?.replace(/[^0-9]/g, '') || '';
        const msg = `*T-SHAPE LEDGER STATEMENT*\n` +
            `*Company:* ${company?.name || 'Company'}\n` +
            `*Party:* ${ledger?.name}\n` +
            `*Closing Balance:* ${formatCurrency(closingBalance)} ${closingBalance >= 0 ? '(Dr - Due)' : '(Cr - Paid)'}\n` +
            `*Opening Balance:* ${formatCurrency(openingBalance)}\n` +
            `*Total Debit:* ${formatCurrency(grandTotal)}\n` +
            `*Total Credit:* ${formatCurrency(grandTotal)}\n` +
            `_Generated via TallyLink ERP_`;

        window.open(`https://wa.me/${phone ? `91${phone}` : ''}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-6xl max-h-[92vh] bg-[#0E151D] border border-[#1E2B38] text-slate-100 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header Controls */}
                <div className="px-5 py-4 border-b border-[#1E2B38] bg-[#121B24] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                            <FileText size={20} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base font-black text-white tracking-tight truncate">
                                    T-Shape Ledger — {ledger.name}
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                    Double Entry Format
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {company?.name || 'Company'} • Closing Balance: <span className="font-bold text-white">{formatCurrency(closingBalance)} {closingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Download / Print PDF */}
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00E599] hover:bg-[#00D284] text-[#0A1017] text-xs font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                        >
                            <Printer size={15} />
                            Download PDF / Print
                        </button>

                        {/* WhatsApp Share */}
                        <button
                            onClick={handleShareWhatsApp}
                            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
                        >
                            <MessageCircle size={15} />
                            WhatsApp
                        </button>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-[#1A2634] hover:bg-[#223347] text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Sub-header info bar */}
                <div className="px-5 py-2.5 bg-[#0A1017] border-b border-[#1A2634] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4 text-slate-400">
                        <span>Period: <strong className="text-slate-200">{dateRange?.from && dateRange?.to ? `${dateRange.from} to ${dateRange.to}` : 'All Financial Transactions'}</strong></span>
                        <span>Party Group: <strong className="text-slate-200">{ledger.parent_group || 'Sundry Debtors'}</strong></span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-slate-400">
                            Dr Total: <strong className="text-emerald-400 font-mono">{formatCurrency(grandTotal)}</strong>
                        </span>
                        <span className="text-slate-400">
                            Cr Total: <strong className="text-cyan-400 font-mono">{formatCurrency(grandTotal)}</strong>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                            ✓ Balanced
                        </span>
                    </div>
                </div>

                {/* T-Shape Body (Two Columns Side-by-Side) */}
                <div className="flex-1 overflow-auto p-4">
                    <div className="border border-[#1E2B38] rounded-2xl overflow-hidden bg-[#121B24] grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#1E2B38]">
                        {/* DEBIT SIDE (Left) */}
                        <div className="flex flex-col min-w-0">
                            <div className="px-4 py-2.5 bg-rose-500/10 border-b border-[#1E2B38] flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                                    <ArrowUpRight size={14} /> Dr. (Debit Side — Invoices & Debits)
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">{drList.filter(d => !d.empty).length} entries</span>
                            </div>

                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[#0B1118] text-slate-400 border-b border-[#1E2B38] text-[10px] font-bold uppercase">
                                            <th className="px-3 py-2 text-left w-20">Date</th>
                                            <th className="px-3 py-2 text-left">Particulars</th>
                                            <th className="px-3 py-2 text-left w-16">Vch</th>
                                            <th className="px-3 py-2 text-left w-14">#</th>
                                            <th className="px-3 py-2 text-right w-24">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#182330]">
                                        {drList.map((row, idx) => {
                                            if (row.empty) {
                                                return (
                                                    <tr key={`dr_empty_${idx}`} className="h-8">
                                                        <td colSpan={5}>&nbsp;</td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr
                                                    key={row.id || `dr_${idx}`}
                                                    className={`hover:bg-[#182330] transition-colors ${
                                                        row.isClosing ? 'bg-emerald-500/10 font-bold text-emerald-300' : ''
                                                    } ${row.isOpening ? 'bg-amber-500/5 font-semibold text-amber-200' : ''}`}
                                                >
                                                    <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap">{row.date}</td>
                                                    <td className="px-3 py-2 font-medium text-slate-200">
                                                        {row.particulars}
                                                    </td>
                                                    <td className="px-3 py-2 text-[10px] text-slate-400 whitespace-nowrap">{row.voucher_type}</td>
                                                    <td className="px-3 py-2 text-[10px] text-slate-400 whitespace-nowrap">{row.voucher_number}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-white whitespace-nowrap">
                                                        {formatCurrency(row.amount)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-auto px-4 py-3 bg-[#0B1118] border-t-2 border-[#1E2B38] flex items-center justify-between font-bold">
                                <span className="text-xs uppercase text-slate-400">Total Debit (Dr)</span>
                                <span className="text-sm font-mono text-emerald-400">{formatCurrency(grandTotal)}</span>
                            </div>
                        </div>

                        {/* CREDIT SIDE (Right) */}
                        <div className="flex flex-col min-w-0">
                            <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-[#1E2B38] flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                    <ArrowDownLeft size={14} /> Cr. (Credit Side — Receipts & Credits)
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">{crList.filter(c => !c.empty).length} entries</span>
                            </div>

                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[#0B1118] text-slate-400 border-b border-[#1E2B38] text-[10px] font-bold uppercase">
                                            <th className="px-3 py-2 text-left w-20">Date</th>
                                            <th className="px-3 py-2 text-left">Particulars</th>
                                            <th className="px-3 py-2 text-left w-16">Vch</th>
                                            <th className="px-3 py-2 text-left w-14">#</th>
                                            <th className="px-3 py-2 text-right w-24">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#182330]">
                                        {crList.map((row, idx) => {
                                            if (row.empty) {
                                                return (
                                                    <tr key={`cr_empty_${idx}`} className="h-8">
                                                        <td colSpan={5}>&nbsp;</td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr
                                                    key={row.id || `cr_${idx}`}
                                                    className={`hover:bg-[#182330] transition-colors ${
                                                        row.isClosing ? 'bg-cyan-500/10 font-bold text-cyan-300' : ''
                                                    } ${row.isOpening ? 'bg-amber-500/5 font-semibold text-amber-200' : ''}`}
                                                >
                                                    <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap">{row.date}</td>
                                                    <td className="px-3 py-2 font-medium text-slate-200">
                                                        {row.particulars}
                                                    </td>
                                                    <td className="px-3 py-2 text-[10px] text-slate-400 whitespace-nowrap">{row.voucher_type}</td>
                                                    <td className="px-3 py-2 text-[10px] text-slate-400 whitespace-nowrap">{row.voucher_number}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-white whitespace-nowrap">
                                                        {formatCurrency(row.amount)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-auto px-4 py-3 bg-[#0B1118] border-t-2 border-[#1E2B38] flex items-center justify-between font-bold">
                                <span className="text-xs uppercase text-slate-400">Total Credit (Cr)</span>
                                <span className="text-sm font-mono text-cyan-400">{formatCurrency(grandTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Bar */}
                <div className="px-5 py-3 border-t border-[#1E2B38] bg-[#121B24] flex items-center justify-between text-xs text-slate-400">
                    <span>
                        Closing Balance: <strong className="text-white font-mono">{formatCurrency(closingBalance)} {closingBalance >= 0 ? 'Dr (Due to receive)' : 'Cr (Due to pay)'}</strong>
                    </span>
                    <button
                        onClick={handleDownloadPDF}
                        className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                        <Download size={13} /> Direct PDF Download / Print
                    </button>
                </div>
            </div>
        </div>
    );
};
