import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { stockApi, supabase } from '../lib/insforge';
import { Package, Search, AlertTriangle, Grid, List, TrendingUp, Filter, Activity, Share2, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, Badge, Spinner, EmptyState, MetricCard, ListItem } from '../components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import { subDays, format } from 'date-fns';
import { HeaderPortal } from '../components/layout/HeaderPortal';

export default function StockPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [stockItems, setStockItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [groups, setGroups] = useState<string[]>([]);
    const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, lowStock: 0 });
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [activeTab, setActiveTab] = useState<'inventory' | 'analysis'>('inventory');
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [profitability, setProfitability] = useState<any[]>([]);
    const [deadStock, setDeadStock] = useState<any[]>([]);

    useEffect(() => {
        if (selectedCompany) {
            loadStock();
            loadGroups();
            if (activeTab === 'analysis') loadAnalysis();
        }
    }, [selectedCompany, selectedGroup, activeTab]);

    const loadStock = async () => {
        setLoading(true);
        try {
            const { data } = await stockApi.list(
                selectedCompany.id,
                selectedGroup !== 'all' ? selectedGroup : null
            );
            setStockItems(data || []);

            const all = data || [];
            setStats({
                totalItems: all.length,
                totalValue: all.reduce((s: number, item: any) => s + (item.closing_value || 0), 0),
                lowStock: all.filter((item: any) => (item.current_stock || 0) < 10).length
            });
        } catch (error) {
            console.error('Error loading stock:', error);
        }
        setLoading(false);
    };

    const loadGroups = async () => {
        try {
            const { data } = await stockApi.getGroups(selectedCompany.id);
            setGroups(data || []);
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    };

    const loadAnalysis = async () => {
        setAnalysisLoading(true);
        try {
            const { data: rawEntries, error: entriesError } = await (supabase
                .from('voucher_stock_entries')
                .select('stock_item_name, voucher_id, amount, quantity')
                .eq('company_id', selectedCompany.id)
                .limit(50000) as any);

            if (entriesError) throw entriesError;

            const voucherIds = Array.from(new Set((rawEntries || []).map((e: any) => e.voucher_id).filter(Boolean)));
            let voucherMap: Record<string, any> = {};
            if (voucherIds.length > 0) {
                const chunkSize = 40;
                const vouchers: any[] = [];

                for (let i = 0; i < voucherIds.length; i += chunkSize) {
                    const chunk = voucherIds.slice(i, i + chunkSize);
                    const { data: batch, error: voucherError } = await (supabase
                        .from('vouchers')
                        .select('id, voucher_type, voucher_date')
                        .eq('company_id', selectedCompany.id)
                        .in('id', chunk) as any);

                    if (voucherError) throw voucherError;
                    vouchers.push(...(batch || []));
                }

                (vouchers || []).forEach((v: any) => {
                    voucherMap[v.id] = v;
                });
            }

            const entries = (rawEntries || []).map((entry: any) => ({
                ...entry,
                voucher: voucherMap[entry.voucher_id] || null
            }));
            if (entries) {
                const itemStats: Record<string, any> = {};
                const now = new Date();
                const ninetyDaysAgo = subDays(now, 90);

                entries.forEach((entry: any) => {
                    const name = entry.stock_item_name;
                    if (!entry.voucher) return; // safeguard against orphaned entries
                    const type = entry.voucher.voucher_type;
                    const date = new Date(entry.voucher.voucher_date);
                    const amt = Math.abs(Number(entry.amount) || 0);

                    if (!itemStats[name]) {
                        itemStats[name] = {
                            name,
                            sales: 0,
                            purchases: 0,
                            lastSale: null,
                            totalQtySold: 0
                        };
                    }

                    if (type === 'Sales' || type === 'Sales Invoice') {
                        itemStats[name].sales += amt;
                        itemStats[name].totalQtySold += Math.abs(entry.quantity || 0);
                        if (!itemStats[name].lastSale || date > itemStats[name].lastSale) {
                            itemStats[name].lastSale = date;
                        }
                    } else if (type === 'Purchase') {
                        itemStats[name].purchases += amt;
                    }
                });

                const profitData = Object.values(itemStats)
                    .map((item: any) => ({
                        ...item,
                        margin: item.sales > 0 ? ((item.sales - item.purchases) / item.sales) * 100 : 0
                    }))
                    .filter(item => item.sales > 0)
                    .sort((a, b) => b.margin - a.margin);

                const deadData = stockItems.filter(stock => {
                    const stats = itemStats[stock.name];
                    if (!stats) return true;
                    if (!stats.lastSale) return true;
                    return stats.lastSale < ninetyDaysAgo;
                }).map(stock => ({
                    ...stock,
                    lastSale: itemStats[stock.name]?.lastSale
                }));

                setProfitability(profitData);
                setDeadStock(deadData);
            }
        } catch (error) {
            console.error('Error loading analysis:', error);
        }
        setAnalysisLoading(false);
    };

    const openStockItem = (item: any) => {
        const directId = item?.id || item?.stock_item_id || null;
        if (directId) {
            navigate('/stock/' + directId);
            return;
        }

        const byName = stockItems.find((s: any) => String(s?.name || '').toLowerCase() === String(item?.name || '').toLowerCase());
        if (byName?.id) navigate('/stock/' + byName.id);
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const formatQuantity = (qty: number, unit: string) => {
        if (!qty && qty !== 0) return '-';
        return `${qty.toFixed(qty % 1 === 0 ? 0 : 2)} ${unit || ''}`.trim();
    };

    const filteredStock = stockItems.filter((item: any) =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.stock_group?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const generatePDF = () => {
        const doc = new jsPDF();
        const companyName = selectedCompany?.name || 'Company';
        const date = format(new Date(), 'dd MMM yyyy');

        doc.setFontSize(18);
        doc.text(`Live Stock Availability - ${companyName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${date}`, 14, 28);

        let availableStock = filteredStock.filter((s: any) => s.current_stock > 0);

        autoTable(doc, {
            startY: 35,
            head: [['Item Name', 'Group', 'Available Qty', 'Valuation (Rs)']],
            body: availableStock.map((s: any) => [
                s.name,
                s.stock_group || 'General',
                formatQuantity(s.current_stock, s.unit),
                formatCurrency(s.closing_value).replace('₹', '')
            ]),
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] }
        });

        return doc;
    };

    const handleDownloadPDF = () => {
        const doc = generatePDF();
        doc.save(`Live_Stock_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    };

    const handleSharePDF = async () => {
        try {
            const doc = generatePDF();
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], `Live_Stock_${format(new Date(), 'dd-MM-yyyy')}.pdf`, { type: 'application/pdf' });

            if (navigator.share) {
                await navigator.share({
                    title: 'Live Stock List',
                    text: `Available stock for ${selectedCompany?.name}`,
                    files: [file]
                });
            } else {
                alert('Sharing is not supported on this browser. Try downloading instead.');
            }
        } catch (error) {
            console.error('Error sharing PDF:', error);
        }
    };

    const [showSearch, setShowSearch] = useState(false);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 md:space-y-8 max-w-7xl mx-auto">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Warehouse Node</h1>
                    <p className="hidden md:block text-[var(--text-muted)] font-bold text-[9px] uppercase tracking-widest mt-0.5">{stats.totalItems} Active SKU • {selectedCompany.name}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="search">
                <div className="flex items-center gap-2">
                    <AnimatePresence>
                        {showSearch ? (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: '200px', opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="relative overflow-hidden"
                            >
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)]" />
                                <input
                                    autoFocus
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onBlur={() => !searchTerm && setShowSearch(false)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-1.5 pl-9 pr-3 text-[11px] font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </motion.div>
                        ) : (
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-all"
                            >
                                <Search size={18} />
                            </button>
                        )}
                    </AnimatePresence>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="flex items-center gap-2">
                    {activeTab === 'inventory' && (
                        <div className="relative group/select">
                            <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <select
                                value={selectedGroup}
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className="bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-1.5 pl-8 pr-6 text-[10px] font-black uppercase tracking-widest text-[var(--on-surface)] appearance-none focus:outline-none focus:border-[var(--primary)] transition-all cursor-pointer min-w-[100px] md:min-w-[120px]"
                            >
                                <option value="all">Groups</option>
                                {groups.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                    )}
                    {activeTab === 'inventory' && (
                        <div className="flex gap-2 mr-2">
                            <button
                                onClick={handleDownloadPDF}
                                className="p-1.5 rounded-xl bg-[var(--surface-variant)] text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-all border border-[var(--border)]"
                                title="Download PDF"
                            >
                                <Download size={14} />
                            </button>
                            <button
                                onClick={handleSharePDF}
                                className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white font-bold text-[10px] uppercase tracking-wider shadow-sm hover:shadow-md transition-all"
                            >
                                <Share2 size={12} />
                                <span className="hidden sm:inline">Share Stock</span>
                                <span className="sm:hidden">Share</span>
                            </button>
                        </div>
                    )}
                    <div className="flex items-center gap-1 bg-[var(--surface-variant)] p-1 rounded-xl border border-[var(--border)]">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[var(--primary)] text-white shadow-md' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
                        >
                            <Grid size={12} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[var(--primary)] text-white shadow-md' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
                        >
                            <List size={12} />
                        </button>
                    </div>
                </div>
            </HeaderPortal>

            {/* Performance Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6">
                <MetricCard
                    title="Net SKU Count"
                    value={stats.totalItems.toString()}
                    icon={<Package size={22} />}
                    color="primary"
                />
                <MetricCard
                    title="Valuation"
                    value={formatCurrency(stats.totalValue)}
                    icon={<TrendingUp size={22} />}
                    color="success"
                />
                <MetricCard
                    title="Critical Stock"
                    value={stats.lowStock.toString()}
                    icon={<AlertTriangle size={22} />}
                    color="error"
                />
            </div>

            {/* View Tabs */}
            <div className="flex items-center gap-1 p-1 bg-[var(--surface-container)] rounded-xl w-full sm:w-fit border border-[var(--border)]">
                <button
                    onClick={() => setActiveTab('inventory')}
                    className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all ${activeTab === 'inventory' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm border border-[var(--border)]' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}`}
                >
                    Live Inventory
                </button>
                <button
                    onClick={() => setActiveTab('analysis')}
                    className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all ${activeTab === 'analysis' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm border border-[var(--border)]' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}`}
                >
                    Stock Analysis
                </button>
            </div>

            {activeTab === 'inventory' ? (
                <>

                    <AnimatePresence mode="wait">
                        {loading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center py-32"
                            >
                                <Spinner size="lg" />
                                <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--text-muted)] mt-6">Extracting Inventory Data...</p>
                            </motion.div>
                        ) : filteredStock.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                <EmptyState
                                    icon={<Package size={48} className="text-[var(--text-muted)]" />}
                                    title="Sector Clear"
                                    description="No items match your current filtration parameters."
                                />
                            </motion.div>
                        ) : viewMode === 'grid' ? (
                            <motion.div
                                key="grid"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5"
                            >
                                {filteredStock.map((item: any, idx) => {
                                    const isLowStock = (item.current_stock || 0) < 10;
                                    return (
                                        <Card key={item.id} hover onClick={() => openStockItem(item)} className="h-full flex flex-col p-5 border-[var(--border)] group animate-fadeIn shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className={`p-4 rounded-2xl bg-gradient-to-br ${isLowStock ? 'from-red-500 to-amber-500' : 'from-blue-500 to-indigo-600'} text-white shadow-lg`}>
                                                    <Package size={20} />
                                                </div>
                                                {isLowStock && (
                                                    <Badge variant="error" className="text-[8px] font-black tracking-widest px-2 py-0.5 animate-pulse">
                                                        CRITICAL
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="font-black text-[var(--on-surface)] text-sm mb-1.5 leading-tight group-hover:text-[var(--primary)] transition-colors min-h-[40px] line-clamp-2 uppercase tracking-tight">
                                                {item.name}
                                            </h3>
                                            <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest opacity-60 truncate">
                                                {item.stock_group || 'General Node'}
                                            </p>
                                            <div className="mt-8 space-y-3 pt-5 border-t border-[var(--border)]">
                                                <div className="flex justify-between items-center text-right">
                                                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Balance</span>
                                                    <p className={`text-sm font-black ${isLowStock ? 'text-red-500' : 'text-[var(--on-surface)]'}`}>
                                                        {formatQuantity(item.current_stock, item.unit)}
                                                    </p>
                                                </div>
                                                <div className="flex justify-between items-center text-right">
                                                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Liquidity</span>
                                                    <p className="text-sm font-black text-emerald-500">{formatCurrency(item.closing_value)}</p>
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </motion.div>
                        ) : (
                            <Card className="overflow-hidden border-[var(--border)] bg-transparent p-0">
                                <div className="divide-y divide-[var(--border)]">
                                    {filteredStock.map((item: any) => {
                                        const isLowStock = (item.current_stock || 0) < 10;
                                        return (
                                            <ListItem
                                                key={item.id}
                                                onClick={() => openStockItem(item)} className="px-4 md:px-6 py-4 hover:bg-[var(--surface-variant)] transition-all"
                                                title={<span className="font-black text-sm uppercase tracking-tight text-[var(--on-surface)]">{item.name}</span>}
                                                subtitle={<span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[2px]">{item.stock_group || 'General'}</span>}
                                                leading={
                                                    <div className={`p-3 rounded-xl ${isLowStock ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'} border border-white/5`}>
                                                        <Package size={20} />
                                                    </div>
                                                }
                                                trailing={
                                                    <div className="flex items-center gap-4 md:gap-12 text-right">
                                                        <div>
                                                            <p className={`text-sm font-black ${isLowStock ? 'text-red-500' : 'text-[var(--on-surface)]'}`}>
                                                                {formatQuantity(item.current_stock, item.unit)}
                                                            </p>
                                                            <p className="text-[8px] uppercase font-black tracking-widest text-[var(--text-muted)] mt-1">Status</p>
                                                        </div>
                                                        <div className="min-w-[120px]">
                                                            <p className="text-sm font-black text-emerald-500">{formatCurrency(item.closing_value)}</p>
                                                            <p className="text-[8px] uppercase font-black tracking-widest text-[var(--text-muted)] mt-1">Valuation</p>
                                                        </div>
                                                        <div className="w-20 flex justify-end">
                                                            {isLowStock ? (
                                                                <Badge variant="error" className="text-[8px] font-black uppercase tracking-widest">LOW</Badge>
                                                            ) : (
                                                                <Badge variant="success" className="text-[8px] font-black uppercase tracking-widest">OPTIMAL</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            </Card>
                        )}
                    </AnimatePresence>
                </>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children">
                    {/* Dead Stock Analysis */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-[var(--on-surface)] uppercase">Dead Stock Analysis</h3>
                                <p className="text-[10px] font-bold text-red-500 uppercase">Items not sold in 90+ days</p>
                            </div>
                            <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
                                <AlertTriangle size={18} />
                            </div>
                        </div>
                        <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
                            {analysisLoading ? (
                                <div className="p-12 flex justify-center"><Spinner /></div>
                            ) : deadStock.length === 0 ? (
                                <div className="p-12 text-center text-xs text-[var(--text-muted)]">No dead stock found. Great job!</div>
                            ) : deadStock.map((item) => (
                                <div key={item.id} onClick={() => openStockItem(item)} className="p-4 flex items-center justify-between hover:bg-[var(--surface-active)] transition-colors cursor-pointer">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-[var(--on-surface)]">{item.name}</span>
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">
                                            Last Sale: {item.lastSale ? format(new Date(item.lastSale), 'dd MMM yyyy') : 'NEVER SOLD'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-black text-[var(--on-surface)]">{formatQuantity(item.current_stock, item.unit)}</div>
                                        <div className="text-[10px] text-red-500 font-bold uppercase">Locked Value: {formatCurrency(item.closing_value)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Profitability Analysis */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-[var(--on-surface)] uppercase">Item Profitability</h3>
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Realized margin per SKU</p>
                            </div>
                            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                                <TrendingUp size={18} />
                            </div>
                        </div>
                        <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
                            {analysisLoading ? (
                                <div className="p-12 flex justify-center"><Spinner /></div>
                            ) : profitability.length === 0 ? (
                                <div className="p-12 text-center text-xs text-[var(--text-muted)] font-bold">No sales data available for analysis.</div>
                            ) : profitability.map((item) => (
                                <div key={item.name} onClick={() => openStockItem(item)} className="p-4 flex items-center justify-between hover:bg-[var(--surface-active)] transition-colors cursor-pointer">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-[var(--on-surface)]">{item.name}</span>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Rev: {formatCurrency(item.sales)}</span>
                                            <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
                                            <span className="text-[10px] font-bold text-emerald-500 uppercase">Prof: {formatCurrency(item.sales - item.purchases)}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className={`text-xs font-black ${item.margin >= 20 ? 'text-emerald-500' : item.margin >= 10 ? 'text-blue-500' : 'text-amber-500'}`}>
                                            {item.margin.toFixed(1)}%
                                        </div>
                                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tighter">Margin</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


