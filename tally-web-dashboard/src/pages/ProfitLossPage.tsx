import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, Download, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { FinancialYearFilter } from '@/components/shared/FinancialYearFilter';

interface LedgerGroup {
    name: string;
    ledgers: { name: string; balance: number }[];
    total: number;
}

interface PnLData {
    revenue: LedgerGroup[];
    expenses: LedgerGroup[];
    totalRevenue: number;
    totalExpenses: number;
    grossProfit: number;
    netProfit: number;
    profitMargin: number;
}

export default function ProfitLossPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [pnlData, setPnlData] = useState<PnLData | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());

    // Calculate FY date range
    const fyDateRange = useMemo(() => {
        const startYearText = selectedFy.split(' ')[1].split('-')[0];
        const startYear = parseInt(startYearText);
        return {
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };
    }, [selectedFy]);

    useEffect(() => {
        if (selectedCompany?.id) loadPnLData();
    }, [selectedCompany, selectedFy]);

    const loadPnLData = async () => {
        setLoading(true);
        try {
            // Fetch all ledgers with their groups
            const { data: ledgers, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', selectedCompany.id);

            if (error) throw error;

            // Define revenue groups (Sales, Direct Income)
            const revenueGroups = ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes', 'Income (Direct)', 'Income (Indirect)'];
            const expenseGroups = ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses', 'Expenses (Direct)', 'Expenses (Indirect)', 'Manufacturing Expenses'];

            // Fetch voucher data for P&L calculation
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', fyDateRange.start)
                .lte('voucher_date', fyDateRange.end)
                .eq('is_deleted', false);

            // Calculate revenue from sales vouchers
            const salesVouchers = (vouchers || []).filter((v: any) =>
                v.voucher_type === 'Sales' || v.voucher_type === 'Receipt'
            );
            const totalSales = salesVouchers.reduce((sum: number, v: any) =>
                sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0
            );

            // Calculate purchases/expenses from purchase vouchers
            const purchaseVouchers = (vouchers || []).filter((v: any) =>
                v.voucher_type === 'Purchase' || v.voucher_type === 'Payment'
            );
            const totalPurchases = purchaseVouchers.reduce((sum: number, v: any) =>
                sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0
            );

            // Group ledgers by parent
            const revenueData: LedgerGroup[] = [];
            const expenseData: LedgerGroup[] = [];

            // Process ledgers into groups
            const ledgersByParent: Record<string, { name: string; balance: number }[]> = {};
            (ledgers || []).forEach((ledger: any) => {
                const parent = ledger.parent || ledger.ledger_type || 'Other';
                if (!ledgersByParent[parent]) ledgersByParent[parent] = [];
                ledgersByParent[parent].push({
                    name: ledger.name,
                    balance: Math.abs(Number(ledger.current_balance) || 0)
                });
            });

            // Categorize into revenue and expenses
            Object.entries(ledgersByParent).forEach(([parent, ledgerList]) => {
                const groupTotal = ledgerList.reduce((sum, l) => sum + l.balance, 0);
                const group: LedgerGroup = { name: parent, ledgers: ledgerList, total: groupTotal };

                if (revenueGroups.some(rg => parent.toLowerCase().includes(rg.toLowerCase()))) {
                    revenueData.push(group);
                } else if (expenseGroups.some(eg => parent.toLowerCase().includes(eg.toLowerCase()))) {
                    expenseData.push(group);
                }
            });

            // Use voucher data for accurate totals
            const totalRevenue = totalSales || revenueData.reduce((sum, g) => sum + g.total, 0);
            const totalExpenses = totalPurchases || expenseData.reduce((sum, g) => sum + g.total, 0);
            const grossProfit = totalRevenue - totalPurchases;
            const netProfit = totalRevenue - totalExpenses;
            const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

            setPnlData({
                revenue: revenueData,
                expenses: expenseData,
                totalRevenue,
                totalExpenses,
                grossProfit,
                netProfit,
                profitMargin
            });
        } catch (error) {
            console.error('Error loading P&L data:', error);
        }
        setLoading(false);
    };

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupName)
                ? prev.filter(g => g !== groupName)
                : [...prev, groupName]
        );
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);

    const exportPnL = () => {
        if (!pnlData) return;
        const exportData = {
            company: selectedCompany.name,
            financialYear: selectedFy,
            generatedAt: new Date().toISOString(),
            ...pnlData
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ProfitLoss_${selectedFy.replace(' ', '_')}_${selectedCompany.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)] uppercase tracking-tighter">Profit & Loss</h1>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-1">{selectedCompany.name}</p>
                </div>
                <button
                    onClick={exportPnL}
                    disabled={!pnlData || loading}
                    className="px-6 py-3 bg-[var(--primary)] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 hover:scale-105 transition-transform"
                >
                    <Download size={16} /> Export Report
                </button>
            </header>

            {/* FY Filter */}
            <FinancialYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />

            <AnimatePresence mode="wait">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Spinner size="md" />
                    </div>
                ) : pnlData ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Key Metrics Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 p-6 rounded-3xl border border-emerald-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp size={18} className="text-emerald-500" />
                                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Total Revenue</span>
                                </div>
                                <p className="text-2xl font-black text-emerald-400">{formatCurrency(pnlData.totalRevenue)}</p>
                            </div>

                            <div className="bg-gradient-to-br from-rose-500/20 to-rose-600/10 p-6 rounded-3xl border border-rose-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingDown size={18} className="text-rose-500" />
                                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest">Total Expenses</span>
                                </div>
                                <p className="text-2xl font-black text-rose-400">{formatCurrency(pnlData.totalExpenses)}</p>
                            </div>

                            <div className={`bg-gradient-to-br ${pnlData.netProfit >= 0 ? 'from-blue-500/20 to-blue-600/10 border-blue-500/30' : 'from-orange-500/20 to-orange-600/10 border-orange-500/30'} p-6 rounded-3xl border`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <DollarSign size={18} className={pnlData.netProfit >= 0 ? 'text-blue-500' : 'text-orange-500'} />
                                    <span className={`text-[8px] font-black uppercase tracking-widest ${pnlData.netProfit >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
                                        Net {pnlData.netProfit >= 0 ? 'Profit' : 'Loss'}
                                    </span>
                                </div>
                                <p className={`text-2xl font-black ${pnlData.netProfit >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                                    {formatCurrency(Math.abs(pnlData.netProfit))}
                                </p>
                            </div>

                            <div className="bg-gradient-to-br from-violet-500/20 to-violet-600/10 p-6 rounded-3xl border border-violet-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <Percent size={18} className="text-violet-500" />
                                    <span className="text-[8px] font-black text-violet-500 uppercase tracking-widest">Profit Margin</span>
                                </div>
                                <p className="text-2xl font-black text-violet-400">{pnlData.profitMargin.toFixed(1)}%</p>
                            </div>
                        </div>

                        {/* Visual P&L Summary Bar */}
                        <div className="bg-[var(--surface-variant)] p-6 rounded-3xl border border-[var(--border)]">
                            <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Visual Summary</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="h-8 bg-[var(--surface)] rounded-xl overflow-hidden flex">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 flex items-center justify-center"
                                            style={{ width: `${Math.min((pnlData.totalRevenue / (pnlData.totalRevenue + pnlData.totalExpenses)) * 100, 100)}%` }}
                                        >
                                            <span className="text-[8px] font-black text-white uppercase">Revenue</span>
                                        </div>
                                        <div
                                            className="h-full bg-gradient-to-r from-rose-400 to-rose-500 flex items-center justify-center"
                                            style={{ width: `${Math.min((pnlData.totalExpenses / (pnlData.totalRevenue + pnlData.totalExpenses)) * 100, 100)}%` }}
                                        >
                                            <span className="text-[8px] font-black text-white uppercase">Expenses</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={`px-4 py-2 rounded-xl ${pnlData.netProfit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                    {pnlData.netProfit >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                                </div>
                            </div>
                        </div>

                        {/* Detailed P&L Statement */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Revenue Section */}
                            <GlassCard className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-sm font-black text-emerald-500 uppercase tracking-tight flex items-center gap-2">
                                        <TrendingUp size={18} /> Revenue / Income
                                    </h3>
                                    <span className="text-lg font-black text-emerald-400">{formatCurrency(pnlData.totalRevenue)}</span>
                                </div>
                                <div className="space-y-2">
                                    {pnlData.revenue.length > 0 ? pnlData.revenue.map((group, i) => (
                                        <div key={i} className="bg-[var(--surface-variant)]/50 rounded-xl overflow-hidden">
                                            <button
                                                onClick={() => toggleGroup(group.name)}
                                                className="w-full px-4 py-3 flex justify-between items-center hover:bg-[var(--surface-active)] transition-colors"
                                            >
                                                <span className="text-xs font-bold text-[var(--on-surface)]">{group.name}</span>
                                                <span className="text-xs font-black text-emerald-400">{formatCurrency(group.total)}</span>
                                            </button>
                                            {expandedGroups.includes(group.name) && (
                                                <div className="px-4 pb-3 space-y-1">
                                                    {group.ledgers.map((ledger, j) => (
                                                        <div key={j} className="flex justify-between text-[10px] py-1 border-t border-[var(--border)]/50">
                                                            <span className="text-[var(--text-muted)]">{ledger.name}</span>
                                                            <span className="font-bold">{formatCurrency(ledger.balance)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )) : (
                                        <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                                            Revenue calculated from Sales vouchers
                                        </div>
                                    )}
                                </div>
                            </GlassCard>

                            {/* Expenses Section */}
                            <GlassCard className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-sm font-black text-rose-500 uppercase tracking-tight flex items-center gap-2">
                                        <TrendingDown size={18} /> Expenses / Costs
                                    </h3>
                                    <span className="text-lg font-black text-rose-400">{formatCurrency(pnlData.totalExpenses)}</span>
                                </div>
                                <div className="space-y-2">
                                    {pnlData.expenses.length > 0 ? pnlData.expenses.map((group, i) => (
                                        <div key={i} className="bg-[var(--surface-variant)]/50 rounded-xl overflow-hidden">
                                            <button
                                                onClick={() => toggleGroup(group.name)}
                                                className="w-full px-4 py-3 flex justify-between items-center hover:bg-[var(--surface-active)] transition-colors"
                                            >
                                                <span className="text-xs font-bold text-[var(--on-surface)]">{group.name}</span>
                                                <span className="text-xs font-black text-rose-400">{formatCurrency(group.total)}</span>
                                            </button>
                                            {expandedGroups.includes(group.name) && (
                                                <div className="px-4 pb-3 space-y-1">
                                                    {group.ledgers.map((ledger, j) => (
                                                        <div key={j} className="flex justify-between text-[10px] py-1 border-t border-[var(--border)]/50">
                                                            <span className="text-[var(--text-muted)]">{ledger.name}</span>
                                                            <span className="font-bold">{formatCurrency(ledger.balance)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )) : (
                                        <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                                            Expenses calculated from Purchase vouchers
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </div>

                        {/* Bottom Summary */}
                        <div className={`bg-gradient-to-r ${pnlData.netProfit >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-orange-600'} p-8 rounded-[32px] text-white shadow-2xl`}>
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">
                                        {selectedFy} Statement Result
                                    </p>
                                    <h2 className="text-3xl font-black">
                                        {pnlData.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-4xl font-black">{formatCurrency(Math.abs(pnlData.netProfit))}</p>
                                    <p className="text-sm font-bold opacity-80 mt-1">
                                        {pnlData.profitMargin >= 0 ? '+' : ''}{pnlData.profitMargin.toFixed(2)}% margin
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24">
                        <BarChart3 size={48} className="text-[var(--text-muted)] opacity-30 mb-4" />
                        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase">No Data</h3>
                        <p className="text-sm text-[var(--text-muted)]">No financial data found for this period</p>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
