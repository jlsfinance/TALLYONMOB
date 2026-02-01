import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function AgingReportPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [loading, setLoading] = useState(true);
    const [reportType, setReportType] = useState('receivables'); // receivables or payables
    const [agingData, setAgingData] = useState([]);
    const [summary, setSummary] = useState({ current: 0, days30: 0, days60: 0, days90: 0, days120: 0, total: 0 });
    const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadAgingReport();
        }
    }, [selectedCompany, reportType, asOnDate]);

    const loadAgingReport = async () => {
        setLoading(true);
        try {
            // For receivables: Get Sales vouchers
            // For payables: Get Purchase vouchers
            const voucherType = reportType === 'receivables' ? 'Sales' : 'Purchase';

            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', voucherType)
                .lte('voucher_date', asOnDate)
                .eq('is_deleted', false);

            // Get receipts/payments to calculate outstanding
            const paymentType = reportType === 'receivables' ? 'Receipt' : 'Payment';
            const { data: payments } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', paymentType)
                .lte('voucher_date', asOnDate);

            // Group by party and calculate outstanding
            const partyMap = new Map();
            const today = new Date(asOnDate);

            (vouchers || []).forEach(v => {
                const partyName = v.party_name || 'Unknown';
                if (!partyMap.has(partyName)) {
                    partyMap.set(partyName, {
                        partyName,
                        invoices: [],
                        totalBilled: 0,
                        totalPaid: 0,
                        current: 0,
                        days30: 0,
                        days60: 0,
                        days90: 0,
                        days120: 0,
                        outstanding: 0
                    });
                }

                const party = partyMap.get(partyName);
                const amount = Math.abs(v.total_amount || 0);
                party.totalBilled += amount;
                party.invoices.push({
                    number: v.voucher_number,
                    date: v.voucher_date,
                    amount,
                    daysOld: Math.floor((today - new Date(v.voucher_date)) / (1000 * 60 * 60 * 24))
                });
            });

            // Subtract payments
            (payments || []).forEach(p => {
                const partyName = p.party_name || 'Unknown';
                if (partyMap.has(partyName)) {
                    partyMap.get(partyName).totalPaid += Math.abs(p.total_amount || 0);
                }
            });

            // Calculate aging buckets
            const agingList = [];
            let summaryData = { current: 0, days30: 0, days60: 0, days90: 0, days120: 0, total: 0 };

            partyMap.forEach(party => {
                party.outstanding = party.totalBilled - party.totalPaid;

                if (party.outstanding <= 0) return; // Skip if fully paid

                // Distribute outstanding across aging buckets based on invoice dates
                let remaining = party.outstanding;

                // Sort invoices by date (oldest first for FIFO payment allocation)
                party.invoices.sort((a, b) => new Date(a.date) - new Date(b.date));

                party.invoices.forEach(inv => {
                    if (remaining <= 0) return;

                    const allocate = Math.min(remaining, inv.amount);
                    remaining -= allocate;

                    if (inv.daysOld <= 30) {
                        party.current += allocate;
                        summaryData.current += allocate;
                    } else if (inv.daysOld <= 60) {
                        party.days30 += allocate;
                        summaryData.days30 += allocate;
                    } else if (inv.daysOld <= 90) {
                        party.days60 += allocate;
                        summaryData.days60 += allocate;
                    } else if (inv.daysOld <= 120) {
                        party.days90 += allocate;
                        summaryData.days90 += allocate;
                    } else {
                        party.days120 += allocate;
                        summaryData.days120 += allocate;
                    }
                });

                summaryData.total += party.outstanding;
                agingList.push(party);
            });

            // Sort by outstanding amount (highest first)
            agingList.sort((a, b) => b.outstanding - a.outstanding);

            setAgingData(agingList);
            setSummary(summaryData);

        } catch (error) {
            console.error('Error loading aging report:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getPercentage = (value) => {
        if (summary.total === 0) return 0;
        return ((value / summary.total) * 100).toFixed(1);
    };

    const handleWhatsAppReminder = (party) => {
        const message = `🔔 *Payment Reminder*

Dear ${party.partyName},

This is a friendly reminder regarding your outstanding balance:

💰 *Outstanding: ${formatCurrency(party.outstanding)}*

${party.days90 + party.days120 > 0 ? `⚠️ Overdue Amount: ${formatCurrency(party.days90 + party.days120)} (60+ days)` : ''}

Please arrange for the payment at your earliest convenience.

Thank you for your business!
${selectedCompany?.name}`;

        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">📊 Aging Report</h1>
                    <p className="text-gray-500">{selectedCompany.name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                        className="px-4 py-2 border rounded-lg bg-white"
                    >
                        <option value="receivables">📈 Receivables (Debtors)</option>
                        <option value="payables">📉 Payables (Creditors)</option>
                    </select>
                    <input
                        type="date"
                        value={asOnDate}
                        onChange={(e) => setAsOnDate(e.target.value)}
                        className="px-4 py-2 border rounded-lg"
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                    <p className="text-sm text-emerald-600">Current (0-30)</p>
                    <p className="text-xl font-bold text-emerald-700">{formatCurrency(summary.current)}</p>
                    <p className="text-xs text-emerald-500">{getPercentage(summary.current)}%</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <p className="text-sm text-yellow-600">31-60 Days</p>
                    <p className="text-xl font-bold text-yellow-700">{formatCurrency(summary.days30)}</p>
                    <p className="text-xs text-yellow-500">{getPercentage(summary.days30)}%</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                    <p className="text-sm text-orange-600">61-90 Days</p>
                    <p className="text-xl font-bold text-orange-700">{formatCurrency(summary.days60)}</p>
                    <p className="text-xs text-orange-500">{getPercentage(summary.days60)}%</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <p className="text-sm text-red-600">91-120 Days</p>
                    <p className="text-xl font-bold text-red-700">{formatCurrency(summary.days90)}</p>
                    <p className="text-xs text-red-500">{getPercentage(summary.days90)}%</p>
                </div>
                <div className="bg-red-100 rounded-xl p-4 border border-red-300">
                    <p className="text-sm text-red-700">120+ Days</p>
                    <p className="text-xl font-bold text-red-800">{formatCurrency(summary.days120)}</p>
                    <p className="text-xs text-red-600">{getPercentage(summary.days120)}%</p>
                </div>
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 text-white">
                    <p className="text-sm text-white/80">Total Outstanding</p>
                    <p className="text-xl font-bold">{formatCurrency(summary.total)}</p>
                    <p className="text-xs text-white/60">{agingData.length} parties</p>
                </div>
            </div>

            {/* Aging Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm border mb-6">
                <h2 className="font-semibold mb-4">Aging Distribution</h2>
                <div className="h-8 rounded-full overflow-hidden flex bg-gray-100">
                    {summary.current > 0 && (
                        <div
                            className="bg-emerald-500 h-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ width: `${getPercentage(summary.current)}%` }}
                        >
                            {getPercentage(summary.current) > 10 && `${getPercentage(summary.current)}%`}
                        </div>
                    )}
                    {summary.days30 > 0 && (
                        <div
                            className="bg-yellow-500 h-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ width: `${getPercentage(summary.days30)}%` }}
                        >
                            {getPercentage(summary.days30) > 10 && `${getPercentage(summary.days30)}%`}
                        </div>
                    )}
                    {summary.days60 > 0 && (
                        <div
                            className="bg-orange-500 h-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ width: `${getPercentage(summary.days60)}%` }}
                        >
                            {getPercentage(summary.days60) > 10 && `${getPercentage(summary.days60)}%`}
                        </div>
                    )}
                    {summary.days90 > 0 && (
                        <div
                            className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ width: `${getPercentage(summary.days90)}%` }}
                        />
                    )}
                    {summary.days120 > 0 && (
                        <div
                            className="bg-red-700 h-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ width: `${getPercentage(summary.days120)}%` }}
                        />
                    )}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded"></span> Current</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> 31-60</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded"></span> 61-90</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span> 91-120</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-700 rounded"></span> 120+</span>
                </div>
            </div>

            {/* Party-wise Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold">Party-wise {reportType === 'receivables' ? 'Receivables' : 'Payables'}</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left">Party Name</th>
                                <th className="px-4 py-3 text-right text-emerald-600">Current</th>
                                <th className="px-4 py-3 text-right text-yellow-600">31-60</th>
                                <th className="px-4 py-3 text-right text-orange-600">61-90</th>
                                <th className="px-4 py-3 text-right text-red-600">91-120</th>
                                <th className="px-4 py-3 text-right text-red-700">120+</th>
                                <th className="px-4 py-3 text-right font-bold">Total</th>
                                <th className="px-4 py-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center">
                                        <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
                                    </td>
                                </tr>
                            ) : agingData.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                                        No outstanding {reportType} found
                                    </td>
                                </tr>
                            ) : (
                                agingData.map((party, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{party.partyName}</td>
                                        <td className="px-4 py-3 text-right">{party.current > 0 ? formatCurrency(party.current) : '-'}</td>
                                        <td className="px-4 py-3 text-right">{party.days30 > 0 ? formatCurrency(party.days30) : '-'}</td>
                                        <td className="px-4 py-3 text-right">{party.days60 > 0 ? formatCurrency(party.days60) : '-'}</td>
                                        <td className="px-4 py-3 text-right">{party.days90 > 0 ? formatCurrency(party.days90) : '-'}</td>
                                        <td className="px-4 py-3 text-right">{party.days120 > 0 ? formatCurrency(party.days120) : '-'}</td>
                                        <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatCurrency(party.outstanding)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleWhatsAppReminder(party)}
                                                className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs"
                                            >
                                                📱 Remind
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {agingData.length > 0 && (
                            <tfoot className="bg-indigo-50 font-bold">
                                <tr>
                                    <td className="px-4 py-3">TOTAL</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(summary.current)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(summary.days30)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(summary.days60)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(summary.days90)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(summary.days120)}</td>
                                    <td className="px-4 py-3 text-right text-indigo-700">{formatCurrency(summary.total)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
