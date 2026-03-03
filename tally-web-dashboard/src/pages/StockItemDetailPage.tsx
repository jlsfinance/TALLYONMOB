import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase as insforgeClient, stockApi } from '@/lib/supabase';
import {
    ArrowLeft, Package, TrendingUp, TrendingDown, Clock,
    ShoppingCart, Users, Store, BarChart3, Receipt,
    ChevronRight, Info, AlertTriangle, Hash, Calendar
} from 'lucide-react';
import { Card, Badge, Spinner, MetricCard, ListItem, EmptyState } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays } from 'date-fns';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(Math.abs(amount || 0));
};

const formatQuantity = (qty: number, unit: string) => {
    return `${(qty || 0).toFixed(2)} ${unit || ''}`.trim();
};

const getFYStart = () => {
    const now = new Date();
    const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return new Date(year, 3, 1).toISOString().split('T')[0];
};

const SALES_TYPES = new Set(['Sales', 'Sales Invoice']);
const PURCHASE_TYPES = new Set(['Purchase', 'Purchase Invoice']);

export default function StockItemDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const supabase: any = insforgeClient;
    const [item, setItem] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'summary' | 'history' | 'customers' | 'suppliers'>('summary');

    const [stats, setStats] = useState({
        totalSalesQty: 0,
        totalSalesVal: 0,
        totalPurchaseQty: 0,
        totalPurchaseVal: 0,
        salesCount: 0,
        lastSaleDate: null,
        lastSalePrice: 0,
        avgSalePrice: 0,
        maxGstRate: 0
    });

    const [customers, setCustomers] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);

    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRows, setHistoryRows] = useState<any[]>([]);
    const [historySummary, setHistorySummary] = useState({
        opening_qty: 0,
        total_in_qty: 0,
        total_out_qty: 0,
        total_in_amount: 0,
        total_out_amount: 0,
        closing_qty: 0
    });
    const [voucherTypeOptions, setVoucherTypeOptions] = useState<string[]>(['All']);
    const [historyFilters, setHistoryFilters] = useState({
        fromDate: getFYStart(),
        toDate: new Date().toISOString().split('T')[0],
        party: '',
        voucherType: 'All'
    });

    useEffect(() => {
        if (id && selectedCompany) {
            loadItemDetails();
        }
    }, [id, selectedCompany]);

    useEffect(() => {
        if (item && selectedCompany) {
            loadStockHistory(item);
        }
    }, [
        item?.id,
        selectedCompany?.id,
        historyFilters.fromDate,
        historyFilters.toDate,
        historyFilters.party,
        historyFilters.voucherType
    ]);

    const loadStockHistory = async (sourceItem?: any) => {
        const itemRef = sourceItem || item;
        if (!itemRef || !selectedCompany?.id) return;

        setHistoryLoading(true);
        try {
            const voucherTypes = historyFilters.voucherType && historyFilters.voucherType !== 'All'
                ? [historyFilters.voucherType]
                : undefined;

            const { data, error } = await stockApi.getHistory(selectedCompany.id, itemRef.id || itemRef.name, {
                fromDate: historyFilters.fromDate || undefined,
                toDate: historyFilters.toDate || undefined,
                party: historyFilters.party?.trim() || undefined,
                voucherTypes,
                sort: 'desc',
                limit: 5000
            } as any);

            if (error) throw error;

            const rows = data?.rows || [];
            setHistoryRows(rows);
            setHistorySummary(data?.summary || {
                opening_qty: Number(itemRef.opening_stock || itemRef.opening_balance || 0),
                total_in_qty: 0,
                total_out_qty: 0,
                total_in_amount: 0,
                total_out_amount: 0,
                closing_qty: Number(itemRef.opening_stock || itemRef.opening_balance || 0)
            });

            const typeOptions = ['All', ...Array.from(new Set(rows.map((r: any) => r.voucher_type).filter(Boolean)))] as string[];
            setVoucherTypeOptions(typeOptions);
        } catch (error: any) {
            console.error('Error loading stock history:', error);
            setHistoryRows([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const loadItemDetails = async () => {
        setLoading(true);
        try {
            const { data: itemData, error: itemError } = await supabase
                .from('stock_items')
                .select('*')
                .eq('id', id)
                .single();
            if (itemError) throw itemError;
            setItem(itemData);
            const { data: allHistory, error: allHistoryError } = await stockApi.getHistory(
                selectedCompany.id,
                itemData.id || itemData.name,
                {
                    sort: 'desc',
                    limit: 10000
                } as any
            );
            if (allHistoryError) throw allHistoryError;
            const rows = allHistory?.rows || [];
            let sQty = 0;
            let sVal = 0;
            let pQty = 0;
            let pVal = 0;
            let lastSDate: string | null = null;
            let lastSPrice = 0;
            let maxGstRate = 0;
            const saleVoucherSet = new Set<string>();
            const custMap: Record<string, any> = {};
            const suppMap: Record<string, any> = {};
            rows.forEach((row: any) => {
                const type = String(row.voucher_type || '').trim();
                const party = String(row.party_name || '').trim() || 'Unknown Party';
                const date = row.voucher_date || row.created_at || null;
                const qtyAbs = Math.abs(Number(row.quantity) || 0);
                const qtyDelta = Number(row.qty_delta || 0);
                const qtyIn = Math.abs(Number(row.qty_in || (qtyDelta > 0 ? qtyDelta : 0)));
                const qtyOut = Math.abs(Number(row.qty_out || (qtyDelta < 0 ? qtyDelta : 0)));
                const inwardQty = qtyIn > 0 ? qtyIn : qtyAbs;
                const outwardQty = qtyOut > 0 ? qtyOut : qtyAbs;
                const amount = Math.abs(Number(row.amount) || 0);
                const rate = Math.abs(Number(row.rate) || 0) || (qtyAbs > 0 ? amount / qtyAbs : 0);
                const gstRate = Number(row.tax_rate ?? row.gst_rate ?? 0) || 0;
                if (gstRate > maxGstRate) maxGstRate = gstRate;
                if (SALES_TYPES.has(type)) {
                    sQty += outwardQty;
                    sVal += amount;
                    if (row.voucher_id) saleVoucherSet.add(String(row.voucher_id));
                    if (date && (!lastSDate || new Date(date).getTime() > new Date(lastSDate).getTime())) {
                        lastSDate = date;
                        lastSPrice = rate;
                    }
                    if (!custMap[party]) {
                        custMap[party] = { name: party, lastDate: date, qty: 0, val: 0, rates: [], id: null };
                    }
                    custMap[party].qty += outwardQty;
                    custMap[party].val += amount;
                    custMap[party].rates.push(rate);
                    if (date && (!custMap[party].lastDate || new Date(date).getTime() > new Date(custMap[party].lastDate).getTime())) {
                        custMap[party].lastDate = date;
                    }
                } else if (PURCHASE_TYPES.has(type)) {
                    pQty += inwardQty;
                    pVal += amount;
                    if (!suppMap[party]) {
                        suppMap[party] = { name: party, lastDate: date, qty: 0, val: 0, rates: [], id: null };
                    }
                    suppMap[party].qty += inwardQty;
                    suppMap[party].val += amount;
                    suppMap[party].rates.push(rate);
                    if (date && (!suppMap[party].lastDate || new Date(date).getTime() > new Date(suppMap[party].lastDate).getTime())) {
                        suppMap[party].lastDate = date;
                    }
                }
            });
            setStats({
                totalSalesQty: sQty,
                totalSalesVal: sVal,
                totalPurchaseQty: pQty,
                totalPurchaseVal: pVal,
                salesCount: saleVoucherSet.size,
                lastSaleDate: lastSDate,
                lastSalePrice: lastSPrice,
                avgSalePrice: sQty > 0 ? sVal / sQty : 0,
                maxGstRate
            });
            setCustomers(Object.values(custMap).sort((a, b) => b.val - a.val));
            setSuppliers(Object.values(suppMap).sort((a, b) => b.val - a.val));
            await loadStockHistory(itemData);
        } catch (error: any) {
            console.error('Error loading item details:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Spinner size="lg" />
                <p className="text-[var(--text-muted)] animate-pulse uppercase text-[10px] font-black tracking-widest">Identifying SKU...</p>
            </div>
        );
    }

    if (!item) return null;

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-[var(--on-surface-variant)] hover:text-[var(--primary)] transition-colors">
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h1 className="text-sm md:text-base font-black text-[var(--on-surface)] line-clamp-1 leading-none uppercase">{item.name}</h1>
                        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight mt-0.5">
                            Stock Balance: <span className={(item.current_stock || 0) > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                {formatQuantity(item.current_stock, item.unit)}
                            </span>
                        </p>
                    </div>
                </div>
            </HeaderPortal>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="flex flex-col items-center justify-center p-4">
                    <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg mb-2">
                        <ShoppingCart size={18} />
                    </div>
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Sales Val</p>
                    <p className="text-sm font-black text-[var(--on-surface)]">{formatCurrency(stats.totalSalesVal)}</p>
                </Card>
                <Card className="flex flex-col items-center justify-center p-4">
                    <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg mb-2">
                        <TrendingUp size={18} />
                    </div>
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Avg Price</p>
                    <p className="text-sm font-black text-[var(--on-surface)]">₹{stats.avgSalePrice.toFixed(2)}</p>
                </Card>
                <Card className="flex flex-col items-center justify-center p-4">
                    <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg mb-2">
                        <Users size={18} />
                    </div>
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Customers</p>
                    <p className="text-sm font-black text-[var(--on-surface)]">{customers.length}</p>
                </Card>
                <Card className="flex flex-col items-center justify-center p-4">
                    <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg mb-2">
                        <AlertTriangle size={18} />
                    </div>
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Stock Value</p>
                    <p className="text-sm font-black text-[var(--on-surface)]">{formatCurrency(item.closing_value)}</p>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] bg-[var(--surface)] sticky top-[72px] md:top-[88px] z-30">
                {[
                    { id: 'summary', label: 'Summary', icon: <Info size={14} /> },
                    { id: 'history', label: 'History', icon: <Clock size={14} /> },
                    { id: 'customers', label: 'Customers', icon: <Users size={14} /> },
                    { id: 'suppliers', label: 'Suppliers', icon: <Store size={14} /> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 flex items-center justify-center gap-2 py-4 text-[11px] font-black uppercase tracking-widest transition-all relative
                            ${activeTab === tab.id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}
                        `}
                    >
                        {tab.icon}
                        {tab.label}
                        {activeTab === tab.id && (
                            <motion.div layoutId="activeTabStock" className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--primary)]" />
                        )}
                    </button>
                ))}
            </div>

            {/* Content View */}
            <div className="mt-6">
                <AnimatePresence mode="wait">
                    {activeTab === 'summary' && (
                        <motion.div
                            key="summary"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Technical Details */}
                                <Card padding="none" className="overflow-hidden">
                                    <div className="px-4 py-3 bg-[var(--surface-variant)]/50 border-b border-[var(--border)]">
                                        <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[2px]">Item Specifications</h3>
                                    </div>
                                    <div className="divide-y divide-[var(--border)]">
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">HSN / SAC</span>
                                            <span className="text-xs font-black text-[var(--on-surface)]">{item.hsn_code || '---'}</span>
                                        </div>
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Tax Category</span>
                                            <Badge variant="primary">{item.gst_rate || stats.maxGstRate || 0}% GST</Badge>
                                        </div>
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Stock Group</span>
                                            <span className="text-xs font-black text-[var(--on-surface)] uppercase">{item.stock_group || 'General'}</span>
                                        </div>
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Base Unit</span>
                                            <span className="text-xs font-black text-[var(--on-surface)] uppercase">{item.unit || 'Nos'}</span>
                                        </div>
                                    </div>
                                </Card>

                                {/* Sales Analysis */}
                                <Card padding="none" className="overflow-hidden">
                                    <div className="px-4 py-3 bg-[var(--surface-variant)]/50 border-b border-[var(--border)]">
                                        <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[2px]">Lifecycle Metrics</h3>
                                    </div>
                                    <div className="divide-y divide-[var(--border)]">
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Sales Count</span>
                                            <span className="text-xs font-black text-[var(--on-surface)]">{stats.salesCount} Invoices</span>
                                        </div>
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Volume Moved</span>
                                            <span className="text-xs font-black text-[var(--on-surface)]">{stats.totalSalesQty.toFixed(0)} {item.unit}</span>
                                        </div>
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Last Sale Date</span>
                                            <span className="text-xs font-black text-[var(--on-surface)]">
                                                {stats.lastSaleDate && !isNaN(new Date(stats.lastSaleDate).getTime())
                                                    ? format(new Date(stats.lastSaleDate), 'dd MMM yyyy')
                                                    : '---'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between p-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Last Sale Rate</span>
                                            <span className="text-xs font-black text-emerald-500">₹{stats.lastSalePrice.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* Standard Rates Section */}
                            <Card padding="md" className="bg-gradient-to-br from-[var(--surface)] to-[var(--surface-variant)]">
                                <div className="flex items-center gap-3 mb-4">
                                    <BarChart3 className="text-[var(--primary)]" size={20} />
                                    <h3 className="text-xs font-black text-[var(--on-surface)] uppercase tracking-widest">Rate Benchmarking</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase mb-2">Standard Cost</p>
                                        <p className="text-xl font-black text-[var(--on-surface)]">₹{(stats.totalPurchaseVal / (stats.totalPurchaseQty || 1)).toFixed(2)}</p>
                                        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase mt-1">Weighted Purchase Avg</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase mb-2">Market Price</p>
                                        <p className="text-xl font-black text-emerald-500">₹{stats.avgSalePrice.toFixed(2)}</p>
                                        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase mt-1">Weighted Sales Avg</p>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    )}
                    {activeTab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            <Card className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input
                                        type="date"
                                        value={historyFilters.fromDate}
                                        onChange={(e) => setHistoryFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                                        className="px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold text-[var(--on-surface)]"
                                    />
                                    <input
                                        type="date"
                                        value={historyFilters.toDate}
                                        onChange={(e) => setHistoryFilters(prev => ({ ...prev, toDate: e.target.value }))}
                                        className="px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold text-[var(--on-surface)]"
                                    />
                                    <input
                                        type="text"
                                        value={historyFilters.party}
                                        onChange={(e) => setHistoryFilters(prev => ({ ...prev, party: e.target.value }))}
                                        placeholder="Filter party"
                                        className="px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold text-[var(--on-surface)] placeholder:text-[var(--text-muted)]"
                                    />
                                    <select
                                        value={historyFilters.voucherType}
                                        onChange={(e) => setHistoryFilters(prev => ({ ...prev, voucherType: e.target.value }))}
                                        className="px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold text-[var(--on-surface)]"
                                    >
                                        {voucherTypeOptions.map((type) => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <div className="p-3 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)]">
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Opening</p>
                                        <p className="text-sm font-black text-[var(--on-surface)]">{formatQuantity(historySummary.opening_qty, item.unit)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)]">
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Inward</p>
                                        <p className="text-sm font-black text-emerald-500">{formatQuantity(historySummary.total_in_qty, item.unit)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)]">
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Outward</p>
                                        <p className="text-sm font-black text-rose-500">{formatQuantity(historySummary.total_out_qty, item.unit)}</p>
                                    </div>
                                </div>
                            </Card>

                            <Card padding="none" className="overflow-hidden">
                                <div className="grid grid-cols-12 px-4 py-2 bg-[var(--surface-variant)] border-b border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    <div className="col-span-3">Date</div>
                                    <div className="col-span-3">Party</div>
                                    <div className="col-span-2 text-right">Qty</div>
                                    <div className="col-span-2 text-right">Amount</div>
                                    <div className="col-span-2 text-right">Running</div>
                                </div>

                                {historyLoading ? (
                                    <div className="p-8 flex justify-center"><Spinner /></div>
                                ) : historyRows.length === 0 ? (
                                    <div className="p-8 text-center text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">No transactions found</div>
                                ) : (
                                    <div className="divide-y divide-[var(--border)]">
                                        {historyRows.map((row: any) => (
                                            <button
                                                key={row.entry_id || row.id || [row.voucher_id || 'v', row.voucher_date || '', row.party_name || ''].join('-')}
                                                onClick={() => row.voucher_id && navigate('/vouchers/' + encodeURIComponent(row.voucher_id))}
                                                className="w-full grid grid-cols-12 px-4 py-3 text-left hover:bg-[var(--surface-hover)]"
                                            >
                                                <div className="col-span-3">
                                                    <p className="text-xs font-black text-[var(--on-surface)]">{row.voucher_date ? format(new Date(row.voucher_date), 'dd MMM yyyy') : '---'}</p>
                                                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{row.voucher_type || '-'}</p>
                                                </div>
                                                <div className="col-span-3">
                                                    <p className="text-xs font-black text-[var(--on-surface)] line-clamp-1">{row.party_name || '-'}</p>
                                                    <p className="text-[10px] font-bold text-[var(--text-muted)]">@ {Number(row.rate || 0).toFixed(2)}</p>
                                                </div>
                                                <div className="col-span-2 text-right self-center">
                                                    <p className={"text-xs font-black " + (row.qty_delta >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                                        {row.qty_delta >= 0 ? '+' : ''}{Number(row.qty_delta || 0).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className="col-span-2 text-right self-center">
                                                    <p className="text-xs font-black text-[var(--on-surface)]">{formatCurrency(row.amount)}</p>
                                                </div>
                                                <div className="col-span-2 text-right self-center">
                                                    <p className="text-xs font-black text-[var(--primary)]">{Number(row.running_stock_balance ?? row.running_stock ?? 0).toFixed(2)}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    )}

                    {activeTab === 'customers' && (
                        <motion.div
                            key="customers"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-3"
                        >
                            {customers.length === 0 ? (
                                <EmptyState icon={<Users size={40} />} title="No Buyers" description="This item has not been sold to any customer yet." />
                            ) : (
                                customers.map((c, i) => (
                                    <Card
                                        key={i}
                                        hover
                                        padding="none"
                                        className="overflow-hidden group"
                                        onClick={() => c.id ? navigate(`/ledgers/${c.id}`) : navigate(`/ledgers?party=${encodeURIComponent(c.name)}`)}
                                    >
                                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-[var(--surface-variant)] flex items-center justify-center text-[var(--primary)] font-black text-sm">
                                                    {c.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-[var(--on-surface)] uppercase group-hover:text-[var(--primary)] transition-colors">{c.name}</h4>
                                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-0.5">
                                                        Last Transaction: {c.lastDate && !isNaN(new Date(c.lastDate).getTime()) ? format(new Date(c.lastDate), 'dd MMM yyyy') : '---'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6 text-right bg-[var(--surface-variant)] md:bg-transparent p-3 md:p-0 rounded-xl">
                                                <div className="hidden sm:block">
                                                    <p className="text-xs font-black text-[var(--on-surface)]">₹{(c.val / (c.qty || 1)).toFixed(2)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Avg Rate</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-[var(--on-surface)]">{c.qty} {item.unit}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Total Qty</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-[var(--primary)]">{formatCurrency(c.val)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Revenue</p>
                                                </div>
                                                <ChevronRight size={16} className="text-[var(--text-muted)] hidden md:block" />
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'suppliers' && (
                        <motion.div
                            key="suppliers"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-3"
                        >
                            {suppliers.length === 0 ? (
                                <EmptyState icon={<Store size={40} />} title="No Sources" description="No purchase history found for this item." />
                            ) : (
                                suppliers.map((s, i) => (
                                    <Card
                                        key={i}
                                        hover
                                        padding="none"
                                        className="overflow-hidden group"
                                        onClick={() => s.id ? navigate(`/ledgers/${s.id}`) : navigate(`/ledgers?party=${encodeURIComponent(s.name)}`)}
                                    >
                                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-black text-sm">
                                                    {s.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-[var(--on-surface)] uppercase group-hover:text-amber-500 transition-colors">{s.name}</h4>
                                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-0.5">
                                                        Last Inward: {s.lastDate && !isNaN(new Date(s.lastDate).getTime()) ? format(new Date(s.lastDate), 'dd MMM yyyy') : '---'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6 text-right">
                                                <div className="hidden sm:block">
                                                    <p className="text-xs font-black text-[var(--on-surface)]">₹{(s.val / (s.qty || 1)).toFixed(2)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Avg Rate</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-[var(--on-surface)]">{s.qty} {item.unit}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Total In</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-amber-500">{formatCurrency(s.val)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Value</p>
                                                </div>
                                                <ChevronRight size={16} className="text-[var(--text-muted)] hidden md:block" />
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

