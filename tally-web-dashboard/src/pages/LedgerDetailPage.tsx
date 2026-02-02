import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
    ArrowLeft, Phone, Mail, MapPin, FileText, Receipt,
    MessageCircle, Calendar, Printer, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownLeft, Filter, Download
} from 'lucide-react';
import { GlassCard, MetricCard, Badge, Button, Spinner } from '@/components/ui/GlassUI';
import { format, startOfYear, startOfMonth, subMonths, isBefore, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const formatCurrency = (amount: number) => {
    const val = Math.abs(amount || 0);
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(val);
};

const getFYStart = () => {
    const now = new Date();
    const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return new Date(year, 3, 1).toISOString().split('T')[0];
};

export default function LedgerDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [ledger, setLedger] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'transactions' | 'info'>('transactions');
    const [fromDate, setFromDate] = useState(getFYStart());
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [summary, setSummary] = useState({
        totalDebit: 0,
        totalCredit: 0,
        netAmount: 0,
        count: 0
    });

    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id && selectedCompany) loadLedgerDetails();
    }, [id, selectedCompany, fromDate, toDate]);

    const loadLedgerDetails = async () => {
        setLoading(true);
        try {
            // 1. Fetch Ledger Master
            const { data: ledgerData } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', id)
                .single();

            if (!ledgerData) throw new Error('Ledger not found');
            setLedger(ledgerData);

            // 2. Calculate Dynamic Opening Balance
            // Opening = Initial Tally Opening + All transactions before fromDate
            const { data: beforeVouchers } = await supabase
                .from('vouchers')
                .select('voucher_type, total_amount')
                .eq('company_id', selectedCompany.id)
                .eq('party_name', ledgerData.name)
                .lt('voucher_date', fromDate);

            let dynamicOpening = Number(ledgerData.opening_balance) || 0;

            (beforeVouchers || []).forEach(v => {
                const amount = Math.abs(Number(v.total_amount) || 0);
                // Unified logic for Dr/Cr
                const vType = v.voucher_type;
                const isDebit = ['Sales', 'Payment', 'Debit Note'].includes(vType);
                const isCredit = ['Purchase', 'Receipt', 'Credit Note'].includes(vType);

                if (isDebit) dynamicOpening += amount;
                if (isCredit) dynamicOpening -= amount;
            });

            setOpeningBalance(dynamicOpening);

            // 3. Fetch Transactions in Range
            const { data: rangeVouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('party_name', ledgerData.name)
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .order('voucher_date', { ascending: true });

            // 4. Process Running Balance
            let running = dynamicOpening;
            let totalDr = 0;
            let totalCr = 0;

            const processed = (rangeVouchers || []).map(v => {
                const amount = Math.abs(Number(v.total_amount) || 0);
                const isDebit = ['Sales', 'Payment', 'Debit Note'].includes(v.voucher_type);
                const isCredit = ['Purchase', 'Receipt', 'Credit Note'].includes(v.voucher_type);

                const debitAmt = isDebit ? amount : 0;
                const creditAmt = isCredit ? amount : 0;

                totalDr += debitAmt;
                totalCr += creditAmt;
                running = running + debitAmt - creditAmt;

                return {
                    ...v,
                    debit: debitAmt,
                    credit: creditAmt,
                    balance: running
                };
            });

            setTransactions(processed);
            setSummary({
                totalDebit: totalDr,
                totalCredit: totalCr,
                netAmount: running,
                count: processed.length
            });

        } catch (error: any) {
            console.error('Error loading ledger:', error);
            toast.error(error.message || 'Failed to load ledger');
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsApp = () => {
        if (ledger?.phone) {
            const message = `Hello ${ledger.name}, your balance as on ${format(parseISO(toDate), 'dd MMM yyyy')} is ${formatCurrency(summary.netAmount)} ${summary.netAmount >= 0 ? 'Dr' : 'Cr'}.`;
            window.open(`https://wa.me/91${ledger.phone}?text=${encodeURIComponent(message)}`, '_blank');
        }
    };

    const handlePrint = () => {
        if (!ledger || transactions.length === 0) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Ledger Statement - ${ledger.name}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a; font-size: 11px; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                        .company-name { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
                        .ledger-name { font-size: 16px; font-weight: 700; margin-top: 5px; color: #333; }
                        .period { font-size: 11px; color: #666; margin-top: 5px; font-weight: 600; }
                        
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th { background: #f8f9fa; border: 1px solid #000; padding: 10px 8px; text-transform: uppercase; font-size: 10px; font-weight: 800; text-align: left; }
                        td { border: 1px solid #000; padding: 8px; vertical-align: top; }
                        
                        .text-right { text-align: right; }
                        .font-bold { font-weight: 700; }
                        .font-black { font-weight: 900; }
                        
                        .summary-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; border: 1px solid #000; padding: 15px; }
                        .summary-item { text-align: center; }
                        .summary-label { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #666; margin-bottom: 4px; }
                        .summary-value { font-size: 14px; font-weight: 800; }
                        
                        .opening-row { background: #f0f7ff; }
                        .closing-row { background: #fffbeb; font-weight: 800; }
                        
                        @media print {
                            body { padding: 0; }
                            @page { margin: 1cm; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-name">${selectedCompany.name}</div>
                        <div class="ledger-name">Ledger: ${ledger.name}</div>
                        <div class="period">Period: ${format(parseISO(fromDate), 'dd MMM yyyy')} to ${format(parseISO(toDate), 'dd MMM yyyy')}</div>
                    </div>

                    <div class="summary-grid">
                        <div class="summary-item">
                            <div class="summary-label">Opening Balance</div>
                            <div class="summary-value">${formatCurrency(openingBalance)} ${openingBalance >= 0 ? 'Dr' : 'Cr'}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Total Debit</div>
                            <div class="summary-value">${formatCurrency(summary.totalDebit)}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Total Credit</div>
                            <div class="summary-value">${formatCurrency(summary.totalCredit)}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Closing Balance</div>
                            <div class="summary-value">${formatCurrency(summary.netAmount)} ${summary.netAmount >= 0 ? 'Dr' : 'Cr'}</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 12%">Date</th>
                                <th>Particulars</th>
                                <th style="width: 15%" class="text-right">Debit (₹)</th>
                                <th style="width: 15%" class="text-right">Credit (₹)</th>
                                <th style="width: 15%" class="text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="opening-row font-bold">
                                <td>${format(parseISO(fromDate), 'dd-MM-yy')}</td>
                                <td>Opening Balance (B/F)</td>
                                <td class="text-right">-</td>
                                <td class="text-right">-</td>
                                <td class="text-right">${formatCurrency(openingBalance)} ${openingBalance >= 0 ? 'Dr' : 'Cr'}</td>
                            </tr>
                            ${transactions.map(v => `
                                <tr>
                                    <td>${format(new Date(v.voucher_date), 'dd-MM-yy')}</td>
                                    <td>
                                        <div class="font-bold">${v.voucher_type} #${v.voucher_number || '---'}</div>
                                        ${v.narration ? `<div style="font-size: 9px; color: #666; margin-top: 2px;">${v.narration}</div>` : ''}
                                    </td>
                                    <td class="text-right">${v.debit > 0 ? formatCurrency(v.debit) : '-'}</td>
                                    <td class="text-right">${v.credit > 0 ? formatCurrency(v.credit) : '-'}</td>
                                    <td class="text-right">${formatCurrency(v.balance)} ${v.balance >= 0 ? 'Dr' : 'Cr'}</td>
                                </tr>
                            `).join('')}
                            <tr class="closing-row">
                                <td colspan="2" class="text-right">Period Totals / Closing Balance</td>
                                <td class="text-right">${formatCurrency(summary.totalDebit)}</td>
                                <td class="text-right">${formatCurrency(summary.totalCredit)}</td>
                                <td class="text-right">${formatCurrency(summary.netAmount)} ${summary.netAmount >= 0 ? 'Dr' : 'Cr'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style="margin-top: 40px; font-size: 9px; color: #999; text-align: center;">
                        Generated via BillBook App on ${format(new Date(), 'dd MMM yyyy HH:mm')}
                    </div>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        // Wait for fonts/styles to load then print
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    };

    if (loading && !ledger) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Spinner size="lg" />
                <p className="text-[var(--text-muted)] animate-pulse uppercase text-[10px] font-black tracking-widest">Crunching Ledger Data...</p>
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="text-center py-20 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Ledger not found</p>
                <button onClick={() => navigate('/ledgers')} className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                    ← Back to Ledgers
                </button>
            </div>
        );
    }

    const isDebit = ledger.closing_balance > 0;

    return (
        <div className="space-y-6 pb-24 max-w-7xl mx-auto">
            {/* Action Bar */}
            <div className="flex items-center justify-between sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl py-4 border-b border-[var(--border)] -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/ledgers')} className="p-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-black text-[var(--on-surface)] truncate max-w-[200px] sm:max-w-none uppercase tracking-tighter">{ledger.name}</h1>
                        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{ledger.parent_group}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={handlePrint} icon={<Printer size={16} />} size="sm">
                        Print
                    </Button>
                    <Button variant="glow" onClick={handleWhatsApp} icon={<MessageCircle size={16} />} size="sm">
                        Share
                    </Button>
                </div>
            </div>

            <GlassCard className="p-4 border-b border-[var(--border)]">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="flex-1 flex items-center gap-3 w-full">
                        <div className="flex-1 relative group">
                            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)] group-focus-within:scale-110 transition-transform" />
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-2.5 pl-10 pr-3 text-[11px] font-black text-[var(--on-surface)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] focus:outline-none transition-all"
                            />
                            <div className="absolute -top-2 left-3 px-2 bg-[var(--background)] text-[8px] font-black text-[var(--primary)] uppercase tracking-tighter rounded-full border border-[var(--border)]">From Date</div>
                        </div>
                        <div className="text-[var(--text-muted)] font-black opacity-30 px-1">→</div>
                        <div className="flex-1 relative group">
                            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)] group-focus-within:scale-110 transition-transform" />
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-2.5 pl-10 pr-3 text-[11px] font-black text-[var(--on-surface)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] focus:outline-none transition-all"
                            />
                            <div className="absolute -top-2 left-3 px-2 bg-[var(--background)] text-[8px] font-black text-[var(--primary)] uppercase tracking-tighter rounded-full border border-[var(--border)]">To Date</div>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => {
                        setFromDate(getFYStart());
                        setToDate(new Date().toISOString().split('T')[0]);
                    }}>Reset</Button>
                </div>
            </GlassCard>

            {/* Dynamic Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-4 border-l-4 border-blue-500 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-500 opacity-[0.05] rounded-full blur-xl group-hover:scale-150 transition-transform" />
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Opening
                    </p>
                    <div className="flex items-baseline gap-1">
                        <p className={`text-xl font-black ${openingBalance >= 0 ? 'text-blue-500' : 'text-red-500'} tracking-tighter`}>
                            {formatCurrency(openingBalance)}
                        </p>
                        <span className="text-[9px] font-black text-[var(--text-muted)] opacity-50 uppercase">{openingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                    </div>
                </GlassCard>

                <MetricCard
                    title="Total Debit"
                    value={formatCurrency(summary.totalDebit)}
                    icon={<TrendingUp size={16} />}
                    color="success"
                    subtitle={`${summary.count} entries`}
                />

                <MetricCard
                    title="Total Credit"
                    value={formatCurrency(summary.totalCredit)}
                    icon={<TrendingDown size={16} />}
                    color="warning"
                />

                <GlassCard className={`p-4 border-l-4 ${summary.netAmount >= 0 ? 'border-emerald-500' : 'border-red-500'} relative overflow-hidden group`}>
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500 opacity-[0.05] rounded-full blur-xl group-hover:scale-150 transition-transform" />
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Closing
                    </p>
                    <div className="flex items-baseline gap-1">
                        <p className={`text-xl font-black ${summary.netAmount >= 0 ? 'text-emerald-500' : 'text-red-500'} tracking-tighter`}>
                            {formatCurrency(summary.netAmount)}
                        </p>
                        <span className="text-[9px] font-black text-[var(--text-muted)] opacity-50 uppercase">{summary.netAmount >= 0 ? 'Dr' : 'Cr'}</span>
                    </div>
                    <p className="text-[7px] font-bold text-[var(--text-muted)] uppercase mt-1 opacity-60">
                        {summary.netAmount >= 0 ? 'Account Receivable' : 'Account Payable'}
                    </p>
                </GlassCard>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-[var(--border)] overflow-x-auto scrollbar-hide">
                {[
                    { id: 'transactions', label: 'Ledger Statement', icon: <FileText size={14} /> },
                    { id: 'info', label: 'Company Info', icon: <MapPin size={14} /> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                            ${activeTab === tab.id ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}
                        `}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'transactions' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <GlassCard padding="none" className="overflow-hidden">
                        {loading ? (
                            <div className="py-20 flex justify-center"><Spinner /></div>
                        ) : transactions.length === 0 ? (
                            <div className="py-20 flex flex-col items-center text-[var(--text-muted)] opacity-50">
                                <Receipt size={48} className="mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-[2px]">No transactions in this range</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[var(--surface-variant)]/50">
                                        <tr>
                                            <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Date</th>
                                            <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Voucher Details</th>
                                            <th className="px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest text-emerald-500">Debit (Dr)</th>
                                            <th className="px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest text-red-500">Credit (Cr)</th>
                                            <th className="px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest text-[var(--on-surface)]">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {/* Dynamic Opening Balance Row */}
                                        <tr className="bg-blue-500/5">
                                            <td className="px-4 py-3 text-[10px] font-bold text-[var(--text-muted)]">{format(parseISO(fromDate), 'dd MMM yyyy')}</td>
                                            <td className="px-4 py-3">
                                                <div className="text-[10px] font-black uppercase tracking-tight">Opening Balance (B/F)</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">-</td>
                                            <td className="px-4 py-3 text-right">-</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className={`text-[11px] font-black ${openingBalance >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                                    {formatCurrency(openingBalance)} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                                                </div>
                                            </td>
                                        </tr>

                                        {transactions.map((v, idx) => (
                                            <tr
                                                key={v.voucher_id || idx}
                                                className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                                                onClick={() => navigate(`/vouchers/${v.voucher_id || v.id}`)}
                                            >
                                                <td className="px-4 py-4">
                                                    <div className="text-[11px] font-bold text-[var(--on-surface)]">
                                                        {format(new Date(v.voucher_date), 'dd MMM')}
                                                    </div>
                                                    <div className="text-[9px] text-[var(--text-muted)]">
                                                        {format(new Date(v.voucher_date), 'yyyy')}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Badge variant={v.debit > 0 ? 'info' : 'warning'} className="text-[7px] font-black uppercase py-0 px-1.5 h-4">
                                                            {v.voucher_type}
                                                        </Badge>
                                                        <span className="text-[10px] font-black text-[var(--primary)] uppercase tracking-wider">#{v.voucher_number || '---'}</span>
                                                    </div>
                                                    {v.narration && (
                                                        <p className="text-[9px] text-[var(--text-muted)] line-clamp-1 italic">{v.narration}</p>
                                                    )}
                                                </td>
                                                <td className={`px-4 py-4 text-right font-mono text-xs font-bold ${v.debit > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]/30'}`}>
                                                    {v.debit > 0 ? formatCurrency(v.debit) : '-'}
                                                </td>
                                                <td className={`px-4 py-4 text-right font-mono text-xs font-bold ${v.credit > 0 ? 'text-red-500' : 'text-[var(--text-muted)]/30'}`}>
                                                    {v.credit > 0 ? formatCurrency(v.credit) : '-'}
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className={`text-[11px] font-black ${v.balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        {formatCurrency(v.balance)} {v.balance >= 0 ? 'Dr' : 'Cr'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Dynamic Totals / Closing Row */}
                                        <tr className="bg-[var(--surface-variant)]/30 border-t-2 border-[var(--border)]">
                                            <td colSpan={2} className="px-4 py-5 text-right text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                                Period Totals & Closing
                                            </td>
                                            <td className="px-4 py-5 text-right text-xs font-black text-emerald-500 border-x border-[var(--border)]/20">
                                                {formatCurrency(summary.totalDebit)}
                                            </td>
                                            <td className="px-4 py-5 text-right text-xs font-black text-red-500 border-r border-[var(--border)]/20">
                                                {formatCurrency(summary.totalCredit)}
                                            </td>
                                            <td className="px-4 py-5 text-right">
                                                <div className={`text-base font-black ${summary.netAmount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {formatCurrency(summary.netAmount)} {summary.netAmount >= 0 ? 'Dr' : 'Cr'}
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </GlassCard>
                </div>
            )}

            {activeTab === 'info' && (
                <GlassCard className="p-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <div>
                            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" /> GST Details
                            </p>
                            <p className="text-sm font-black text-[var(--on-surface)] font-mono tracking-wider">{ledger.gstin || 'NOT REGISTERED'}</p>
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mt-1">PAN: {ledger.pan || '---'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--info)]" /> Credit Terms
                            </p>
                            <p className="text-sm font-black text-[var(--on-surface)]">{ledger.credit_days || 0} DAYS</p>
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mt-1">Limit: {formatCurrency(ledger.credit_limit || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" /> Location
                            </p>
                            <p className="text-sm font-black text-[var(--on-surface)] uppercase">{ledger.state || 'UNKNOWN'}</p>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-1 line-clamp-2">{ledger.address || 'No address provided'}</p>
                        </div>
                    </div>

                    <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-wrap gap-4">
                        {ledger.phone && (
                            <a href={`tel:${ledger.phone}`} className="flex items-center gap-3 px-6 py-3 bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl text-[var(--on-surface)] hover:bg-[var(--primary-glow)] transition-all group">
                                <Phone size={16} className="text-[var(--primary)] group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-black">{ledger.phone}</span>
                            </a>
                        )}
                        {ledger.email && (
                            <a href={`mailto:${ledger.email}`} className="flex items-center gap-3 px-6 py-3 bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl text-[var(--on-surface)] hover:bg-[var(--info-glow)] transition-all group">
                                <Mail size={16} className="text-[var(--info)] group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-black uppercase text-ellipsis overflow-hidden">{ledger.email}</span>
                            </a>
                        )}
                    </div>
                </GlassCard>
            )}

            {/* Sticky Mobile Share */}
            <div className="fixed bottom-24 right-6 sm:hidden z-50">
                <button
                    onClick={handleWhatsApp}
                    className="w-14 h-14 rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/40 flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                    <MessageCircle size={24} fill="white" />
                </button>
            </div>
        </div>
    );
}
