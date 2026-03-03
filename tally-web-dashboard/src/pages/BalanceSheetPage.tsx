import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Building, Wallet, CreditCard, Landmark, PiggyBank, Scale, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { CompactYearFilter } from '@/components/shared/CompactYearFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

interface LedgerItem {
    name: string;
    balance: number;
}

interface BalanceGroup {
    name: string;
    icon: React.ReactNode;
    ledgers: LedgerItem[];
    total: number;
    color: string;
}

interface BalanceSheetData {
    assets: {
        fixedAssets: BalanceGroup;
        currentAssets: BalanceGroup;
        bankAccounts: BalanceGroup;
        cashInHand: BalanceGroup;
        totalAssets: number;
    };
    liabilities: {
        capital: BalanceGroup;
        loans: BalanceGroup;
        currentLiabilities: BalanceGroup;
        sundryCr: BalanceGroup;
        totalLiabilities: number;
    };
    netWorth: number;
}

export default function BalanceSheetPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [bsData, setBsData] = useState<BalanceSheetData | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['Fixed Assets', 'Capital Account']);

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
        if (selectedCompany?.id) loadBalanceSheet();
    }, [selectedCompany, selectedFy]);

    const loadBalanceSheet = async () => {
        setLoading(true);
        try {
            // Fetch all ledgers
            const { data: ledgers, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', selectedCompany.id);

            if (error) throw error;

            // Categorization rules based on Tally ledger groups
            const assetGroups = {
                fixed: ['Fixed Assets', 'Investments', 'Secured Loans (Asset)', 'Plant and Machinery'],
                current: ['Current Assets', 'Stock-in-hand', 'Sundry Debtors', 'Deposits (Asset)', 'Loans (Asset)', 'Loans and Advances (Asset)'],
                bank: ['Bank Accounts', 'Bank OD A/c', 'Bank OCC A/c'],
                cash: ['Cash-in-hand', 'Cash']
            };

            const liabilityGroups = {
                capital: ['Capital Account', 'Reserves & Surplus', 'Reserves and Surplus', 'Share Capital', "Partner's Capital Account"],
                loans: ['Secured Loans', 'Unsecured Loans', 'Loans (Liability)', 'Bank Loans'],
                current: ['Current Liabilities', 'Duties & Taxes', 'Provisions'],
                creditors: ['Sundry Creditors', 'Trade Payables']
            };

            // Helper to categorize ledgers
            const categorizeLedgers = (patterns: string[]): LedgerItem[] => {
                return (ledgers || [])
                    .filter((l: any) => patterns.some(p =>
                        ((l.parent || l.parent_group || '')).toLowerCase().includes(p.toLowerCase()) ||
                        ((l.ledger_type || l.ledger_group || '')).toLowerCase().includes(p.toLowerCase())
                    ))
                    .map((l: any) => ({
                        name: l.name,
                        balance: Math.abs(Number(l.current_balance ?? l.closing_balance ?? l.opening_balance) || 0)
                    }));
            };

            // Get ledgers for each category
            const fixedAssetsLedgers = categorizeLedgers(assetGroups.fixed);
            const currentAssetsLedgers = categorizeLedgers(assetGroups.current);
            const bankLedgers = categorizeLedgers(assetGroups.bank);
            const cashLedgers = categorizeLedgers(assetGroups.cash);

            const capitalLedgers = categorizeLedgers(liabilityGroups.capital);
            const loanLedgers = categorizeLedgers(liabilityGroups.loans);
            const currentLiabLedgers = categorizeLedgers(liabilityGroups.current);
            const creditorLedgers = categorizeLedgers(liabilityGroups.creditors);

            // Calculate totals
            const sumLedgers = (items: LedgerItem[]) => items.reduce((sum, l) => sum + l.balance, 0);

            const fixedTotal = sumLedgers(fixedAssetsLedgers);
            const currentTotal = sumLedgers(currentAssetsLedgers);
            const bankTotal = sumLedgers(bankLedgers);
            const cashTotal = sumLedgers(cashLedgers);
            const totalAssets = fixedTotal + currentTotal + bankTotal + cashTotal;

            const capitalTotal = sumLedgers(capitalLedgers);
            const loanTotal = sumLedgers(loanLedgers);
            const currentLiabTotal = sumLedgers(currentLiabLedgers);
            const creditorTotal = sumLedgers(creditorLedgers);
            const totalLiabilities = capitalTotal + loanTotal + currentLiabTotal + creditorTotal;

            setBsData({
                assets: {
                    fixedAssets: { name: 'Fixed Assets', icon: <Building size={16} />, ledgers: fixedAssetsLedgers, total: fixedTotal, color: 'emerald' },
                    currentAssets: { name: 'Current Assets', icon: <Wallet size={16} />, ledgers: currentAssetsLedgers, total: currentTotal, color: 'blue' },
                    bankAccounts: { name: 'Bank Accounts', icon: <Landmark size={16} />, ledgers: bankLedgers, total: bankTotal, color: 'cyan' },
                    cashInHand: { name: 'Cash in Hand', icon: <PiggyBank size={16} />, ledgers: cashLedgers, total: cashTotal, color: 'green' },
                    totalAssets
                },
                liabilities: {
                    capital: { name: 'Capital Account', icon: <Scale size={16} />, ledgers: capitalLedgers, total: capitalTotal, color: 'violet' },
                    loans: { name: 'Loans & Borrowings', icon: <CreditCard size={16} />, ledgers: loanLedgers, total: loanTotal, color: 'rose' },
                    currentLiabilities: { name: 'Current Liabilities', icon: <Wallet size={16} />, ledgers: currentLiabLedgers, total: currentLiabTotal, color: 'orange' },
                    sundryCr: { name: 'Sundry Creditors', icon: <Building size={16} />, ledgers: creditorLedgers, total: creditorTotal, color: 'amber' },
                    totalLiabilities
                },
                netWorth: totalAssets - totalLiabilities + capitalTotal
            });
        } catch (error) {
            console.error('Error loading balance sheet:', error);
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

    const exportBalanceSheet = () => {
        if (!bsData) return;
        const exportData = {
            company: selectedCompany.name,
            asOnDate: fyDateRange.end,
            financialYear: selectedFy,
            generatedAt: new Date().toISOString(),
            assets: {
                fixedAssets: bsData.assets.fixedAssets.total,
                currentAssets: bsData.assets.currentAssets.total,
                bankAccounts: bsData.assets.bankAccounts.total,
                cashInHand: bsData.assets.cashInHand.total,
                total: bsData.assets.totalAssets
            },
            liabilities: {
                capital: bsData.liabilities.capital.total,
                loans: bsData.liabilities.loans.total,
                currentLiabilities: bsData.liabilities.currentLiabilities.total,
                sundryCr: bsData.liabilities.sundryCr.total,
                total: bsData.liabilities.totalLiabilities
            },
            netWorth: bsData.netWorth
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BalanceSheet_${fyDateRange.end}_${selectedCompany.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderGroup = (group: BalanceGroup, side: 'asset' | 'liability') => {
        const isExpanded = expandedGroups.includes(group.name);
        const colorClasses = {
            emerald: 'text-emerald-500 bg-emerald-500/10',
            blue: 'text-blue-500 bg-blue-500/10',
            cyan: 'text-cyan-500 bg-cyan-500/10',
            green: 'text-green-500 bg-green-500/10',
            violet: 'text-violet-500 bg-violet-500/10',
            rose: 'text-rose-500 bg-rose-500/10',
            orange: 'text-orange-500 bg-orange-500/10',
            amber: 'text-amber-500 bg-amber-500/10'
        };
        const colors = colorClasses[group.color as keyof typeof colorClasses] || colorClasses.blue;

        return (
            <div className="bg-[var(--surface-variant)]/50 rounded-2xl border border-[var(--border)] overflow-hidden">
                <button
                    onClick={() => toggleGroup(group.name)}
                    className="w-full px-5 py-4 flex justify-between items-center hover:bg-[var(--surface-active)] transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${colors}`}>{group.icon}</div>
                        <span className="text-xs font-black text-[var(--on-surface)] uppercase tracking-tight">{group.name}</span>
                        <span className="text-[8px] font-bold text-[var(--text-muted)] bg-[var(--surface)] px-2 py-0.5 rounded-full">
                            {group.ledgers.length} items
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-sm font-black ${side === 'asset' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(group.total)}
                        </span>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                </button>

                <AnimatePresence>
                    {isExpanded && group.ledgers.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="px-5 pb-4 space-y-1 border-t border-[var(--border)]">
                                {group.ledgers.map((ledger, i) => (
                                    <div key={i} className="flex justify-between py-2 text-[10px]">
                                        <span className="text-[var(--text-muted)] truncate max-w-[200px]">{ledger.name}</span>
                                        <span className="font-bold text-[var(--on-surface)]">{formatCurrency(ledger.balance)}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] uppercase tracking-tighter leading-none">Balance Sheet</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                        {selectedCompany.name} ? As on {fyDateRange.end}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
            </HeaderPortal>

            <HeaderPortal type="actions">
                <button
                    onClick={exportBalanceSheet}
                    disabled={!bsData || loading}
                    className="w-9 h-9 flex items-center justify-center bg-[var(--primary)] text-white rounded-xl shadow-lg shadow-[var(--primary-glow)] hover:scale-105 transition-transform disabled:opacity-50"
                    title="Export Report"
                >
                    <Download size={18} />
                </button>
            </HeaderPortal>


            <AnimatePresence mode="wait">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Spinner size="md" />
                    </div>
                ) : bsData ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/10 p-6 rounded-3xl border border-emerald-500/30">
                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2">Total Assets</p>
                                <p className="text-3xl font-black text-emerald-400">{formatCurrency(bsData.assets.totalAssets)}</p>
                            </div>

                            <div className="bg-gradient-to-br from-rose-500/20 to-orange-600/10 p-6 rounded-3xl border border-rose-500/30">
                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-2">Total Liabilities</p>
                                <p className="text-3xl font-black text-rose-400">{formatCurrency(bsData.liabilities.totalLiabilities)}</p>
                            </div>

                            <div className="bg-gradient-to-br from-blue-500/20 to-violet-600/10 p-6 rounded-3xl border border-blue-500/30">
                                <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-2">Net Worth</p>
                                <p className="text-3xl font-black text-blue-400">{formatCurrency(bsData.netWorth)}</p>
                            </div>
                        </div>

                        {/* Balance Sheet Table */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Assets Side */}
                            <GlassCard className="p-6">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
                                    <h2 className="text-lg font-black text-emerald-500 uppercase tracking-tight">Assets</h2>
                                    <span className="text-xl font-black text-emerald-400">{formatCurrency(bsData.assets.totalAssets)}</span>
                                </div>
                                <div className="space-y-3">
                                    {renderGroup(bsData.assets.fixedAssets, 'asset')}
                                    {renderGroup(bsData.assets.currentAssets, 'asset')}
                                    {renderGroup(bsData.assets.bankAccounts, 'asset')}
                                    {renderGroup(bsData.assets.cashInHand, 'asset')}
                                </div>
                            </GlassCard>

                            {/* Liabilities Side */}
                            <GlassCard className="p-6">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
                                    <h2 className="text-lg font-black text-rose-500 uppercase tracking-tight">Liabilities & Capital</h2>
                                    <span className="text-xl font-black text-rose-400">{formatCurrency(bsData.liabilities.totalLiabilities)}</span>
                                </div>
                                <div className="space-y-3">
                                    {renderGroup(bsData.liabilities.capital, 'liability')}
                                    {renderGroup(bsData.liabilities.loans, 'liability')}
                                    {renderGroup(bsData.liabilities.currentLiabilities, 'liability')}
                                    {renderGroup(bsData.liabilities.sundryCr, 'liability')}
                                </div>
                            </GlassCard>
                        </div>

                        {/* Balance Check Footer */}
                        <div className={`p-6 rounded-3xl border-2 ${Math.abs(bsData.assets.totalAssets - bsData.liabilities.totalLiabilities) < 1 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Scale size={24} className={Math.abs(bsData.assets.totalAssets - bsData.liabilities.totalLiabilities) < 1 ? 'text-emerald-500' : 'text-amber-500'} />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-tight">Balance Sheet Status</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">
                                            {Math.abs(bsData.assets.totalAssets - bsData.liabilities.totalLiabilities) < 1
                                                ? 'Assets and Liabilities are balanced'
                                                : `Difference: ${formatCurrency(Math.abs(bsData.assets.totalAssets - bsData.liabilities.totalLiabilities))}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Generated</p>
                                    <p className="text-xs font-bold">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Scale size={48} className="text-[var(--text-muted)] opacity-30 mb-4" />
                        <h3 className="text-lg font-black text-[var(--on-surface)] uppercase">No Data</h3>
                        <p className="text-sm text-[var(--text-muted)]">No balance sheet data found</p>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
