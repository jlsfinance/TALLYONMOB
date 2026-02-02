import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stockApi } from '@/lib/supabase';
import { Package, Search, AlertTriangle, Grid, List, TrendingUp, Filter } from 'lucide-react';
import { Card, Chip, Badge, Input, ListItem, Avatar, Spinner, EmptyState, MetricCard } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';

export default function StockPage() {
    const { selectedCompany } = useAuth() as any;
    const [stockItems, setStockItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [groups, setGroups] = useState<string[]>([]);
    const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, lowStock: 0 });
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        if (selectedCompany) {
            loadStock();
            loadGroups();
        }
    }, [selectedCompany, selectedGroup]);

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
                lowStock: all.filter((item: any) => (item.closing_balance || 0) < 10).length
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

    if (!selectedCompany) return null;

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-[var(--on-surface)] tracking-tighter uppercase">Warehouse Node</h1>
                    <p className="text-[var(--text-muted)] font-bold text-[10px] uppercase tracking-[3px] mt-1">Inventory Management System • {stats.totalItems} Active SKU</p>
                </div>
                <div className="flex items-center gap-3 bg-[var(--surface-variant)] p-1.5 rounded-2xl border border-[var(--border)]">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-[var(--primary)] text-white shadow-lg' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
                    >
                        <Grid size={18} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-[var(--primary)] text-white shadow-lg' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)]'}`}
                    >
                        <List size={18} />
                    </button>
                </div>
            </div>

            {/* Performance Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

            {/* Search & Intelligence */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
                <div className="lg:col-span-3 relative group">
                    <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors" />
                    <input
                        placeholder="Search SKU identity, category, or attributes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl py-5 pl-14 pr-6 text-sm font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-glow)] transition-all placeholder:text-[var(--text-muted)] placeholder:font-black placeholder:uppercase placeholder:tracking-widest"
                    />
                </div>
                <div className="relative group">
                    <Filter size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl py-5 pl-12 pr-6 text-[10px] font-black uppercase tracking-widest text-[var(--on-surface)] appearance-none focus:outline-none focus:border-[var(--primary)] transition-all cursor-pointer"
                    >
                        <option value="all">All Clusters</option>
                        {groups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
            </div>

            {/* Inventory Grid/List */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-32"
                    >
                        <div className="w-10 h-10 border-[3px] border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
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
                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
                    >
                        {filteredStock.map((item: any, idx) => {
                            const isLowStock = (item.closing_balance || 0) < 10;
                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <Card hover className="h-full flex flex-col p-5 border-[var(--border)] group animate-in shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className={`p-4 rounded-2xl bg-gradient-to-br ${isLowStock ? 'from-[var(--error)] to-[var(--accent)]' : 'from-[var(--primary)] to-[var(--secondary)]'} text-white shadow-lg`}>
                                                <Package size={20} />
                                            </div>
                                            {isLowStock && (
                                                <Badge variant="error" className="bg-[var(--error-bg)] text-[var(--error)] border-none text-[8px] font-black tracking-widest px-2 py-0.5 animate-pulse">
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
                                            <div className="flex justify-between items-center text-right text-right">
                                                <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Balance</span>
                                                <p className={`text-sm font-black ${isLowStock ? 'text-[var(--error)]' : 'text-[var(--on-surface)]'}`}>
                                                    {formatQuantity(item.closing_balance, item.base_unit)}
                                                </p>
                                            </div>
                                            <div className="flex justify-between items-center text-right">
                                                <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Liquidity</span>
                                                <p className="text-sm font-black text-[var(--success)]">{formatCurrency(item.closing_value)}</p>
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                ) : (
                    <motion.div
                        key="list"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <Card padding="none" className="overflow-hidden border-[var(--border)] bg-transparent">
                            <div className="divide-y divide-[var(--border)]">
                                {filteredStock.map((item: any) => {
                                    const isLowStock = (item.closing_balance || 0) < 10;
                                    return (
                                        <ListItem
                                            key={item.id}
                                            className="px-6 py-4 hover:bg-[var(--surface-variant)] transition-all cursor-default"
                                            title={<span className="font-black text-sm uppercase tracking-tight text-[var(--on-surface)]">{item.name}</span>}
                                            subtitle={<span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[2px]">{item.stock_group || 'General'}</span>}
                                            leading={
                                                <div className={`p-3 rounded-xl ${isLowStock ? 'bg-[var(--error-bg)] text-[var(--error)]' : 'bg-[var(--primary-glow)] text-[var(--primary)]'} border border-white/5`}>
                                                    <Package size={20} />
                                                </div>
                                            }
                                            trailing={
                                                <div className="flex items-center gap-12 text-right">
                                                    <div>
                                                        <p className={`text-sm font-black ${isLowStock ? 'text-[var(--error)]' : 'text-[var(--on-surface)]'}`}>
                                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                                        </p>
                                                        <p className="text-[8px] uppercase font-black tracking-widest text-[var(--text-muted)] mt-1">Status</p>
                                                    </div>
                                                    <div className="min-w-[120px]">
                                                        <p className="text-sm font-black text-[var(--success)]">{formatCurrency(item.closing_value)}</p>
                                                        <p className="text-[8px] uppercase font-black tracking-widest text-[var(--text-muted)] mt-1">Valuation</p>
                                                    </div>
                                                    <div className="w-20 flex justify-end">
                                                        {isLowStock ? (
                                                            <Badge variant="error" className="bg-[var(--error-bg)] text-[var(--error)] text-[8px] font-black uppercase tracking-widest border-none">LOW</Badge>
                                                        ) : (
                                                            <Badge variant="success" className="bg-[var(--success-bg)] text-[var(--success)] text-[8px] font-black uppercase tracking-widest border-none">OPTIMAL</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            }
                                        />
                                    );
                                })}
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}
