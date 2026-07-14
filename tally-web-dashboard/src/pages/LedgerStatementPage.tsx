import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, ledgerApi } from '@/lib/supabase';
import { ArrowLeft, Printer, MessageCircle, Calendar, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';
import { format } from 'date-fns';

export default function LedgerStatementPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { selectedCompany } = useAuth() as any;
    const printRef = useRef<HTMLDivElement>(null);

    const [ledger, setLedger] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 3);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [summary, setSummary] = useState({ debit: 0, credit: 0, closing: 0 });

    useEffect(() => {
        if (selectedCompany?.id && id) loadLedgerStatement();
    }, [selectedCompany, id, fromDate, toDate]);

    const loadLedgerStatement = async () => {
        setLoading(true);
        try {
            const { data: ledgerData } = await ledgerApi.getById(id!);
            setLedger(ledgerData);

            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .or(`party_name.eq.${ledgerData?.name},ledger_name.eq.${ledgerData?.name}`)
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .order('voucher_date', { ascending: true })
                .limit(5000);

            let runningBalance = ledgerData?.opening_balance || 0;
            setOpeningBalance(runningBalance);

            const processedTxns = (vouchers || []).map((v: any) => {
                const isDebit = ['Receipt', 'Sales', 'Debit Note'].includes(v.voucher_type);
                const amount = Math.abs(v.total_amount || 0);
                const debit = isDebit ? amount : 0;
                const credit = !isDebit ? amount : 0;
                runningBalance = runningBalance + debit - credit;
                return { ...v, debit, credit, balance: runningBalance };
            });

            setTransactions(processedTxns);

            const totalDebit = processedTxns.reduce((sum: number, t: any) => sum + t.debit, 0);
            const totalCredit = processedTxns.reduce((sum: number, t: any) => sum + t.credit, 0);
            setSummary({ debit: totalDebit, credit: totalCredit, closing: runningBalance });

        } catch (error) {
            console.error('Error loading statement:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Math.abs(amount || 0));

    const handlePrint = () => {
        const printContent = printRef.current;
        if (!printContent) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ledger Statement - ${ledger?.name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 12px; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
                    .header h1 { font-size: 18px; margin-bottom: 5px; }
                    .header p { color: #666; font-size: 11px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f5f5f5; font-weight: 600; }
                    .text-right { text-align: right; }
                    .debit { color: #059669; }
                    .credit { color: #dc2626; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                ${printContent.innerHTML}
                <script>window.print(); window.close();</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleWhatsAppShare = () => {
        const message = `*LEDGER STATEMENT*
━━━━━━━━━━━━━━━━
📋 *${ledger?.name}*
🏢 ${selectedCompany?.name}
📅 ${format(new Date(fromDate), 'dd MMM yyyy')} to ${format(new Date(toDate), 'dd MMM yyyy')}

💰 Opening: ${formatCurrency(openingBalance)}
📈 Total Debit: ${formatCurrency(summary.debit)}
📉 Total Credit: ${formatCurrency(summary.credit)}
━━━━━━━━━━━━━━━━
*Closing Balance: ${formatCurrency(summary.closing)}*
${summary.closing >= 0 ? '(Receivable)' : '(Payable)'}

Generated via TallySync`;

        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white mb-2">
                        <ArrowLeft size={18} /> Back to Ledgers
                    </button>
                    <h1 className="text-2xl font-bold text-white">Ledger Statement</h1>
                    <p className="text-gray-500">{ledger?.name || 'Loading...'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-[#121214] border border-white/10 rounded-xl px-4 py-2">
                        <Calendar size={16} className="text-gray-500" />
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent text-white text-sm focus:outline-none" />
                    </div>
                    <span className="text-gray-500">to</span>
                    <div className="flex items-center gap-2 bg-[#121214] border border-white/10 rounded-xl px-4 py-2">
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent text-white text-sm focus:outline-none" />
                    </div>
                    <button onClick={handlePrint} className="px-4 py-2 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white flex items-center gap-2">
                        <Printer size={16} /> Print
                    </button>
                    <button onClick={handleWhatsAppShare} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-2">
                        <MessageCircle size={16} /> WhatsApp
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <GlassCard className="p-4">
                    <p className="text-sm text-gray-400">Opening Balance</p>
                    <p className={`text-xl font-bold mt-1 ${openingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(openingBalance)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{openingBalance >= 0 ? 'Dr' : 'Cr'}</p>
                </GlassCard>
                <MetricCard title="Total Debit" value={formatCurrency(summary.debit)} icon={<TrendingUp size={20} />} color="success" />
                <MetricCard title="Total Credit" value={formatCurrency(summary.credit)} icon={<TrendingDown size={20} />} color="warning" />
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 rounded-2xl p-4">
                    <p className="text-sm text-blue-400">Closing Balance</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCurrency(summary.closing)}</p>
                    <p className="text-xs text-gray-400 mt-1">{summary.closing >= 0 ? 'Receivable' : 'Payable'}</p>
                </div>
            </div>

            {/* Transaction Table */}
            <div ref={printRef}>
                <GlassCard className="p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Voucher</th>
                                    <th className="px-6 py-4">Particulars</th>
                                    <th className="px-6 py-4 text-right text-emerald-400">Debit</th>
                                    <th className="px-6 py-4 text-right text-red-400">Credit</th>
                                    <th className="px-6 py-4 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {/* Opening Balance Row */}
                                <tr className="bg-white/[0.02]">
                                    <td className="px-6 py-4 text-white">{format(new Date(fromDate), 'dd MMM yyyy')}</td>
                                    <td className="px-6 py-4 text-gray-500">-</td>
                                    <td className="px-6 py-4 text-white font-medium">Opening Balance</td>
                                    <td className="px-6 py-4 text-right text-gray-500">-</td>
                                    <td className="px-6 py-4 text-right text-gray-500">-</td>
                                    <td className="px-6 py-4 text-right font-semibold text-white">
                                        {formatCurrency(openingBalance)} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                                    </td>
                                </tr>

                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center">
                                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                        </td>
                                    </tr>
                                ) : transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No transactions found</td>
                                    </tr>
                                ) : (
                                    transactions.map((txn: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4 text-white">{format(new Date(txn.voucher_date), 'dd MMM yyyy')}</td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400 mr-2">
                                                    {txn.voucher_type}
                                                </span>
                                                <span className="text-gray-500 font-mono">#{txn.voucher_number}</span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">{txn.narration || txn.party_name || '-'}</td>
                                            <td className="px-6 py-4 text-right font-mono text-emerald-400">
                                                {txn.debit > 0 ? formatCurrency(txn.debit) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-red-400">
                                                {txn.credit > 0 ? formatCurrency(txn.credit) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-semibold text-white">
                                                {formatCurrency(txn.balance)} {txn.balance >= 0 ? 'Dr' : 'Cr'}
                                            </td>
                                        </tr>
                                    ))
                                )}

                                {/* Closing Balance Row */}
                                <tr className="bg-blue-500/10 border-t border-blue-500/20">
                                    <td className="px-6 py-4 text-white font-bold">{format(new Date(toDate), 'dd MMM yyyy')}</td>
                                    <td className="px-6 py-4 text-gray-500">-</td>
                                    <td className="px-6 py-4 text-white font-bold">Closing Balance</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">{formatCurrency(summary.debit)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-red-400">{formatCurrency(summary.credit)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-blue-400">
                                        {formatCurrency(summary.closing)} {summary.closing >= 0 ? 'Dr' : 'Cr'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
