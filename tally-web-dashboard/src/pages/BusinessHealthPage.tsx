import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Gauge, PackageCheck, RefreshCw, ShieldCheck, Users } from 'lucide-react';

const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0,
    }).format(Math.abs(value || 0));
};

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
        const riskCount = [
            receivables > sales * 0.75 && receivables > 0,
            payables > sales * 0.5 && payables > 0,
            stockItems.length > 0 && stockValue <= 0,
        ].filter(Boolean).length;

        const score = Math.max(35, Math.min(96, 82 + (netFlow > 0 ? 8 : -8) - riskCount * 9));

        return { receivables, payables, stockValue, sales, purchases, netFlow, riskCount, score };
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
                    </>
                )}
            </div>
        </div>
    );
}
