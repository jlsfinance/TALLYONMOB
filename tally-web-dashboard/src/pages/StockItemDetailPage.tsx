import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
    ArrowLeft, Package, TrendingUp, TrendingDown, Clock,
    ShoppingCart, Users, Store, BarChart3, Receipt,
    ChevronRight, Info, AlertTriangle, Hash, Calendar
} from 'lucide-react';
import { Card, Badge, Spinner, MetricCard, ListItem } from '@/components/ui/GlassUI';
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

export default function StockItemDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [item, setItem] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'summary' | 'customers' | 'suppliers'>('summary');

    const [stats, setStats] = useState({
        totalSalesQty: 0,
        totalSalesVal: 0,
        totalPurchaseQty: 0,
        totalPurchaseVal: 0,
        salesCount: 0,
        lastSaleDate: null,
        lastSalePrice: 0,
        avgSalePrice: 0
    });

    const [customers, setCustomers] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);

    useEffect(() => {
        if (id && selectedCompany) {
            loadItemDetails();
        }
    }, [id, selectedCompany]);

    const loadItemDetails = async () => {
        setLoading(true);
        try {
            // 1. Fetch Item Master
            const { data: itemData, error: itemError } = await supabase
                .from('stock_items')
                .select('*')
                .eq('id', id)
                .single();

            if (itemError) throw itemError;
            setItem(itemData);

            // 2. Fetch All Transactions for this item
            const { data: entries, error: entriesError } = await supabase
                .from('voucher_stock_entries')
                .select('*, vouchers!inner(voucher_type, voucher_date, party_name, voucher_number, id, voucher_id)')
                .eq('stock_item_name', itemData.name)
                .eq('company_id', selectedCompany.id)
                .order('vouchers(voucher_date)', { ascending: false });

            if (entriesError) throw entriesError;

            // 3. Process Stats & Lists
            let sQty = 0, sVal = 0, pQty = 0, pVal = 0, sCount = 0;
            let lastSDate = null, lastSPrice = 0;

            const custMap: Record<string, any> = {};
            const suppMap: Record<string, any> = {};

            entries?.forEach(entry => {
                const type = entry.vouchers.voucher_type;
                const qty = Math.abs(Number(entry.quantity) || 0);
                const amt = Math.abs(Number(entry.amount) || 0);
                const rate = Math.abs(Number(entry.rate) || 0);
                const party = entry.vouchers.party_name;
                const date = entry.vouchers.voucher_date;

                if (type === 'Sales' || type === 'Sales Invoice') {
                    sQty += qty;
                    sVal += amt;
                    sCount++;
                    if (!lastSDate || new Date(date) > new Date(lastSDate)) {
                        lastSDate = date;
                        lastSPrice = rate;
                    }

                    if (!custMap[party]) {
                        custMap[party] = { name: party, lastDate: date, qty: 0, val: 0, rates: [] };
                    }
                    custMap[party].qty += qty;
                    custMap[party].val += amt;
                    custMap[party].rates.push(rate);
                    if (new Date(date) > new Date(custMap[party].lastDate)) custMap[party].lastDate = date;
                } else if (type === 'Purchase') {
                    pQty += qty;
                    pVal += amt;

                    if (!suppMap[party]) {
                        suppMap[party] = { name: party, lastDate: date, qty: 0, val: 0, rates: [] };
                    }
                    suppMap[party].qty += qty;
                    suppMap[party].val += amt;
                    suppMap[party].rates.push(rate);
                    if (new Date(date) > new Date(suppMap[party].lastDate)) suppMap[party].lastDate = date;
                }
            });

            setStats({
                totalSalesQty: sQty,
                totalSalesVal: sVal,
                totalPurchaseQty: pQty,
                totalPurchaseVal: pVal,
                salesCount: sCount,
                lastSaleDate: lastSDate,
                lastSalePrice: lastSPrice,
                avgSalePrice: sQty > 0 ? sVal / sQty : 0
            });

            setCustomers(Object.values(custMap).sort((a, b) => b.val - a.val));
            setSuppliers(Object.values(suppMap).sort((a, b) => b.val - a.val));

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
                                            <Badge variant="primary">{item.gst_rate || 0}% GST</Badge>
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
                                            <span className="text-xs font-black text-[var(--on-surface)]">{stats.lastSaleDate ? format(new Date(stats.lastSaleDate), 'dd MMM yyyy') : '---'}</span>
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
                                        onClick={() => navigate(`/ledgers`)} // Can't easily link to ledger detail without ID here, but name lookup is possible
                                    >
                                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-[var(--surface-variant)] flex items-center justify-center text-[var(--primary)] font-black text-sm">
                                                    {c.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-[var(--on-surface)] uppercase group-hover:text-[var(--primary)] transition-colors">{c.name}</h4>
                                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-0.5">
                                                        Last Transaction: {format(new Date(c.lastDate), 'dd MMM yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8 text-right bg-[var(--surface-variant)] md:bg-transparent p-3 md:p-0 rounded-xl">
                                                <div>
                                                    <p className="text-xs font-black text-[var(--on-surface)]">{c.qty} {item.unit}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase uppercase">Total Qty</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-[var(--primary)]">{formatCurrency(c.val)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase uppercase">Total Revenue</p>
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
                                    <Card key={i} hover padding="none" className="overflow-hidden group">
                                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-black text-sm">
                                                    {s.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-[var(--on-surface)] uppercase group-hover:text-amber-500 transition-colors">{s.name}</h4>
                                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-0.5">
                                                        Last Inward: {format(new Date(s.lastDate), 'dd MMM yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8 text-right">
                                                <div>
                                                    <p className="text-xs font-black text-[var(--on-surface)]">{s.qty} {item.unit}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase uppercase">Stock In</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-amber-500">{formatCurrency(s.val)}</p>
                                                    <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase uppercase">Total Value</p>
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
