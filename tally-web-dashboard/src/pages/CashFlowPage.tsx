import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Download, RefreshCw, TrendingUp, TrendingDown, Wallet, Landmark } from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

interface CashFlowEntry {
    category: string;
    description: string;
    amount: number;
    voucher_type: string;
    voucher_number: string;
    voucher_date: string;
}

interface CashFlowCategory {
    name: string;
    entries: CashFlowEntry[];
    total: number;
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(Math.abs(amount || 0));

export default function CashFlowPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [inflows, setInflows] = useState<CashFlowCategory[]>([]);
    const [outflows, setOutflows] = useState<CashFlowCategory[]>([]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [closingBalance, setClosingBalance] = useState(0);
    const [cashLedgers, setCashLedgers] = useState<any[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const monthLabel = useMemo(() => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        return format(date, 'MMMM yyyy');
    }, [selectedMonth]);

    const monthRange = useMemo(() => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const start = startOfMonth(new Date(year, month - 1, 1));
        const end = endOfMonth(new Date(year, month - 1, 1));
        return {
            start: format(start, 'yyyy-MM-dd'),
            end: format(end, 'yyyy-MM-dd'),
        };
    }, [selectedMonth]);

    useEffect(() => {
        if (selectedCompany?.id) loadCashFlow();
    }, [selectedCompany, selectedMonth]);

    const loadCashFlow = async () => {
        setLoading(true);
        try {
            // 1. Fetch cash & bank ledgers
            const { data: ledgers, error: ledgersError } = await supabase
                .from('ledgers')
                .select('id, name, parent_group, parent, current_balance, opening_balance')
                .eq('company_id', selectedCompany.id);

            if (ledgersError) throw ledgersError;

            // Identify cash/bank ledgers
            const cashBankLedgers = (ledgers || []).filter((l: any) => {
                const p = ((l.parent_group || l.parent || '') + ' ' + (l.name || '')).toLowerCase();
                return p.includes('cash') || p.includes('bank') || p.includes('current account') || p.includes('savings');
            });

            setCashLedgers(cashBankLedgers);

            // Calculate opening and closing balance for cash/bank
            const totalOpening = cashBankLedgers.reduce((s: number, l: any) => s + (Number(l.opening_balance) || 0), 0);
            const totalCurrent = cashBankLedgers.reduce((s: number, l: any) => s + (Number(l.current_balance) || 0), 0);
            setOpeningBalance(totalOpening);
            setClosingBalance(totalCurrent);

            // 2. Fetch vouchers for the selected month
            const { data: vouchers, error: vouchersError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .gte('voucher_date', monthRange.start)
                .lte('voucher_date', monthRange.end)
                .order('voucher_date', { ascending: true });

            if (vouchersError) throw vouchersError;

            // 3. Fetch voucher_ledger_entries to find cash/bank linked transactions
            const voucherIds = (vouchers || []).map((v: any) => v.id);
            let voucherLedgerEntries: any[] = [];

            if (voucherIds.length > 0) {
                // Process in batches of 100
                for (let i = 0; i < voucherIds.length; i += 100) {
                    const batch = voucherIds.slice(i, i + 100);
                    const { data: entries } = await supabase
                        .from('voucher_ledger_entries')
                        .select('*')
                        .in('voucher_id', batch);
                    if (entries) voucherLedgerEntries = [...voucherLedgerEntries, ...entries];
                }
            }

            // Map voucher_id to its ledger entries
            const entriesByVoucher = new Map<string, any[]>();
            voucherLedgerEntries.forEach((entry: any) => {
                const vid = entry.voucher_id;
                if (!entriesByVoucher.has(vid)) entriesByVoucher.set(vid, []);
                entriesByVoucher.get(vid)!.push(entry);
            });

            // Get cash/bank ledger IDs for filtering
            const cashBankLedgerIds = new Set(cashBankLedgers.map((l: any) => l.id));

            // Categorize cash flow entries
            const inflowEntries: CashFlowEntry[] = [];
            const outflowEntries: CashFlowEntry[] = [];

            (vouchers || []).forEach((v: any) => {
                const entries = entriesByVoucher.get(v.id) || [];
                const amount = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                if (amount === 0) return;

                // Check if this voucher involves cash/bank ledgers
                const hasCashBankEntry = entries.some((e: any) =>
                    cashBankLedgerIds.has(e.ledger_id) || cashBankLedgerIds.has(e.ledger_name)
                );

                if (!hasCashBankEntry) return;

                // Determine if inflow or outflow based on voucher type
                // Sales, Receipt = Inflow; Purchase, Payment = Outflow
                const isInflow = ['Sales', 'Receipt', 'Credit Note', 'Sales Return'].includes(v.voucher_type);
                const isOutflow = ['Purchase', 'Payment', 'Debit Note', 'Purchase Return', 'Expense'].includes(v.voucher_type);

                // For Contra/Journal, check the nature of the cash/bank entry
                let effectiveInflow = isInflow;
                let effectiveOutflow = isOutflow;

                if (!isInflow && !isOutflow) {
                    // For journal/contra, infer from cash/bank entry direction
                    const cashBankEntries = entries.filter((e: any) =>
                        cashBankLedgerIds.has(e.ledger_id) || cashBankLedgerIds.has(e.ledger_name)
                    );
                    const netCashEffect = cashBankEntries.reduce((sum: number, e: any) => {
                        return sum + (Number(e.debit) || 0) - (Number(e.credit) || 0);
                    }, 0);
                    effectiveInflow = netCashEffect > 0;
                    effectiveOutflow = netCashEffect < 0;
                }

                const entry: CashFlowEntry = {
                    category: v.voucher_type === 'Sales' ? 'Sales Revenue' :
                        v.voucher_type === 'Receipt' ? 'Receipts' :
                            v.voucher_type === 'Credit Note' ? 'Credit Notes' :
                                v.voucher_type === 'Purchase' ? 'Purchases' :
                                    v.voucher_type === 'Payment' ? 'Payments' :
                                        v.voucher_type === 'Debit Note' ? 'Debit Notes' :
                                            v.voucher_type === 'Contra' ? 'Contra' : 'Other',
                    description: v.party_name || v.ledger_name || v.voucher_number || '',
                    amount,
                    voucher_type: v.voucher_type,
                    voucher_number: v.voucher_number || '-',
                    voucher_date: v.voucher_date,
                };

                if (effectiveInflow) {
                    inflowEntries.push(entry);
                } else if (effectiveOutflow) {
                    outflowEntries.push(entry);
                }
            });

            // Group into categories
            const groupByCategory = (entries: CashFlowEntry[]): CashFlowCategory[] => {
                const map = new Map<string, CashFlowEntry[]>();
                entries.forEach(e => {
                    if (!map.has(e.category)) map.set(e.category, []);
                    map.get(e.category)!.push(e);
                });
                return Array.from(map.entries())
                    .map(([name, entries]) => ({
                        name,
                        entries,
                        total: entries.reduce((s, e) => s + e.amount, 0),
                    }))
                    .sort((a, b) => b.total - a.total);
            };

            setInflows(groupByCategory(inflowEntries));
            setOutflows(groupByCategory(outflowEntries));
        } catch (error) {
            console.error('Error loading cash flow:', error);
        }
        setLoading(false);
    };

    const totalInflow = useMemo(() =>
        inflows.reduce((s, c) => s + c.total, 0),
        [inflows]
    );

    const totalOutflow = useMemo(() =>
        outflows.reduce((s, c) => s + c.total, 0),
        [outflows]
    );

    const netCashFlow = useMemo(() => totalInflow - totalOutflow, [totalInflow, totalOutflow]);

    const exportToCsv = () => {
        const rows: string[][] = [['Type', 'Category', 'Description', 'Voucher Type', 'Voucher #', 'Amount (₹)']];
        inflows.forEach(cat => {
            cat.entries.forEach(e => {
                rows.push(['Inflow', cat.name, e.description, e.voucher_type, e.voucher_number, formatCurrency(e.amount)]);
            });
        });
        outflows.forEach(cat => {
            cat.entries.forEach(e => {
                rows.push(['Outflow', cat.name, e.description, e.voucher_type, e.voucher_number, formatCurrency(e.amount)]);
            });
        });
        rows.push([]);
        rows.push(['', '', '', 'Opening Balance', '', formatCurrency(openingBalance)]);
        rows.push(['', '', '', 'Total Inflow', '', formatCurrency(totalInflow)]);
        rows.push(['', '', '', 'Total Outflow', '', formatCurrency(totalOutflow)]);
        rows.push(['', '', '', 'Net Cash Flow', '', formatCurrency(netCashFlow)]);
        rows.push(['', '', '', 'Closing Balance', '', formatCurrency(closingBalance)]);

        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CashFlow_${monthLabel}_${selectedCompany?.name || 'Company'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderCategoryGroup = (title: string, categories: CashFlowCategory[], type: 'inflow' | 'outflow') => {
        const total = type === 'inflow' ? totalInflow : totalOutflow;
        const colorClass = type === 'inflow' ? 'text-emerald-400' : 'text-rose-400';
        const bgClass = type === 'inflow' ? 'from-emerald-500/10 to-teal-600/5 border-emerald-500/20' : 'from-rose-500/10 to-orange-600/5 border-rose-500/20';
        const icon = type === 'inflow' ? <TrendingUp size={16} /> : <TrendingDown size={16} />;

        return (
            <GlassCard className={`p-6 ${type === 'inflow' ? 'lg:col-span-1' : 'lg:col-span-1'}`}>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        <span className={`${colorClass}`}>{icon}</span>
                        <h3 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-tight">{title}</h3>
                    </div>
                    <span className={`text-sm font-black ${colorClass}`}>{formatCurrency(total)}</span>
                </div>

                <div className="space-y-3">
                    {categories.map((cat) => (
                        <div key={cat.name} className="bg-[var(--surface-variant)]/50 rounded-xl border border-[var(--border)] overflow-hidden">
                            <div className="flex justify-between items-center px-3 py-2">
                                <span className="text-[10px] font-bold text-[var(--on-surface)]">{cat.name}</span>
                                <span className={`text-[10px] font-mono font-semibold ${colorClass}`}>{formatCurrency(cat.total)}</span>
                            </div>
                            {cat.entries.length > 0 && (
                                <div className="border-t border-[var(--border)]/30 divide-y divide-[var(--border)]/20">
                                    {cat.entries.map((entry, i) => (
                                        <div key={i} className="flex justify-between items-center px-3 py-1.5">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span className="text-[8px] font-mono text-[var(--text-muted)]">{entry.voucher_date}</span>
                                                <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase">#{entry.voucher_number}</span>
                                                <span className="text-[9px] text-[var(--on-surface)] truncate">{entry.description}</span>
                                            </div>
                                            <span className={`text-[9px] font-mono flex-shrink-0 ${colorClass}`}>{formatCurrency(entry.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {categories.length === 0 && (
                        <div className="text-center py-8">
                            <p className="text-[10px] text-[var(--text-muted)]">No {type === 'inflow' ? 'inflows' : 'outflows'} for this period</p>
                        </div>
                    )}
                </div>
            </GlassCard>
        );
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] uppercase tracking-tighter leading-none">Cash Flow Statement</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                        {selectedCompany.name} • {monthLabel}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-2">
                    {/* Month Picker */}
                    <div className="flex items-center gap-1.5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl px-2 py-1.5">
                        <Calendar size={12} className="text-[var(--primary)]" />
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-transparent text-[9px] font-bold uppercase outline-none w-28 text-[var(--on-surface)]"
                        />
                    </div>
                    <button
                        onClick={loadCashFlow}
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
                    disabled={loading || (inflows.length === 0 && outflows.length === 0)}
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
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Balance Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gradient-to-br from-blue-500/20 to-cyan-600/10 p-4 md:p-6 rounded-3xl border border-blue-500/30">
                                <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Opening Balance</p>
                                <p className="text-lg md:text-2xl font-black text-blue-400">{formatCurrency(openingBalance)}</p>
                                <p className="text-[7px] text-blue-400/60 mt-1">{cashLedgers.length} cash/bank ledgers</p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/10 p-4 md:p-6 rounded-3xl border border-emerald-500/30">
                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Total Inflows</p>
                                <p className="text-lg md:text-2xl font-black text-emerald-400">{formatCurrency(totalInflow)}</p>
                                <p className="text-[7px] text-emerald-400/60 mt-1">{inflows.reduce((s, c) => s + c.entries.length, 0)} transactions</p>
                            </div>
                            <div className="bg-gradient-to-br from-rose-500/20 to-orange-600/10 p-4 md:p-6 rounded-3xl border border-rose-500/30">
                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1">Total Outflows</p>
                                <p className="text-lg md:text-2xl font-black text-rose-400">{formatCurrency(totalOutflow)}</p>
                                <p className="text-[7px] text-rose-400/60 mt-1">{outflows.reduce((s, c) => s + c.entries.length, 0)} transactions</p>
                            </div>
                            <div className={`bg-gradient-to-br p-4 md:p-6 rounded-3xl border ${netCashFlow >= 0
                                ? 'from-green-500/20 to-emerald-600/10 border-green-500/30'
                                : 'from-red-500/20 to-rose-600/10 border-red-500/30'
                                }`}>
                                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Net Cash Flow</p>
                                <p className={`text-lg md:text-2xl font-black ${netCashFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
                                </p>
                            </div>
                        </div>

                        {/* Closing Balance Banner */}
                        <div className="bg-gradient-to-r from-[#1e3a8a] to-[#1e40af] text-white rounded-2xl p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Wallet size={24} className="text-blue-300" />
                                <div>
                                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Closing Balance</p>
                                    <p className="text-2xl font-black">{formatCurrency(closingBalance)}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-black text-blue-200 uppercase tracking-widest">{monthLabel}</p>
                                <p className="text-[10px] font-mono">{totalInflow - totalOutflow >= 0 ? '+' : ''}{formatCurrency(totalInflow - totalOutflow)} movement</p>
                            </div>
                        </div>

                        {/* Inflow vs Outflow Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {renderCategoryGroup('Cash Inflows', inflows, 'inflow')}
                            {renderCategoryGroup('Cash Outflows', outflows, 'outflow')}
                        </div>

                        {/* Cash Breakdown */}
                        <GlassCard className="p-6">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border)]">
                                <Landmark size={16} className="text-[var(--primary)]" />
                                <h3 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-tight">Cash & Bank Ledgers Details</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">
                                            <th className="text-left pb-2">Ledger Name</th>
                                            <th className="text-left pb-2">Group</th>
                                            <th className="text-right pb-2">Opening Balance</th>
                                            <th className="text-right pb-2">Current Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cashLedgers.map((ledger: any, i: number) => (
                                            <tr key={ledger.id} className="border-b border-[var(--border)]/20 hover:bg-[var(--surface)]/30 transition-colors">
                                                <td className="py-2.5 text-[10px] font-medium text-[var(--on-surface)]">{ledger.name}</td>
                                                <td className="py-2.5 text-[9px] text-[var(--text-muted)]">{ledger.parent_group || ledger.parent || '-'}</td>
                                                <td className={`py-2.5 text-right text-[10px] font-mono ${Number(ledger.opening_balance) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {formatCurrency(Number(ledger.opening_balance) || 0)}
                                                </td>
                                                <td className={`py-2.5 text-right text-[10px] font-mono ${Number(ledger.current_balance) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {formatCurrency(Number(ledger.current_balance) || 0)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {cashLedgers.length > 0 && (
                                        <tfoot>
                                            <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-variant)]/50">
                                                <td className="py-3 text-[10px] font-black text-[var(--on-surface)]">Total</td>
                                                <td className="py-3"></td>
                                                <td className="py-3 text-right text-[10px] font-mono font-black text-emerald-400">{formatCurrency(openingBalance)}</td>
                                                <td className="py-3 text-right text-[10px] font-mono font-black text-emerald-400">{formatCurrency(closingBalance)}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                                {cashLedgers.length === 0 && (
                                    <div className="text-center py-8">
                                        <Landmark size={32} className="text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                        <p className="text-[10px] text-[var(--text-muted)]">No cash or bank ledgers found</p>
                                    </div>
                                )}
                            </div>
                        </GlassCard>

                        {/* Footer */}
                        <div className="text-center">
                            <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                Cash Flow Statement for {monthLabel}
                                {' • '}Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
