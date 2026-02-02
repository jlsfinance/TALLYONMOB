import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stockApi } from '@/lib/supabase';
import { Package, Search, AlertTriangle, Grid, List } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';

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

        setLoading(false);
    };

    const loadGroups = async () => {
        const { data } = await stockApi.getGroups(selectedCompany.id);
        setGroups(data || []);
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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Stock Items</h1>
                    <p className="text-gray-500 mt-1">{stats.totalItems} items in inventory</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-3 rounded-xl border transition-all ${viewMode === 'grid' ? 'bg-white text-black border-transparent' : 'bg-[#121214] text-gray-400 border-white/10'}`}
                    >
                        <Grid size={18} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-3 rounded-xl border transition-all ${viewMode === 'list' ? 'bg-white text-black border-transparent' : 'bg-[#121214] text-gray-400 border-white/10'}`}
                    >
                        <List size={18} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <MetricCard title="Total Items" value={stats.totalItems.toString()} icon={<Package size={20} />} color="blue" />
                <MetricCard title="Total Value" value={formatCurrency(stats.totalValue)} icon={<Package size={20} />} color="green" />
                <MetricCard title="Low Stock" value={stats.lowStock.toString()} icon={<AlertTriangle size={20} />} color="orange" />
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    placeholder="Search item name or group..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#121214] border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/20"
                />
            </div>

            {/* Group Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                    onClick={() => setSelectedGroup('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border whitespace-nowrap ${selectedGroup === 'all' ? 'bg-white text-black border-transparent' : 'bg-[#121214] text-gray-400 border-white/10'}`}
                >
                    All Items
                </button>
                {groups.slice(0, 5).map((group: string) => (
                    <button
                        key={group}
                        onClick={() => setSelectedGroup(group)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border whitespace-nowrap ${selectedGroup === group ? 'bg-white text-black border-transparent' : 'bg-[#121214] text-gray-400 border-white/10'}`}
                    >
                        {group}
                    </button>
                ))}
            </div>

            {/* Stock List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-500">Loading inventory...</p>
                </div>
            ) : filteredStock.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                    <Package size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="font-medium">No stock items found</p>
                    <p className="text-sm">Try adjusting filters</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredStock.map((item: any) => {
                        const isLowStock = (item.closing_balance || 0) < 10;
                        return (
                            <GlassCard key={item.id} className="p-5 flex flex-col">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border mb-4 ${isLowStock ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                                    <Package size={24} />
                                </div>
                                <h3 className="font-semibold text-white text-sm mb-1 truncate">{item.name}</h3>
                                <p className="text-xs text-gray-500 mb-4 truncate">{item.stock_group || 'General'}</p>

                                <div className="mt-auto flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Qty</p>
                                        <p className={`font-semibold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Value</p>
                                        <p className="font-semibold text-emerald-400">{formatCurrency(item.closing_value)}</p>
                                    </div>
                                </div>

                                {isLowStock && (
                                    <div className="mt-3 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                                        <span className="text-[10px] font-bold text-red-400">LOW STOCK</span>
                                    </div>
                                )}
                            </GlassCard>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredStock.map((item: any) => {
                        const isLowStock = (item.closing_balance || 0) < 10;
                        return (
                            <GlassCard key={item.id} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${isLowStock ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                                        <Package size={20} />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-white">{item.name}</p>
                                        <p className="text-xs text-gray-500">{item.stock_group || 'General'}</p>
                                    </div>
                                </div>
                                <div className="text-right flex items-center gap-6">
                                    <div>
                                        <p className={`font-semibold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </p>
                                        <p className="text-xs text-gray-500">Qty</p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-emerald-400">{formatCurrency(item.closing_value)}</p>
                                        <p className="text-xs text-gray-500">Value</p>
                                    </div>
                                </div>
                            </GlassCard>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
