import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Scale, ChevronRight, ChevronDown, Download, Search } from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { CompactYearFilter } from '@/components/shared/CompactYearFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

interface TrialLedger {
    name: string;
    debit: number;
    credit: number;
}

interface TrialGroup {
    parent_group: string;
    group_type: 'Assets' | 'Liabilities' | 'Income' | 'Expenses';
    ledgers: TrialLedger[];
    totalDebit: number;
    totalCredit: number;
    color: string;
}

const GROUP_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    Assets: { label: 'Assets', color: 'emerald', icon: '🏦' },
    Liabilities: { label: 'Liabilities', color: 'rose', icon: '📋' },
    Income: { label: 'Income', color: 'blue', icon: '📈' },
    Expenses: { label: 'Expenses', color: 'amber', icon: '📉' },
};

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Math.abs(amount || 0));

export default function TrialBalancePage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState<TrialGroup[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // Calculate current FY dynamically
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
        if (selectedCompany?.id) loadTrialBalance();
    }, [selectedCompany, selectedFy]);

    const classifyParentGroup = (parent: string): 'Assets' | 'Liabilities' | 'Income' | 'Expenses' => {
        const p = (parent || '').toLowerCase();
        const assetKeywords = ['asset', 'bank', 'cash', 'debtor', 'stock', 'investment', 'deposit', 'loan and advance', 'fixed'];
        const liabilityKeywords = ['liability', 'capital', 'loan', 'creditor', 'reserve', 'surplus', 'provision', 'duties', 'taxes', 'secured loan', 'unsecured loan'];
        const incomeKeywords = ['income', 'revenue', 'sales', 'gain', 'receipt', 'discount received'];
        const expenseKeywords = ['expense', 'expenditure', 'cost', 'purchase', 'salary', 'rent', 'commission', 'discount allowed', 'manufacturing', 'admin'];

        if (assetKeywords.some(k => p.includes(k))) return 'Assets';
        if (liabilityKeywords.some(k => p.includes(k))) return 'Liabilities';
        if (incomeKeywords.some(k => p.includes(k))) return 'Income';
        if (expenseKeywords.some(k => p.includes(k))) return 'Expenses';

        // Fallback: balance sign heuristic
        // Debit balance (positive) → Assets/Expenses, Credit balance (negative) → Liabilities/Income
        return 'Assets';
    };

    const loadTrialBalance = async () => {
        setLoading(true);
        try {
            const { data: ledgers, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', selectedCompany.id);

            if (error) throw error;

            // Group ledgers by parent_group
            const groupMap = new Map<string, TrialLedger[]>();

            (ledgers || []).forEach((l: any) => {
                const parentGroup = l.parent_group || l.parent || 'Uncategorised';
                const balance = Number(l.current_balance) || 0;
                const ledger: TrialLedger = {
                    name: l.name,
                    debit: balance > 0 ? balance : 0,
                    credit: balance < 0 ? Math.abs(balance) : 0,
                };

                if (!groupMap.has(parentGroup)) {
                    groupMap.set(parentGroup, []);
                }
                groupMap.get(parentGroup)!.push(ledger);
            });

            // Convert to TrialGroup array
            const trialGroups: TrialGroup[] = [];
            groupMap.forEach((ledgers, parentGroup) => {
                const totalDebit = ledgers.reduce((s, l) => s + l.debit, 0);
                const totalCredit = ledgers.reduce((s, l) => s + l.credit, 0);
                const groupType = classifyParentGroup(parentGroup);
                trialGroups.push({
                    parent_group: parentGroup,
                    group_type: groupType,
                    ledgers,
                    totalDebit,
                    totalCredit,
                    color: GROUP_TYPE_CONFIG[groupType]?.color || 'gray',
                });
            });

            // Sort by group type order, then by name
            const typeOrder = { Assets: 0, Liabilities: 1, Income: 2, Expenses: 3 };
            trialGroups.sort((a, b) => {
                const orderDiff = (typeOrder[a.group_type] ?? 99) - (typeOrder[b.group_type] ?? 99);
                if (orderDiff !== 0) return orderDiff;
                return a.parent_group.localeCompare(b.parent_group);
            });

            // Auto-expand first group of each type
            const autoExpand = new Set<string>();
            const seenTypes = new Set<string>();
            trialGroups.forEach(g => {
                if (!seenTypes.has(g.group_type)) {
                    seenTypes.add(g.group_type);
                    autoExpand.add(g.parent_group);
                }
            });

            setGroups(trialGroups);
            setExpandedGroups(autoExpand);
        } catch (error) {
            console.error('Error loading trial balance:', error);
        }
        setLoading(false);
    };

    const toggleGroup = (name: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        const q = searchQuery.toLowerCase();
        return groups
            .map(g => ({
                ...g,
                ledgers: g.ledgers.filter(l => l.name.toLowerCase().includes(q))
            }))
            .filter(g => g.ledgers.length > 0 || g.parent_group.toLowerCase().includes(q));
    }, [groups, searchQuery]);

    const grandTotalDebit = useMemo(() =>
        groups.reduce((s, g) => s + g.totalDebit, 0),
        [groups]
    );

    const grandTotalCredit = useMemo(() =>
        groups.reduce((s, g) => s + g.totalCredit, 0),
        [groups]
    );

    const groupedByType = useMemo(() => {
        const map = new Map<string, TrialGroup[]>();
        filteredGroups.forEach(g => {
            if (!map.has(g.group_type)) map.set(g.group_type, []);
            map.get(g.group_type)!.push(g);
        });
        return map;
    }, [filteredGroups]);

    const exportToCsv = () => {
        const rows = [['Group', 'Ledger', 'Debit (₹)', 'Credit (₹)']];
        groups.forEach(g => {
            if (g.ledgers.length === 0) {
                rows.push([g.parent_group, '', formatCurrency(g.totalDebit), formatCurrency(g.totalCredit)]);
            } else {
                g.ledgers.forEach(l => {
                    rows.push([g.parent_group, l.name, formatCurrency(l.debit), formatCurrency(l.credit)]);
                });
            }
            rows.push(['', `Total - ${g.parent_group}`, formatCurrency(g.totalDebit), formatCurrency(g.totalCredit)]);
            rows.push([]);
        });
        rows.push(['', 'GRAND TOTAL', formatCurrency(grandTotalDebit), formatCurrency(grandTotalCredit)]);

        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TrialBalance_${selectedFy}_${selectedCompany?.name || 'Company'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderGroupSection = (type: string, groups: TrialGroup[]) => {
        const config = GROUP_TYPE_CONFIG[type];
        if (!config || groups.length === 0) return null;

        const typeTotalDebit = groups.reduce((s, g) => s + g.totalDebit, 0);
        const typeTotalCredit = groups.reduce((s, g) => s + g.totalCredit, 0);

        return (
            <div key={type} className="mb-6">
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{config.icon}</span>
                        <h3 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-tight">{config.label}</h3>
                        <span className="text-[8px] font-bold text-[var(--text-muted)] bg-[var(--surface)] px-2 py-0.5 rounded-full">
                            {groups.reduce((s, g) => s + g.ledgers.length, 0)} ledgers
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono">
                        <span className="text-emerald-500 font-bold">Dr: {formatCurrency(typeTotalDebit)}</span>
                        <span className="text-rose-500 font-bold">Cr: {formatCurrency(typeTotalCredit)}</span>
                    </div>
                </div>
                <div className="space-y-2">
                    {groups.map(group => (
                        <div key={group.parent_group} className="bg-[var(--surface-variant)]/50 rounded-2xl border border-[var(--border)] overflow-hidden">
                            <button
                                onClick={() => toggleGroup(group.parent_group)}
                                className="w-full px-4 py-3 flex justify-between items-center hover:bg-[var(--surface-active)] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {expandedGroups.has(group.parent_group)
                                        ? <ChevronDown size={14} className="text-[var(--text-muted)]" />
                                        : <ChevronRight size={14} className="text-[var(--text-muted)]" />
                                    }
                                    <span className="text-xs font-bold text-[var(--on-surface)]">{group.parent_group}</span>
                                    <span className="text-[8px] text-[var(--text-muted)] bg-[var(--surface)] px-1.5 py-0.5 rounded-full">
                                        {group.ledgers.length}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-mono">
                                    <span className="text-emerald-500 font-semibold">{formatCurrency(group.totalDebit)}</span>
                                    <span className="text-rose-500 font-semibold">{formatCurrency(group.totalCredit)}</span>
                                </div>
                            </button>

                            <AnimatePresence>
                                {expandedGroups.has(group.parent_group) && group.ledgers.length > 0 && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="border-t border-[var(--border)]">
                                            {/* Table Header */}
                                            <div className="flex justify-between px-4 py-2 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--surface)]/50">
                                                <span className="flex-1">Ledger</span>
                                                <span className="w-24 text-right">Debit (₹)</span>
                                                <span className="w-24 text-right">Credit (₹)</span>
                                            </div>
                                            {/* Ledger Rows */}
                                            {group.ledgers.map((ledger, i) => (
                                                <div key={i} className="flex justify-between px-4 py-2 text-[10px] border-t border-[var(--border)]/30 hover:bg-[var(--surface)]/30 transition-colors">
                                                    <span className="flex-1 text-[var(--text-muted)] truncate">{ledger.name}</span>
                                                    <span className="w-24 text-right font-mono text-emerald-500">
                                                        {ledger.debit > 0 ? formatCurrency(ledger.debit) : '-'}
                                                    </span>
                                                    <span className="w-24 text-right font-mono text-rose-500">
                                                        {ledger.credit > 0 ? formatCurrency(ledger.credit) : '-'}
                                                    </span>
                                                </div>
                                            ))}
                                            {/* Group Total */}
                                            <div className="flex justify-between px-4 py-2.5 text-[10px] font-bold border-t border-[var(--border)] bg-[var(--surface)]/50">
                                                <span className="flex-1 text-[var(--on-surface)]">Total - {group.parent_group}</span>
                                                <span className="w-24 text-right font-mono text-emerald-400">{formatCurrency(group.totalDebit)}</span>
                                                <span className="w-24 text-right font-mono text-rose-400">{formatCurrency(group.totalCredit)}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] uppercase tracking-tighter leading-none">Trial Balance</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                        {selectedCompany.name} • {selectedFy}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-2">
                    <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
                    <div className="flex items-center gap-1.5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl px-2 py-1.5">
                        <Search size={12} className="text-[var(--text-muted)]" />
                        <input
                            type="text"
                            placeholder="Search ledger..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent text-[9px] font-bold uppercase outline-none w-24 text-[var(--on-surface)] placeholder:text-[var(--text-muted)]"
                        />
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <button
                    onClick={exportToCsv}
                    disabled={loading || groups.length === 0}
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
                ) : filteredGroups.length > 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/10 p-6 rounded-3xl border border-emerald-500/30">
                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2">Total Debits</p>
                                <p className="text-3xl font-black text-emerald-400">{formatCurrency(grandTotalDebit)}</p>
                            </div>
                            <div className="bg-gradient-to-br from-rose-500/20 to-orange-600/10 p-6 rounded-3xl border border-rose-500/30">
                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-2">Total Credits</p>
                                <p className="text-3xl font-black text-rose-400">{formatCurrency(grandTotalCredit)}</p>
                            </div>
                            <div className={`bg-gradient-to-br p-6 rounded-3xl border ${Math.abs(grandTotalDebit - grandTotalCredit) < 1
                                ? 'from-green-500/20 to-emerald-600/10 border-green-500/30'
                                : 'from-amber-500/20 to-red-600/10 border-amber-500/30'
                                }`}>
                                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Difference</p>
                                <p className={`text-3xl font-black ${Math.abs(grandTotalDebit - grandTotalCredit) < 1 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {Math.abs(grandTotalDebit - grandTotalCredit) < 1
                                        ? '✓ Balanced'
                                        : formatCurrency(Math.abs(grandTotalDebit - grandTotalCredit))}
                                </p>
                            </div>
                        </div>

                        {/* Trial Balance Sections */}
                        <GlassCard className="p-6">
                            {['Assets', 'Liabilities', 'Income', 'Expenses'].map(type =>
                                renderGroupSection(type, groupedByType.get(type) || [])
                            )}

                            {/* Grand Total Row */}
                            <div className="mt-6 pt-4 border-t-2 border-[var(--border)]">
                                <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-[var(--primary)]/20 to-transparent rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <Scale size={20} className="text-[var(--primary)]" />
                                        <span className="text-sm font-black text-[var(--on-surface)] uppercase tracking-tight">Grand Total</span>
                                    </div>
                                    <div className="flex items-center gap-6 text-sm font-black font-mono">
                                        <span className="text-emerald-400">{formatCurrency(grandTotalDebit)}</span>
                                        <span className="text-rose-400">{formatCurrency(grandTotalCredit)}</span>
                                    </div>
                                </div>
                            </div>
                        </GlassCard>

                        {/* Footer Note */}
                        <div className="text-center">
                            <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                {' • '}{groups.reduce((s, g) => s + g.ledgers.length, 0)} ledgers in {groups.length} groups
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Scale size={48} className="text-[var(--text-muted)] opacity-30 mb-4" />
                        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase">No Data</h3>
                        <p className="text-sm text-[var(--text-muted)]">No trial balance data found for this period</p>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
