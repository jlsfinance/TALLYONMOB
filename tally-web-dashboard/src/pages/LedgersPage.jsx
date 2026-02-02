import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/Material3.css';

export default function LedgersPage() {
    const { selectedCompany } = useAuth();
    const [searchParams] = useSearchParams();
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'all');
    const [stats, setStats] = useState({ total: 0, debit: 0, credit: 0, count: 0 });
    const [viewMode, setViewMode] = useState('all');

    const groupFilters = [
        { key: 'all', label: 'All', icon: '👥' },
        { key: 'Sundry Debtors', label: 'Debtors', icon: '💰' },
        { key: 'Sundry Creditors', label: 'Creditors', icon: '📤' },
        { key: 'Bank Accounts', label: 'Banks', icon: '🏦' },
        { key: 'Cash-in-Hand', label: 'Cash', icon: '💵' },
    ];

    useEffect(() => {
        if (selectedCompany) loadLedgers();
    }, [selectedCompany, selectedGroup]);

    const loadLedgers = async () => {
        setLoading(true);
        const { data } = await ledgerApi.list(
            selectedCompany.id,
            selectedGroup !== 'all' ? selectedGroup : null
        );
        setLedgers(data || []);

        const all = data || [];
        const debitTotal = all.filter(l => l.closing_balance > 0).reduce((s, l) => s + l.closing_balance, 0);
        const creditTotal = all.filter(l => l.closing_balance < 0).reduce((s, l) => s + Math.abs(l.closing_balance), 0);

        setStats({
            total: debitTotal - creditTotal,
            debit: debitTotal,
            credit: creditTotal,
            count: all.length
        });

        setLoading(false);
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

    const filteredLedgers = ledgers.filter(l => {
        const matchesSearch = l.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesView = viewMode === 'all' ||
            (viewMode === 'debit' && l.closing_balance > 0) ||
            (viewMode === 'credit' && l.closing_balance < 0);
        return matchesSearch && matchesView;
    });

    if (!selectedCompany) {
        return (
            <div className="page-m3" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <p>Please select a company first</p>
            </div>
        );
    }

    return (
        <div className="page-m3">
            {/* Header */}
            <header className="page-m3__header">
                <h1 className="page-m3__title">
                    <span style={{ marginRight: '8px' }}>👥</span> Parties
                </h1>
                <p className="page-m3__subtitle">
                    Total Outstanding: {formatCurrency(stats.total)}
                </p>
            </header>



            {/* Group Filters */}
            <div className="page-m3__filter-chips" style={{ marginTop: '16px', padding: '0 4px', overflowX: 'auto', flexWrap: 'nowrap' }}>
                {groupFilters.map(filter => (
                    <button
                        key={filter.key}
                        onClick={() => setSelectedGroup(filter.key)}
                        className={`page-m3__chip ${selectedGroup === filter.key ? 'page-m3__chip--active' : ''}`}
                    >
                        <span style={{ marginRight: '4px' }}>{filter.icon}</span>
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="page-m3__search-bar" style={{ marginTop: '16px' }}>
                <span className="page-m3__search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search party name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="page-m3__search-input"
                />
            </div>

            {/* Ledger List */}
            {loading ? (
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p>Loading parties...</p>
                </div>
            ) : (
                <div className="page-m3__list" style={{ marginTop: '16px' }}>
                    {filteredLedgers.map(ledger => {
                        const isDebit = ledger.closing_balance > 0;
                        const balance = Math.abs(ledger.closing_balance || 0);

                        return (
                            <Link
                                key={ledger.id}
                                to={`/ledgers/${ledger.id}`}
                                className="page-m3__list-item"
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: isDebit ? '#e8f5e9' : '#ffebee',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px',
                                        color: isDebit ? '#1b5e20' : '#b71c1c'
                                    }}>
                                        {ledger.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: '600', color: '#1f2937' }}>{ledger.name}</p>
                                        <p style={{ fontSize: '11px', color: '#6b7280' }}>
                                            {ledger.parent_group || 'General'}
                                            {ledger.phone && ` • ${ledger.phone}`}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{
                                        fontWeight: 'bold',
                                        color: isDebit ? '#1b5e20' : '#d32f2f',
                                        fontSize: '14px'
                                    }}>
                                        {formatCurrency(balance)}
                                    </p>
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: isDebit ? '#e8f5e9' : '#ffebee',
                                        color: isDebit ? '#1b5e20' : '#b71c1c',
                                        fontWeight: 'bold'
                                    }}>
                                        {isDebit ? 'Receivable' : 'Payable'}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                    {filteredLedgers.length === 0 && (
                        <div className="page-m3__empty-state">
                            <p style={{ fontSize: '32px', marginBottom: '8px' }}>👤</p>
                            <p>No parties found</p>
                            <p style={{ fontSize: '12px', opacity: 0.7 }}>Try adjusting the filters</p>
                        </div>
                    )}
                </div>
            )}

            {/* FAB */}
            <button className="page-m3__fab" title="New Party">
                <span className="material-icons">+</span>
            </button>
        </div>
    );
}
