import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { stockApi } from '../lib/supabase';
import { Link } from 'react-router-dom';

export default function StockPage() {
    const { selectedCompany } = useAuth();
    const [stockItems, setStockItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [groups, setGroups] = useState([]);
    const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, lowStock: 0 });
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

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

        // Calculate stats
        const all = data || [];
        setStats({
            totalItems: all.length,
            totalValue: all.reduce((s, item) => s + (item.closing_value || 0), 0),
            lowStock: all.filter(item => (item.closing_balance || 0) < 10).length
        });

        setLoading(false);
    };

    const loadGroups = async () => {
        const { data } = await stockApi.getGroups(selectedCompany.id);
        setGroups(data || []);
    };

    const formatCurrency = (amount) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absAmount);
    };

    const formatQuantity = (qty, unit) => {
        if (!qty && qty !== 0) return '-';
        return `${qty.toFixed(qty % 1 === 0 ? 0 : 2)} ${unit || ''}`.trim();
    };

    const filteredStock = stockItems.filter(item =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.stock_group?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="space-y-4 pb-20 lg:pb-0">
            {/* Header with Stats */}
            <div className="bg-gradient-to-br from-orange-500 via-amber-600 to-yellow-600 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-yellow-300/30 to-orange-300/30 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-br from-amber-300/30 to-red-300/30 rounded-full blur-3xl"></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-white text-xl font-bold">Stock Items</h1>
                            <p className="text-white/60 text-sm">{stats.totalItems} items in inventory</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                                className="p-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition"
                            >
                                {viewMode === 'grid' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                )}
                            </button>
                            <button className="p-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-3 bg-white/10 rounded-xl">
                            <p className="text-white font-bold text-lg">{stats.totalItems}</p>
                            <p className="text-white/40 text-[10px]">Total Items</p>
                        </div>
                        <div className="text-center p-3 bg-white/10 rounded-xl">
                            <p className="text-yellow-200 font-bold text-lg">{formatCurrency(stats.totalValue)}</p>
                            <p className="text-white/40 text-[10px]">Stock Value</p>
                        </div>
                        <div className="text-center p-3 bg-white/10 rounded-xl">
                            <p className="text-red-300 font-bold text-lg">{stats.lowStock}</p>
                            <p className="text-white/40 text-[10px]">Low Stock</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Group Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                <button
                    onClick={() => setSelectedGroup('all')}
                    className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedGroup === 'all'
                            ? 'bg-orange-500 text-white shadow-lg scale-105'
                            : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
                        }`}
                >
                    📦 All Items
                </button>
                {groups.slice(0, 5).map(group => (
                    <button
                        key={group}
                        onClick={() => setSelectedGroup(group)}
                        className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedGroup === group
                                ? 'bg-orange-500 text-white shadow-lg scale-105'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
                            }`}
                    >
                        {group}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search item name or group..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            {/* Stock Items */}
            {loading ? (
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                            <div className="h-12 bg-gray-200 rounded-xl mb-3"></div>
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                    ))}
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3">
                    {filteredStock.map(item => {
                        const isLowStock = (item.closing_balance || 0) < 10;
                        return (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all group"
                            >
                                <div className={`w-full h-16 rounded-xl flex items-center justify-center text-3xl mb-3 ${isLowStock ? 'bg-red-50' : 'bg-gradient-to-br from-orange-50 to-amber-50'
                                    }`}>
                                    📦
                                </div>
                                <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-orange-600 transition-colors">
                                    {item.name}
                                </p>
                                <p className="text-[10px] text-gray-500 truncate">{item.stock_group || 'General'}</p>

                                <div className="flex justify-between items-end mt-3">
                                    <div>
                                        <p className="text-[10px] text-gray-400">Qty</p>
                                        <p className={`font-bold ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-400">Value</p>
                                        <p className="font-bold text-orange-600 text-sm">
                                            {formatCurrency(item.closing_value)}
                                        </p>
                                    </div>
                                </div>

                                {isLowStock && (
                                    <div className="mt-2 px-2 py-1 bg-red-100 text-red-600 text-[9px] rounded-full text-center font-medium">
                                        ⚠️ Low Stock
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredStock.map(item => {
                        const isLowStock = (item.closing_balance || 0) < 10;
                        return (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all group"
                            >
                                <div className="flex gap-3 items-center">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${isLowStock ? 'bg-red-50' : 'bg-gradient-to-br from-orange-50 to-amber-50'
                                        }`}>
                                        📦
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-gray-500">{item.stock_group || 'General'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-bold ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </p>
                                        <p className="text-xs text-orange-600 font-medium">
                                            {formatCurrency(item.closing_value)}
                                        </p>
                                    </div>
                                </div>

                                {isLowStock && (
                                    <div className="mt-2 flex justify-end">
                                        <span className="px-2 py-1 bg-red-100 text-red-600 text-[9px] rounded-full font-medium">
                                            ⚠️ Low Stock
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {filteredStock.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400">
                    <span className="text-5xl">📦</span>
                    <p className="mt-4 font-medium">No stock items found</p>
                    <p className="text-sm">Try adjusting the filters</p>
                </div>
            )}

            {/* Floating Action Button */}
            <button className="fixed bottom-24 lg:bottom-8 right-6 w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform z-40">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
}
