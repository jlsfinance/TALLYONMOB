import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Filter, Download, RefreshCw, Book, Clock } from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion } from 'framer-motion';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { format, parseISO } from 'date-fns';

interface DayBookVoucher {
    id: string;
    voucher_type: string;
    voucher_number: string;
    voucher_date: string;
    party_name: string;
    total_amount: number;
    grand_total: number;
    debit: number;
    credit: number;
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(Math.abs(amount || 0));

const VOUCHER_TYPE_OPTIONS = [
    'All Types',
    'Sales',
    'Purchase',
    'Payment',
    'Receipt',
    'Contra',
    'Journal',
    'Credit Note',
    'Debit Note',
    'Stock Journal',
];

export default function DayBookPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [vouchers, setVouchers] = useState<DayBookVoucher[]>([]);
    const [allVoucherTypes, setAllVoucherTypes] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [voucherTypeFilter, setVoucherTypeFilter] = useState('All Types');

    useEffect(() => {
        if (selectedCompany?.id) {
            loadVoucherTypes();
            loadDayBook();
        }
    }, [selectedCompany, selectedDate]);

    useEffect(() => {
        if (selectedCompany?.id) loadDayBook();
    }, [voucherTypeFilter]);

    const loadVoucherTypes = async () => {
        try {
            const { data, error } = await supabase
                .from('vouchers')
                .select('voucher_type')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false);

            if (error) throw error;
            const types = [...new Set((data || []).map((v: any) => v.voucher_type))].sort() as string[];
            setAllVoucherTypes(types);
        } catch (error) {
            console.error('Error loading voucher types:', error);
        }
    };

    const loadDayBook = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .eq('voucher_date', selectedDate)
                .order('voucher_date', { ascending: true });

            if (voucherTypeFilter !== 'All Types') {
                query = query.eq('voucher_type', voucherTypeFilter);
            }

            const { data, error } = await query.limit(10000);
            if (error) throw error;

            const processed: DayBookVoucher[] = (data || []).map((v: any) => {
                const amount = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                // Determine if it's debit or credit based on voucher type
                const isDebitType = ['Purchase', 'Payment', 'Debit Note', 'Expense', 'Purchase Return'].includes(v.voucher_type);
                return {
                    id: v.id,
                    voucher_type: v.voucher_type,
                    voucher_number: v.voucher_number || '-',
                    voucher_date: v.voucher_date,
                    party_name: v.party_name || v.ledger_name || '-',
                    total_amount: Number(v.total_amount) || 0,
                    grand_total: Number(v.grand_total) || 0,
                    debit: amount,
                    credit: 0,
                };
            });

            setVouchers(processed);
        } catch (error) {
            console.error('Error loading day book:', error);
        }
        setLoading(false);
    };

    const summary = useMemo(() => {
        const totalVouchers = vouchers.length;
        const totalDebit = vouchers.reduce((s, v) => s + v.debit, 0);
        const totalCredit = vouchers.reduce((s, v) => s + v.credit, 0);
        return { totalVouchers, totalDebit, totalCredit };
    }, [vouchers]);

    const filteredVouchers = useMemo(() => {
        return vouchers;
    }, [vouchers]);

    const exportToCsv = () => {
        const rows = [['Time', 'Voucher Type', 'Voucher #', 'Party', 'Debit (₹)', 'Credit (₹)']];
        filteredVouchers.forEach(v => {
            rows.push([
                v.voucher_date || '',
                v.voucher_type,
                v.voucher_number,
                v.party_name,
                formatCurrency(v.debit),
                formatCurrency(v.credit),
            ]);
        });
        rows.push([]);
        rows.push(['', '', 'TOTAL', '', formatCurrency(summary.totalDebit), formatCurrency(summary.totalCredit)]);

        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DayBook_${selectedDate}_${selectedCompany?.name || 'Company'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] uppercase tracking-tighter leading-none">Day Book</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                        {selectedCompany.name} • {format(parseISO(selectedDate), 'dd MMM yyyy')}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-2">
                    {/* Date Picker */}
                    <div className="flex items-center gap-1.5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl px-2 py-1.5">
                        <Calendar size={12} className="text-[var(--primary)]" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent text-[9px] font-bold uppercase outline-none w-24 text-[var(--on-surface)]"
                        />
                    </div>

                    {/* Voucher Type Filter */}
                    <div className="flex items-center gap-1.5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl px-2 py-1.5">
                        <Filter size={12} className="text-[var(--text-muted)]" />
                        <select
                            value={voucherTypeFilter}
                            onChange={(e) => setVoucherTypeFilter(e.target.value)}
                            className="bg-transparent text-[9px] font-bold uppercase outline-none text-[var(--on-surface)] cursor-pointer"
                        >
                            {VOUCHER_TYPE_OPTIONS.map(opt => (
                                <option key={opt} value={opt} className="bg-[var(--surface)] text-[var(--on-surface)]">
                                    {opt}
                                </option>
                            ))}
                            {allVoucherTypes
                                .filter(t => !VOUCHER_TYPE_OPTIONS.includes(t))
                                .map(t => (
                                    <option key={t} value={t} className="bg-[var(--surface)] text-[var(--on-surface)]">
                                        {t}
                                    </option>
                                ))}
                        </select>
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={loadDayBook}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface-active)] text-[var(--on-surface-variant)] transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <button
                    onClick={exportToCsv}
                    disabled={loading || vouchers.length === 0}
                    className="w-9 h-9 flex items-center justify-center bg-[var(--primary)] text-white rounded-xl shadow-lg shadow-[var(--primary-glow)] hover:scale-105 transition-transform disabled:opacity-50"
                    title="Export CSV"
                >
                    <Download size={18} />
                </button>
            </HeaderPortal>

            <AnimatePresence mode="wait">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Spinner size="md" />
                    </div>
                ) : filteredVouchers.length > 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-blue-500/20 to-indigo-600/10 p-6 rounded-3xl border border-blue-500/30">
                                <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-2">Total Vouchers</p>
                                <p className="text-3xl font-black text-blue-400">{summary.totalVouchers}</p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/10 p-6 rounded-3xl border border-emerald-500/30">
                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2">Total Debit</p>
                                <p className="text-3xl font-black text-emerald-400">{formatCurrency(summary.totalDebit)}</p>
                            </div>
                            <div className="bg-gradient-to-br from-rose-500/20 to-orange-600/10 p-6 rounded-3xl border border-rose-500/30">
                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-2">Total Credit</p>
                                <p className="text-3xl font-black text-rose-400">{formatCurrency(summary.totalCredit)}</p>
                            </div>
                        </div>

                        {/* Voucher Table */}
                        <GlassCard className="p-6">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[var(--border)]">
                                            <th className="text-left pb-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={10} />
                                                    Date
                                                </div>
                                            </th>
                                            <th className="text-left pb-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">
                                                <div className="flex items-center gap-1.5">
                                                    <Book size={10} />
                                                    Voucher Type
                                                </div>
                                            </th>
                                            <th className="text-left pb-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Voucher #</th>
                                            <th className="text-left pb-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Party</th>
                                            <th className="text-right pb-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Debit (₹)</th>
                                            <th className="text-right pb-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Credit (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredVouchers.map((voucher, i) => (
                                            <tr key={voucher.id} className="border-b border-[var(--border)]/30 hover:bg-[var(--surface)]/30 transition-colors">
                                                <td className="py-3 text-[10px] font-mono text-[var(--text-muted)]">{voucher.voucher_date}</td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                                                        voucher.voucher_type === 'Sales' ? 'bg-emerald-500/20 text-emerald-500' :
                                                        voucher.voucher_type === 'Purchase' ? 'bg-rose-500/20 text-rose-500' :
                                                        voucher.voucher_type === 'Payment' ? 'bg-amber-500/20 text-amber-500' :
                                                        voucher.voucher_type === 'Receipt' ? 'bg-blue-500/20 text-blue-500' :
                                                        voucher.voucher_type === 'Contra' ? 'bg-purple-500/20 text-purple-500' :
                                                        voucher.voucher_type === 'Journal' ? 'bg-cyan-500/20 text-cyan-500' :
                                                        'bg-gray-500/20 text-gray-400'
                                                    }`}>
                                                        {voucher.voucher_type}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-[10px] font-mono text-[var(--text-muted)]">{voucher.voucher_number}</td>
                                                <td className="py-3 text-[10px] font-medium text-[var(--on-surface)] max-w-[150px] truncate">{voucher.party_name}</td>
                                                <td className="py-3 text-right text-[10px] font-mono text-emerald-500">
                                                    {voucher.debit > 0 ? formatCurrency(voucher.debit) : '-'}
                                                </td>
                                                <td className="py-3 text-right text-[10px] font-mono text-rose-500">
                                                    {voucher.credit > 0 ? formatCurrency(voucher.credit) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {/* Summary Row */}
                                    <tfoot>
                                        <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-variant)]/50">
                                            <td className="py-3 text-[10px] font-black text-[var(--on-surface)]" colSpan={2}>
                                                Total
                                            </td>
                                            <td className="py-3 text-[10px] font-black text-[var(--on-surface)]">{summary.totalVouchers} entries</td>
                                            <td className="py-3"></td>
                                            <td className="py-3 text-right text-[10px] font-mono font-black text-emerald-400">
                                                {formatCurrency(summary.totalDebit)}
                                            </td>
                                            <td className="py-3 text-right text-[10px] font-mono font-black text-rose-400">
                                                {formatCurrency(summary.totalCredit)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </GlassCard>

                        {/* Footer */}
                        <div className="text-center">
                            <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                Day Book for {format(parseISO(selectedDate), 'dd MMM yyyy, EEEE')}
                                {' • '}{voucherTypeFilter === 'All Types' ? 'All voucher types' : voucherTypeFilter}
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Book size={48} className="text-[var(--text-muted)] opacity-30 mb-4" />
                        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase">No Transactions</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                            No vouchers found for {format(parseISO(selectedDate), 'dd MMM yyyy')}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {voucherTypeFilter !== 'All Types' ? `Filter: ${voucherTypeFilter}` : 'Select a different date'}
                        </p>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
