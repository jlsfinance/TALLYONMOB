import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { BarChart3, MessageCircle, Calendar, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';

export default function AgingReportPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [reportType, setReportType] = useState<'receivables' | 'payables'>('receivables');
    const [agingData, setAgingData] = useState<any[]>([]);
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
            const voucherType = reportType === 'receivables' ? 'Sales' : 'Purchase';

            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', voucherType)
                .lte('voucher_date', asOnDate)
                .eq('is_deleted', false);

            const paymentType = reportType === 'receivables' ? 'Receipt' : 'Payment';
            const { data: payments } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', paymentType)
                .lte('voucher_date', asOnDate);

            const partyMap = new Map();
            const today = new Date(asOnDate);

            (vouchers || []).forEach((v: any) => {
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
                    daysOld: Math.floor((today.getTime() - new Date(v.voucher_date).getTime()) / (1000 * 60 * 60 * 24))
                });
            });

            (payments || []).forEach((p: any) => {
                const partyName = p.party_name || 'Unknown';
                if (partyMap.has(partyName)) {
                    partyMap.get(partyName).totalPaid += Math.abs(p.total_amount || 0);
                }
            });

            const agingList: any[] = [];
            let summaryData = { current: 0, days30: 0, days60: 0, days90: 0, days120: 0, total: 0 };

            partyMap.forEach((party: any) => {
                party.outstanding = party.totalBilled - party.totalPaid;
                if (party.outstanding <= 0) return;

                let remaining = party.outstanding;
                party.invoices.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

                party.invoices.forEach((inv: any) => {
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

            agingList.sort((a, b) => b.outstanding - a.outstanding);

            setAgingData(agingList);
            setSummary(summaryData);

        } catch (error) {
            console.error('Error loading aging report:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
    };

    const getPercentage = (value: number) => {
        if (summary.total === 0) return 0;
        return ((value / summary.total) * 100).toFixed(1);
    };

    const handleWhatsAppReminder = (party: any) => {
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

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Aging Report</h1>
                    <p className="text-gray-500 mt-1">{agingData.length} parties with outstanding</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value as 'receivables' | 'payables')}
                        className="px-4 py-2.5 bg-[#121214] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
                    >
                        <option value="receivables">📈 Receivables</option>
                        <option value="payables">📉 Payables</option>
                    </select>
                    <div className="flex items-center gap-2 bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5">
                        <Calendar size={16} className="text-gray-500" />
                        <input
                            type="date"
                            value={asOnDate}
                            onChange={(e) => setAsOnDate(e.target.value)}
                            className="bg-transparent text-white text-sm focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                    <p className="text-xs text-emerald-400 font-bold">CURRENT (0-30)</p>
                    <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(summary.current)}</p>
                    <p className="text-xs text-emerald-400/60">{getPercentage(summary.current)}%</p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
                    <p className="text-xs text-yellow-400 font-bold">31-60 DAYS</p>
                    <p className="text-xl font-bold text-yellow-400 mt-1">{formatCurrency(summary.days30)}</p>
                    <p className="text-xs text-yellow-400/60">{getPercentage(summary.days30)}%</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                    <p className="text-xs text-orange-400 font-bold">61-90 DAYS</p>
                    <p className="text-xl font-bold text-orange-400 mt-1">{formatCurrency(summary.days60)}</p>
                    <p className="text-xs text-orange-400/60">{getPercentage(summary.days60)}%</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    <p className="text-xs text-red-400 font-bold">91-120 DAYS</p>
                    <p className="text-xl font-bold text-red-400 mt-1">{formatCurrency(summary.days90)}</p>
                    <p className="text-xs text-red-400/60">{getPercentage(summary.days90)}%</p>
                </div>
                <div className="bg-red-600/10 border border-red-600/20 rounded-2xl p-4">
                    <p className="text-xs text-red-500 font-bold">120+ DAYS</p>
                    <p className="text-xl font-bold text-red-500 mt-1">{formatCurrency(summary.days120)}</p>
                    <p className="text-xs text-red-500/60">{getPercentage(summary.days120)}%</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 rounded-2xl p-4">
                    <p className="text-xs text-blue-400 font-bold">TOTAL</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCurrency(summary.total)}</p>
                    <p className="text-xs text-gray-400">{agingData.length} parties</p>
                </div>
            </div>

            {/* Aging Bar */}
            <GlassCard className="p-6">
                <h2 className="font-semibold text-white mb-4">Aging Distribution</h2>
                <div className="h-6 rounded-full overflow-hidden flex bg-white/5">
                    {summary.current > 0 && (
                        <div className="bg-emerald-500 h-full flex items-center justify-center text-white text-[10px] font-bold transition-all" style={{ width: `${getPercentage(summary.current)}%` }}>
                            {Number(getPercentage(summary.current)) > 10 && `${getPercentage(summary.current)}%`}
                        </div>
                    )}
                    {summary.days30 > 0 && (
                        <div className="bg-yellow-500 h-full flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${getPercentage(summary.days30)}%` }} />
                    )}
                    {summary.days60 > 0 && (
                        <div className="bg-orange-500 h-full" style={{ width: `${getPercentage(summary.days60)}%` }} />
                    )}
                    {summary.days90 > 0 && (
                        <div className="bg-red-500 h-full" style={{ width: `${getPercentage(summary.days90)}%` }} />
                    )}
                    {summary.days120 > 0 && (
                        <div className="bg-red-700 h-full" style={{ width: `${getPercentage(summary.days120)}%` }} />
                    )}
                </div>
                <div className="flex justify-between mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-500 rounded" /> Current</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-500 rounded" /> 31-60</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 bg-orange-500 rounded" /> 61-90</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded" /> 91-120</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 bg-red-700 rounded" /> 120+</span>
                </div>
            </GlassCard>

            {/* Party Table */}
            <GlassCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <h2 className="font-semibold text-white">Party-wise {reportType === 'receivables' ? 'Receivables' : 'Payables'}</h2>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-gray-500">Loading...</p>
                    </div>
                ) : agingData.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="font-medium">No outstanding {reportType}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Party</th>
                                    <th className="px-6 py-4 text-right text-emerald-400">Current</th>
                                    <th className="px-6 py-4 text-right text-yellow-400">31-60</th>
                                    <th className="px-6 py-4 text-right text-orange-400">61-90</th>
                                    <th className="px-6 py-4 text-right text-red-400">91-120</th>
                                    <th className="px-6 py-4 text-right text-red-500">120+</th>
                                    <th className="px-6 py-4 text-right font-bold">Total</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {agingData.map((party: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4 font-medium text-white">{party.partyName}</td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{party.current > 0 ? formatCurrency(party.current) : '-'}</td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{party.days30 > 0 ? formatCurrency(party.days30) : '-'}</td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{party.days60 > 0 ? formatCurrency(party.days60) : '-'}</td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{party.days90 > 0 ? formatCurrency(party.days90) : '-'}</td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{party.days120 > 0 ? formatCurrency(party.days120) : '-'}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-blue-400">{formatCurrency(party.outstanding)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleWhatsAppReminder(party)}
                                                className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 text-xs flex items-center gap-1 mx-auto"
                                            >
                                                <MessageCircle size={12} />
                                                Remind
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-blue-500/10 border-t border-blue-500/20">
                                <tr>
                                    <td className="px-6 py-4 font-bold text-white">TOTAL</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">{formatCurrency(summary.current)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-yellow-400">{formatCurrency(summary.days30)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-orange-400">{formatCurrency(summary.days60)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-red-400">{formatCurrency(summary.days90)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-red-500">{formatCurrency(summary.days120)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-blue-400">{formatCurrency(summary.total)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </GlassCard>
        </div>
    );
}
