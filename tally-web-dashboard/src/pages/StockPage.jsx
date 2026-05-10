import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { stockApi } from '../lib/supabase';

export default function StockPage() {
    const { selectedCompany } = useAuth();
    const [stock, setStock] = useState([]);
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

    useEffect(() => {
        if (selectedCompany) {
            loadData();
        }
    }, [selectedCompany]);

    const loadData = async () => {
        setLoading(true);
        const [stockRes, groupRes] = await Promise.all([
            stockApi.list(selectedCompany.id),
            stockApi.getGroups(selectedCompany.id)
        ]);
        setStock(stockRes.data || []);
        setGroups(groupRes.data || []);
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatQuantity = (qty, unit) => {
        const numQty = parseFloat(qty || 0);
        return `${numQty.toLocaleString('en-IN')} ${unit || ''}`;
    };

    const filteredStock = stock.filter(s => {
        const matchesSearch = s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.hsn_code?.includes(searchTerm);
        const matchesGroup = !selectedGroup || s.stock_group === selectedGroup;
        return matchesSearch && matchesGroup;
    });

    // Calculate totals
    const totalValue = filteredStock.reduce((sum, s) => sum + (s.closing_value || 0), 0);
    const totalItems = filteredStock.length;

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Stock Items</h1>
                    <p className="text-gray-500 text-sm">Inventory management and stock levels</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-sm text-gray-500">{totalItems} items</p>
                        <p className="text-lg font-bold text-purple-600">{formatCurrency(totalValue)}</p>
                    </div>
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-white shadow' : ''}`}
                        >
                            📋
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-3 py-1 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
                        >
                            📊
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4">
                <div className="flex-1">
                    <input type="text" placeholder="Search by name or HSN code..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="">All Groups</option>
                    {groups.map(g => (<option key={g} value={g}>{g}</option>))}
                </select>
            </div>

            {/* Stock List/Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="bg-white rounded-xl p-4 shadow animate-pulse">
                            <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-32"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {/* Mobile: always show cards | Desktop: show based on viewMode */}
                    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${viewMode === 'list' ? 'md:hidden' : ''}`}>
                        {filteredStock.map(item => (
                            <div key={item.id} className="bg-white rounded-xl p-4 sm:p-5 shadow hover:shadow-lg active:bg-gray-50">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-gray-800">{item.name}</h3>
                                        <p className="text-sm text-gray-500">{item.stock_group || 'Uncategorized'}</p>
                                    </div>
                                    {item.hsn_code && (
                                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                                            HSN: {item.hsn_code}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div className="bg-blue-50 rounded-lg p-3">
                                        <p className="text-xs text-blue-600">Closing Qty</p>
                                        <p className="text-lg font-bold text-blue-700">
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-3">
                                        <p className="text-xs text-green-600">Value</p>
                                        <p className="text-lg font-bold text-green-700">
                                            {formatCurrency(item.closing_value)}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-xs text-gray-500">
                                    <div>
                                        <span>In: </span>
                                        <span className="text-green-600 font-medium">
                                            {formatQuantity(item.inward_quantity, item.base_unit)}
                                        </span>
                                    </div>
                                    <div>
                                        <span>Out: </span>
                                        <span className="text-red-600 font-medium">
                                            {formatQuantity(item.outward_quantity, item.base_unit)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table - only visible when list viewMode selected on desktop */}
                    <div className={`bg-white rounded-xl shadow overflow-hidden ${viewMode === 'list' ? 'hidden md:block' : 'hidden'}`}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Group</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">HSN</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Opening</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Inward</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Outward</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Closing</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredStock.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-800">{item.name}</p>
                                            {item.alias && <p className="text-xs text-gray-500">{item.alias}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{item.stock_group || '-'}</td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-600">{item.hsn_code || '-'}</td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            {formatQuantity(item.opening_balance, item.base_unit)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-green-600">
                                            +{formatQuantity(item.inward_quantity, item.base_unit)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-red-600">
                                            -{formatQuantity(item.outward_quantity, item.base_unit)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-purple-600">
                                            {formatCurrency(item.closing_value)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50">
                                <tr>
                                    <td colSpan="7" className="px-4 py-3 text-right font-semibold text-gray-700">
                                        Total Stock Value:
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-purple-600 text-lg">
                                        {formatCurrency(totalValue)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {filteredStock.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            <div className="text-5xl mb-4">📦</div>
                            <p>No stock items found</p>
                        </div>
                    )}
                </div>
                </>
            )}
        </div>
    );
}
