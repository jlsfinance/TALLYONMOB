import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '../lib/supabase';
import './VouchersPage.css';

export default function VouchersPage() {
    const { selectedCompany } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState(searchParams.get('status') === 'pending' ? 'pending' : (searchParams.get('type') || 'all'));
    const [fromDate, setFromDate] = useState(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [stats, setStats] = useState({ sales: 0, purchase: 0, receipt: 0, payment: 0 });
    const [monthStats, setMonthStats] = useState([]);

    const voucherTypes = [
        { key: 'all', label: 'All', icon: '📋' },
        { key: 'Sales', label: 'Sales', icon: '📈' },
        { key: 'Purchase', label: 'Purchase', icon: '🛒' },
        { key: 'Receipt', label: 'Receipt', icon: '💰' },
        { key: 'Payment', label: 'Payment', icon: '💸' },
        { key: 'Credit Note', label: 'Cr Note', icon: '📋' },
        { key: 'Debit Note', label: 'Dr Note', icon: '📋' },
        { key: 'pending', label: 'Pending', icon: '⏳' },
    ];

    useEffect(() => {
        if (selectedCompany) {
            loadVouchers();
            loadMonthStats();
        }
    }, [selectedCompany, fromDate, toDate, selectedType]);

    const loadMonthStats = async () => {
        const months = [];
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        let fyStartYear = currentMonth < 3 ? currentYear - 1 : currentYear;
        let startDate = new Date(fyStartYear, 3, 1);

        while (startDate <= today) {
            months.push({
                name: format(startDate, 'MMM'),
                year: format(startDate, 'yyyy'),
                start: format(startOfMonth(startDate), 'yyyy-MM-dd'),
                end: format(endOfMonth(startDate), 'yyyy-MM-dd'),
            });
            startDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
        }
        months.reverse();

        const statsPromises = months.map(async (m) => {
            if (selectedType === 'pending') {
                const { data } = await supabase
                    .from('pending_transactions')
                    .select('voucher_data')
                    .eq('company_id', selectedCompany.id)
                    .eq('status', 'pending')
                    .gte('created_at', `${m.start}T00:00:00`)
                    .lte('created_at', `${m.end}T23:59:59`);

                return {
                    ...m,
                    total: data?.reduce((sum, p) => sum + Math.abs(p.voucher_data?.amount || p.voucher_data?.total_amount || 0), 0) || 0
                };
            }

            let query = supabase
                .from('vouchers')
                .select('total_amount')
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', m.start)
                .lte('voucher_date', m.end);

            if (selectedType !== 'all') {
                query = query.eq('voucher_type', selectedType);
            }

            const { data } = await query;

            return {
                ...m,
                total: data?.reduce((sum, v) => sum + Math.abs(v.total_amount || 0), 0) || 0
            };
        });

        const results = await Promise.all(statsPromises);
        setMonthStats(results);
    };

    const loadVouchers = async () => {
        setLoading(true);
        let data = [];

        if (selectedType === 'pending') {
            const { data: pendingData } = await supabase
                .from('pending_transactions')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            data = (pendingData || []).map(p => ({
                voucher_id: p.id,
                voucher_type: p.transaction_type === 'VOUCHER' ? (p.voucher_data?.voucher_type || 'Sales') : p.transaction_type,
                voucher_number: 'PENDING',
                voucher_date: p.created_at,
                party_name: p.voucher_data?.party_ledger_name || p.voucher_data?.party_name || p.voucher_data?.ledger_name || 'App Created',
                total_amount: p.voucher_data?.amount || p.voucher_data?.total_amount || 0,
                narration: p.voucher_data?.narration || 'Pending Sync to Tally',
                is_pending: true,
                status: p.status
            }));
        } else {
            const { data: vData } = await supabase.from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .eq(selectedType !== 'all' ? 'voucher_type' : 'company_id', selectedType !== 'all' ? selectedType : selectedCompany.id)
                .order('voucher_date', { ascending: false });
            data = vData || [];
        }
        setVouchers(data || []);

        const allVouchers = data || [];
        setStats({
            sales: allVouchers.filter(v => v.voucher_type === 'Sales').reduce((s, v) => s + Math.abs(v.total_amount || 0), 0),
            purchase: allVouchers.filter(v => v.voucher_type === 'Purchase').reduce((s, v) => s + Math.abs(v.total_amount || 0), 0),
            receipt: allVouchers.filter(v => v.voucher_type === 'Receipt').reduce((s, v) => s + Math.abs(v.total_amount || 0), 0),
            payment: allVouchers.filter(v => v.voucher_type === 'Payment').reduce((s, v) => s + Math.abs(v.total_amount || 0), 0),
        });

        setLoading(false);
    };

    const formatCurrency = (amount) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };

    const getVoucherStyle = (type) => {
        const styles = {
            'Sales': { color: 'green', icon: '📈' },
            'Purchase': { color: 'purple', icon: '🛒' },
            'Receipt': { color: 'blue', icon: '💰' },
            'Payment': { color: 'red', icon: '💸' },
            'Journal': { color: 'orange', icon: '📖' },
            'Contra': { color: 'blue', icon: '🔄' },
            'Debit Note': { color: 'orange', icon: '📋' },
            'Credit Note': { color: 'purple', icon: '📋' },
        };
        return styles[type] || { color: 'default', icon: '📝' };
    };

    const filteredVouchers = vouchers.filter(v =>
        v.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) {
        return <div className="page-3d__empty"><p>Please select a company first</p></div>;
    }

    return (
        <div className="page-3d vouchers-3d">
            {/* Header */}
            <header className="vouchers-3d__header">
                <div className="vouchers-3d__header-info">
                    <h1 className="page-3d__title">
                        <span className="page-3d__title-icon">📖</span>
                        Day Book
                    </h1>
                    <p className="page-3d__subtitle">{filteredVouchers.length} entries found</p>
                </div>
            </header>

            {/* Stats Row */}
            <div className="vouchers-3d__stats">
                <div className="vouchers-3d__stat-card">
                    <span className="vouchers-3d__stat-value green">{formatCurrency(stats.sales)}</span>
                    <span className="vouchers-3d__stat-label">Sales</span>
                </div>
                <div className="vouchers-3d__stat-card">
                    <span className="vouchers-3d__stat-value purple">{formatCurrency(stats.purchase)}</span>
                    <span className="vouchers-3d__stat-label">Purchase</span>
                </div>
                <div className="vouchers-3d__stat-card">
                    <span className="vouchers-3d__stat-value blue">{formatCurrency(stats.receipt)}</span>
                    <span className="vouchers-3d__stat-label">Receipt</span>
                </div>
                <div className="vouchers-3d__stat-card">
                    <span className="vouchers-3d__stat-value red">{formatCurrency(stats.payment)}</span>
                    <span className="vouchers-3d__stat-label">Payment</span>
                </div>
            </div>

            {/* Voucher Type Filters */}
            <div className="page-3d__filters">
                {voucherTypes.map((type) => (
                    <button
                        key={type.key}
                        onClick={() => setSelectedType(type.key)}
                        className={`page-3d__filter-btn ${selectedType === type.key ? 'active' : ''}`}
                    >
                        <span>{type.icon}</span>
                        {type.label}
                    </button>
                ))}
            </div>

            {/* Month Filter */}
            <div className="vouchers-3d__month-filter">
                {monthStats.map((ms, idx) => {
                    const isActive = fromDate === ms.start && toDate === ms.end;
                    return (
                        <button
                            key={idx}
                            onClick={() => {
                                setFromDate(ms.start);
                                setToDate(ms.end);
                            }}
                            className={`vouchers-3d__month-btn ${isActive ? 'active' : ''}`}
                        >
                            <span className="vouchers-3d__month-name">{ms.name}</span>
                            <span className="vouchers-3d__month-total">{formatCurrency(ms.total)}</span>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="page-3d__search">
                <span className="page-3d__search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search party or voucher number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="page-3d__search-input"
                />
            </div>

            {/* Voucher List */}
            {loading ? (
                <div className="page-3d__loading">
                    <div className="page-3d__spinner" />
                    <p>Loading vouchers...</p>
                </div>
            ) : (
                <div className="page-3d__list">
                    {filteredVouchers.map(v => {
                        const style = getVoucherStyle(v.voucher_type);
                        const isPending = v.is_pending;
                        return (
                            <Link
                                key={v.voucher_id}
                                to={isPending ? '#' : `/vouchers/${encodeURIComponent(v.voucher_id)}`}
                                className={`page-3d__list-card ${v.is_deleted ? 'deleted' : ''} ${isPending ? 'pending' : ''}`}
                                onClick={e => isPending && e.preventDefault()}
                            >
                                <div className="page-3d__list-left">
                                    <div className={`page-3d__list-avatar ${isPending ? 'warning' : style.color}`}>
                                        {v.is_deleted ? '🗑️' : (isPending ? '⏳' : style.icon)}
                                    </div>
                                    <div className="page-3d__list-info">
                                        <span className={`page-3d__list-name ${v.is_deleted ? 'deleted' : ''}`}>
                                            {v.party_name || 'Cash / Unknown'}
                                            {v.is_deleted && <span className="vouchers-3d__deleted-tag">Deleted</span>}
                                            {isPending && <span className="vouchers-3d__pending-tag">Pending Sync</span>}
                                        </span>
                                        <span className="page-3d__list-meta">
                                            #{v.voucher_number} • {formatDate(v.voucher_date)}
                                        </span>
                                        {v.narration && (
                                            <span className="vouchers-3d__narration">{v.narration}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="page-3d__list-right">
                                    <span className={`page-3d__list-amount ${isPending ? 'warning' : style.color}`}>
                                        {formatCurrency(Math.abs(v.total_amount || 0))}
                                    </span>
                                    <span className={`page-3d__list-badge ${isPending ? 'warning' : style.color}`}>
                                        {v.voucher_type}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                    {filteredVouchers.length === 0 && (
                        <div className="page-3d__empty">
                            <span className="page-3d__empty-icon">📭</span>
                            <p className="page-3d__empty-text">No vouchers found</p>
                            <p className="page-3d__empty-hint">Try adjusting the date range or filters</p>
                        </div>
                    )}
                </div>
            )}

            {/* FAB */}
            <Link to="/create-invoice" className="page-3d__fab">➕</Link>
        </div>
    );
}
