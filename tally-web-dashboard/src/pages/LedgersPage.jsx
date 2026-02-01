import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import './LedgersPage.css';

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
        return <div className="page-3d__empty"><p>Please select a company first</p></div>;
    }

    return (
        <div className="page-3d ledgers-3d">
            {/* Header */}
            <header className="ledgers-3d__header">
                <div className="ledgers-3d__header-info">
                    <h1 className="page-3d__title">
                        <span className="page-3d__title-icon">👥</span>
                        Parties
                    </h1>
                    <p className="page-3d__subtitle">
                        Total Outstanding: {formatCurrency(stats.total)}
                    </p>
                </div>
            </header>

            {/* Stats Row */}
            <div className="ledgers-3d__stats">
                <button
                    onClick={() => setViewMode('all')}
                    className={`ledgers-3d__stat-btn ${viewMode === 'all' ? 'active' : ''}`}
                >
                    <span className="ledgers-3d__stat-value">{stats.count}</span>
                    <span className="ledgers-3d__stat-label">Total Parties</span>
                </button>
                <button
                    onClick={() => setViewMode('debit')}
                    className={`ledgers-3d__stat-btn ${viewMode === 'debit' ? 'active green' : ''}`}
                >
                    <span className="ledgers-3d__stat-value green">{formatCurrency(stats.debit)}</span>
                    <span className="ledgers-3d__stat-label">Receivable</span>
                </button>
                <button
                    onClick={() => setViewMode('credit')}
                    className={`ledgers-3d__stat-btn ${viewMode === 'credit' ? 'active red' : ''}`}
                >
                    <span className="ledgers-3d__stat-value red">{formatCurrency(stats.credit)}</span>
                    <span className="ledgers-3d__stat-label">Payable</span>
                </button>
            </div>

            {/* Group Filters */}
            <div className="page-3d__filters">
                {groupFilters.map(filter => (
                    <button
                        key={filter.key}
                        onClick={() => setSelectedGroup(filter.key)}
                        className={`page-3d__filter-btn ${selectedGroup === filter.key ? 'active' : ''}`}
                    >
                        <span>{filter.icon}</span>
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="page-3d__search">
                <span className="page-3d__search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search party name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="page-3d__search-input"
                />
            </div>

            {/* Ledger List */}
            {loading ? (
                <div className="page-3d__loading">
                    <div className="page-3d__spinner" />
                    <p>Loading parties...</p>
                </div>
            ) : (
                <div className="page-3d__list">
                    {filteredLedgers.map(ledger => {
                        const isDebit = ledger.closing_balance > 0;
                        const balance = Math.abs(ledger.closing_balance || 0);

                        return (
                            <Link
                                key={ledger.id}
                                to={`/ledgers/${ledger.id}`}
                                className="page-3d__list-card"
                            >
                                <div className="page-3d__list-left">
                                    <div className={`page-3d__list-avatar ${isDebit ? 'green' : 'red'}`}>
                                        {ledger.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="page-3d__list-info">
                                        <span className="page-3d__list-name">{ledger.name}</span>
                                        <span className="page-3d__list-meta">
                                            {ledger.parent_group || 'General'}
                                            {ledger.phone && ` • ${ledger.phone}`}
                                        </span>
                                    </div>
                                </div>
                                <div className="page-3d__list-right">
                                    <span className={`page-3d__list-amount ${isDebit ? 'credit' : 'debit'}`}>
                                        {formatCurrency(balance)}
                                    </span>
                                    <span className={`page-3d__list-badge ${isDebit ? 'green' : 'red'}`}>
                                        {isDebit ? 'Dr' : 'Cr'}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                    {filteredLedgers.length === 0 && (
                        <div className="page-3d__empty">
                            <span className="page-3d__empty-icon">👤</span>
                            <p className="page-3d__empty-text">No parties found</p>
                            <p className="page-3d__empty-hint">Try adjusting the filters</p>
                        </div>
                    )}
                </div>
            )}

            {/* FAB */}
            <button className="page-3d__fab">➕</button>
        </div>
    );
}
