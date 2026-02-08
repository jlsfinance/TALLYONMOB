import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { GlassCard, Badge, Button, Spinner } from '@/components/ui/GlassUI';
import {
    Calendar, Download, ChevronRight, ChevronDown, TrendingUp, TrendingDown,
    RefreshCw, Filter, BarChart3
} from 'lucide-react';
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const formatCurrency = (amount: number) => {
    const absAmount = Math.abs(amount || 0);
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(absAmount);
};

// Clickable row component
const PLRow = ({
    label,
    amount,
    isClickable = true,
    isExpanded = false,
    isSubtotal = false,
    isProfit = false,
    isLoss = false,
    indent = 0,
    onClick,
    children
}: any) => {
    const hasChildren = children && children.length > 0;

    return (
        <>
            <div
                onClick={isClickable ? onClick : undefined}
                className={`
                    flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]/30
                    transition-all group
                    ${isClickable ? 'cursor-pointer hover:bg-blue-500/10' : ''}
                    ${isSubtotal ? 'bg-[var(--surface-variant)]/50 font-bold border-t-2 border-b-2 border-[var(--border)]' : ''}
                    ${isProfit ? 'bg-emerald-500/10' : ''}
                    ${isLoss ? 'bg-red-500/10' : ''}
                `}
                style={{ paddingLeft: `${16 + indent * 20}px` }}
            >
                <div className="flex items-center gap-2">
                    {hasChildren && (
                        <span className="text-[var(--text-muted)]">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                    )}
                    {isClickable && !hasChildren && (
                        <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    <span className={`
                        ${isSubtotal ? 'font-bold text-[var(--on-surface)]' : 'text-[var(--on-surface)]'}
                        ${isProfit ? 'text-emerald-500 font-bold' : ''}
                        ${isLoss ? 'text-red-500 font-bold' : ''}
                    `}>
                        {label}
                    </span>
                </div>
                <span className={`
                    font-mono text-sm
                    ${isSubtotal ? 'font-bold text-[var(--on-surface)]' : 'text-[var(--text-muted)]'}
                    ${isProfit ? 'text-emerald-500 font-bold' : ''}
                    ${isLoss ? 'text-red-500 font-bold' : ''}
                `}>
                    {formatCurrency(amount)}
                </span>
            </div>
        </>
    );
};

export default function ProfitLossPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [dateRange, setDateRange] = useState({
        from: selectedCompany?.fy_start || new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (selectedCompany?.id) loadPLData();
    }, [selectedCompany, dateRange]);

    const loadPLData = async () => {
        setLoading(true);
        try {
            // Fetch all ledgers with their groups
            const { data: ledgers, error: ledgersError } = await supabase
                .from('ledgers')
                .select('id, name, parent, opening_balance, current_balance')
                .eq('company_id', selectedCompany.id);

            if (ledgersError) throw ledgersError;

            // Group mapping based on standard Tally primary groups
            const plData: any = {
                // Left Side (Expenses)
                openingStock: 0,
                purchaseAccounts: { total: 0, ledgers: [] },
                directExpenses: { total: 0, ledgers: [] },
                grossProfitCo: 0,
                indirectExpenses: { total: 0, ledgers: [] },
                nettProfit: 0,

                // Right Side (Income)
                salesAccounts: { total: 0, ledgers: [] },
                directIncomes: { total: 0, ledgers: [] },
                closingStock: 0,
                grossProfitBf: 0,
                indirectIncomes: { total: 0, ledgers: [] },
                nettLoss: 0
            };

            // Process Ledgers
            ledgers?.forEach(l => {
                const balance = Number(l.current_balance) || 0;
                // In Tally: 
                // Expenses/Assets are typically Positive (Debit)
                // Incomes/Liabilities are typically Negative (Credit) in some syncs.
                // We use absolute value for side-based display.
                const absBalance = Math.abs(balance);
                if (absBalance === 0) return;

                const group = l.parent || '';

                if (group.includes('Sales Accounts')) {
                    plData.salesAccounts.total += absBalance;
                    plData.salesAccounts.ledgers.push({ name: l.name, amount: absBalance, id: l.id });
                } else if (group.includes('Purchase Accounts')) {
                    plData.purchaseAccounts.total += absBalance;
                    plData.purchaseAccounts.ledgers.push({ name: l.name, amount: absBalance, id: l.id });
                } else if (group.includes('Direct Expenses')) {
                    plData.directExpenses.total += absBalance;
                    plData.directExpenses.ledgers.push({ name: l.name, amount: absBalance, id: l.id });
                } else if (group.includes('Direct Incomes')) {
                    plData.directIncomes.total += absBalance;
                    plData.directIncomes.ledgers.push({ name: l.name, amount: absBalance, id: l.id });
                } else if (group.includes('Indirect Expenses')) {
                    plData.indirectExpenses.total += absBalance;
                    plData.indirectExpenses.ledgers.push({ name: l.name, amount: absBalance, id: l.id });
                } else if (group.includes('Indirect Incomes')) {
                    plData.indirectIncomes.total += absBalance;
                    plData.indirectIncomes.ledgers.push({ name: l.name, amount: absBalance, id: l.id });
                } else if (group.includes('Stock-in-Hand')) {
                    plData.closingStock += absBalance;
                }
            });

            // Get stock values from stock_items table
            const { data: stockItems } = await supabase
                .from('stock_items')
                .select('opening_stock, current_stock, rate, opening_value, closing_value')
                .eq('company_id', selectedCompany.id);

            if (stockItems && stockItems.length > 0) {
                // Prefer direct value columns (synced from Tally)
                const openingVal = stockItems.reduce((sum, item) => sum + (Number(item.opening_value) || 0), 0);
                const closingVal = stockItems.reduce((sum, item) => sum + (Number(item.closing_value) || 0), 0);

                if (openingVal > 0 || closingVal > 0) {
                    plData.openingStock = openingVal;
                    if (plData.closingStock === 0) plData.closingStock = closingVal;
                } else {
                    // Fallback: calculate from qty * rate
                    plData.openingStock = stockItems.reduce((sum, item) => sum + ((Number(item.opening_stock) || 0) * (Number(item.rate) || 0)), 0);
                    const itemsClosingValue = stockItems.reduce((sum, item) => sum + ((Number(item.current_stock) || 0) * (Number(item.rate) || 0)), 0);
                    if (itemsClosingValue > 0 && plData.closingStock === 0) {
                        plData.closingStock = itemsClosingValue;
                    }
                }
            }

            // Calculate Gross Profit
            const tradingCredit = plData.salesAccounts.total + plData.directIncomes.total + plData.closingStock;
            const tradingDebit = plData.openingStock + plData.purchaseAccounts.total + plData.directExpenses.total;

            if (tradingCredit >= tradingDebit) {
                plData.grossProfitCo = tradingCredit - tradingDebit;
                plData.grossProfitBf = plData.grossProfitCo;
            } else {
                plData.grossLossCo = tradingDebit - tradingCredit;
                plData.grossLossBf = plData.grossLossCo;
            }

            // Calculate Net Profit
            const plCredit = (plData.grossProfitBf || 0) + plData.indirectIncomes.total;
            const plDebit = (plData.grossLossBf || 0) + plData.indirectExpenses.total;

            if (plCredit >= plDebit) {
                plData.nettProfit = plCredit - plDebit;
            } else {
                plData.nettLoss = plDebit - plCredit;
            }

            // Calculate totals for balancing
            plData.tradingDebitTotal = tradingDebit + (plData.grossProfitCo || 0);
            plData.tradingCreditTotal = tradingCredit + (plData.grossLossCo || 0);
            plData.plDebitTotal = plDebit + (plData.nettProfit || 0);
            plData.plCreditTotal = plCredit + (plData.nettLoss || 0);

            setData(plData);
        } catch (error) {
            console.error('Error loading P&L data:', error);
            toast.error('Failed to load Profit & Loss');
        } finally {
            setLoading(false);
        }
    };

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    const navigateToLedger = (ledgerId: string) => {
        navigate(`/ledgers/${ledgerId}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <Spinner size="lg" />
                    <p className="mt-4 text-sm text-[var(--text-muted)]">Loading Profit & Loss...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* Tally-style Header */}
            <div className="bg-gradient-to-r from-[#1e3a8a] to-[#1e40af] text-white">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-black tracking-tight">Profit & Loss A/c</h1>
                            <p className="text-blue-200 text-sm">{selectedCompany?.name} - (from {format(new Date(selectedCompany?.fy_start || new Date()), 'd-MMM-yy')})</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                                <Calendar size={16} />
                                <input
                                    type="date"
                                    value={dateRange.from}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                                    className="bg-transparent text-sm outline-none w-28"
                                />
                                <span className="text-blue-200">to</span>
                                <input
                                    type="date"
                                    value={dateRange.to}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                                    className="bg-transparent text-sm outline-none w-28"
                                />
                            </div>
                            <button
                                onClick={() => loadPLData()}
                                className="p-2 bg-white/10 rounded-lg hover:bg-white/20"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Period Bar */}
            <div className="bg-[#1e3a5f] text-white text-center py-2 text-sm font-bold">
                {format(new Date(dateRange.from), 'd-MMM-yy')} to {format(new Date(dateRange.to), 'd-MMM-yy')}
            </div>

            {/* T-Account Layout */}
            <div className="max-w-7xl mx-auto p-4">
                <div className="grid md:grid-cols-2 gap-0 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)]">

                    {/* LEFT SIDE - Expenses/Debit */}
                    <div className="border-r border-[var(--border)]">
                        {/* Header */}
                        <div className="bg-[var(--surface-variant)] px-4 py-3 border-b border-[var(--border)] flex justify-between">
                            <span className="font-black text-sm text-[var(--on-surface)] uppercase tracking-wider">Particulars</span>
                            <span className="font-black text-sm text-[var(--on-surface)] uppercase tracking-wider">Amount (₹)</span>
                        </div>

                        {/* Trading Account - Debit Side */}
                        <div className="border-b-2 border-[var(--border)]">
                            {/* Opening Stock */}
                            <PLRow
                                label="Opening Stock"
                                amount={data?.openingStock || 0}
                                onClick={() => navigate('/stock')}
                            />

                            {/* Purchase Accounts */}
                            <PLRow
                                label="Purchase Accounts"
                                amount={data?.purchaseAccounts?.total || 0}
                                isExpanded={expandedGroups['purchase']}
                                onClick={() => toggleGroup('purchase')}
                                children={data?.purchaseAccounts?.ledgers}
                            />
                            {expandedGroups['purchase'] && data?.purchaseAccounts?.ledgers?.map((l: any) => (
                                <PLRow
                                    key={l.id}
                                    label={l.name}
                                    amount={l.amount}
                                    indent={1}
                                    onClick={() => navigateToLedger(l.id)}
                                />
                            ))}

                            {/* Direct Expenses */}
                            {data?.directExpenses?.total > 0 && (
                                <>
                                    <PLRow
                                        label="Direct Expenses"
                                        amount={data?.directExpenses?.total || 0}
                                        isExpanded={expandedGroups['directExp']}
                                        onClick={() => toggleGroup('directExp')}
                                        children={data?.directExpenses?.ledgers}
                                    />
                                    {expandedGroups['directExp'] && data?.directExpenses?.ledgers?.map((l: any) => (
                                        <PLRow
                                            key={l.id}
                                            label={l.name}
                                            amount={l.amount}
                                            indent={1}
                                            onClick={() => navigateToLedger(l.id)}
                                        />
                                    ))}
                                </>
                            )}

                            {/* Gross Profit c/o */}
                            {(data?.grossProfitCo || 0) > 0 && (
                                <PLRow
                                    label="Gross Profit c/o"
                                    amount={data?.grossProfitCo || 0}
                                    isProfit
                                    isClickable={false}
                                />
                            )}

                            {/* Trading Total */}
                            <PLRow
                                label=""
                                amount={data?.tradingDebitTotal || 0}
                                isSubtotal
                                isClickable={false}
                            />
                        </div>

                        {/* P&L Account - Debit Side */}
                        <div>
                            {/* Indirect Expenses */}
                            <PLRow
                                label="Indirect Expenses"
                                amount={data?.indirectExpenses?.total || 0}
                                isExpanded={expandedGroups['indirectExp']}
                                onClick={() => toggleGroup('indirectExp')}
                                children={data?.indirectExpenses?.ledgers}
                            />
                            {expandedGroups['indirectExp'] && data?.indirectExpenses?.ledgers?.map((l: any) => (
                                <PLRow
                                    key={l.id}
                                    label={l.name}
                                    amount={l.amount}
                                    indent={1}
                                    onClick={() => navigateToLedger(l.id)}
                                />
                            ))}

                            {/* Gross Loss b/f */}
                            {(data?.grossLossBf || 0) > 0 && (
                                <PLRow
                                    label="Gross Loss b/f"
                                    amount={data?.grossLossBf || 0}
                                    isLoss
                                    isClickable={false}
                                />
                            )}

                            {/* Net Profit */}
                            {(data?.nettProfit || 0) > 0 && (
                                <PLRow
                                    label="Nett Profit"
                                    amount={data?.nettProfit || 0}
                                    isProfit
                                    isClickable={false}
                                />
                            )}

                            {/* P&L Total */}
                            <PLRow
                                label=""
                                amount={data?.plDebitTotal || 0}
                                isSubtotal
                                isClickable={false}
                            />
                        </div>
                    </div>

                    {/* RIGHT SIDE - Income/Credit */}
                    <div>
                        {/* Header */}
                        <div className="bg-[var(--surface-variant)] px-4 py-3 border-b border-[var(--border)] flex justify-between">
                            <span className="font-black text-sm text-[var(--on-surface)] uppercase tracking-wider">Particulars</span>
                            <span className="font-black text-sm text-[var(--on-surface)] uppercase tracking-wider">Amount (₹)</span>
                        </div>

                        {/* Trading Account - Credit Side */}
                        <div className="border-b-2 border-[var(--border)]">
                            {/* Sales Accounts */}
                            <PLRow
                                label="Sales Accounts"
                                amount={data?.salesAccounts?.total || 0}
                                isExpanded={expandedGroups['sales']}
                                onClick={() => toggleGroup('sales')}
                                children={data?.salesAccounts?.ledgers}
                            />
                            {expandedGroups['sales'] && data?.salesAccounts?.ledgers?.map((l: any) => (
                                <PLRow
                                    key={l.id}
                                    label={l.name}
                                    amount={l.amount}
                                    indent={1}
                                    onClick={() => navigateToLedger(l.id)}
                                />
                            ))}

                            {/* Direct Incomes */}
                            {data?.directIncomes?.total > 0 && (
                                <>
                                    <PLRow
                                        label="Direct Incomes"
                                        amount={data?.directIncomes?.total || 0}
                                        isExpanded={expandedGroups['directInc']}
                                        onClick={() => toggleGroup('directInc')}
                                        children={data?.directIncomes?.ledgers}
                                    />
                                    {expandedGroups['directInc'] && data?.directIncomes?.ledgers?.map((l: any) => (
                                        <PLRow
                                            key={l.id}
                                            label={l.name}
                                            amount={l.amount}
                                            indent={1}
                                            onClick={() => navigateToLedger(l.id)}
                                        />
                                    ))}
                                </>
                            )}

                            {/* Closing Stock */}
                            <PLRow
                                label="Closing Stock"
                                amount={data?.closingStock || 0}
                                onClick={() => navigate('/stock')}
                            />

                            {/* Gross Loss c/o */}
                            {(data?.grossLossCo || 0) > 0 && (
                                <PLRow
                                    label="Gross Loss c/o"
                                    amount={data?.grossLossCo || 0}
                                    isLoss
                                    isClickable={false}
                                />
                            )}

                            {/* Trading Total */}
                            <PLRow
                                label=""
                                amount={data?.tradingCreditTotal || 0}
                                isSubtotal
                                isClickable={false}
                            />
                        </div>

                        {/* P&L Account - Credit Side */}
                        <div>
                            {/* Gross Profit b/f */}
                            {(data?.grossProfitBf || 0) > 0 && (
                                <PLRow
                                    label="Gross Profit b/f"
                                    amount={data?.grossProfitBf || 0}
                                    isProfit
                                    isClickable={false}
                                />
                            )}

                            {/* Indirect Incomes */}
                            {data?.indirectIncomes?.total > 0 && (
                                <>
                                    <PLRow
                                        label="Indirect Incomes"
                                        amount={data?.indirectIncomes?.total || 0}
                                        isExpanded={expandedGroups['indirectInc']}
                                        onClick={() => toggleGroup('indirectInc')}
                                        children={data?.indirectIncomes?.ledgers}
                                    />
                                    {expandedGroups['indirectInc'] && data?.indirectIncomes?.ledgers?.map((l: any) => (
                                        <PLRow
                                            key={l.id}
                                            label={l.name}
                                            amount={l.amount}
                                            indent={1}
                                            onClick={() => navigateToLedger(l.id)}
                                        />
                                    ))}
                                </>
                            )}

                            {/* Net Loss */}
                            {(data?.nettLoss || 0) > 0 && (
                                <PLRow
                                    label="Nett Loss"
                                    amount={data?.nettLoss || 0}
                                    isLoss
                                    isClickable={false}
                                />
                            )}

                            {/* P&L Total */}
                            <PLRow
                                label=""
                                amount={data?.plCreditTotal || 0}
                                isSubtotal
                                isClickable={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer - Grand Total */}
                <div className="mt-4 bg-gradient-to-r from-[#1e3a8a] to-[#1e40af] text-white rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {(data?.nettProfit || 0) > 0 ? (
                                <>
                                    <TrendingUp size={24} className="text-emerald-400" />
                                    <div>
                                        <p className="text-sm text-blue-200">Net Profit</p>
                                        <p className="text-2xl font-black text-emerald-400">₹{formatCurrency(data?.nettProfit || 0)}</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <TrendingDown size={24} className="text-red-400" />
                                    <div>
                                        <p className="text-sm text-blue-200">Net Loss</p>
                                        <p className="text-2xl font-black text-red-400">₹{formatCurrency(data?.nettLoss || 0)}</p>
                                    </div>
                                </>
                            )}
                        </div>
                        <button className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 flex items-center gap-2">
                            <Download size={16} />
                            Export
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
