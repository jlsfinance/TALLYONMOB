import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { stockApi } from '../lib/supabase';
import { Link } from 'react-router-dom';
import '../styles/Material3.css';

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
        return (
            <div className="page-m3">
                <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                    Please select a company first
                </div>
            </div>
        );
    }

    return (
        <div className="page-m3">
            <header className="page-m3__header">
                <div className="page-m3__header-content">
                    <div>
                        <h1 className="page-m3__title">Stock Items</h1>
                        <p className="page-m3__subtitle">{stats.totalItems} items in inventory</p>
                    </div>
                </div>
            </header>



            {/* Controls Section */}
            <div className="page-m3__controls" style={{ marginTop: '24px' }}>
                <div className="page-m3__search-bar">
                    <span className="page-m3__search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Search item name or group..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="page-m3__search-input"
                    />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        className="page-m3__icon-button"
                        title={viewMode === 'grid' ? "List View" : "Grid View"}
                    >
                        {viewMode === 'grid' ? '📄' : 'grid_view'}
                    </button>
                    <button className="page-m3__icon-button">
                        filter_list
                    </button>
                </div>
            </div>

            {/* Group Filter Pills */}
            <div className="page-m3__filter-chips" style={{ marginTop: '16px' }}>
                <button
                    onClick={() => setSelectedGroup('all')}
                    className={`page-m3__chip ${selectedGroup === 'all' ? 'page-m3__chip--active' : ''}`}
                >
                    All Items
                </button>
                {groups.slice(0, 5).map(group => (
                    <button
                        key={group}
                        onClick={() => setSelectedGroup(group)}
                        className={`page-m3__chip ${selectedGroup === group ? 'page-m3__chip--active' : ''}`}
                    >
                        {group}
                    </button>
                ))}
            </div>

            {/* Stock Items List/Grid */}
            <div style={{ marginTop: '24px', paddingBottom: '80px' }}>
                {loading ? (
                    <div className="page-m3__loading">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                        <p>Loading inventory...</p>
                    </div>
                ) : filteredStock.length === 0 ? (
                    <div className="page-m3__empty-state">
                        <div style={{ fontSize: '48px' }}>📦</div>
                        <p>No stock items found</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                        {filteredStock.map(item => {
                            const isLowStock = (item.closing_balance || 0) < 10;
                            return (
                                <div key={item.id} className="page-m3__card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '12px',
                                        background: isLowStock ? '#fee2e2' : '#f3f4f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '24px',
                                        marginBottom: '12px'
                                    }}>
                                        📦
                                    </div>
                                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1f2937', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.name}
                                    </h3>
                                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.stock_group || 'General'}
                                    </p>

                                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                        <div>
                                            <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold' }}>Qty</p>
                                            <p style={{ fontSize: '14px', fontWeight: '600', color: isLowStock ? '#dc2626' : '#374151' }}>
                                                {formatQuantity(item.closing_balance, item.base_unit)}
                                            </p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 'bold' }}>Val</p>
                                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#059669' }}>
                                                {formatCurrency(item.closing_value)}
                                            </p>
                                        </div>
                                    </div>

                                    {isLowStock && (
                                        <div style={{ marginTop: '8px', padding: '4px 8px', background: '#fee2e2', borderRadius: '4px', color: '#dc2626', fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>
                                            Low Stock
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="page-m3__list">
                        {filteredStock.map(item => {
                            const isLowStock = (item.closing_balance || 0) < 10;
                            return (
                                <div key={item.id} className="page-m3__list-item" style={{ display: 'flex', alignItems: 'center', padding: '12px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '8px',
                                        background: isLowStock ? '#fee2e2' : '#f3f4f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px',
                                        marginRight: '16px'
                                    }}>
                                        📦
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
                                        <p style={{ fontSize: '12px', color: '#6b7280' }}>{item.stock_group || 'General'}</p>
                                    </div>
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                        <span style={{ fontWeight: '600', fontSize: '14px', color: isLowStock ? '#dc2626' : '#1f2937' }}>
                                            {formatQuantity(item.closing_balance, item.base_unit)}
                                        </span>
                                        <span style={{ fontSize: '12px', color: '#059669', fontWeight: '500' }}>
                                            {formatCurrency(item.closing_value)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Floating Action Button */}
            <Link to="/invoice/create" className="page-m3__fab" title="Create Invoice">
                <span>+</span>
            </Link>
        </div>
    );
}


