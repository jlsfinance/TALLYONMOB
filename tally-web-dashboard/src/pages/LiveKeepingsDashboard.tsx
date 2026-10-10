import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import {
    TrendingUp, TrendingDown, Wallet, Building2, Users, Package,
    Plus, Send, FileText, BarChart3, RefreshCw, Calendar,
    Clock, Pin, PinOff, Eye, Receipt, Landmark, ChevronDown,
    Bell, MessageCircle, Search, ChevronRight, AlertTriangle,
    IndianRupee, ArrowUpRight, ArrowDownLeft, X, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import SmartInsights from '@/components/SmartInsights';
import MultiCompanyDashboard from '@/components/MultiCompanyDashboard';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(amount) || 0);
}

function formatCompact(amount: number) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return formatCurrency(amount);
}

function getCurrentFY(): string {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-${(year + 1).toString().slice(-2)}`;
}

function getFYDates(fy: string): { from: string; to: string } {
    const startYear = parseInt(fy.split('-')[0]);
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function getAvailableFYs(): string[] {
    const current = getCurrentFY();
    const startYear = parseInt(current.split('-')[0]);
    return Array.from({ length: 5 }, (_, i) => {
        const y = startYear - i;
        return `${y}-${(y + 1).toString().slice(-2)}`;
    });
}

const QUICK_ACCESS_ITEMS = [
    { icon: <Package size={18} />, label: 'Buy Now', color: 'text-rose-500', path: '/create-voucher' },
    { icon: <FileText size={18} />, label: 'Invoice', color: 'text-emerald-500', path: '/create-invoice', badge: 'NEW' },
    { icon: <Clock size={18} />, label: 'Day Book', color: 'text-blue-500', path: '/day-book' },
    { icon: <Landmark size={18} />, label: 'Ledger', color: 'text-purple-500', path: '/ledgers' },
    { icon: <BarChart3 size={18} />, label: 'Reports', color: 'text-amber-500', path: '/profit-loss' },
    { icon: <TrendingUp size={18} />, label: 'P&L', color: 'text-emerald-500', path: '/profit-loss' },
    { icon: <Users size={18} />, label: 'Parties', color: 'text-indigo-500', path: '/ledgers' },
    { icon: <Receipt size={18} />, label: 'GST', color: 'text-orange-500', path: '/gst-reports' },
];

function shareOnWhatsApp(phone: string, message: string) {
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encoded}`, '_blank');
}

function generateInvoiceMessage(v: any) {
    const amt = formatCurrency(Number(v.grand_total) || Number(v.total_amount) || 0);
    return `📄 *Invoice #${v.voucher_number || 'NA'}*\n👤 ${v.party_name || 'Customer'}\n💰 Amount: ${amt}\n📅 Date: ${format(new Date(v.voucher_date), 'dd MMM yyyy')}\n📝 Type: ${v.voucher_type}`;
}

const SummaryCards = memo(({ dashboard, navigate }: { dashboard: any; navigate: any }) => {
    const cards = [
        { label: 'Sales', value: dashboard?.totalSales, note: `${dashboard?.salesCount || 0} invoices this FY`, path: '/sales', tone: 'blue', icon: <TrendingUp size={19} /> },
        { label: 'Purchases', value: dashboard?.totalPurchases, note: `${dashboard?.purchaseCount || 0} bills this FY`, path: '/purchases', tone: 'violet', icon: <Package size={19} /> },
        { label: 'Receivables', value: dashboard?.receivables, note: 'From sundry debtors', path: '/aging-report', tone: 'amber', icon: <ArrowUpRight size={19} /> },
        { label: 'Payables', value: dashboard?.payables, note: 'Due to sundry creditors', path: '/ledgers', tone: 'emerald', icon: <Wallet size={19} /> },
    ];
    const tones: Record<string, string> = {
        blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
        amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    };
    return (
        <section aria-labelledby="dashboard-summary-title">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 id="dashboard-summary-title" className="text-base font-bold tracking-tight">Business overview</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">Your key numbers for the selected financial year</p>
                </div>
                <button onClick={() => navigate('/profit-loss')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-container)]">
                    Reports <ChevronRight size={14} />
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <button key={card.label} onClick={() => navigate(card.path)} className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-xs)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-[var(--shadow-md)] sm:p-5">
                        <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-[var(--on-surface-variant)]">{card.label}</span>
                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[card.tone]}`}>{card.icon}</span>
                        </div>
                        <p className="mt-4 text-2xl font-bold tracking-tight text-[var(--on-surface)] sm:text-[28px]">{formatCompact(Number(card.value) || 0)}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-[var(--text-muted)]">{card.note}</span>
                            <ChevronRight size={15} className="shrink-0 text-[var(--text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
                        </div>
                    </button>
                ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    { label: 'Receipts', value: dashboard?.totalReceipts, path: '/vouchers', state: { type: 'Receipt' }, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Payments', value: dashboard?.totalPayments, path: '/vouchers', state: { type: 'Payment' }, color: 'text-rose-600 dark:text-rose-400' },
                    { label: 'Today’s sales', value: dashboard?.todaySales, path: '/sales', color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Transactions', value: (dashboard?.salesCount || 0) + (dashboard?.purchaseCount || 0), path: '/vouchers', count: true, color: 'text-[var(--on-surface)]' },
                ].map((item) => (
                    <button key={item.label} onClick={() => navigate(item.path, item.state ? { state: item.state } : undefined)} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition hover:bg-[var(--surface-hover)]">
                        <span className="text-xs font-medium text-[var(--text-muted)]">{item.label}</span>
                        <span className={`text-sm font-bold ${item.color}`}>{item.count ? Number(item.value || 0).toLocaleString('en-IN') : formatCompact(Number(item.value) || 0)}</span>
                    </button>
                ))}
            </div>
        </section>
    );
});

const QuickAccessGrid = memo(({ navigate }: { navigate: any }) => (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
            <div>
                <h2 className="text-base font-bold tracking-tight">Quick actions</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Jump straight into your day-to-day work</p>
            </div>
            <button onClick={() => navigate('/vouchers')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-container)]">
                All activity <ChevronRight size={14} />
            </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {QUICK_ACCESS_ITEMS.map((item, i) => (
                <button key={i} onClick={() => navigate(item.path)} className="group relative flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)]/70 px-2 py-3 text-center transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:bg-[var(--surface)] hover:shadow-[var(--shadow-sm)]">
                    {item.badge && <span className="absolute right-2 top-2 rounded-full bg-[var(--primary-container)] px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-[var(--primary)]">{item.badge}</span>}
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface)] shadow-[var(--shadow-xs)] transition group-hover:scale-105 ${item.color}`}>{item.icon}</span>
                    <span className="text-xs font-semibold leading-tight text-[var(--on-surface)]">{item.label}</span>
                </button>
            ))}
        </div>
    </section>
));

const RecentTransactions = memo(({ dashboard, navigate }: { dashboard: any; navigate: any }) => (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div>
                <h2 className="text-base font-bold tracking-tight">Recent transactions</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">The latest activity recorded in this company</p>
            </div>
            <button onClick={() => navigate('/vouchers')} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-container)]">
                View all <ChevronRight size={14} />
            </button>
        </div>
        <div className="divide-y divide-[var(--border)] px-4 sm:px-5">
            {(dashboard?.recentVouchers || []).slice(0, 6).map((v: any) => {
                const amount = Number(v.grand_total) || Number(v.total_amount) || 0;
                const isSales = v.voucher_type === 'Sales';
                const isPurchase = v.voucher_type === 'Purchase';
                const tone = isSales ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : isPurchase ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
                return (
                    <div key={v.id} className="flex items-center gap-3 py-3.5">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Receipt size={17} /></span>
                        <button onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/dashboard' } })} className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-sm font-semibold text-[var(--on-surface)]">{v.party_name || 'Cash transaction'}</span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{v.voucher_type || 'Voucher'} · {v.voucher_number ? `#${v.voucher_number} · ` : ''}{v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : 'Date unavailable'}</span>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="text-right text-sm font-bold tabular-nums text-[var(--on-surface)]">{formatCurrency(amount)}</span>
                            {isSales && <button aria-label="Share invoice on WhatsApp" onClick={(event) => { event.stopPropagation(); shareOnWhatsApp('', generateInvoiceMessage(v)); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition hover:bg-emerald-500 hover:text-white dark:text-emerald-400"><MessageCircle size={15} /></button>}
                        </div>
                    </div>
                );
            })}
            {!(dashboard?.recentVouchers || []).length && <div className="py-10 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-container)] text-[var(--text-muted)]"><Receipt size={19} /></span><p className="mt-3 text-sm font-semibold">No transactions yet</p><p className="mt-1 text-xs text-[var(--text-muted)]">Once vouchers are synced, they’ll appear here.</p></div>}
        </div>
    </section>
));

export default memo(function LiveKeepingsDashboard() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [selectedFY, setSelectedFY] = useState(getCurrentFY());
    const [showFYDropdown, setShowFYDropdown] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('dismissedAlerts') || '[]')); } catch { return new Set(); }
    });

    const fyDates = getFYDates(selectedFY);

    // FY detection
    useEffect(() => {
        if (!selectedCompany?.id) return;
        (async () => {
            try {
                const { data } = await supabase
                    .from('vouchers').select('voucher_date')
                    .eq('company_id', selectedCompany.id).eq('is_deleted', false)
                    .order('voucher_date', { ascending: false }).limit(1);
                if (data?.[0]?.voucher_date) {
                    const d = new Date(data[0].voucher_date);
                    const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
                    setSelectedFY(`${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)}`);
                }
            } catch {}
        })();
    }, [selectedCompany?.id]);

    // React Query — dashboard data (NO raw useEffect)
    const { data: dashboard, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['dashboard', selectedCompany?.id, selectedFY],
        queryFn: async () => {
            if (!selectedCompany?.id) return null;
            const today = format(new Date(), 'yyyy-MM-dd');

            const [salesRes, purchasesRes, receiptsRes, paymentsRes, ledgersRes, recentRes, stockRes] = await Promise.all([
                supabase.from('vouchers').select('grand_total, total_amount, voucher_date, party_name, id')
                    .eq('company_id', selectedCompany.id).eq('voucher_type', 'Sales').eq('is_deleted', false)
                    .gte('voucher_date', fyDates.from).lte('voucher_date', fyDates.to),
                supabase.from('vouchers').select('grand_total, total_amount, voucher_date, party_name, id')
                    .eq('company_id', selectedCompany.id).eq('voucher_type', 'Purchase').eq('is_deleted', false)
                    .gte('voucher_date', fyDates.from).lte('voucher_date', fyDates.to),
                supabase.from('vouchers').select('grand_total, total_amount')
                    .eq('company_id', selectedCompany.id).eq('voucher_type', 'Receipt').eq('is_deleted', false)
                    .gte('voucher_date', fyDates.from).lte('voucher_date', fyDates.to),
                supabase.from('vouchers').select('grand_total, total_amount')
                    .eq('company_id', selectedCompany.id).eq('voucher_type', 'Payment').eq('is_deleted', false)
                    .gte('voucher_date', fyDates.from).lte('voucher_date', fyDates.to),
                supabase.from('ledgers').select('name, current_balance, parent')
                    .eq('company_id', selectedCompany.id),
                supabase.from('vouchers').select('id, voucher_type, voucher_number, party_name, grand_total, total_amount, voucher_date')
                    .eq('company_id', selectedCompany.id).eq('is_deleted', false)
                    .order('voucher_date', { ascending: false }).limit(15),
                supabase.from('stock_items').select('id, name, current_stock, opening_stock, stock_group')
                    .eq('company_id', selectedCompany.id),
            ]);

            const sales = salesRes.data || [];
            const purchases = purchasesRes.data || [];
            const ledgers = ledgersRes.data || [];

            const totalSales = sales.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalPurchases = purchases.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalReceipts = (receiptsRes.data || []).reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalPayments = (paymentsRes.data || []).reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const todaySales = sales.filter(v => v.voucher_date === today).reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);

            const debtors = ledgers.filter(l => l.parent === 'Sundry Debtors');
            const creditors = ledgers.filter(l => l.parent === 'Sundry Creditors');
            const receivables = debtors.reduce((s, d) => s + (Number(d.current_balance) || 0), 0);
            const payables = creditors.reduce((s, c) => s + Math.abs(Number(c.current_balance) || 0), 0);

            const overdueParties = debtors.filter(d => (Number(d.current_balance) || 0) > 0)
                .sort((a, b) => Number(b.current_balance) - Number(a.current_balance));

            const stockItems = stockRes.data || [];
            const lowStock = stockItems.filter(s => {
                const stock = Number(s.current_stock) || Number(s.opening_stock) || 0;
                return stock <= 5 && stock > 0;
            });

            return {
                totalSales, totalPurchases, totalReceipts, totalPayments,
                receivables, payables, todaySales,
                salesCount: sales.length, purchaseCount: purchases.length,
                recentVouchers: recentRes.data || [],
                topParties: [...debtors, ...creditors]
                    .sort((a, b) => Math.abs(Number(b.current_balance)) - Math.abs(Number(a.current_balance)))
                    .slice(0, 5),
                alerts: {
                    overduePayments: overdueParties.length,
                    overdueAmount: receivables,
                    lowStockCount: lowStock.length,
                    lowStockItems: lowStock.slice(0, 3).map(s => s.name),
                }
            };
        },
        enabled: !!selectedCompany?.id,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const alerts = useMemo(() => {
        if (!dashboard?.alerts) return [];
        const items: { id: string; type: 'warning' | 'error' | 'info'; title: string; desc: string; action?: string }[] = [];
        if (dashboard.alerts.overduePayments > 0) {
            items.push({
                id: 'overdue',
                type: 'error',
                title: `${dashboard.alerts.overduePayments} Overdue Payments`,
                desc: `${formatCurrency(dashboard.alerts.overdueAmount)} pending from ${dashboard.alerts.overduePayments} parties`,
                action: '/aging-report'
            });
        }
        if (dashboard.alerts.lowStockCount > 0) {
            items.push({
                id: 'low-stock',
                type: 'warning',
                title: `${dashboard.alerts.lowStockCount} Items Low Stock`,
                desc: dashboard.alerts.lowStockItems.join(', ') + (dashboard.alerts.lowStockCount > 3 ? ` +${dashboard.alerts.lowStockCount - 3} more` : ''),
                action: '/stock'
            });
        }
        if (new Date().getDate() <= 20) {
            items.push({
                id: 'gst-filing',
                type: 'info',
                title: 'GST Filing Due',
                desc: 'GSTR-1/3B filing deadline approaching',
                action: '/gst-reports'
            });
        }
        return items.filter(a => !dismissedAlerts.has(a.id));
    }, [dashboard, dismissedAlerts]);

    const dismissAlert = useCallback((id: string) => {
        const next = new Set(dismissedAlerts);
        next.add(id);
        setDismissedAlerts(next);
        localStorage.setItem('dismissedAlerts', JSON.stringify([...next]));
    }, [dismissedAlerts]);

    if (isLoading && !dashboard) {
        return (
            <div className="animate-pulse space-y-5 pb-24" aria-label="Loading dashboard">
                <div className="h-40 rounded-3xl bg-[var(--surface-container)]" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-36 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />)}
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
                    <div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
                </div>
            </div>
        );
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const lastSync = selectedCompany?.last_sync_at ? new Date(selectedCompany.last_sync_at) : null;
    const hasSyncTime = !!lastSync && !Number.isNaN(lastSync.getTime());

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-24 animate-fade-in sm:space-y-6">
            {/* Bell in header actions */}
            <HeaderPortal type="actions">
                <div className="flex items-center gap-1.5">
                    <div className="relative" data-notif-panel>
                        <button aria-label="Notifications" aria-expanded={showNotifications} onClick={(e) => { e.stopPropagation(); setShowNotifications(!showNotifications); }}
                            className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--text-muted)] transition-all relative">
                            <Bell size={18} />
                            {alerts.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{alerts.length}</span>
                            )}
                        </button>
                        {showNotifications && (
                            <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl z-50">
                                <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
                                    <span className="text-sm font-bold">Notifications</span>
                                    <button onClick={() => setShowNotifications(false)} className="p-1 rounded-lg hover:bg-[var(--surface-variant)]"><X size={14} /></button>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {alerts.length === 0 ? (
                                        <div className="p-6 text-center">
                                            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                                            <p className="text-sm text-[var(--text-muted)]">All clear!</p>
                                        </div>
                                    ) : alerts.map(alert => (
                                        <div key={alert.id} className={`p-3 border-b border-[var(--border)] flex items-start gap-3 ${alert.type === 'error' ? 'bg-red-500/5' : alert.type === 'warning' ? 'bg-amber-500/5' : 'bg-blue-500/5'}`}>
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${alert.type === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : alert.type === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                                                {alert.type === 'error' ? <AlertTriangle size={14} /> : alert.type === 'warning' ? <Package size={14} /> : <FileText size={14} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold">{alert.title}</p>
                                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{alert.desc}</p>
                                                {alert.action && <button onClick={() => { navigate(alert.action!); setShowNotifications(false); }} className="text-[10px] font-bold text-[var(--primary)] mt-1 hover:underline">View →</button>}
                                            </div>
                                            <button onClick={() => dismissAlert(alert.id)} className="p-1 rounded hover:bg-[var(--surface-variant)] shrink-0"><X size={12} className="text-[var(--text-muted)]" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </HeaderPortal>

            {/* FY Selector — in header filters */}
            <HeaderPortal type="filters">
                <div className="relative">
                    <button
                        onClick={() => setShowFYDropdown(!showFYDropdown)}
                        aria-label="Select financial year"
                        className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--on-surface)] shadow-[var(--shadow-xs)] transition hover:border-[var(--primary)]/40"
                    >
                        <Calendar size={14} className="text-[var(--primary)]" />
                        FY {selectedFY}
                        <ChevronDown size={13} />
                    </button>
                    {showFYDropdown && (
                        <div className="absolute right-0 top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                            {getAvailableFYs().map(fy => (
                                <button key={fy}
                                    onClick={() => { setSelectedFY(fy); setShowFYDropdown(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-all ${fy === selectedFY ? 'bg-[var(--primary)] text-white' : 'text-[var(--on-surface)] hover:bg-[var(--surface-container)]'}`}
                                >
                                    FY {fy}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </HeaderPortal>

            <section className="relative isolate overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
                <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-2/3 opacity-80" style={{ background: 'radial-gradient(ellipse at 80% 20%, var(--primary-container), transparent 68%)' }} />
                <div className="relative z-10 flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                    <div className="min-w-0">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)]/80 px-3 py-1.5 text-xs font-medium text-[var(--on-surface-variant)]">
                            <Building2 size={14} className="text-[var(--primary)]" />
                            <span className="max-w-[220px] truncate">{selectedCompany?.name || 'Your company'}</span>
                            <span className="h-1 w-1 rounded-full bg-[var(--outline)]" />
                            <span>FY {selectedFY}</span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-[var(--on-surface)] sm:text-3xl">{greeting}, here’s your overview</h1>
                        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">A clear picture of your business activity, outstanding balances, and recent transactions.</p>
                        <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[var(--on-surface-variant)]">
                            <span className={`h-2 w-2 rounded-full ${hasSyncTime ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {hasSyncTime ? `Last synced ${formatDistanceToNow(lastSync!, { addSuffix: true })}` : 'No sync time available'}
                            <button onClick={() => navigate('/tally-sync')} className="ml-1 font-semibold text-[var(--primary)] hover:underline">Sync status</button>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                        <button onClick={() => refetch()} disabled={isFetching} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--on-surface)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-60">
                            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <button onClick={() => navigate('/create-invoice')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--on-primary)] shadow-[var(--shadow-sm)] transition hover:brightness-110">
                            <Plus size={17} /> New invoice
                        </button>
                    </div>
                </div>
            </section>

            <SummaryCards dashboard={dashboard} navigate={navigate} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <QuickAccessGrid navigate={navigate} />
                <RecentTransactions dashboard={dashboard} navigate={navigate} />
            </div>

            {/* Smart Insights */}
            <SmartInsights />

            {/* Multi-Company View */}
            <MultiCompanyDashboard />
        </div>
    );
});
