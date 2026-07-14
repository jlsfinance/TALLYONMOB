import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import {
    Activity,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    Banknote,
    CalendarClock,
    Gauge,
    PackageCheck,
    Percent,
    RefreshCw,
    ShieldCheck,
    TrendingDown,
    TrendingUp,
    Users,
    Wallet,
    Zap,
} from 'lucide-react';

const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0,
    }).format(Math.abs(value || 0));
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatDays = (value: number) => `${value.toFixed(0)} days`;
const toNumber = (value: unknown) => Number(value || 0) || 0;

const HealthTile = ({
    title,
    value,
    hint,
    icon,
    tone = 'neutral',
}: {
    title: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
    tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) => {
    const toneClass = {
        good: 'bg-emerald-500/10 text-emerald-500',
        warn: 'bg-amber-500/10 text-amber-500',
        bad: 'bg-red-500/10 text-red-500',
        neutral: 'bg-sky-500/10 text-sky-500',
    }[tone];

    return (
        <GlassCard className="min-w-0">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{title}</p>
                    <h3 className="mt-3 text-2xl font-black text-[var(--on-surface)] sm:text-3xl">{value}</h3>
                    <p className="mt-2 text-xs leading-5 text-[var(--on-surface-variant)]">{hint}</p>
                </div>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${toneClass}`}>
                    {icon}
                </div>
            </div>
        </GlassCard>
    );
};

export default function BusinessHealthPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [stockItems, setStockItems] = useState<any[]>([]);

    const loadHealth = async () => {
        if (!selectedCompany?.id) return;

        setLoading(true);
        setError(null);

        try {
            const [ledgerRes, voucherRes, stockRes] = await Promise.all([
                supabase.from('ledgers').select('*').eq('company_id', selectedCompany.id),
                supabase.from('vouchers').select('*').eq('company_id', selectedCompany.id),
                supabase.from('stock_items').select('*').eq('company_id', selectedCompany.id),
            ]);

            if (ledgerRes.error) throw ledgerRes.error;
            if (voucherRes.error) throw voucherRes.error;
            if (stockRes.error) throw stockRes.error;

            setLedgers(ledgerRes.data || []);
            setVouchers(voucherRes.data || []);
            setStockItems(stockRes.data || []);
        } catch (err: any) {
            setError(err?.message || 'Unable to load business health');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHealth();
    }, [selectedCompany?.id]);

    const health = useMemo(() => {
        const receivables = ledgers
            .filter((ledger) => String(ledger.parent || ledger.parent_group || '').toLowerCase().includes('sundry debtors'))
            .reduce((sum, ledger) => sum + Math.abs(toNumber(ledger.closing_balance ?? ledger.current_balance)), 0);

        const payables = ledgers
            .filter((ledger) => String(ledger.parent || ledger.parent_group || '').toLowerCase().includes('sundry creditors'))
            .reduce((sum, ledger) => sum + Math.abs(toNumber(ledger.closing_balance ?? ledger.current_balance)), 0);

        const stockValue = stockItems.reduce((sum, item) => {
            const value = toNumber(item.closing_value);
            if (value) return sum + Math.abs(value);
            return sum + Math.abs(toNumber(item.current_stock ?? item.closing_balance) * toNumber(item.rate));
        }, 0);

        const sales = vouchers
            .filter((voucher) => String(voucher.voucher_type || '').toLowerCase().includes('sales'))
            .reduce((sum, voucher) => sum + Math.abs(toNumber(voucher.grand_total ?? voucher.total_amount ?? voucher.amount)), 0);

        const purchases = vouchers
            .filter((voucher) => String(voucher.voucher_type || '').toLowerCase().includes('purchase'))
            .reduce((sum, voucher) => sum + Math.abs(toNumber(voucher.grand_total ?? voucher.total_amount ?? voucher.amount)), 0);

        const netFlow = sales - purchases;

        const workingCapital = receivables + stockValue - payables;

        const grossMargin = sales > 0 ? ((sales - purchases) / sales) * 100 : 0;

        const dso = sales > 0 ? (receivables / sales) * 365 : 0;

        const stockTurnover = stockValue > 0 ? purchases / stockValue : 0;

        const averageStock = stockValue;

        const overdueDebtorsCount = ledgers
            .filter((ledger) => String(ledger.parent || ledger.parent_group || '').toLowerCase().includes('sundry debtors'))
            .filter((ledger) => {
                const balance = Math.abs(toNumber(ledger.closing_balance ?? ledger.current_balance));
                return balance > 0;
            }).length;

        const riskWarnings: string[] = [];
        let riskCount = 0;

        if (receivables > sales * 0.75 && receivables > 0) {
            riskWarnings.push('Receivables exceed 75% of sales — collection may be lagging.');
            riskCount++;
        }
        if (payables > sales * 0.5 && payables > 0) {
            riskWarnings.push('Payables exceed 50% of sales — cash flow pressure from creditors.');
            riskCount++;
        }
        if (stockItems.length > 0 && stockValue <= 0) {
            riskWarnings.push('Stock value is zero or negative despite having inventory items.');
            riskCount++;
        }
        if (grossMargin < 20) {
            riskWarnings.push('Gross margin is below 20% — pricing or cost control needs review.');
            riskCount++;
        }
        if (dso > 90) {
            riskWarnings.push(`DSO is ${formatDays(dso)} — receivables take over 90 days to collect.`);
            riskCount++;
        }
        if (workingCapital < 0) {
            riskWarnings.push('Working capital is negative — immediate liquidity risk.');
            riskCount++;
        }

        const recommendations: string[] = [];
        if (receivables > 0) recommendations.push('Accelerate debtor follow-ups; consider offering early payment discounts.');
        if (payables > sales * 0.4) recommendations.push('Negotiate longer payment terms with creditors to ease cash pressure.');
        if (grossMargin < 30) recommendations.push('Review product pricing and supplier costs to improve gross margins.');
        if (dso > 60) recommendations.push('Implement a structured collections process for overdue invoices.');
        if (stockValue > sales * 0.5) recommendations.push('Reduce excess stock holding — consider liquidating slow-moving inventory.');
        if (netFlow < 0) recommendations.push('Urgent: Purchases exceed sales. Focus on revenue generation or cost cutting.');
        if (riskCount === 0) recommendations.push('Business health is strong. Maintain current financial discipline.');

        const score = Math.max(20, Math.min(96, 82 + (netFlow > 0 ? 8 : -8) - riskCount * 9 + (grossMargin > 30 ? 4 : -4)));

        const scoreBreakdown = [
            { label: 'Cash Flow', score: netFlow > 0 ? 20 : 10, max: 20 },
            { label: 'Gross Margin', score: grossMargin > 30 ? 20 : grossMargin > 15 ? 12 : 6, max: 20 },
            { label: 'Receivables', score: receivables < sales * 0.5 ? 18 : receivables < sales * 0.75 ? 12 : 6, max: 20 },
            { label: 'Working Capital', score: workingCapital > 0 ? 18 : 8, max: 20 },
            { label: 'Risk Profile', score: riskCount === 0 ? 20 : Math.max(4, 20 - riskCount * 5), max: 20 },
        ];

        return {
            receivables,
            payables,
            stockValue,
            sales,
            purchases,
            netFlow,
            workingCapital,
            grossMargin,
            dso,
            stockTurnover,
            averageStock,
            overdueDebtorsCount,
            riskCount,
            riskWarnings,
            recommendations,
            score,
            scoreBreakdown,
        };
    }, [ledgers, vouchers, stockItems]);

    if (!selectedCompany) return null;

    return (
        <div className="min-h-screen pb-24">
            <HeaderPortal>
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-emerald-500/10 text-emerald-500">
                        <Activity size={20} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-black text-[var(--on-surface)]">Business Health</h1>
                        <p className="truncate text-xs text-[var(--text-muted)]">{selectedCompany.name}</p>
                    </div>
                </div>
            </HeaderPortal>

            <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Health monitor</p>
                        <h2 className="mt-1 text-2xl font-black text-[var(--on-surface)]">Score {health.score}/100</h2>
                    </div>
                    <button
                        onClick={loadHealth}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--on-surface)] disabled:opacity-60"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {error && (
                    <GlassCard className="border-red-500/25 bg-red-500/5">
                        <div className="flex items-center gap-3 text-red-500">
                            <AlertTriangle size={18} />
                            <p className="text-sm font-bold">{error}</p>
                        </div>
                    </GlassCard>
                )}

                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center">
                        <Spinner size="lg" />
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <HealthTile
                                title="Sales"
                                value={`Rs. ${formatMoney(health.sales)}`}
                                hint={`${vouchers.length} vouchers scanned for this company.`}
                                icon={<ArrowUpRight size={20} />}
                                tone="good"
                            />
                            <HealthTile
                                title="Purchases"
                                value={`Rs. ${formatMoney(health.purchases)}`}
                                hint={health.netFlow >= 0 ? 'Sales are ahead of purchases.' : 'Purchases are higher than sales.'}
                                icon={<ArrowDownRight size={20} />}
                                tone={health.netFlow >= 0 ? 'neutral' : 'warn'}
                            />
                            <HealthTile
                                title="Receivables"
                                value={`Rs. ${formatMoney(health.receivables)}`}
                                hint="Outstanding amount from debtor ledgers."
                                icon={<Users size={20} />}
                                tone={health.receivables > health.sales * 0.75 && health.receivables > 0 ? 'warn' : 'neutral'}
                            />
                            <HealthTile
                                title="Stock Value"
                                value={`Rs. ${formatMoney(health.stockValue)}`}
                                hint={`${stockItems.length} inventory items included.`}
                                icon={<PackageCheck size={20} />}
                                tone="good"
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <HealthTile
                                title="Payables"
                                value={`Rs. ${formatMoney(health.payables)}`}
                                hint={health.payables > health.sales * 0.5 ? 'High relative to sales — review cash position.' : 'Within manageable range of sales.'}
                                icon={<Wallet size={20} />}
                                tone={health.payables > health.sales * 0.5 ? 'bad' : 'neutral'}
                            />
                            <HealthTile
                                title="Working Capital"
                                value={`Rs. ${formatMoney(health.workingCapital)}`}
                                hint={health.workingCapital >= 0 ? 'Liquidity position is positive.' : 'Negative working capital — liquidity risk.'}
                                icon={<Zap size={20} />}
                                tone={health.workingCapital >= 0 ? 'good' : 'bad'}
                            />
                            <HealthTile
                                title="Gross Margin"
                                value={formatPercent(health.grossMargin)}
                                hint={health.grossMargin >= 30 ? 'Healthy margin — good pricing discipline.' : health.grossMargin >= 15 ? 'Moderate margin — room for improvement.' : 'Low margin — review pricing or costs.'}
                                icon={<Percent size={20} />}
                                tone={health.grossMargin >= 30 ? 'good' : health.grossMargin >= 15 ? 'warn' : 'bad'}
                            />
                            <HealthTile
                                title="DSO"
                                value={formatDays(health.dso)}
                                hint={health.dso <= 45 ? 'Fast collections — healthy receivable cycle.' : health.dso <= 90 ? 'Moderate collection speed.' : 'Slow collections — consider stricter terms.'}
                                icon={<CalendarClock size={20} />}
                                tone={health.dso <= 45 ? 'good' : health.dso <= 90 ? 'warn' : 'bad'}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <HealthTile
                                title="Net Cash Flow"
                                value={`Rs. ${formatMoney(health.netFlow)}`}
                                hint={health.netFlow >= 0 ? 'Revenue exceeds cost of goods.' : 'Cost of goods exceeds revenue — loss position.'}
                                icon={health.netFlow >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                tone={health.netFlow >= 0 ? 'good' : 'bad'}
                            />
                            <HealthTile
                                title="Stock Turnover"
                                value={`${health.stockTurnover.toFixed(2)}x`}
                                hint={health.stockTurnover >= 3 ? 'Good inventory velocity.' : health.stockTurnover >= 1 ? 'Moderate turnover — watch slow-movers.' : 'Low turnover — inventory may be stagnant.'}
                                icon={<PackageCheck size={20} />}
                                tone={health.stockTurnover >= 3 ? 'good' : health.stockTurnover >= 1 ? 'warn' : 'bad'}
                            />
                            <HealthTile
                                title="Overdue Debtors"
                                value={`${health.overdueDebtorsCount}`}
                                hint={health.overdueDebtorsCount > 5 ? 'Multiple outstanding debtor accounts.' : 'Debtor accounts within limits.'}
                                icon={<Users size={20} />}
                                tone={health.overdueDebtorsCount > 5 ? 'warn' : 'neutral'}
                            />
                            <HealthTile
                                title="Risk Signals"
                                value={`${health.riskCount}`}
                                hint={health.riskCount === 0 ? 'No active risk warnings.' : `${health.riskCount} issue${health.riskCount > 1 ? 's' : ''} flagged for attention.`}
                                icon={health.riskCount === 0 ? <ShieldCheck size={20} /> : <Gauge size={20} />}
                                tone={health.riskCount === 0 ? 'good' : health.riskCount <= 2 ? 'warn' : 'bad'}
                            />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <GlassCard className="lg:col-span-2">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Cash pressure</p>
                                        <h3 className="mt-2 text-xl font-black text-[var(--on-surface)]">Receivable vs payable balance</h3>
                                    </div>
                                    <Banknote className="text-sky-500" size={22} />
                                </div>
                                <div className="mt-6 space-y-4">
                                    <div>
                                        <div className="mb-2 flex justify-between text-xs font-bold text-[var(--on-surface-variant)]">
                                            <span>Receivables</span>
                                            <span>Rs. {formatMoney(health.receivables)}</span>
                                        </div>
                                        <div className="h-3 rounded-full bg-[var(--surface-variant)]">
                                            <div className="h-3 rounded-full bg-sky-500" style={{ width: `${Math.min(100, (health.receivables / Math.max(health.receivables, health.payables, 1)) * 100)}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 flex justify-between text-xs font-bold text-[var(--on-surface-variant)]">
                                            <span>Payables</span>
                                            <span>Rs. {formatMoney(health.payables)}</span>
                                        </div>
                                        <div className="h-3 rounded-full bg-[var(--surface-variant)]">
                                            <div className="h-3 rounded-full bg-amber-500" style={{ width: `${Math.min(100, (health.payables / Math.max(health.receivables, health.payables, 1)) * 100)}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>

                            <GlassCard>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-emerald-500/10 text-emerald-500">
                                        {health.riskCount === 0 ? <ShieldCheck size={20} /> : <Gauge size={20} />}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Signals</p>
                                        <h3 className="text-xl font-black text-[var(--on-surface)]">{health.riskCount === 0 ? 'Stable' : `${health.riskCount} alerts`}</h3>
                                    </div>
                                </div>
                                <p className="mt-5 text-sm leading-6 text-[var(--on-surface-variant)]">
                                    This snapshot checks sales momentum, purchase pressure, outstanding balances, and stock value from synced Tally data.
                                </p>
                            </GlassCard>
                        </div>

                        <GlassCard>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Detailed Health Report</p>
                            <h3 className="mt-3 text-xl font-black text-[var(--on-surface)]">Score Breakdown</h3>
                            <div className="mt-5 space-y-3">
                                {health.scoreBreakdown.map((item) => (
                                    <div key={item.label}>
                                        <div className="mb-1 flex justify-between text-xs font-bold text-[var(--on-surface-variant)]">
                                            <span>{item.label}</span>
                                            <span>{item.score}/{item.max}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-[var(--surface-variant)]">
                                            <div
                                                className="h-2 rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${(item.score / item.max) * 100}%`,
                                                    backgroundColor: item.score / item.max >= 0.7 ? '#34d399' : item.score / item.max >= 0.4 ? '#fbbf24' : '#f87171',
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                <div className="mt-4 rounded-[14px] bg-[var(--surface)] p-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-[var(--on-surface)]">Overall Health Score</span>
                                        <span className="text-2xl font-black text-[var(--on-surface)]">{health.score}/100</span>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-[var(--on-surface-variant)]">
                                        {health.score >= 80
                                            ? 'Strong financial position — maintain discipline and reinvest wisely.'
                                            : health.score >= 60
                                                ? 'Moderate health — address flagged areas to prevent deterioration.'
                                                : 'Weak position — immediate action required on cash flow and costs.'}
                                    </p>
                                </div>
                            </div>
                        </GlassCard>

                        <div className="grid gap-4 md:grid-cols-2">
                            <GlassCard>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-red-500/10 text-red-500">
                                        <AlertTriangle size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Risk Factors</p>
                                        <h3 className="text-lg font-black text-[var(--on-surface)]">
                                            {health.riskWarnings.length === 0 ? 'No Risks Detected' : `${health.riskWarnings.length} Risk${health.riskWarnings.length > 1 ? 's' : ''}`}
                                        </h3>
                                    </div>
                                </div>
                                {health.riskWarnings.length > 0 ? (
                                    <ul className="mt-4 space-y-3">
                                        {health.riskWarnings.map((warning, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm leading-5 text-[var(--on-surface-variant)]">
                                                <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                                                {warning}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-4 text-sm leading-6 text-[var(--on-surface-variant)]">
                                        All key financial indicators are within healthy thresholds.
                                    </p>
                                )}
                            </GlassCard>

                            <GlassCard>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-emerald-500/10 text-emerald-500">
                                        <ShieldCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Recommendations</p>
                                        <h3 className="text-lg font-black text-[var(--on-surface)]">Action Items</h3>
                                    </div>
                                </div>
                                <ul className="mt-4 space-y-3">
                                    {health.recommendations.map((rec, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-[var(--on-surface-variant)]">
                                            <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                            {rec}
                                        </li>
                                    ))}
                                </ul>
                            </GlassCard>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
