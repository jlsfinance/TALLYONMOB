import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase, ledgerApi, voucherApi } from '../lib/supabase';

export default function LedgerStatementPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { selectedCompany } = useAuth();
    const printRef = useRef();

    const [ledger, setLedger] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [summary, setSummary] = useState({ debit: 0, credit: 0, closing: 0 });

    useEffect(() => {
        if (selectedCompany?.id && id) {
            loadLedgerStatement();
        }
    }, [selectedCompany, id, fromDate, toDate]);

    const loadLedgerStatement = async () => {
        setLoading(true);
        try {
            // Get ledger details
            const { data: ledgerData } = await ledgerApi.getById(id);
            setLedger(ledgerData);

            // Get all vouchers where this ledger is involved
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .or(`party_name.eq.${ledgerData?.name},ledger_name.eq.${ledgerData?.name}`)
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .order('voucher_date', { ascending: true })
                .limit(5000);

            // Calculate running balance
            let runningBalance = ledgerData?.opening_balance || 0;
            setOpeningBalance(runningBalance);

            const processedTxns = (vouchers || []).map(v => {
                const isDebit = v.voucher_type === 'Receipt' ||
                    v.voucher_type === 'Sales' ||
                    v.voucher_type === 'Debit Note';

                const amount = Math.abs(v.total_amount || 0);
                const debit = isDebit ? amount : 0;
                const credit = !isDebit ? amount : 0;

                runningBalance = runningBalance + debit - credit;

                return {
                    ...v,
                    debit,
                    credit,
                    balance: runningBalance
                };
            });

            setTransactions(processedTxns);

            // Calculate summary
            const totalDebit = processedTxns.reduce((sum, t) => sum + t.debit, 0);
            const totalCredit = processedTxns.reduce((sum, t) => sum + t.credit, 0);

            setSummary({
                debit: totalDebit,
                credit: totalCredit,
                closing: runningBalance
            });

        } catch (error) {
            console.error('Error loading statement:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(Math.abs(amount || 0));
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const handlePrint = () => {
        const printContent = printRef.current;
        const printWindow = window.open('', '_blank');

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
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 15px; }
                    .info-box { border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f5f5f5; font-weight: 600; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .debit { color: #059669; }
                    .credit { color: #dc2626; }
                    .footer { margin-top: 20px; border-top: 2px solid #333; padding-top: 15px; }
                    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
                    .summary-box { border: 1px solid #ddd; padding: 10px; text-align: center; border-radius: 5px; }
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
📅 ${formatDate(fromDate)} to ${formatDate(toDate)}

💰 Opening: ${formatCurrency(openingBalance)}
📈 Total Debit: ${formatCurrency(summary.debit)}
📉 Total Credit: ${formatCurrency(summary.credit)}
━━━━━━━━━━━━━━━━
*Closing Balance: ${formatCurrency(summary.closing)}*
${summary.closing >= 0 ? '(Receivable)' : '(Payable)'}

Generated via TallySync`;

        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 mb-2">
                        ← Back to Ledgers
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">📋 Ledger Statement</h1>
                    <p className="text-gray-500">{ledger?.name || 'Loading...'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                    />
                    <button
                        onClick={handlePrint}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        🖨️ Print/PDF
                    </button>
                    <button
                        onClick={handleWhatsAppShare}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        📱 WhatsApp
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-sm text-gray-500">Opening Balance</p>
                    <p className={`text-xl font-bold ${openingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(openingBalance)}
                    </p>
                    <p className="text-xs text-gray-400">{openingBalance >= 0 ? 'Dr' : 'Cr'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-sm text-gray-500">Total Debit</p>
                    <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.debit)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-sm text-gray-500">Total Credit</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(summary.credit)}</p>
                </div>
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 shadow-lg text-white">
                    <p className="text-sm text-white/80">Closing Balance</p>
                    <p className="text-xl font-bold">{formatCurrency(summary.closing)}</p>
                    <p className="text-xs text-white/60">{summary.closing >= 0 ? 'Receivable' : 'Payable'}</p>
                </div>
            </div>

            {/* Printable Content */}
            <div ref={printRef}>
                <div className="header hidden print:block">
                    <h1>{selectedCompany?.name}</h1>
                    <p>Ledger Statement: {ledger?.name}</p>
                    <p>Period: {formatDate(fromDate)} to {formatDate(toDate)}</p>
                </div>

                {/* Transaction Table */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Voucher</th>
                                    <th className="px-4 py-3 text-left">Particulars</th>
                                    <th className="px-4 py-3 text-right text-emerald-600">Debit</th>
                                    <th className="px-4 py-3 text-right text-red-600">Credit</th>
                                    <th className="px-4 py-3 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {/* Opening Balance Row */}
                                <tr className="bg-gray-50 font-medium">
                                    <td className="px-4 py-3">{formatDate(fromDate)}</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">Opening Balance</td>
                                    <td className="px-4 py-3 text-right">-</td>
                                    <td className="px-4 py-3 text-right">-</td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                        {formatCurrency(openingBalance)} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                                    </td>
                                </tr>

                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center">
                                            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
                                        </td>
                                    </tr>
                                ) : transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                                            No transactions found for this period
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map((txn, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">{formatDate(txn.voucher_date)}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                                                    {txn.voucher_type}
                                                </span>
                                                <span className="ml-2 text-gray-500">#{txn.voucher_number}</span>
                                            </td>
                                            <td className="px-4 py-3">{txn.narration || txn.party_name || '-'}</td>
                                            <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                                                {txn.debit > 0 ? formatCurrency(txn.debit) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-red-600 font-medium">
                                                {txn.credit > 0 ? formatCurrency(txn.credit) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                                {formatCurrency(txn.balance)} {txn.balance >= 0 ? 'Dr' : 'Cr'}
                                            </td>
                                        </tr>
                                    ))
                                )}

                                {/* Closing Balance Row */}
                                <tr className="bg-indigo-50 font-bold">
                                    <td className="px-4 py-3">{formatDate(toDate)}</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">Closing Balance</td>
                                    <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(summary.debit)}</td>
                                    <td className="px-4 py-3 text-right text-red-600">{formatCurrency(summary.credit)}</td>
                                    <td className="px-4 py-3 text-right text-indigo-700">
                                        {formatCurrency(summary.closing)} {summary.closing >= 0 ? 'Dr' : 'Cr'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="footer hidden print:block">
                    <div className="summary-grid">
                        <div className="summary-box"><strong>Total Debit:</strong> {formatCurrency(summary.debit)}</div>
                        <div className="summary-box"><strong>Total Credit:</strong> {formatCurrency(summary.credit)}</div>
                        <div className="summary-box"><strong>Closing:</strong> {formatCurrency(summary.closing)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
