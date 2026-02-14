import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';

interface Prediction {
    date: string;
    inflow: number;
    outflow: number;
    netBalance: number;
}

export default function CashFlowPrediction() {
    const { selectedCompany } = useAuth() as any;
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(14);

    useEffect(() => {
        if (selectedCompany?.id) generatePredictions();
    }, [selectedCompany, period]);

    const generatePredictions = async () => {
        setLoading(true);
        try {
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('voucher_type, amount, vch_date')
                .eq('company_id', selectedCompany.id)
                .order('vch_date', { ascending: false })
                .limit(500);

            if (!vouchers?.length) { setPredictions([]); return; }

            const receipts = vouchers.filter(v => v.voucher_type === 'Receipt');
            const payments = vouchers.filter(v => v.voucher_type === 'Payment');

            const avgInflow = receipts.reduce((s, r) => s + Math.abs(parseFloat(r.amount) || 0), 0) / Math.max(receipts.length, 1);
            const avgOutflow = payments.reduce((s, p) => s + Math.abs(parseFloat(p.amount) || 0), 0) / Math.max(payments.length, 1);

            const preds: Prediction[] = [];
            let balance = 0;
            const today = new Date();

            for (let i = 1; i <= period; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() + i);
                const isWeekend = date.getDay() === 0;
                const dayIn = isWeekend ? 0 : avgInflow * (0.8 + Math.random() * 0.4);
                const dayOut = isWeekend ? 0 : avgOutflow * (0.8 + Math.random() * 0.4);
                balance += dayIn - dayOut;

                preds.push({
                    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                    inflow: Math.round(dayIn),
                    outflow: Math.round(dayOut),
                    netBalance: Math.round(balance)
                });
            }
            setPredictions(preds);
        } catch (err) {
            console.error('CashFlow prediction error:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatAmount = (n: number) => {
        if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
        if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
        return `₹${n.toLocaleString('en-IN')}`;
    };

    const totalInflow = predictions.reduce((s, p) => s + p.inflow, 0);
    const totalOutflow = predictions.reduce((s, p) => s + p.outflow, 0);
    const netFlow = totalInflow - totalOutflow;
    const maxVal = Math.max(...predictions.map(p => Math.max(p.inflow, p.outflow)), 1);

    if (loading) {
        return (
            <div className="rounded-2xl p-6 border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={18} className="text-[var(--primary)]" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Cash Flow Prediction</h3>
                </div>
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl p-6 border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp size={18} className="text-[var(--primary)]" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Cash Flow Prediction</h3>
                </div>
                <div className="flex gap-1 bg-[var(--background)] rounded-lg p-0.5">
                    {[7, 14, 30].map(d => (
                        <button key={d} onClick={() => setPeriod(d)}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${period === d
                                ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}`}>
                            {d}D
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[var(--background)] rounded-xl p-3 text-center">
                    <ArrowUpRight size={14} className="text-emerald-500 mx-auto mb-1" />
                    <p className="text-xs text-[var(--text-muted)]">Inflow</p>
                    <p className="text-sm font-bold text-emerald-500">{formatAmount(totalInflow)}</p>
                </div>
                <div className="bg-[var(--background)] rounded-xl p-3 text-center">
                    <ArrowDownRight size={14} className="text-red-500 mx-auto mb-1" />
                    <p className="text-xs text-[var(--text-muted)]">Outflow</p>
                    <p className="text-sm font-bold text-red-500">{formatAmount(totalOutflow)}</p>
                </div>
                <div className="bg-[var(--background)] rounded-xl p-3 text-center">
                    {netFlow >= 0 ? <TrendingUp size={14} className="text-emerald-500 mx-auto mb-1" />
                        : <TrendingDown size={14} className="text-red-500 mx-auto mb-1" />}
                    <p className="text-xs text-[var(--text-muted)]">Net</p>
                    <p className={`text-sm font-bold ${netFlow >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatAmount(netFlow)}
                    </p>
                </div>
            </div>

            {/* Bar Chart */}
            <div className="flex items-end gap-1 h-32">
                {predictions.map((p, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex flex-col items-center gap-0.5" style={{ height: '100px' }}>
                            <div className="w-full bg-emerald-500/20 rounded-t-sm relative"
                                style={{ height: `${(p.inflow / maxVal) * 100}%`, minHeight: '2px' }}>
                                <div className="absolute inset-0 bg-emerald-500 rounded-t-sm opacity-60" />
                            </div>
                            <div className="w-full bg-red-500/20 rounded-b-sm relative"
                                style={{ height: `${(p.outflow / maxVal) * 100}%`, minHeight: '2px' }}>
                                <div className="absolute inset-0 bg-red-500 rounded-b-sm opacity-60" />
                            </div>
                        </div>
                        {i % Math.ceil(predictions.length / 7) === 0 && (
                            <span className="text-[9px] text-[var(--text-muted)] mt-1">{p.date}</span>
                        )}
                    </div>
                ))}
            </div>

            {netFlow < 0 && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400">
                        ⚠️ Cash flow negative in next {period} days. Consider sending payment reminders.
                    </p>
                </div>
            )}
        </div>
    );
}
