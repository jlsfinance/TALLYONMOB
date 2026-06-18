import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
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

const SummaryCards = memo(({ dashboard, navigate }: { dashboard: any; navigate: any }) => (
    <div>
        <div className="flex items-center justify-between mb-2 pl-[2px]">
            <p className="text-sm font-bold">Summary</p>
            <button onClick={() => navigate('/sales')} className="text-[10px] font-bold text-[var(--primary)] flex items-center gap-0.5">
                View All <ChevronRight size={10} />
            </button>
        </div>
        <div className="grid grid-cols-2 gap-[2px]">
            <button onClick={() => navigate('/sales')} className="p-2 sm:p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:scale-[1.02] transition-transform">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-[var(--text-muted)] uppercase">Sales</span>
                    <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-base sm:text-lg font-black">{formatCompact(dashboard?.totalSales || 0)}</p>
            </button>
            <button onClick={() => navigate('/aging-report')} className="p-2 sm:p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:scale-[1.02] transition-transform">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-[var(--text-muted)] uppercase">Receivables</span>
                    <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-base sm:text-lg font-black text-amber-600">{formatCompact(dashboard?.receivables || 0)}</p>
            </button>
            <button onClick={() => navigate('/purchases')} className="p-2 sm:p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:scale-[1.02] transition-transform">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-[var(--text-muted)] uppercase">Purchase</span>
                    <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-base sm:text-lg font-black">{formatCompact(dashboard?.totalPurchases || 0)}</p>
            </button>
            <button onClick={() => navigate('/ledgers')} className="p-2 sm:p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:scale-[1.02] transition-transform">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-[var(--text-muted)] uppercase">Payables</span>
                    <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-base sm:text-lg font-black text-blue-600">{formatCompact(dashboard?.payables || 0)}</p>
            </button>
            <button onClick={() => navigate('/vouchers', { state: { type: 'Receipt' } })} className="p-2 sm:p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:scale-[1.02] transition-transform">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-[var(--text-muted)] uppercase">Receipt</span>
                    <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-base sm:text-lg font-black text-emerald-600">{formatCompact(dashboard?.totalReceipts || 0)}</p>
            </button>
            <button onClick={() => navigate('/vouchers', { state: { type: 'Payment' } })} className="p-2 sm:p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:scale-[1.02] transition-transform">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold text-[var(--text-muted)] uppercase">Payment</span>
                    <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-base sm:text-lg font-black">{formatCompact(dashboard?.totalPayments || 0)}</p>
            </button>
        </div>
    </div>
));

const QuickAccessGrid = memo(({ navigate }: { navigate: any }) => (
    <div>
        <div className="flex items-center justify-between mb-2 pl-[2px]">
            <p className="text-sm font-bold">Quick Access</p>
            <button onClick={() => navigate('/vouchers')} className="text-[10px] font-bold text-[var(--primary)] flex items-center gap-0.5">
                View All <ChevronRight size={10} />
            </button>
        </div>
        <div className="grid grid-cols-4 gap-[2px]">
            {QUICK_ACCESS_ITEMS.map((item, i) => (
                <button key={i} onClick={() => navigate(item.path)}
                    className="flex flex-col items-center gap-0.5 p-1.5 sm:p-2 rounded-lg hover:bg-[var(--surface-container)] transition-all relative">
                    {item.badge && (
                        <span className="absolute top-0 right-0.5 text-[6px] font-bold text-red-500 bg-red-100 px-0.5 rounded">{item.badge}</span>
                    )}
                    <div className={`${item.color}`}>{item.icon}</div>
                    <span className="text-[8px] sm:text-[9px] font-bold text-center leading-tight">{item.label}</span>
                </button>
            ))}
        </div>
    </div>
));

const RecentTransactions = memo(({ dashboard, navigate }: { dashboard: any; navigate: any }) => (
    <div>
        <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold">Sales {formatCompact(dashboard?.totalSales || 0)}</p>
            <button onClick={() => navigate('/sales')} className="text-[10px] font-bold text-[var(--primary)] flex items-center gap-0.5">
                View All <ChevronRight size={10} />
            </button>
        </div>
        <div className="flex gap-1 mb-2">
            {['Latest Vouchers', 'Recent Customers', 'Sold Recently'].map((tab, i) => (
                <button key={tab} className={`text-[9px] font-bold px-2 py-1 rounded border transition-all ${i === 0 ? 'bg-[var(--on-surface)] text-white border-[var(--on-surface)]' : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]'}`}>
                    {tab}
                </button>
            ))}
        </div>
        <div className="space-y-[2px]">
            {(dashboard?.recentVouchers || []).slice(0, 5).map((v: any) => {
                const amt = Number(v.grand_total) || Number(v.total_amount) || 0;
                const isDebit = v.voucher_type === 'Sales' || v.voucher_type === 'Purchase';
                return (
                    <div key={v.id} className="flex items-center justify-between p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                        <button onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/dashboard' } })}
                            className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-black truncate">{v.party_name || 'CASH'}</p>
                                {isDebit && <span className="text-[7px] font-bold text-amber-600 bg-amber-100 px-0.5 rounded">Dr</span>}
                            </div>
                            <p className="text-[9px] text-[var(--text-muted)]">
                                {format(new Date(v.voucher_date), 'dd MMM yy')} | #{v.voucher_number || 'NA'}
                            </p>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <p className="text-[10px] font-black whitespace-nowrap">{formatCurrency(amt)}</p>
                            {v.voucher_type === 'Sales' && (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    shareOnWhatsApp('', generateInvoiceMessage(v));
                                }}
                                    className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 active:scale-90 transition-transform">
                                    <MessageCircle size={10} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
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
    const { data: dashboard, isLoading, refetch } = useQuery({
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
            <div className="space-y-3 pb-24">
                {/* Skeleton — Summary */}
                <div className="grid grid-cols-2 gap-[2px]">
                    {[1,2,3,4].map(i => (
                        <div key={i} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] animate-pulse">
                            <div className="h-2 w-16 bg-[var(--surface-container)] rounded mb-2" />
                            <div className="h-4 w-20 bg-[var(--surface-container)] rounded" />
                        </div>
                    ))}
                </div>
                {/* Skeleton — Quick Access */}
                <div className="grid grid-cols-4 gap-[2px]">
                    {[1,2,3,4,5,6,7,8].map(i => (
                        <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-lg animate-pulse">
                            <div className="w-8 h-8 rounded-lg bg-[var(--surface-container)]" />
                            <div className="h-1.5 w-10 bg-[var(--surface-container)] rounded" />
                        </div>
                    ))}
                </div>
                {/* Skeleton — Recent */}
                <div className="space-y-1.5">
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] animate-pulse">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-[var(--surface-container)]" />
                                <div>
                                    <div className="h-2 w-24 bg-[var(--surface-container)] rounded mb-1" />
                                    <div className="h-1.5 w-16 bg-[var(--surface-container)] rounded" />
                                </div>
                            </div>
                            <div className="h-3 w-14 bg-[var(--surface-container)] rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3 pb-24 animate-fade-in">
            {/* Bell in header actions */}
            <HeaderPortal type="actions">
                <div className="flex items-center gap-1.5">
                    <div className="relative" data-notif-panel>
                        <button onClick={(e) => { e.stopPropagation(); setShowNotifications(!showNotifications); }}
                            className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--text-muted)] transition-all relative">
                            <Bell size={18} />
                            {alerts.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{alerts.length}</span>
                            )}
                        </button>
                        {showNotifications && (
                            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1E1E2E] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden">
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
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${alert.type === 'error' ? 'bg-red-100 text-red-600' : alert.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
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
                        className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--on-surface)]"
                    >
                        <Calendar size={10} className="text-[var(--primary)]" />
                        FY {selectedFY}
                        <ChevronDown size={8} />
                    </button>
                    {showFYDropdown && (
                        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#1E1E2E] border border-[var(--border)] rounded-xl shadow-lg z-50 min-w-[140px]">
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

            {/* Sync Banner — compact + working */}
            <button onClick={() => navigate('/tally-sync')} className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-amber-600" />
                    <span className="text-[10px] font-semibold text-amber-700">Sync pending with Tally</span>
                </div>
                <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">FIX →</span>
            </button>

            {/* Summary Cards — memoized */}
            <SummaryCards dashboard={dashboard} navigate={navigate} />

            {/* Quick Access Grid — memoized */}
            <QuickAccessGrid navigate={navigate} />

            {/* Recent Transactions — memoized */}
            <RecentTransactions dashboard={dashboard} navigate={navigate} />

            {/* Smart Insights */}
            <SmartInsights />

            {/* Multi-Company View */}
            <MultiCompanyDashboard />
        </div>
    );
});
