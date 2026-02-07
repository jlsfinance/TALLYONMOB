import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { GlassCard, Badge, Button, Spinner } from '@/components/ui/GlassUI';
import {
    Calendar, TrendingUp, TrendingDown, Users, Filter,
    Download, ChevronRight, AlertTriangle, Clock, CheckCircle,
    Phone, MessageCircle
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const formatCurrency = (amount: number) => {
    return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(amount || 0));
};

// Age bucket configuration
const AGE_BUCKETS = [
    { id: 'current', label: 'Current (0-30)', min: 0, max: 30, color: 'bg-emerald-100 text-emerald-700 border-emerald-300', barColor: 'bg-emerald-500' },
    { id: '31-60', label: '31-60 Days', min: 31, max: 60, color: 'bg-amber-100 text-amber-700 border-amber-300', barColor: 'bg-amber-400' },
    { id: '61-90', label: '61-90 Days', min: 61, max: 90, color: 'bg-orange-100 text-orange-700 border-orange-300', barColor: 'bg-orange-500' },
    { id: '91-120', label: '91-120 Days', min: 91, max: 120, color: 'bg-red-100 text-red-700 border-red-300', barColor: 'bg-red-400' },
    { id: '120+', label: '120+ Days', min: 121, max: 9999, color: 'bg-red-200 text-red-800 border-red-400', barColor: 'bg-red-600' },
];

export default function AgeingReportPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [reportType, setReportType] = useState<'receivable' | 'payable'>('receivable');
    const [parties, setParties] = useState<any[]>([]);
    const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (selectedCompany?.id) loadAgeingData();
    }, [selectedCompany, reportType, asOnDate]);

    const loadAgeingData = async () => {
        setLoading(true);
        try {
            // Fetch all parties (Sundry Debtors for Receivable, Sundry Creditors for Payable)
            const groupName = reportType === 'receivable' ? 'Sundry Debtors' : 'Sundry Creditors';

            const { data: ledgers } = await supabase
                .from('ledgers')
                .select('id, name, phone, opening_balance, group_name')
                .eq('company_id', selectedCompany.id)
                .eq('group_name', groupName);

            // Fetch all vouchers for these parties
            const partyNames = (ledgers || []).map(l => l.name);

            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('id, party_name, voucher_type, voucher_date, total_amount, voucher_number')
                .eq('company_id', selectedCompany.id)
                .in('party_name', partyNames)
                .lte('voucher_date', asOnDate)
                .order('voucher_date', { ascending: true });

            // Calculate outstanding for each party with age buckets
            const partyData: any[] = [];
            const today = new Date(asOnDate);

            for (const ledger of (ledgers || [])) {
                const partyVouchers = (vouchers || []).filter(v => v.party_name === ledger.name);

                // Calculate running balance for each voucher
                let openingBal = Number(ledger.opening_balance) || 0;
                const buckets: Record<string, number> = {
                    current: 0,
                    '31-60': 0,
                    '61-90': 0,
                    '91-120': 0,
                    '120+': 0
                };

                // For Receivable: Sales add, Receipt subtract
                // For Payable: Purchase add, Payment subtract
                const unpaidVouchers: any[] = [];

                partyVouchers.forEach(v => {
                    const amount = Math.abs(Number(v.total_amount) || 0);
                    const vType = v.voucher_type;
                    const vDate = new Date(v.voucher_date);
                    const age = differenceInDays(today, vDate);

                    if (reportType === 'receivable') {
                        if (vType === 'Sales' || vType === 'Debit Note') {
                            unpaidVouchers.push({ ...v, amount, age });
                        } else if (vType === 'Receipt' || vType === 'Credit Note') {
                            // Knock off oldest vouchers first
                            let remaining = amount;
                            for (const uv of unpaidVouchers) {
                                if (remaining <= 0) break;
                                const knockOff = Math.min(uv.amount, remaining);
                                uv.amount -= knockOff;
                                remaining -= knockOff;
                            }
                        }
                    } else {
                        if (vType === 'Purchase' || vType === 'Credit Note') {
                            unpaidVouchers.push({ ...v, amount, age });
                        } else if (vType === 'Payment' || vType === 'Debit Note') {
                            let remaining = amount;
                            for (const uv of unpaidVouchers) {
                                if (remaining <= 0) break;
                                const knockOff = Math.min(uv.amount, remaining);
                                uv.amount -= knockOff;
                                remaining -= knockOff;
                            }
                        }
                    }
                });

                // Distribute remaining amounts to age buckets
                unpaidVouchers.filter(v => v.amount > 0).forEach(v => {
                    const bucket = AGE_BUCKETS.find(b => v.age >= b.min && v.age <= b.max);
                    if (bucket) {
                        buckets[bucket.id] += v.amount;
                    }
                });

                // Add opening balance to oldest bucket if positive
                if (openingBal > 0) {
                    buckets['120+'] += openingBal;
                }

                const total = Object.values(buckets).reduce((sum, val) => sum + val, 0);

                if (total > 0) {
                    partyData.push({
                        ...ledger,
                        buckets,
                        total,
                        unpaidVouchers: unpaidVouchers.filter(v => v.amount > 0)
                    });
                }
            }

            // Sort by total descending
            partyData.sort((a, b) => b.total - a.total);
            setParties(partyData);

        } catch (error) {
            console.error('Error loading ageing data:', error);
            toast.error('Failed to load ageing report');
        } finally {
            setLoading(false);
        }
    };

    // Calculate totals for each bucket
    const bucketTotals = useMemo(() => {
        const totals: Record<string, number> = {
            current: 0,
            '31-60': 0,
            '61-90': 0,
            '91-120': 0,
            '120+': 0
        };
        parties.forEach(p => {
            Object.keys(totals).forEach(k => {
                totals[k] += p.buckets[k] || 0;
            });
        });
        return totals;
    }, [parties]);

    const grandTotal = useMemo(() => {
        return Object.values(bucketTotals).reduce((sum, val) => sum + val, 0);
    }, [bucketTotals]);

    const getPercentage = (value: number) => {
        if (grandTotal === 0) return 0;
        return Math.round((value / grandTotal) * 100);
    };

    const handleWhatsApp = (party: any) => {
        if (!party.phone) {
            toast.error('Phone number not available');
            return;
        }
        const message = `Dear ${party.name}, your outstanding balance of ${formatCurrency(party.total)} is pending. Kindly arrange payment at the earliest. Thank you!`;
        window.open(`https://wa.me/91${party.phone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const exportToCSV = () => {
        const headers = ['Party Name', 'Phone', 'Current (0-30)', '31-60 Days', '61-90 Days', '91-120 Days', '120+ Days', 'Total'];
        const rows = parties.map(p => [
            p.name,
            p.phone || '',
            p.buckets.current,
            p.buckets['31-60'],
            p.buckets['61-90'],
            p.buckets['91-120'],
            p.buckets['120+'],
            p.total
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportType}_ageing_${asOnDate}.csv`;
        a.click();
        toast.success('Report exported!');
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)]">Ageing Report</h1>
                    <p className="text-sm text-[var(--text-muted)]">
                        {selectedCompany?.name} - (from {format(new Date(selectedCompany?.fy_start || new Date()), 'd-MMM-yy')})
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Report Type Toggle */}
                    <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
                        <button
                            onClick={() => setReportType('receivable')}
                            className={`px-4 py-2 text-sm font-bold transition-all ${reportType === 'receivable'
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-[var(--surface)] text-[var(--text-muted)]'
                                }`}
                        >
                            Receivable
                        </button>
                        <button
                            onClick={() => setReportType('payable')}
                            className={`px-4 py-2 text-sm font-bold transition-all ${reportType === 'payable'
                                    ? 'bg-rose-500 text-white'
                                    : 'bg-[var(--surface)] text-[var(--text-muted)]'
                                }`}
                        >
                            Payable
                        </button>
                    </div>

                    {/* Date Picker */}
                    <div className="flex items-center gap-2 bg-[var(--surface)] rounded-xl border border-[var(--border)] px-3 py-2">
                        <Calendar size={16} className="text-[var(--text-muted)]" />
                        <input
                            type="date"
                            value={asOnDate}
                            onChange={(e) => setAsOnDate(e.target.value)}
                            className="bg-transparent text-sm text-[var(--on-surface)] outline-none"
                        />
                    </div>

                    {/* Export */}
                    <button
                        onClick={exportToCSV}
                        className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-variant)]"
                    >
                        <Download size={18} />
                    </button>
                </div>
            </div>

            {/* Age Bucket Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                {AGE_BUCKETS.map(bucket => (
                    <div
                        key={bucket.id}
                        className={`rounded-2xl p-4 border ${bucket.color}`}
                    >
                        <p className="text-xs font-bold opacity-70 mb-1">{bucket.label}</p>
                        <p className="text-xl font-black">{formatCurrency(bucketTotals[bucket.id])}</p>
                        <p className="text-xs font-bold opacity-60">{getPercentage(bucketTotals[bucket.id])}%</p>
                    </div>
                ))}
                {/* Total Outstanding */}
                <div className="rounded-2xl p-4 border bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                    <p className="text-xs font-bold opacity-80 mb-1">Total Outstanding</p>
                    <p className="text-xl font-black">{formatCurrency(grandTotal)}</p>
                    <p className="text-xs font-bold opacity-70">{parties.length} parties</p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="h-4 rounded-full overflow-hidden flex bg-[var(--surface-variant)]">
                    {AGE_BUCKETS.map(bucket => {
                        const width = getPercentage(bucketTotals[bucket.id]);
                        return width > 0 ? (
                            <div
                                key={bucket.id}
                                className={`${bucket.barColor} transition-all`}
                                style={{ width: `${width}%` }}
                                title={`${bucket.label}: ${formatCurrency(bucketTotals[bucket.id])}`}
                            />
                        ) : null;
                    })}
                </div>
                <div className="flex justify-center gap-4 mt-2 flex-wrap">
                    {AGE_BUCKETS.map(bucket => (
                        <div key={bucket.id} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <div className={`w-3 h-3 rounded-full ${bucket.barColor}`} />
                            <span>{bucket.label.split(' ')[0]}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Party-wise Breakdown Table */}
            <GlassCard className="overflow-hidden">
                <div className="p-4 border-b border-[var(--border)]">
                    <h2 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-wider">
                        {reportType === 'receivable' ? 'Sundry Debtors' : 'Sundry Creditors'} - Outstanding
                    </h2>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : parties.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                        <CheckCircle size={48} className="mb-4 opacity-30" />
                        <p className="text-sm font-bold">No outstanding {reportType === 'receivable' ? 'receivables' : 'payables'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[var(--surface-variant)] text-[var(--text-muted)]">
                                    <th className="px-4 py-3 text-left font-bold">Party Name</th>
                                    {AGE_BUCKETS.map(b => (
                                        <th key={b.id} className="px-3 py-3 text-right font-bold whitespace-nowrap">{b.label.split(' ')[0]}</th>
                                    ))}
                                    <th className="px-4 py-3 text-right font-bold">Total</th>
                                    <th className="px-4 py-3 text-center font-bold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parties.map((party, idx) => (
                                    <tr
                                        key={party.id}
                                        className="border-b border-[var(--border)] hover:bg-[var(--surface-variant)]/50 cursor-pointer"
                                        onClick={() => navigate(`/ledgers/${party.id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-[var(--on-surface)]">{party.name}</p>
                                            {party.phone && (
                                                <p className="text-xs text-[var(--text-muted)]">{party.phone}</p>
                                            )}
                                        </td>
                                        {AGE_BUCKETS.map(b => (
                                            <td key={b.id} className="px-3 py-3 text-right">
                                                {party.buckets[b.id] > 0 ? (
                                                    <span className={`font-bold ${b.id === '120+' || b.id === '91-120' ? 'text-red-500' : ''}`}>
                                                        {formatCurrency(party.buckets[b.id])}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">-</span>
                                                )}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-black text-[var(--primary)]">
                                                {formatCurrency(party.total)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleWhatsApp(party)}
                                                className="p-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
                                            >
                                                <MessageCircle size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-[var(--surface-variant)] font-black">
                                    <td className="px-4 py-3">TOTAL</td>
                                    {AGE_BUCKETS.map(b => (
                                        <td key={b.id} className="px-3 py-3 text-right">
                                            {formatCurrency(bucketTotals[b.id])}
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 text-right text-[var(--primary)]">
                                        {formatCurrency(grandTotal)}
                                    </td>
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
