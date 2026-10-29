import { HeaderPortal } from '../components/layout/HeaderPortal';
import { useState, useEffect, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    TrendingUp, TrendingDown, Wallet, Building2, Users, Package,
    Plus, Send, FileText, BarChart3, RefreshCw,
    Clock, Pin, PinOff, Eye, Receipt, Landmark,
    Bell, MessageCircle, Search, ChevronRight, ChevronDown, AlertTriangle,
    IndianRupee, ArrowUpRight, ArrowDownLeft, X, CheckCircle2,
    Calendar, Filter, ShieldCheck, ArrowRight, Check, Activity,
    SlidersHorizontal, Layers, ExternalLink, Sparkles, Box, Share2,
    MoreVertical, FileCheck, Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useFY, formatFYRange } from '@/contexts/FYContext';
import { supabase, pendingTransactionApi } from '@/lib/insforge';
import { shareVoucherOnWhatsApp } from '@/lib/whatsappInvoice';
import './LiveKeepingsDashboard.css';

function formatCurrency(amount: number) {
    return '₹' + new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
    }).format(Math.round(Math.abs(amount) || 0));
}

function formatCompact(amount: number) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)} K`;
    return formatCurrency(amount);
}

const QUICK_ACCESS_ITEMS = [
    { icon: <FileText size={18} />, label: 'Create Invoice', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', path: '/create-invoice', badge: 'NEW' },
    { icon: <Package size={18} />, label: 'Record Purchase', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', path: '/create-voucher' },
    { icon: <Clock size={18} />, label: 'Day Book', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', path: '/day-book' },
    { icon: <Landmark size={18} />, label: 'Party Ledgers', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', path: '/ledgers' },
    { icon: <BarChart3 size={18} />, label: 'Profit & Loss', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', path: '/profit-loss' },
    { icon: <Receipt size={18} />, label: 'GST Reports', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', path: '/gst-reports' },
    { icon: <Box size={18} />, label: 'Stock Items', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', path: '/stock' },
    { icon: <RefreshCw size={18} />, label: 'Sync Status', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', path: '/sync-history' },
];

function shareOnWhatsApp(phone: string, message: string) {
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encoded}`, '_blank');
}

function generateInvoiceMessage(v: any) {
    const amt = formatCurrency(Number(v.grand_total) || Number(v.total_amount) || 0);
    return `📄 *Invoice #${v.voucher_number || 'NA'}*\n👤 ${v.party_name || 'Customer'}\n💰 Amount: ${amt}\n📅 Date: ${v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : 'Recent'}\n📝 Type: ${v.voucher_type}`;
}

export default memo(function LiveKeepingsDashboard() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const { selectedFY, setSelectedFY, fyDates, stepFY } = useFY();

    // Desktop Tabs & Filters
    const [activeTab, setActiveTab] = useState<'overview' | 'vouchers' | 'customers' | 'stock' | 'cashflow'>('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [voucherTypeFilter, setVoucherTypeFilter] = useState('All');
    const [recentVoucherFilter, setRecentVoucherFilter] = useState('All');
    const { isDark } = useTheme();
    const [dismissedSyncWarning, setDismissedSyncWarning] = useState<string | null>(null);
    const { data: lastSuccessfulSync } = useQuery({
        queryKey: ['dashboard-last-successful-sync', selectedCompany?.id],
        enabled: Boolean(selectedCompany?.id),
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const { data, error } = await supabase.from('sync_history')
                .select('completed_at').eq('company_id', selectedCompany.id)
                .in('status', ['completed', 'success', 'successful'])
                .not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1);
            if (error) throw error;
            return data?.[0]?.completed_at || null;
        },
    });
    const syncDate = lastSuccessfulSync ? new Date(lastSuccessfulSync) : null;
    const syncAgeDays = syncDate && !Number.isNaN(syncDate.getTime())
        ? Math.floor((Date.now() - syncDate.getTime()) / 86_400_000) : null;
    const warningKey = `${selectedCompany?.id}:${lastSuccessfulSync}`;

    // Mobile Voucher Segment Filter
    const [mobileVoucherFilter, setMobileVoucherFilter] = useState<'all' | 'customers' | 'suppliers'>('all');

    // Pending Tally count
    const [pendingCount, setPendingCount] = useState(0);
    useEffect(() => {
        if (!selectedCompany?.id) { setPendingCount(0); return; }
        let cancelled = false;
        pendingTransactionApi.getPendingCount(selectedCompany.id).then(({ count }: any) => {
            if (!cancelled) setPendingCount(count || 0);
        });
        return () => { cancelled = true; };
    }, [selectedCompany?.id]);

    // React Query — dashboard data
    const { data: dashboard, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-fy-v4', selectedCompany?.id, selectedFY],
        queryFn: async () => {
            if (!selectedCompany?.id) return null;
            const today = format(new Date(), 'yyyy-MM-dd');

            async function fetchAllVouchers(type: string | null, select: string) {
                const rows: any[] = [];
                for (let fromIndex = 0; rows.length < 50000; fromIndex += 1000) {
                    let query = supabase.from('vouchers').select(select)
                        .eq('company_id', selectedCompany.id).eq('is_deleted', false)
                        .gte('voucher_date', fyDates.from).lte('voucher_date', fyDates.to);
                    if (type) query = query.eq('voucher_type', type);
                    const { data, error } = await query.order('voucher_date', { ascending: false })
                        .order('id', { ascending: false }).range(fromIndex, fromIndex + 999);
                    if (error) throw error;
                    const batch = data || [];
                    rows.push(...batch);
                    if (batch.length < 1000) break;
                }
                return rows;
            }

            async function fetchLedgers() {
                const rows: any[] = [];
                for (let offset = 0; ; offset += 1000) {
                    const { data, error } = await supabase.from('ledgers')
                        .select('id, name, current_balance, parent, parent_group, closing_balance, phone')
                        .eq('company_id', selectedCompany.id).order('id', { ascending: true }).range(offset, offset + 999);
                    if (error) throw error;
                    const batch = data || [];
                    rows.push(...batch);
                    if (batch.length < 1000) return rows;
                }
            }

            const [salesRes, purchasesRes, receiptsRes, paymentsRes, ledgersRes, recentRes, stockRes] = await Promise.all([
                fetchAllVouchers('Sales', 'grand_total, total_amount, voucher_date, party_name, id').then(data => ({ data })),
                fetchAllVouchers('Purchase', 'grand_total, total_amount, voucher_date, party_name, id').then(data => ({ data })),
                fetchAllVouchers('Receipt', 'grand_total, total_amount, voucher_date, party_name, id').then(data => ({ data })),
                fetchAllVouchers('Payment', 'grand_total, total_amount, voucher_date, party_name, id').then(data => ({ data })),
                fetchLedgers().then(data => ({ data })),
                fetchAllVouchers(null, 'id, voucher_type, voucher_number, party_name, grand_total, total_amount, voucher_date').then(data => ({ data })),
                supabase.from('stock_items').select('id, name, current_stock, opening_stock, stock_group, rate')
                    .eq('company_id', selectedCompany.id),
            ]);

            const sales = salesRes.data || [];
            const purchases = (recentRes.data || []).filter((v: any) => ['purchase', 'purchase invoice', 'purchase voucher'].includes(String(v.voucher_type || '').trim().toLowerCase()));
            const debitNotes = (recentRes.data || []).filter((v: any) => ['debit note', 'debit note voucher'].includes(String(v.voucher_type || '').trim().toLowerCase()));
            const creditNotes = (recentRes.data || []).filter((v: any) => ['credit note', 'credit note voucher'].includes(String(v.voucher_type || '').trim().toLowerCase()));
            const sumAmounts = (rows: any[]) => rows.reduce((sum, v) => sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const receipts = receiptsRes.data || [];
            const payments = paymentsRes.data || [];
            const ledgers = ledgersRes.data || [];
            const stockItems = stockRes.data || [];

            const totalSales = sales.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalPurchases = purchases.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalReceipts = receipts.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const totalPayments = payments.reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
            const todaySales = sales.filter(v => v.voucher_date === today).reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);

            const debtors = ledgers.filter(l => String(l.parent || l.parent_group || '').trim().toLowerCase() === 'sundry debtors');
            const creditors = ledgers.filter(l => String(l.parent || l.parent_group || '').trim().toLowerCase() === 'sundry creditors');
            const receivables = debtors.reduce((s, d) => s + Math.abs(Number(d.current_balance) || 0), 0);
            const payables = creditors.reduce((s, c) => s + Math.abs(Number(c.current_balance) || 0), 0);

            const overdueParties = debtors.filter(d => (Number(d.current_balance) || 0) > 0)
                .sort((a, b) => Number(b.current_balance) - Number(a.current_balance));

            const lowStock = stockItems.filter(s => {
                const stock = Number(s.current_stock) || Number(s.opening_stock) || 0;
                return stock <= 5 && stock > 0;
            });

            // Deriving recent customers from recent transactions & ledger directory
            const ledgerMap = new Map(ledgers.map((l: any) => [(l.name || '').trim().toLowerCase(), l]));
            const seenCustomers = new Set();
            const recentCustomers: any[] = [];
            for (const v of [...sales, ...(recentRes.data || [])]) {
                const pName = (v.party_name || '').trim();
                if (!pName || pName.toLowerCase() === 'cash' || seenCustomers.has(pName.toLowerCase())) continue;
                seenCustomers.add(pName.toLowerCase());
                const matchedLedger = ledgerMap.get(pName.toLowerCase());
                recentCustomers.push({
                    id: matchedLedger?.id || null,
                    name: pName,
                    lastDate: v.voucher_date,
                    lastAmount: Number(v.grand_total) || Number(v.total_amount) || 0,
                    balance: Number(matchedLedger?.current_balance ?? matchedLedger?.closing_balance) || 0,
                    parent: matchedLedger?.parent || 'Sundry Debtors',
                    phone: matchedLedger?.phone || ''
                });
                if (recentCustomers.length >= 12) break;
            }

            // Rank parties by sales or purchase value within the selected financial year.
            const rankParties = (vouchers: any[]) => {
                const totals = new Map<string, any>();
                for (const voucher of vouchers) {
                    const name = String(voucher.party_name || '').trim();
                    if (!name || name.toLowerCase() === 'cash') continue;
                    const key = name.toLowerCase();
                    const party = totals.get(key) || { name, total: 0, count: 0, id: ledgerMap.get(key)?.id };
                    party.total += Math.abs(Number(voucher.grand_total) || Number(voucher.total_amount) || 0);
                    party.count++;
                    totals.set(key, party);
                }
                return [...totals.values()].sort ( (a, b) => b.total - a.total );
            };
            const topCustomers = rankParties(sales);
            const fyVouchers = recentRes.data || [];
            const supplierPurchases = fyVouchers.filter((v: any) =>
                ['purchase', 'purchase invoice', 'purchase voucher'].includes(String(v.voucher_type || '').trim().toLowerCase())
            );
            const purchasedSuppliers = rankParties(supplierPurchases).map(p => ({ ...p, basis: 'purchases' }));
            const purchasedNames = new Set(purchasedSuppliers.map(p => p.name.toLowerCase()));
            const creditorNames = new Set(creditors.map(l => String(l.name || '').trim().toLowerCase()));
            // If a supplier has payments but no purchase voucher, show those payments separately.
            // Never add payments to purchase turnover, which would count the same trade twice.
            const supplierPayments = fyVouchers.filter((v: any) =>
                String(v.voucher_type || '').trim().toLowerCase() === 'payment'
                && creditorNames.has(String(v.party_name || '').trim().toLowerCase())
                && !purchasedNames.has(String(v.party_name || '').trim().toLowerCase())
            );
            const paidSuppliers = rankParties(supplierPayments).map(p => ({ ...p, basis: 'payments' }));
            const topSuppliers = [...purchasedSuppliers, ...paidSuppliers].sort((a, b) => b.total - a.total);

            // Deriving recently active / sold stock items
            const soldRecently = stockItems.slice(0, 15).map((s: any) => ({
                id: s.id,
                name: s.name,
                group: s.stock_group || 'General',
                stock: Number(s.current_stock) || Number(s.opening_stock) || 0,
                price: Number(s.rate || 0)
            }));

            return {
                totalSales, totalPurchases, totalReceipts, totalPayments,
                receivables, payables, todaySales, debitNoteTotal: sumAmounts(debitNotes), creditNoteTotal: sumAmounts(creditNotes), debitNoteCount: debitNotes.length, creditNoteCount: creditNotes.length,
                salesCount: sales.length, purchaseCount: purchases.length,
                receiptsCount: receipts.length, paymentsCount: payments.length,
                recentVouchers: recentRes.data || [],
                recentCustomers, topCustomers, topSuppliers, debtorCount: debtors.length, creditorCount: creditors.length,
                soldRecently,
                topDebtors: overdueParties.slice(0, 5),
                lowStock: lowStock.slice(0, 5),
            };
        },
        enabled: !!selectedCompany?.id,
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Filtered lists for Desktop
    // Recent Vouchers card filter (overview tab)
    const recentFiltered = useMemo(() =>
        (dashboard?.recentVouchers || [])
            .filter((v: any) => recentVoucherFilter === 'All' || v.voucher_type === recentVoucherFilter)
            .slice(0, 6),
    [dashboard?.recentVouchers, recentVoucherFilter]);

    const filteredVouchers = useMemo(() => {
        const list = dashboard?.recentVouchers || [];
        return list.filter((v: any) => {
            const matchesSearch = !searchQuery ||
                v.party_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                v.voucher_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                v.voucher_type?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType = voucherTypeFilter === 'All' || v.voucher_type === voucherTypeFilter;
            return matchesSearch && matchesType;
        });
    }, [dashboard?.recentVouchers, searchQuery, voucherTypeFilter]);

    const filteredCustomers = useMemo(() => {
        const list = dashboard?.recentCustomers || [];
        return list.filter((c: any) =>
            !searchQuery ||
            c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.parent?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [dashboard?.recentCustomers, searchQuery]);

    const filteredStock = useMemo(() => {
        const list = dashboard?.soldRecently || [];
        return list.filter((s: any) =>
            !searchQuery ||
            s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.group?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [dashboard?.soldRecently, searchQuery]);

    // Filtered Vouchers for Mobile
    const mobileVouchersList = useMemo(() => {
        const list = dashboard?.recentVouchers || [];
        if (mobileVoucherFilter === 'customers') {
            return list.filter((v: any) => ['Sales', 'Sales Invoice', 'Receipt'].includes(v.voucher_type));
        }
        if (mobileVoucherFilter === 'suppliers') {
            return list.filter((v: any) => ['Purchase', 'Purchase Invoice', 'Payment'].includes(v.voucher_type));
        }
        return list;
    }, [dashboard?.recentVouchers, mobileVoucherFilter]);

    const companyInitials = (selectedCompany?.name || 'A').slice(0, 2).toUpperCase();

    return (
        <div className={`dashboard-app ${isDark ? 'dashboard-dark' : 'dashboard-light'} text-slate-100 max-w-7xl mx-auto`}>
            {syncAgeDays !== null && syncAgeDays >= 3 && dismissedSyncWarning !== warningKey && (
                <div className="dashboard-sync-warning" role="status">
                    <AlertTriangle size={19} aria-hidden="true" />
                    <span className="dashboard-sync-warning-text">Sync pending since {syncAgeDays} {syncAgeDays === 1 ? 'day' : 'days'}</span>
                    <button type="button" className="dashboard-sync-help" onClick={() => navigate('/sync-help')}>GET HELP</button>
                    <button type="button" className="dashboard-sync-dismiss" aria-label="Dismiss sync warning" onClick={() => setDismissedSyncWarning(warningKey)}><X size={16} /></button>
                </div>
            )}
            {/* ======================================================== */}
            {/* 📱 MOBILE VIEW (Exact layout as user reference image)   */}
            {/* ======================================================== */}
            <div className="block md:hidden space-y-4 pb-24 px-1 pt-2">
                {/* 1. FINANCIAL SUMMARY (2x3 Grid = 6 Cards) */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-300">Financial Summary</span>
                        <button
                            onClick={() => navigate('/profit-loss')}
                            className="text-[11px] font-bold text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                            Detailed Analytics <ChevronRight size={12} />
                        </button>
                    </div>

                    <div className="dashboard-metrics grid grid-cols-2 gap-2.5">
                        {/* 1. TOTAL SALES */}
                        <div
                            onClick={() => navigate('/sales')}
                            className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Sales</span>
                                <TrendingUp size={14} className="text-emerald-400" />
                            </div>
                            <p className="text-lg font-black text-white">{formatCompact(dashboard?.totalSales || 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">📈 {dashboard?.salesCount || 0} Invoices</p>
                        </div>

                        {/* 2. RECEIVABLES */}
                        <div
                            onClick={() => navigate('/aging-report')}
                            className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Receivables</span>
                                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-md">
                                    {dashboard?.debtorCount || 0} Debtors
                                </span>
                            </div>
                            <p className="text-lg font-black text-amber-400">{formatCurrency(dashboard?.receivables || 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Current ledger balance</p>
                        </div>

                        {/* 3. TOTAL PURCHASE */}
                        <div
                            onClick={() => navigate('/purchases')}
                            className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Purchase</span>
                                <span className="text-xs">🚚</span>
                            </div>
                            <p className="text-lg font-black text-white">{formatCompact(dashboard?.totalPurchases || 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{dashboard?.purchaseCount || 0} Purchase Bills</p>
                        </div>

                        {/* 4. PAYABLES */}
                        <div
                            onClick={() => navigate('/ledgers')}
                            className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Payables</span>
                                <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/15 px-1.5 py-0.5 rounded-md">
                                    {dashboard?.creditorCount || 0} Creditors
                                </span>
                            </div>
                            <p className="text-lg font-black text-cyan-400">{formatCompact(dashboard?.payables || 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Current ledger balance</p>
                        </div>

                        <button onClick={() => navigate('/vouchers', { state: { type: 'Debit Note' } })} className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] text-left active:scale-[0.98] transition-transform">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Debit Note</span>
                            <p className="text-lg font-black text-white">{formatCompact(dashboard?.debitNoteTotal || 0)}</p>
                            <p className="text-[10px] text-slate-400">{dashboard?.debitNoteCount || 0} notes in FY</p>
                        </button>
                        <button onClick={() => navigate('/vouchers', { state: { type: 'Credit Note' } })} className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] text-left active:scale-[0.98] transition-transform">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Credit Note</span>
                            <p className="text-lg font-black text-white">{formatCompact(dashboard?.creditNoteTotal || 0)}</p>
                            <p className="text-[10px] text-slate-400">{dashboard?.creditNoteCount || 0} notes in FY</p>
                        </button>

                        {/* 5. RECEIPTS (IN) */}
                        <div
                            onClick={() => navigate('/vouchers', { state: { type: 'Receipt' } })}
                            className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Receipts (IN)</span>
                            </div>
                            <p className="text-lg font-black text-emerald-400">{formatCompact(dashboard?.totalReceipts || 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Collections & Inflow</p>
                        </div>

                        {/* 6. PAYMENTS (OUT) */}
                        <div
                            onClick={() => navigate('/vouchers', { state: { type: 'Payment' } })}
                            className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Payments (OUT)</span>
                            </div>
                            <p className="text-lg font-black text-white">{formatCompact(dashboard?.totalPayments || 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">RTGS / NEFT / Cheque</p>
                        </div>
                    </div>
                </div>

                {/* 3. QUICK OPERATIONS (HORIZONTALLY SLIDING/SWIPING CAROUSEL) */}
                <div className="quick-operations-section space-y-2">
                    <div className="quick-operations-heading flex items-center justify-between px-1">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-300"><span className="quick-operations-heading-icon"><Zap size={16} fill="currentColor" /></span>Quick Operations</span>
                        <span className="text-[10px] font-bold text-slate-500">Shortcuts • Slide →</span>
                    </div>

                    {/* Sliding container with smooth swipe */}
                    <div className="quick-operations flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory -mx-2 px-2 touch-pan-x">
                        {/* 1. Create Invoice (Glow highlight) */}
                        <button
                            onClick={() => navigate('/create-invoice')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border-2 border-cyan-400/60 shadow-lg shadow-cyan-500/10 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-cyan-400 text-slate-950 flex items-center justify-center font-black">
                                <Plus size={20} strokeWidth={3} />
                            </div>
                            <span className="text-[11px] font-black text-cyan-300 leading-tight">Create Invoice</span>
                        </button>

                        {/* 2. Day Book */}
                        <button
                            onClick={() => navigate('/day-book')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                                <Clock size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">Day Book</span>
                        </button>

                        {/* 3. Party Ledger */}
                        <button
                            onClick={() => navigate('/ledgers')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                                <Landmark size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">Party Ledger</span>
                        </button>

                        {/* 4. GST GSTR-1/3B */}
                        <button
                            onClick={() => navigate('/gst-reports')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                                <Receipt size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">GST GSTR-1/3B</span>
                        </button>

                        {/* 5. Record Purchase */}
                        <button
                            onClick={() => navigate('/create-voucher')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                                <Package size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">Record Purchase</span>
                        </button>

                        {/* 6. Stock Items */}
                        <button
                            onClick={() => navigate('/stock')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                                <Box size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">Stock Inventory</span>
                        </button>

                        {/* 7. Profit & Loss */}
                        <button
                            onClick={() => navigate('/profit-loss')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                                <BarChart3 size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">P&L Report</span>
                        </button>

                        {/* 8. Sync Status */}
                        <button
                            onClick={() => navigate('/sync-history')}
                            className="shrink-0 snap-start w-24 p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                                <RefreshCw size={18} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 leading-tight">Sync Status</span>
                        </button>
                    </div>
                </div>

                {/* 4. LATEST VOUCHERS LIST WITH SEGMENTED TABS */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <div>
                            <h3 className="text-sm font-black text-white tracking-tight">Latest Vouchers</h3>
                            <p className="text-[10px] text-slate-400 mt-0.2">
                                {(dashboard?.recentVouchers || []).length} synced transactions
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/vouchers')}
                            className="text-xs font-bold text-cyan-400 hover:underline cursor-pointer"
                        >
                            View All
                        </button>
                    </div>

                    {/* Segmented Filter Pills */}
                    <div className="flex items-center gap-1.5 bg-[#0B1118] p-1 rounded-xl border border-[#1E2B38]">
                        <button
                            onClick={() => setMobileVoucherFilter('all')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mobileVoucherFilter === 'all'
                                    ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            All Vouchers
                        </button>
                        <button
                            onClick={() => setMobileVoucherFilter('customers')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mobileVoucherFilter === 'customers'
                                    ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Customers
                        </button>
                        <button
                            onClick={() => setMobileVoucherFilter('suppliers')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mobileVoucherFilter === 'suppliers'
                                    ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Suppliers
                        </button>
                    </div>

                    {/* Vouchers Stack Cards */}
                    <div className={mobileVoucherFilter === 'all' && mobileVouchersList.length ? 'dashboard-voucher-list' : 'space-y-2.5'}>
                        {mobileVoucherFilter !== 'all' ? (
                            (mobileVoucherFilter === 'customers' ? dashboard?.topCustomers : dashboard?.topSuppliers)?.length ?
                            (mobileVoucherFilter === 'customers' ? dashboard?.topCustomers : dashboard?.topSuppliers).slice(0, 10).map((party: any, index: number) => (
                                <button key={party.name} onClick={() => party.id && navigate(`/ledgers/${party.id}`)} className="w-full p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] flex items-center gap-3 text-left">
                                    <span className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">{index + 1}</span>
                                    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white truncate">{party.name}</span><span className="text-[10px] text-slate-400">{party.count} {mobileVoucherFilter === 'customers' ? 'sales' : party.basis} · {formatFYRange(selectedFY)}</span></span>
                                    <span className="text-sm font-black text-white">{formatCurrency(party.total)}</span>
                                </button>
                            )) : <div className="p-8 text-center text-xs text-slate-500 border border-[#1E2B38] rounded-2xl bg-[#121B24]">{mobileVoucherFilter === 'suppliers' ? 'No supplier purchases or payments found for this financial year.' : 'No customer sales found for this financial year.'}</div>
                        ) : mobileVouchersList.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-500 border border-[#1E2B38] rounded-2xl bg-[#121B24]">
                                No transactions found for this filter.
                            </div>
                        ) : (
                            mobileVouchersList.slice(0, 10).map((v: any) => {
                                const amt = Number(v.grand_total) || Number(v.total_amount) || 0;
                                const isSale = v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice';
                                const isReceipt = v.voucher_type === 'Receipt';
                                const isPurchase = v.voucher_type === 'Purchase' || v.voucher_type === 'Purchase Invoice';
                                const isPayment = v.voucher_type === 'Payment';

                                return (
                                    <div
                                        key={v.id}
                                        className="dashboard-voucher-row"
                                    >
                                        {/* Card Top: Party + Amount */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <h4 className="text-xs font-black text-white truncate">{v.party_name || 'CASH'}</h4>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                                        isSale ? 'bg-cyan-500/20 text-cyan-300' :
                                                        isReceipt ? 'bg-emerald-500/20 text-emerald-300' :
                                                        isPurchase ? 'bg-purple-500/20 text-purple-300' :
                                                        'bg-amber-500/20 text-amber-300'
                                                    }`}>
                                                        {v.voucher_type}
                                                    </span>
                                                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-[#1A2634] text-slate-400">
                                                        {isSale || isPayment ? 'Dr' : 'Cr'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    #{v.voucher_number || '---'} • {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : 'Recent'}
                                                </p>
                                            </div>

                                            <div className="dashboard-voucher-right text-right shrink-0">
                                                <p className={`text-xs font-black font-mono ${
                                                    isReceipt ? 'text-emerald-400' : isSale ? 'text-emerald-300' : isPurchase ? 'text-white' : 'text-amber-400'
                                                }`}>
                                                    {isReceipt ? '+' : ''}{formatCurrency(amt)}
                                                </p>
                                                <div className="dashboard-voucher-actions">
                                                    <button type="button" aria-label={`Share voucher ${v.voucher_number || ''}`} title="Share" onClick={() => shareVoucherOnWhatsApp(v, selectedCompany)}><MessageCircle size={15} /></button>
                                                    <button type="button" aria-label={`View PDF for voucher ${v.voucher_number || ''}`} title="View PDF" onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/dashboard' } })}><FileText size={15} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ======================================================== */}
            {/* 🖥️ DESKTOP / PC VIEW (Executive Dashboard System)        */}
            {/* ======================================================== */}
            <div className="hidden md:block space-y-4 pb-20">
                <HeaderPortal type="title"><h1 className="dashboard-desktop-title" title={selectedCompany?.name || 'Company'}>{selectedCompany?.name || 'Company'} <span>Dashboard</span></h1></HeaderPortal>
                <HeaderPortal type="filters"><div className="dashboard-desktop-controls"><div className="dashboard-desktop-fy" aria-label="Financial year"><button onClick={() => stepFY(-1)} aria-label="Previous financial year">‹</button><span>{formatFYRange(selectedFY)}</span><button onClick={() => stepFY(1)} aria-label="Next financial year">›</button></div>{pendingCount > 0 ? <button className="dashboard-desktop-refresh" onClick={() => navigate('/tally-sync')}><AlertTriangle size={14}/><span>{pendingCount} Pending Sync</span></button> : <button className="dashboard-desktop-refresh" onClick={() => refetch()} aria-label="Refresh dashboard"><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''}/><span>Refresh</span></button>}</div></HeaderPortal>

                {/* 2. TOP 4 EXECUTIVE KPI METRIC CARDS */}
                <div className="dashboard-metrics grid grid-cols-3 gap-2">
                    {/* Total Sales */}
                    <div
                        onClick={() => navigate('/sales')}
                        className="p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-emerald-500/50 transition-all cursor-pointer group shadow-xs"
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider">Total Sales</span>
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <TrendingUp size={16} />
                            </div>
                        </div>
                        <p className="text-xl font-black text-white tracking-tight">
                            {formatCompact(dashboard?.totalSales || 0)}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                            <span>{dashboard?.salesCount || 0} sales bills in FY</span>
                            {dashboard?.todaySales > 0 && (
                                <span className="text-emerald-400 font-bold">Today: {formatCompact(dashboard.todaySales)}</span>
                            )}
                        </div>
                    </div>

                    {/* Total Purchases */}
                    <div
                        onClick={() => navigate('/purchases')}
                        className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-blue-500/50 transition-all cursor-pointer group shadow-xs"
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider">Total Purchases</span>
                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Package size={16} />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-white tracking-tight">
                            {formatCompact(dashboard?.totalPurchases || 0)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 truncate">
                            {dashboard?.purchaseCount || 0} purchase inward bills
                        </p>
                    </div>

                    {/* Receivables */}
                    <div
                        onClick={() => navigate('/aging-report')}
                        className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-amber-500/50 transition-all cursor-pointer group shadow-xs"
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider">Receivables (To Collect)</span>
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Clock size={16} />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-amber-400 tracking-tight">
                            {formatCompact(dashboard?.receivables || 0)}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                            <span>Outstanding from debtors</span>
                            <span className="text-amber-400 text-[10px] font-bold">Aging →</span>
                        </div>
                    </div>

                    {/* Payables */}
                    <div
                        onClick={() => navigate('/ledgers')}
                        className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-rose-500/50 transition-all cursor-pointer group shadow-xs"
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider">Payables (To Pay)</span>
                            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Wallet size={16} />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-rose-400 tracking-tight">
                            {formatCompact(dashboard?.payables || 0)}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                            <span>Due to sundry suppliers</span>
                            <span className="text-rose-400 text-[10px] font-bold">Ledgers →</span>
                        </div>
                    </div>
                    <button onClick={() => navigate('/vouchers', { state: { type: 'Debit Note' } })} className="p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] text-left"><span className="text-[10px] font-bold uppercase text-slate-400">Debit Note</span><p className="text-lg font-black text-white">{formatCompact(dashboard?.debitNoteTotal || 0)}</p><span className="text-xs text-slate-400">{dashboard?.debitNoteCount || 0} notes in FY</span></button>
                    <button onClick={() => navigate('/vouchers', { state: { type: 'Credit Note' } })} className="p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] text-left"><span className="text-[10px] font-bold uppercase text-slate-400">Credit Note</span><p className="text-lg font-black text-white">{formatCompact(dashboard?.creditNoteTotal || 0)}</p><span className="text-xs text-slate-400">{dashboard?.creditNoteCount || 0} notes in FY</span></button>
                </div>
                {/* 3. NAVIGATION PILL TABS BAR */}
                <div className="flex items-center justify-between border-b border-[#1E2B38] pb-2 overflow-x-auto gap-2">
                    <div className="flex gap-1.5 shrink-0">
                        {[
                            { key: 'overview', label: 'Executive Overview', icon: <Layers size={13} /> },
                            { key: 'vouchers', label: 'Latest Vouchers', icon: <FileText size={13} />, count: (dashboard?.recentVouchers || []).length },
                            { key: 'customers', label: 'Recent Customers', icon: <Users size={13} />, count: (dashboard?.recentCustomers || []).length },
                            { key: 'stock', label: 'Inventory Stock', icon: <Package size={13} />, count: (dashboard?.soldRecently || []).length },
                            { key: 'cashflow', label: 'Cash & Bank Flow', icon: <Landmark size={13} /> },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                    activeTab === tab.key
                                        ? 'bg-[#00E599] text-[#0A1017] shadow-sm font-black'
                                        : 'bg-[#121B24] border border-[#1E2B38] text-slate-300 hover:text-white hover:bg-[#182330]'
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                                {tab.count !== undefined && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                                        activeTab === tab.key ? 'bg-black/20 text-black' : 'bg-[#1E2B38] text-slate-400'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        <span>Real-time Tally Data</span>
                    </div>
                </div>

                {/* 4. EXECUTIVE OVERVIEW (Desktop) */}
                {activeTab === 'overview' && (
                    <div className="space-y-4">
                        {/* Quick Access Shortcuts Grid */}
                        <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-[#00E599]" /> Quick Access & Modules
                                </span>
                                <span className="text-[11px] text-slate-500">Instant Navigation</span>
                            </div>
                            <div className="grid grid-cols-8 gap-2">
                                {QUICK_ACCESS_ITEMS.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => navigate(item.path)}
                                        className="p-3 rounded-xl bg-[#0B1118] border border-[#1A2634] hover:border-[#00E599]/40 hover:bg-[#14202B] flex flex-col items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer group"
                                    >
                                        <div className={`p-2 rounded-lg border ${item.color} group-hover:scale-110 transition-transform`}>
                                            {item.icon}
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-300 group-hover:text-white text-center leading-tight">
                                            {item.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2-Column Split */}
                        <div className="grid grid-cols-3 gap-4">
                            {/* LEFT COLUMN: Cash Pulse & Recent Vouchers */}
                            <div className="col-span-2 space-y-4">
                                <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                            <Landmark size={14} className="text-cyan-400" /> Cash Flow & Operating Liquidity
                                        </span>
                                        <button onClick={() => setActiveTab('cashflow')} className="text-xs font-bold text-[#00E599] hover:underline">
                                            View Details →
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2.5">
                                        <div className="p-3 rounded-xl bg-[#0B1118] border border-[#1A2634]">
                                            <span className="text-[10px] font-bold uppercase text-slate-400">Total Inflow (Receipts)</span>
                                            <p className="text-lg font-black text-emerald-400 mt-1">
                                                {formatCompact(dashboard?.totalReceipts || 0)}
                                            </p>
                                            <span className="text-[10px] text-slate-500">{dashboard?.receiptsCount || 0} collections</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-[#0B1118] border border-[#1A2634]">
                                            <span className="text-[10px] font-bold uppercase text-slate-400">Total Outflow (Payments)</span>
                                            <p className="text-lg font-black text-amber-400 mt-1">
                                                {formatCompact(dashboard?.totalPayments || 0)}
                                            </p>
                                            <span className="text-[10px] text-slate-500">{dashboard?.paymentsCount || 0} expenses paid</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-[#0B1118] border border-[#1A2634]">
                                            <span className="text-[10px] font-bold uppercase text-slate-400">Net Operating Flow</span>
                                            <p className={`text-lg font-black mt-1 ${
                                                (dashboard?.totalReceipts || 0) >= (dashboard?.totalPayments || 0)
                                                    ? 'text-emerald-400'
                                                    : 'text-rose-400'
                                            }`}>
                                                {formatCompact((dashboard?.totalReceipts || 0) - (dashboard?.totalPayments || 0))}
                                            </p>
                                            <span className="text-[10px] text-slate-500">Inflow - Outflow</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Vouchers Table */}
                                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#121B24] border-[#1E2B38]' : 'bg-white border-slate-200 shadow-sm'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                            <FileText size={14} className="text-blue-400" /> Recent Vouchers
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={recentVoucherFilter}
                                                onChange={e => setRecentVoucherFilter(e.target.value)}
                                                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold focus:outline-none cursor-pointer ${isDark ? 'bg-[#0B1118] border-[#1E2B38] text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                                            >
                                                <option value="All">All Types</option>
                                                <option value="Sales">Sales Only</option>
                                                <option value="Purchase">Purchase Only</option>
                                                <option value="Receipt">Receipt Only</option>
                                                <option value="Payment">Payment Only</option>
                                            </select>
                                            <button onClick={() => setActiveTab('vouchers')} className="text-xs font-bold text-[#00E599] hover:underline">
                                                View All ({filteredVouchers.length}) →
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {recentFiltered.length === 0 && (
                                            <p className={`text-center py-4 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                No {recentVoucherFilter !== 'All' ? recentVoucherFilter + ' ' : ''}vouchers in this period
                                            </p>
                                        )}
                                        {recentFiltered.map((v: any) => {
                                            const amt = Number(v.grand_total) || Number(v.total_amount) || 0;
                                            const isSale = v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice';
                                            return (
                                                <div
                                                    key={v.id}
                                                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${isDark ? 'bg-[#0B1118] border-[#1A2634] hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                                                >
                                                    <div
                                                        onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/dashboard' } })}
                                                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                                            isSale ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        }`}>
                                                            {isSale ? 'INV' : 'REC'}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className={`text-xs font-black truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{v.party_name || 'CASH'}</p>
                                                            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                #{v.voucher_number || '---'} • {v.voucher_type} • {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : 'Recent'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`text-xs font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(amt)}</span>
                                                        {isSale && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    shareVoucherOnWhatsApp(v, selectedCompany);
                                                                }}
                                                                className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                                                                title="WhatsApp"
                                                            >
                                                                <MessageCircle size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: Overdue Receivables & Low Stock */}
                            <div className="space-y-4">
                                <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                            <AlertTriangle size={14} /> Highest Receivables
                                        </span>
                                        <button onClick={() => navigate('/aging-report')} className="text-[11px] font-bold text-slate-400 hover:text-white">
                                            Aging →
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {(dashboard?.topDebtors || []).length === 0 ? (
                                            <p className="text-xs text-slate-500 text-center py-4">No overdue debtors</p>
                                        ) : (
                                            (dashboard?.topDebtors || []).map((d: any, idx: number) => (
                                                <div
                                                    key={d.id || idx}
                                                    onClick={() => navigate(`/ledgers/${d.id || encodeURIComponent(d.name)}`)}
                                                    className="p-2.5 rounded-xl bg-[#0B1118] border border-[#1A2634] hover:border-amber-500/40 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-white truncate">{d.name}</p>
                                                        <p className="text-[10px] text-slate-400">Sundry Debtors</p>
                                                    </div>
                                                    <span className="text-xs font-black font-mono text-amber-400 whitespace-nowrap">
                                                        {formatCurrency(d.current_balance)}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                            <Box size={14} /> Low Stock Watchlist
                                        </span>
                                        <button onClick={() => navigate('/stock')} className="text-[11px] font-bold text-slate-400 hover:text-white">
                                            Inventory →
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {(dashboard?.lowStock || []).length === 0 ? (
                                            <p className="text-xs text-slate-500 text-center py-4">Stock levels are healthy</p>
                                        ) : (
                                            (dashboard?.lowStock || []).map((s: any) => (
                                                <div
                                                    key={s.id}
                                                    onClick={() => navigate(`/stock/${s.id}`)}
                                                    className="p-2.5 rounded-xl bg-[#0B1118] border border-[#1A2634] hover:border-cyan-500/40 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-white truncate">{s.name}</p>
                                                        <p className="text-[10px] text-slate-400">{s.stock_group || 'Item'}</p>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold font-mono">
                                                        {s.current_stock || s.opening_stock} left
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. VOUCHERS TABLE (Desktop) */}
                {activeTab === 'vouchers' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 w-full">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search vouchers by party name, voucher # or type..."
                                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00E599]"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <Filter size={13} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400">Type:</span>
                                <select
                                    value={voucherTypeFilter}
                                    onChange={e => setVoucherTypeFilter(e.target.value)}
                                    className="px-3 py-2 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xs font-bold text-white focus:outline-none cursor-pointer"
                                >
                                    <option value="All">All Types</option>
                                    <option value="Sales">Sales Only</option>
                                    <option value="Purchase">Purchase Only</option>
                                    <option value="Receipt">Receipt Only</option>
                                    <option value="Payment">Payment Only</option>
                                </select>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-[#1E2B38] bg-[#121B24] overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[#0B1118] border-b border-[#1E2B38] text-slate-400">
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Party / Customer</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Voucher #</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Type</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Date</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Amount</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#182330]">
                                        {filteredVouchers.map(v => {
                                            const amt = Number(v.grand_total) || Number(v.total_amount) || 0;
                                            const isSale = v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice';
                                            return (
                                                <tr key={v.id} className="hover:bg-[#182330] transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                                                isSale ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                                                            }`}>
                                                                {v.party_name?.[0] || 'C'}
                                                            </div>
                                                            <p className="font-bold text-white text-xs">{v.party_name || 'CASH'}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                                                        #{v.voucher_number || '---'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                            isSale ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        }`}>
                                                            {v.voucher_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                                                        {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : '---'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black font-mono text-white text-xs">
                                                        {formatCurrency(amt)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/dashboard' } })}
                                                                className="px-2.5 py-1 rounded-lg bg-[#1A2634] hover:bg-[#223347] text-slate-300 text-[11px] font-bold transition-colors cursor-pointer"
                                                            >
                                                                Open Invoice
                                                            </button>
                                                            {isSale && (
                                                                <button
                                                                    onClick={() => shareVoucherOnWhatsApp(v, selectedCompany)}
                                                                    className="p-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                                                                    title="WhatsApp"
                                                                >
                                                                    <MessageCircle size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 6. RECENT CUSTOMERS (Desktop) */}
                {activeTab === 'customers' && (
                    <div className="space-y-3">
                        <div className="relative w-full">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search customers by name or group..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00E599]"
                            />
                        </div>

                        <div className="rounded-2xl border border-[#1E2B38] bg-[#121B24] overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[#0B1118] border-b border-[#1E2B38] text-slate-400">
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Customer / Party Name</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Group</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Last Transaction</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Closing Balance</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#182330]">
                                        {filteredCustomers.map((c: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-[#182330] transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                                                            {c.name?.[0] || 'P'}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-white text-xs">{c.name}</p>
                                                            {c.phone && <p className="text-[10px] text-slate-500">{c.phone}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-[11px]">
                                                    {c.parent || 'Sundry Debtors'}
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-[11px]">
                                                    {c.lastDate ? format(new Date(c.lastDate), 'dd MMM yyyy') : 'Recent'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-black font-mono text-emerald-400 text-xs">
                                                    {formatCurrency(c.balance || c.lastAmount)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => navigate(`/ledgers/${c.id || encodeURIComponent(c.name)}`)}
                                                        className="px-3 py-1 rounded-lg bg-[#00E599]/15 text-[#00E599] hover:bg-[#00E599]/25 text-[11px] font-bold transition-colors cursor-pointer"
                                                    >
                                                        View Ledger →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 7. INVENTORY STOCK (Desktop) */}
                {activeTab === 'stock' && (
                    <div className="space-y-3">
                        <div className="relative w-full">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search inventory items by name or category..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00E599]"
                            />
                        </div>

                        <div className="rounded-2xl border border-[#1E2B38] bg-[#121B24] overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[#0B1118] border-b border-[#1E2B38] text-slate-400">
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Item Name</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Stock Group</th>
                                            <th className="px-4 py-3 text-center font-black text-[9px] uppercase">Current Qty</th>
                                            <th className="px-4 py-3 text-center font-black text-[9px] uppercase">Status</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#182330]">
                                        {filteredStock.map((s: any) => (
                                            <tr key={s.id} className="hover:bg-[#182330] transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                                                            <Box size={14} />
                                                        </div>
                                                        <p className="font-bold text-white text-xs">{s.name}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-[11px]">
                                                    {s.group}
                                                </td>
                                                <td className="px-4 py-3 text-center font-black font-mono text-white text-xs">
                                                    {s.stock}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        s.stock <= 5 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                    }`}>
                                                        {s.stock <= 5 ? 'Low Stock' : 'In Stock'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => navigate(`/stock/${s.id}`)}
                                                        className="px-3 py-1 rounded-lg bg-[#1A2634] hover:bg-[#223347] text-slate-300 text-[11px] font-bold transition-colors cursor-pointer"
                                                    >
                                                        Item Details →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 8. CASH & BANK FLOW (Desktop) */}
                {activeTab === 'cashflow' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                                <span className="text-[10px] font-bold uppercase text-slate-400">Total Money Collected</span>
                                <p className="text-2xl font-black text-emerald-400 mt-1">
                                    {formatCurrency(dashboard?.totalReceipts || 0)}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">{dashboard?.receiptsCount || 0} receipt vouchers</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                                <span className="text-[10px] font-bold uppercase text-slate-400">Total Payments Disbursed</span>
                                <p className="text-2xl font-black text-amber-400 mt-1">
                                    {formatCurrency(dashboard?.totalPayments || 0)}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">{dashboard?.paymentsCount || 0} payment vouchers</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38]">
                                <span className="text-[10px] font-bold uppercase text-slate-400">Net Cash Position</span>
                                <p className={`text-2xl font-black mt-1 ${
                                    (dashboard?.totalReceipts || 0) >= (dashboard?.totalPayments || 0)
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }`}>
                                    {formatCurrency((dashboard?.totalReceipts || 0) - (dashboard?.totalPayments || 0))}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">Surplus liquidity for FY</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
