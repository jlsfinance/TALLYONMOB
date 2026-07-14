import { useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import toast from 'react-hot-toast';

import {
    AlertCircle,
    AlertTriangle,
    ArrowDownLeft,
    ArrowUpRight,
    BarChart3,
    Building2,
    Calendar,
    CheckCircle2,
    CircleDollarSign,
    Download,
    FileSpreadsheet,
    FileText,
    Gauge,
    Landmark,
    Loader2,
    Receipt,
    RefreshCw,
    Search,
    Target,
    TrendingDown,
    TrendingUp,
    Users,
    Wallet,
    X,
    Brain,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui/GlassUI';
import {
    buildLedgerStatement,
    fetchTallyData,
    getCachedTallyData,
    loadCachedTallyData,
    TallyDataPayload,
    TallyLedger,
    TallyVoucher,
} from '@/services/tallyDataService';
import {
    FinancialInsightSummary,
    generateFinancialInsights,
} from '@/lib/GeminiService';
import VectorSearchPanel from '@/components/VectorSearchPanel';

type ViewerTab = 'dashboard' | 'ledgers' | 'invoices' | 'vouchers' | 'reports' | 'ai-search';
type ReportTab = 'trial' | 'pl' | 'balance';

const tabs: Array<{ key: ViewerTab; label: string; icon: React.ReactNode }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} /> },
    { key: 'ledgers', label: 'Ledgers', icon: <Users size={15} /> },
    { key: 'invoices', label: 'Invoices', icon: <Receipt size={15} /> },
    { key: 'vouchers', label: 'Vouchers', icon: <FileText size={15} /> },
    { key: 'reports', label: 'Reports', icon: <FileSpreadsheet size={15} /> },
    { key: 'ai-search', label: 'AI Search', icon: <Brain size={15} /> },
];

const voucherTypes = ['All', 'Sales', 'Purchase', 'Payment', 'Receipt'];
const ledgerTypes = ['All', 'Receivable', 'Payable', 'Cash/Bank', 'Sales', 'Purchase'];

export default function TallyDataViewerPage() {
    const { selectedCompany } = useAuth() as any;
    const [activeTab, setActiveTab] = useState<ViewerTab>('dashboard');
    const [reportTab, setReportTab] = useState<ReportTab>('trial');
    const [data, setData] = useState<TallyDataPayload | null>(() => getCachedTallyData());
    const [loading, setLoading] = useState(!getCachedTallyData());
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [insights, setInsights] = useState<FinancialInsightSummary | null>(null);
    const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [searchTerm, setSearchTerm] = useState('');
    const [ledgerType, setLedgerType] = useState('All');
    const [voucherType, setVoucherType] = useState('All');
    const [selectedLedger, setSelectedLedger] = useState<TallyLedger | null>(null);
    const [selectedVoucher, setSelectedVoucher] = useState<TallyVoucher | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const loadData = async (showToast = false) => {
        if (!selectedCompany) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!data) setLoading(true);
        setRefreshing(true);

        const result = await fetchTallyData({
            fromDate,
            toDate,
            companyId: selectedCompany?.id,
            companyName: selectedCompany?.name,
            signal: controller.signal,
        });

        if (result.data) {
            setData(result.data);
            setError(result.error);
            if (result.fromCache && showToast) {
                toast.error('Tally is offline. Showing cached data.');
            } else if (showToast) {
                toast.success('Tally data refreshed');
            }
        } else if (result.error) {
            setError(result.error);
            if (showToast) {
                toast.error(result.error);
            }
        }

        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => {
        loadData(false);
        const timer = window.setInterval(() => loadData(false), 30000);
        return () => {
            window.clearInterval(timer);
            abortRef.current?.abort();
        };
    }, [selectedCompany?.id, fromDate, toDate]);

    useEffect(() => {
        let alive = true;

        (async () => {
            const cached = await loadCachedTallyData();
            if (!alive || data) return;
            if (cached) {
                setData(cached);
                setError(cached.error || null);
            }
            setLoading(false);
        })();

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!data || !selectedCompany) {
            setInsights(null);
            return;
        }

        let cancelled = false;
        const runInsightJob = async () => {
            try {
                const result = await generateFinancialInsights(
                    {
                        company: selectedCompany.name,
                        dashboard: data.dashboard,
                        ledgers: data.ledgers.slice(0, 75),
                        vouchers: data.vouchers.slice(0, 75),
                        invoices: data.invoices.slice(0, 50),
                        topReceivables: getTopLedgerBalances(data.ledgers, 'Receivable', 5),
                        topPayables: getTopLedgerBalances(data.ledgers, 'Payable', 5),
                    },
                    { userId: selectedCompany?.ownerId || null }
                );

                if (!cancelled) {
                    setInsights(result);
                }
            } catch (insightError) {
                if (!cancelled) {
                    setInsights(null);
                }
                console.warn('Background insight generation failed', insightError);
            }
        };

        const handle = typeof window.requestIdleCallback === 'function'
            ? window.requestIdleCallback(runInsightJob)
            : window.setTimeout(runInsightJob, 250);

        return () => {
            cancelled = true;
            if (typeof window.cancelIdleCallback === 'function' && typeof handle === 'number') {
                window.cancelIdleCallback(handle);
            } else {
                window.clearTimeout(handle as number);
            }
        };
    }, [data, selectedCompany]);

    useEffect(() => {
        const handleGlobalRefresh = () => loadData(true);
        window.addEventListener('app-refresh-trigger', handleGlobalRefresh);
        return () => window.removeEventListener('app-refresh-trigger', handleGlobalRefresh);
    }, [selectedCompany?.id, fromDate, toDate, data]);

    const filteredLedgers = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return (data?.ledgers || [])
            .filter((ledger) => ledgerType === 'All' || ledger.ledger_type === ledgerType)
            .filter((ledger) => [ledger.name, ledger.parent, ledger.gstin].join(' ').toLowerCase().includes(term));
    }, [data?.ledgers, ledgerType, searchTerm]);

    const filteredVouchers = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return (data?.vouchers || [])
            .filter((voucher) => voucherType === 'All' || voucher.voucher_type === voucherType)
            .filter((voucher) => [
                voucher.party_name,
                voucher.voucher_number,
                voucher.voucher_type,
                voucher.narration,
            ].join(' ').toLowerCase().includes(term))
            .sort((a, b) => String(b.voucher_date).localeCompare(String(a.voucher_date)));
    }, [data?.vouchers, voucherType, searchTerm]);

    const filteredInvoices = useMemo(() => {
        return filteredVouchers.filter((voucher) => ['Sales', 'Purchase'].includes(voucher.voucher_type));
    }, [filteredVouchers]);

    const ledgerStatement = useMemo(() => {
        if (!selectedLedger || !data) return [];
        return buildLedgerStatement(selectedLedger, data.vouchers, fromDate, toDate);
    }, [selectedLedger, data?.vouchers, fromDate, toDate]);

    const monthlyTrend = useMemo(() => buildMonthlyTrend(data?.vouchers || []), [data?.vouchers]);
    const isOffline = Boolean(error) || data?.status === 'offline';

    if (!selectedCompany) return null;

    return (
        <div className="mx-auto max-w-7xl space-y-4 pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm font-black uppercase leading-none tracking-tight text-[var(--on-surface)] md:text-xl">
                        Tally Data Viewer
                    </h1>
                    <p className="mt-0.5 hidden text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] md:block">
                        {selectedCompany.name}
                    </p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="search">
                <div className="relative hidden w-full max-w-xs md:block">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search Tally data"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] py-2 pl-9 pr-3 text-xs font-bold text-[var(--on-surface)] outline-none focus:border-[var(--primary)]"
                    />
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] px-2 py-1">
                    <Calendar size={12} className="text-[var(--text-muted)]" />
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(event) => setFromDate(event.target.value)}
                        className="w-[92px] bg-transparent text-[10px] font-bold text-[var(--on-surface)] outline-none"
                    />
                    <span className="text-[9px] font-black uppercase text-[var(--text-muted)]">to</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(event) => setToDate(event.target.value)}
                        className="w-[92px] bg-transparent text-[10px] font-bold text-[var(--on-surface)] outline-none"
                    />
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <button
                    onClick={() => loadData(true)}
                    disabled={refreshing}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary-glow)] disabled:opacity-60"
                    title="Refresh from Tally"
                >
                    <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </HeaderPortal>

            <div className="sticky top-[68px] z-20 -mx-4 space-y-3 bg-[var(--background)]/90 px-4 py-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0">
                <div className="relative md:hidden">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search ledgers, invoices, vouchers"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-10 pr-3 text-sm font-semibold text-[var(--on-surface)] outline-none"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all md:text-xs ${activeTab === tab.key
                                ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--shadow-md)]'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface-variant)]'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {isOffline && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-[var(--on-surface)]">
                    <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
                    <div>
                        <p className="font-black uppercase tracking-wide">Tally connection offline</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--on-surface-variant)]">
                            {error || 'Open Tally and refresh. Cached data remains visible when available.'}
                        </p>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24">
                    <Spinner size="lg" />
                    <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">Fetching Tally XML</p>
                </div>
            ) : !data ? (
                <EmptyState
                    icon={<AlertCircle size={42} />}
                    title="No Tally data available"
                    description="Start Tally, enable XML access on port 9000, then refresh."
                />
            ) : (
                <>
                    {activeTab === 'dashboard' && (
                        <DashboardView
                            data={data}
                            monthlyTrend={monthlyTrend}
                            insights={insights}
                            onVoucherClick={setSelectedVoucher}
                        />
                    )}

                    {activeTab === 'ledgers' && (
                        <LedgerView
                            ledgers={filteredLedgers}
                            ledgerType={ledgerType}
                            onLedgerTypeChange={setLedgerType}
                            selectedLedger={selectedLedger}
                            onSelectLedger={setSelectedLedger}
                            statement={ledgerStatement}
                        />
                    )}

                    {activeTab === 'invoices' && (
                        <VoucherList
                            title="Sales and Purchase Invoices"
                            vouchers={filteredInvoices}
                            onSelectVoucher={setSelectedVoucher}
                            emptyTitle="No invoices found"
                        />
                    )}

                    {activeTab === 'vouchers' && (
                        <div className="space-y-4">
                            <FilterChips values={voucherTypes} selected={voucherType} onChange={setVoucherType} />
                            <VoucherList
                                title="Voucher Stream"
                                vouchers={filteredVouchers}
                                onSelectVoucher={setSelectedVoucher}
                                emptyTitle="No vouchers found"
                            />
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <ReportsView
                            data={data}
                            reportTab={reportTab}
                            onReportTabChange={setReportTab}
                            onExportPdf={() => exportReportPdf(data, reportTab, selectedCompany.name)}
                            onExportExcel={() => exportReportExcel(data, reportTab, selectedCompany.name)}
                        />
                    )}

                    {activeTab === 'ai-search' && (
                        <VectorSearchPanel
                            companyId={selectedCompany.id}
                            companyName={selectedCompany.name}
                            userId={selectedCompany.ownerId || null}
                        />
                    )}
                </>
            )}

            {selectedVoucher && (
                <VoucherDrawer voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} />
            )}
        </div>
    );
}

function DashboardView({ data, monthlyTrend, insights, onVoucherClick }: {
    data: TallyDataPayload;
    monthlyTrend: Array<{ month: string; sales: number; purchase: number }>;
    insights: FinancialInsightSummary | null;
    onVoucherClick: (voucher: TallyVoucher) => void;
}) {
    const commandCenter = buildCommandCenter(data);
    const topReceivables = getTopLedgerBalances(data.ledgers, 'Receivable', 4);
    const topPayables = getTopLedgerBalances(data.ledgers, 'Payable', 4);

    const cards = [
        { label: 'Total Sales', value: data.dashboard.totalSales, icon: <TrendingUp size={18} />, color: 'text-emerald-500 bg-emerald-500/10' },
        { label: 'Total Purchase', value: data.dashboard.totalPurchase, icon: <TrendingDown size={18} />, color: 'text-rose-500 bg-rose-500/10' },
        { label: 'Cash and Bank', value: data.dashboard.cashBankBalance, icon: <Landmark size={18} />, color: 'text-sky-500 bg-sky-500/10' },
        { label: 'Receivables', value: data.dashboard.receivables, icon: <Wallet size={18} />, color: 'text-amber-500 bg-amber-500/10' },
        { label: 'Payables', value: data.dashboard.payables, icon: <Building2 size={18} />, color: 'text-indigo-500 bg-indigo-500/10' },
    ];

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {cards.map((card) => (
                    <Card key={card.label} padding="sm" className="rounded-xl">
                        <div className={`mb-4 inline-flex rounded-xl p-2.5 ${card.color}`}>{card.icon}</div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{card.label}</p>
                        <p className="mt-2 text-xl font-black tracking-tight text-[var(--on-surface)]">{formatCurrency(card.value)}</p>
                    </Card>
                ))}
            </div>

            <Card padding="none" className="overflow-hidden rounded-xl">
                <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr_1fr]">
                    <div className="border-b border-[var(--border)] p-4 md:border-b-0 md:border-r">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--primary)]">Command Center</p>
                                <h2 className="text-lg font-black text-[var(--on-surface)]">Business Health</h2>
                            </div>
                            <Gauge size={20} className="text-[var(--primary)]" />
                        </div>
                        <div className="flex items-center gap-4">
                            <div
                                className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
                                style={{
                                    background: `conic-gradient(var(--primary) ${commandCenter.score * 3.6}deg, var(--surface-variant) 0deg)`,
                                }}
                            >
                                <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[var(--surface)]">
                                    <span className="text-2xl font-black text-[var(--on-surface)]">{commandCenter.score}</span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <Badge variant={commandCenter.score >= 75 ? 'success' : commandCenter.score >= 50 ? 'warning' : 'error'}>
                                    {commandCenter.label}
                                </Badge>
                                <p className="mt-3 text-xs font-semibold leading-5 text-[var(--on-surface-variant)]">
                                    {commandCenter.summary}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="border-b border-[var(--border)] p-4 lg:border-b-0 lg:border-r">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wide text-[var(--on-surface)]">Next Best Actions</h3>
                            <Target size={17} className="text-emerald-500" />
                        </div>
                        <div className="space-y-2">
                            {commandCenter.actions.map((action) => (
                                <InsightRow key={action.title} {...action} />
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-1">
                        <ExposureList title="Top Receivables" icon={<ArrowDownLeft size={15} />} rows={topReceivables} empty="No receivables" tone="text-amber-500" />
                        <ExposureList title="Top Payables" icon={<ArrowUpRight size={15} />} rows={topPayables} empty="No payables" tone="text-indigo-500" />
                    </div>
                </div>
            </Card>

            {commandCenter.risks.length > 0 && (
                <div className="grid gap-3 md:grid-cols-3">
                    {commandCenter.risks.map((risk) => (
                        <Card key={risk.title} padding="sm" className="rounded-xl border-amber-500/20 bg-amber-500/5">
                            <div className="flex items-start gap-3">
                                <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500">
                                    <AlertTriangle size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-[var(--on-surface)]">{risk.title}</p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-[var(--on-surface-variant)]">{risk.detail}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {insights && (
                <Card padding="sm" className="rounded-xl border-[var(--border)] bg-[var(--surface)]/90">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--primary)]">Background AI Notes</p>
                            <h3 className="text-lg font-black text-[var(--on-surface)]">Customer reminders and cashflow signals</h3>
                        </div>
                        <Badge variant="info">Idle-time</Badge>
                    </div>
                    <p className="text-sm font-semibold leading-6 text-[var(--on-surface-variant)]">{insights.overview}</p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <InsightPanel title="Cash Flow" tone="text-sky-500" text={insights.cashflowNote} />
                        <InsightList
                            title="Top Ledger Observations"
                            tone="text-emerald-500"
                            items={insights.topLedgerObservations.map((item) => `${item.name}: ${item.note} ${item.action}`)}
                        />
                        <InsightList
                            title="Follow-up Drafts"
                            tone="text-amber-500"
                            items={insights.customerReminders.map((item) => `${item.customer}: ${item.reason} ${item.template}`)}
                        />
                    </div>
                </Card>
            )}

            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <Card className="rounded-xl">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--primary)]">Trend</p>
                            <h2 className="text-lg font-black text-[var(--on-surface)]">Sales vs Purchase</h2>
                        </div>
                        <Badge variant="info">Live</Badge>
                    </div>
                    <div className="space-y-3">
                        {monthlyTrend.map((row) => {
                            const max = Math.max(...monthlyTrend.map((item) => Math.max(item.sales, item.purchase)), 1);
                            return (
                                <div key={row.month} className="grid grid-cols-[42px_1fr] items-center gap-3">
                                    <span className="text-xs font-bold text-[var(--text-muted)]">{row.month}</span>
                                    <div className="space-y-1.5">
                                        <Bar value={row.sales} max={max} className="bg-emerald-500" />
                                        <Bar value={row.purchase} max={max} className="bg-rose-500" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                <Card padding="none" className="overflow-hidden rounded-xl">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[var(--on-surface)]">Recent Transactions</h2>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        {data.dashboard.recentTransactions.length === 0 ? (
                            <EmptyState icon={<FileText size={36} />} title="No recent transactions" />
                        ) : data.dashboard.recentTransactions.map((voucher) => (
                            <button
                                key={voucher.id || `${voucher.voucher_number}-${voucher.voucher_date}`}
                                onClick={() => onVoucherClick(voucher)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)]"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-[var(--on-surface)]">{voucher.party_name || 'Unknown party'}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                        {voucher.voucher_type} | {formatDate(voucher.voucher_date)}
                                    </p>
                                </div>
                                <p className="shrink-0 text-sm font-black text-[var(--on-surface)]">{formatCurrency(voucher.grand_total)}</p>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}

function InsightPanel({ title, text, tone }: { title: string; text: string; tone: string }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] p-4">
            <p className={`text-[10px] font-black uppercase tracking-wider ${tone}`}>{title}</p>
            <p className="mt-2 text-xs font-semibold leading-6 text-[var(--on-surface-variant)]">{text}</p>
        </div>
    );
}

function InsightList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] p-4">
            <p className={`text-[10px] font-black uppercase tracking-wider ${tone}`}>{title}</p>
            <div className="mt-2 space-y-2">
                {items.length > 0 ? items.slice(0, 3).map((item, index) => (
                    <p key={`${title}-${index}`} className="text-xs font-semibold leading-6 text-[var(--on-surface-variant)]">
                        {item}
                    </p>
                )) : (
                    <p className="text-xs font-semibold leading-6 text-[var(--on-surface-variant)]">No insights yet.</p>
                )}
            </div>
        </div>
    );
}

function LedgerView({ ledgers, ledgerType, onLedgerTypeChange, selectedLedger, onSelectLedger, statement }: {
    ledgers: TallyLedger[];
    ledgerType: string;
    onLedgerTypeChange: (value: string) => void;
    selectedLedger: TallyLedger | null;
    onSelectLedger: (ledger: TallyLedger) => void;
    statement: any[];
}) {
    return (
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-3">
                <FilterChips values={ledgerTypes} selected={ledgerType} onChange={onLedgerTypeChange} />
                <Card padding="none" className="max-h-[72vh] overflow-hidden rounded-xl">
                    <div className="divide-y divide-[var(--border)] overflow-y-auto">
                        {ledgers.length === 0 ? (
                            <EmptyState icon={<Users size={40} />} title="No ledgers found" />
                        ) : ledgers.map((ledger) => (
                            <button
                                key={ledger.id || ledger.name}
                                onClick={() => onSelectLedger(ledger)}
                                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] ${selectedLedger?.name === ledger.name ? 'bg-[var(--primary)]/10' : ''}`}
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-[var(--on-surface)]">{ledger.name}</p>
                                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{ledger.parent || ledger.ledger_type}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-black ${ledger.current_balance >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                                        {formatCurrency(Math.abs(ledger.current_balance))}
                                    </p>
                                    <Badge variant={ledger.current_balance >= 0 ? 'info' : 'error'} className="mt-1 text-[9px]">
                                        {ledger.current_balance >= 0 ? 'Dr' : 'Cr'}
                                    </Badge>
                                </div>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <Card padding="none" className="overflow-hidden rounded-xl">
                {!selectedLedger ? (
                    <EmptyState icon={<FileText size={40} />} title="Select a ledger" description="Open a ledger to see running balance and transactions." />
                ) : (
                    <>
                        <div className="border-b border-[var(--border)] p-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--primary)]">Ledger Report</p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-xl font-black text-[var(--on-surface)]">{selectedLedger.name}</h2>
                                    <p className="text-xs font-bold text-[var(--text-muted)]">{selectedLedger.parent}</p>
                                </div>
                                <div className="text-left sm:text-right">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Closing Balance</p>
                                    <p className="text-lg font-black text-[var(--on-surface)]">{formatCurrency(Math.abs(selectedLedger.current_balance))}</p>
                                </div>
                            </div>
                        </div>
                        <ResponsiveTable
                            columns={['Date', 'Type', 'Voucher', 'Debit', 'Credit', 'Balance']}
                            rows={statement.map((row) => [
                                formatDate(row.voucher_date),
                                row.voucher_type,
                                row.voucher_number || '-',
                                row.debit ? formatCurrency(row.debit) : '-',
                                row.credit ? formatCurrency(row.credit) : '-',
                                formatCurrency(Math.abs(row.running_balance)),
                            ])}
                            empty="No transactions for this ledger"
                        />
                    </>
                )}
            </Card>
        </div>
    );
}

function VoucherList({ title, vouchers, onSelectVoucher, emptyTitle }: {
    title: string;
    vouchers: TallyVoucher[];
    onSelectVoucher: (voucher: TallyVoucher) => void;
    emptyTitle: string;
}) {
    return (
        <Card padding="none" className="overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="text-sm font-black uppercase tracking-wide text-[var(--on-surface)]">{title}</h2>
                <Badge variant="outline">{vouchers.length}</Badge>
            </div>
            <div className="divide-y divide-[var(--border)]">
                {vouchers.length === 0 ? (
                    <EmptyState icon={<Receipt size={40} />} title={emptyTitle} />
                ) : vouchers.map((voucher) => (
                    <button
                        key={voucher.id || `${voucher.voucher_type}-${voucher.voucher_number}-${voucher.voucher_date}`}
                        onClick={() => onSelectVoucher(voucher)}
                        className="grid w-full gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] sm:grid-cols-[1fr_auto]"
                    >
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={voucher.voucher_type === 'Sales' ? 'success' : voucher.voucher_type === 'Purchase' ? 'warning' : 'info'}>
                                    {voucher.voucher_type}
                                </Badge>
                                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                                    {formatDate(voucher.voucher_date)}
                                </span>
                            </div>
                            <p className="mt-2 truncate text-sm font-black text-[var(--on-surface)]">{voucher.party_name || 'Unknown party'}</p>
                            <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">#{voucher.voucher_number || 'NA'} | {voucher.items?.length || 0} items</p>
                        </div>
                        <div className="text-left sm:text-right">
                            <p className="text-base font-black text-[var(--on-surface)]">{formatCurrency(voucher.grand_total)}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                GST {formatCurrency(voucher.gst?.totalTax || 0)}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </Card>
    );
}

function ReportsView({ data, reportTab, onReportTabChange, onExportPdf, onExportExcel }: {
    data: TallyDataPayload;
    reportTab: ReportTab;
    onReportTabChange: (tab: ReportTab) => void;
    onExportPdf: () => void;
    onExportExcel: () => void;
}) {
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2 overflow-x-auto">
                    {[
                        { key: 'trial', label: 'Trial Balance' },
                        { key: 'pl', label: 'Profit and Loss' },
                        { key: 'balance', label: 'Balance Sheet' },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => onReportTabChange(tab.key as ReportTab)}
                            className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${reportTab === tab.key
                                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface-variant)]'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={onExportPdf}>PDF</Button>
                    <Button size="sm" variant="secondary" icon={<FileSpreadsheet size={14} />} onClick={onExportExcel}>Excel</Button>
                </div>
            </div>

            {reportTab === 'trial' && (
                <Card padding="none" className="overflow-hidden rounded-xl">
                    <ReportSummary
                        items={[
                            ['Total Debit', data.reports.trialBalance.totalDebit],
                            ['Total Credit', data.reports.trialBalance.totalCredit],
                            ['Difference', data.reports.trialBalance.difference],
                        ]}
                    />
                    <ResponsiveTable
                        columns={['Ledger', 'Group', 'Debit', 'Credit']}
                        rows={data.reports.trialBalance.rows.map((row) => [
                            row.ledger_name,
                            row.group || '-',
                            row.debit ? formatCurrency(row.debit) : '-',
                            row.credit ? formatCurrency(row.credit) : '-',
                        ])}
                        empty="No trial balance rows"
                    />
                </Card>
            )}

            {reportTab === 'pl' && (
                <Card className="rounded-xl">
                    <ReportSummary
                        items={[
                            ['Sales', data.reports.profitLoss.sales],
                            ['Purchases', data.reports.profitLoss.purchases],
                            ['Gross Profit', data.reports.profitLoss.grossProfit],
                            ['Net Profit', data.reports.profitLoss.netProfit],
                        ]}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                        <StatementLine label="Direct Income" amount={data.reports.profitLoss.directIncome} />
                        <StatementLine label="Direct Expense" amount={data.reports.profitLoss.directExpense} />
                        <StatementLine label="Indirect Income" amount={data.reports.profitLoss.indirectIncome} />
                        <StatementLine label="Indirect Expense" amount={data.reports.profitLoss.indirectExpense} />
                    </div>
                </Card>
            )}

            {reportTab === 'balance' && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card padding="none" className="overflow-hidden rounded-xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
                            <h2 className="font-black uppercase text-emerald-500">Assets</h2>
                            <span className="font-black">{formatCurrency(data.reports.balanceSheet.totalAssets)}</span>
                        </div>
                        <ResponsiveTable
                            columns={['Ledger', 'Group', 'Amount']}
                            rows={data.reports.balanceSheet.assets.map((row) => [row.ledger_name, row.group || '-', formatCurrency(row.amount)])}
                            empty="No asset rows"
                        />
                    </Card>
                    <Card padding="none" className="overflow-hidden rounded-xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
                            <h2 className="font-black uppercase text-rose-500">Liabilities</h2>
                            <span className="font-black">{formatCurrency(data.reports.balanceSheet.totalLiabilities)}</span>
                        </div>
                        <ResponsiveTable
                            columns={['Ledger', 'Group', 'Amount']}
                            rows={data.reports.balanceSheet.liabilities.map((row) => [row.ledger_name, row.group || '-', formatCurrency(row.amount)])}
                            empty="No liability rows"
                        />
                    </Card>
                </div>
            )}
        </div>
    );
}

function VoucherDrawer({ voucher, onClose }: { voucher: TallyVoucher; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm" onClick={onClose}>
            <div
                className="absolute bottom-0 right-0 top-auto max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl md:bottom-0 md:top-0 md:max-h-none md:w-[520px] md:rounded-none"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 p-4 backdrop-blur">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--primary)]">{voucher.voucher_type}</p>
                        <h2 className="text-lg font-black text-[var(--on-surface)]">{voucher.party_name || 'Voucher Details'}</h2>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3">
                        <InfoTile label="Voucher No" value={voucher.voucher_number || 'NA'} />
                        <InfoTile label="Date" value={formatDate(voucher.voucher_date)} />
                        <InfoTile label="Taxable" value={formatCurrency(voucher.gst?.taxableValue || 0)} />
                        <InfoTile label="Total" value={formatCurrency(voucher.grand_total)} />
                    </div>

                    <Card padding="none" className="overflow-hidden rounded-xl">
                        <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-black uppercase">Items</div>
                        <ResponsiveTable
                            columns={['Item', 'Qty', 'Rate', 'GST', 'Amount']}
                            rows={(voucher.items || []).map((item) => [
                                item.name || '-',
                                item.billed_qty || item.actual_qty || '-',
                                item.rate ? formatCurrency(item.rate) : '-',
                                item.gst_rate ? `${item.gst_rate}%` : '-',
                                formatCurrency(item.amount || 0),
                            ])}
                            empty="No item details available"
                        />
                    </Card>

                    <Card padding="sm" className="rounded-xl">
                        <h3 className="mb-3 text-sm font-black uppercase text-[var(--on-surface)]">GST Breakdown</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <StatementLine label="CGST" amount={voucher.gst?.cgst || 0} />
                            <StatementLine label="SGST" amount={voucher.gst?.sgst || 0} />
                            <StatementLine label="IGST" amount={voucher.gst?.igst || 0} />
                            <StatementLine label="Cess" amount={voucher.gst?.cess || 0} />
                        </div>
                    </Card>

                    <Card padding="none" className="overflow-hidden rounded-xl">
                        <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-black uppercase">Ledger Entries</div>
                        <ResponsiveTable
                            columns={['Ledger', 'Amount']}
                            rows={(voucher.ledger_entries || []).map((entry) => [entry.ledger_name || '-', formatCurrency(Math.abs(entry.amount || 0))])}
                            empty="No ledger entries available"
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
}

function FilterChips({ values, selected, onChange }: { values: string[]; selected: string; onChange: (value: string) => void }) {
    return (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {values.map((value) => (
                <button
                    key={value}
                    onClick={() => onChange(value)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${selected === value
                        ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface-variant)]'
                        }`}
                >
                    {value}
                </button>
            ))}
        </div>
    );
}

function ResponsiveTable({ columns, rows, empty }: { columns: string[]; rows: any[][]; empty: string }) {
    if (!rows.length) {
        return <EmptyState icon={<FileText size={34} />} title={empty} />;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--surface-variant)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                        {columns.map((column) => (
                            <th key={column} className="whitespace-nowrap px-4 py-3 font-black">{column}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-[var(--surface-hover)]">
                            {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--on-surface)]">
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ReportSummary({ items }: { items: Array<[string, number]> }) {
    return (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map(([label, amount]) => (
                <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
                    <p className="mt-2 text-lg font-black text-[var(--on-surface)]">{formatCurrency(amount)}</p>
                </div>
            ))}
        </div>
    );
}

function StatementLine({ label, amount }: { label: string; amount: number }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] px-4 py-3">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
            <span className="text-sm font-black text-[var(--on-surface)]">{formatCurrency(amount)}</span>
        </div>
    );
}

function InfoTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 text-sm font-black text-[var(--on-surface)]">{value}</p>
        </div>
    );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
    return (
        <div className="h-2 rounded-full bg-[var(--surface-variant)]">
            <div className={`h-2 rounded-full ${className}`} style={{ width: `${Math.max(3, Math.min(100, (value / max) * 100))}%` }} />
        </div>
    );
}

function buildMonthlyTrend(vouchers: TallyVoucher[]) {
    const months = new Map<string, { month: string; sales: number; purchase: number }>();
    vouchers.forEach((voucher) => {
        if (!voucher.voucher_date) return;
        const key = voucher.voucher_date.slice(0, 7);
        const month = formatDate(voucher.voucher_date, 'MMM');
        if (!months.has(key)) months.set(key, { month, sales: 0, purchase: 0 });
        const row = months.get(key)!;
        if (voucher.voucher_type === 'Sales') row.sales += Math.abs(voucher.grand_total || 0);
        if (voucher.voucher_type === 'Purchase') row.purchase += Math.abs(voucher.grand_total || 0);
    });
    return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, value]) => value);
}

async function exportReportPdf(data: TallyDataPayload, reportTab: ReportTab, companyName: string) {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
    ]);
    const doc = new jsPDF();
    const { title, columns, rows } = getReportRows(data, reportTab);
    doc.text(`${companyName} - ${title}`, 14, 14);
    autoTable(doc, { head: [columns], body: rows, startY: 22, styles: { fontSize: 8 } });
    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

async function exportReportExcel(data: TallyDataPayload, reportTab: ReportTab, companyName: string) {
    const XLSX = await import('xlsx');
    const { title, columns, rows } = getReportRows(data, reportTab);
    const sheet = XLSX.utils.aoa_to_sheet([[`${companyName} - ${title}`], [], columns, ...rows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
    XLSX.writeFile(book, `${title.replace(/\s+/g, '_')}.xlsx`);
}

function getReportRows(data: TallyDataPayload, reportTab: ReportTab) {
    if (reportTab === 'pl') {
        return {
            title: 'Profit and Loss',
            columns: ['Particular', 'Amount'],
            rows: [
                ['Sales', data.reports.profitLoss.sales],
                ['Purchases', data.reports.profitLoss.purchases],
                ['Direct Income', data.reports.profitLoss.directIncome],
                ['Direct Expense', data.reports.profitLoss.directExpense],
                ['Indirect Income', data.reports.profitLoss.indirectIncome],
                ['Indirect Expense', data.reports.profitLoss.indirectExpense],
                ['Net Profit', data.reports.profitLoss.netProfit],
            ],
        };
    }

    if (reportTab === 'balance') {
        return {
            title: 'Balance Sheet',
            columns: ['Side', 'Ledger', 'Group', 'Amount'],
            rows: [
                ...data.reports.balanceSheet.assets.map((row) => ['Assets', row.ledger_name, row.group, row.amount]),
                ...data.reports.balanceSheet.liabilities.map((row) => ['Liabilities', row.ledger_name, row.group, row.amount]),
            ],
        };
    }

    return {
        title: 'Trial Balance',
        columns: ['Ledger', 'Group', 'Debit', 'Credit'],
        rows: data.reports.trialBalance.rows.map((row) => [row.ledger_name, row.group, row.debit, row.credit]),
    };
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
}

function formatDate(value: string, pattern = 'dd MMM yyyy') {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return format(date, pattern);
}

function getTopLedgerBalances(ledgers: TallyLedger[], type: string, limit: number) {
    return ledgers
        .filter((l) => l.ledger_type === type)
        .sort((a, b) => Math.abs(b.current_balance || 0) - Math.abs(a.current_balance || 0))
        .slice(0, limit);
}

function buildCommandCenter(data: TallyDataPayload) {
    const sales = data.dashboard.totalSales || 0;
    const purchases = data.dashboard.totalPurchase || 0;
    const receivables = data.dashboard.receivables || 0;
    const payables = data.dashboard.payables || 0;
    const cash = data.dashboard.cashBankBalance || 0;

    let score = 75;
    if (purchases > sales) score -= 15;
    if (payables > cash) score -= 10;
    if (receivables > sales * 0.5) score -= 5;
    score = Math.max(10, Math.min(100, score));

    let label = 'Good';
    let summary = 'Your business health is stable. Keep an eye on outstanding receivables.';
    if (score < 50) {
        label = 'Critical';
        summary = 'High payables relative to cash reserves. Immediate action recommended.';
    } else if (score < 75) {
        label = 'Fair';
        summary = 'Moderate cash reserves. Optimize collections to improve cash flow.';
    }

    const actions = [
        { title: 'Collect outstanding payments', detail: 'Contact top debtors with overdue bills to optimize cashflow.', type: 'warning' as const },
        { title: 'Verify GST filing input credit', detail: 'Cross-reference ledger tax entries before the next filing cycle.', type: 'info' as const },
    ];

    const risks = [];
    if (payables > cash) {
        risks.push({ title: 'Liquidity Pressure', detail: 'Payables exceed current cash/bank balance by ' + formatCurrency(payables - cash) });
    }
    if (purchases > sales) {
        risks.push({ title: 'Negative Margin Trade', detail: 'Purchases exceed sales in this period.' });
    }

    return {
        score,
        label,
        summary,
        actions,
        risks,
    };
}

function InsightRow({ title, detail, type = 'info' }: { title: string; detail: string; type?: 'info' | 'success' | 'warning' | 'error' }) {
    return (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] p-3">
            <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                type === 'success' ? 'bg-emerald-500' :
                type === 'warning' ? 'bg-amber-500' :
                type === 'error' ? 'bg-rose-500' : 'bg-blue-500'
            }`} />
            <div>
                <p className="text-xs font-black text-[var(--on-surface)]">{title}</p>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-[var(--text-muted)]">{detail}</p>
            </div>
        </div>
    );
}

function ExposureList({ title, icon, rows, empty, tone }: {
    title: string;
    icon: React.ReactNode;
    rows: TallyLedger[];
    empty: string;
    tone: string;
}) {
    return (
        <div className="p-4 border-b border-[var(--border)] last:border-b-0">
            <div className="mb-3 flex items-center gap-2">
                <span className={tone}>{icon}</span>
                <h3 className="text-xs font-black uppercase tracking-wide text-[var(--on-surface)]">{title}</h3>
            </div>
            <div className="space-y-2">
                {rows.length === 0 ? (
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">{empty}</p>
                ) : (
                    rows.map((row) => (
                        <div key={row.id || row.name} className="flex items-center justify-between text-xs">
                            <span className="truncate font-semibold text-[var(--on-surface-variant)]">{row.name}</span>
                            <span className={`font-black ${tone}`}>{formatCurrency(Math.abs(row.current_balance))}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
