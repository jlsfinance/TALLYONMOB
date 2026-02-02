import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '../lib/supabase';
import '../styles/Material3.css';

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
        { key: 'Credit Note', label: 'Cr Note', icon: '️📝' },
        { key: 'Debit Note', label: 'Dr Note', icon: '📝' },
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
            'Sales': { color: '', icon: '📈', badgeBackground: '#e8f5e9', badgeColor: '#1b5e20' }, // Green
            'Purchase': { color: 'purple', icon: '🛒', badgeBackground: '#f3e5f5', badgeColor: '#4a148c' }, // Purple
            'Receipt': { color: 'blue', icon: '💰', badgeBackground: '#e3f2fd', badgeColor: '#0d47a1' }, // Blue
            'Payment': { color: 'red', icon: '💸', badgeBackground: '#ffebee', badgeColor: '#b71c1c' }, // Red
            'Journal': { color: 'orange', icon: '📖', badgeBackground: '#fff3e0', badgeColor: '#e65100' }, // Orange
            'Contra': { color: 'blue', icon: '🔄', badgeBackground: '#e3f2fd', badgeColor: '#0d47a1' },
            'Debit Note': { color: 'orange', icon: '📋', badgeBackground: '#fff3e0', badgeColor: '#e65100' },
            'Credit Note': { color: 'purple', icon: '📋', badgeBackground: '#f3e5f5', badgeColor: '#4a148c' },
        };
        return styles[type] || { color: 'black', icon: '📝', badgeBackground: '#f5f5f5', badgeColor: '#212121' };
    };

    const filteredVouchers = vouchers.filter(v =>
        v.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) {
        return (
            <div className="page-m3" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <p>Please select a company</p>
            </div>
        );
    }

    return (
        <div className="page-m3">
            {/* Header */}
            <header className="page-m3__header">
                <h1 className="page-m3__title">
                    <span style={{ marginRight: '8px' }}>📖</span> Day Book
                </h1>
                <p className="page-m3__subtitle">{filteredVouchers.length} entries found</p>
            </header>



            {/* Voucher Type Filters */}
            <div className="page-m3__filter-chips" style={{ marginTop: '16px', padding: '0 4px' }}>
                {voucherTypes.map((type) => (
                    <button
                        key={type.key}
                        onClick={() => setSelectedType(type.key)}
                        className={`page-m3__chip ${selectedType === type.key ? 'page-m3__chip--active' : ''}`}
                    >
                        <span style={{ marginRight: '4px' }}>{type.icon}</span>
                        {type.label}
                    </button>
                ))}
            </div>

            {/* Month Filter */}
            <div className="page-m3__filter-chips" style={{ marginTop: '12px', padding: '0 4px', overflowX: 'auto', flexWrap: 'nowrap' }}>
                {monthStats.map((ms, idx) => {
                    const isActive = fromDate === ms.start && toDate === ms.end;
                    return (
                        <button
                            key={idx}
                            onClick={() => {
                                setFromDate(ms.start);
                                setToDate(ms.end);
                            }}
                            className={`page-m3__chip ${isActive ? 'page-m3__chip--active' : ''}`}
                            style={{
                                flexDirection: 'column',
                                height: 'auto',
                                padding: '8px 16px',
                                alignItems: 'center',
                                minWidth: '80px'
                            }}
                        >
                            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{ms.name}</span>
                            <span style={{ fontSize: '10px', opacity: 0.8 }}>{formatCurrency(ms.total)}</span>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="page-m3__search-bar" style={{ marginTop: '16px' }}>
                <span className="page-m3__search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search party or voucher number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="page-m3__search-input"
                />
            </div>

            {/* Voucher List */}
            {loading ? (
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700 mb-2"></div>
                    <p>Loading vouchers...</p>
                </div>
            ) : (
                <div className="page-m3__list" style={{ marginTop: '16px' }}>
                    {filteredVouchers.map(v => {
                        const style = getVoucherStyle(v.voucher_type);
                        const isPending = v.is_pending;
                        return (
                            <Link
                                key={v.voucher_id}
                                to={isPending ? '#' : `/vouchers/${encodeURIComponent(v.voucher_id)}`}
                                className={`page-m3__list-item ${v.is_deleted ? 'opacity-50' : ''}`}
                                onClick={e => isPending && e.preventDefault()}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isPending ? 'default' : 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: isPending ? '#fff3e0' : style.badgeBackground,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px'
                                    }}>
                                        {v.is_deleted ? '🗑️' : (isPending ? '⏳' : style.icon)}
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: '600', color: '#1f2937' }}>
                                            {v.party_name || 'Cash / Unknown'}
                                            {v.is_deleted && <span style={{ color: '#ef4444', fontSize: '10px', marginLeft: '4px' }}>(Deleted)</span>}
                                        </p>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '10px',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: style.badgeBackground,
                                                color: style.badgeColor,
                                                fontWeight: 'bold'
                                            }}>
                                                {v.voucher_type}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#6b7280' }}>
                                                #{v.voucher_number} • {formatDate(v.voucher_date)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{
                                        fontWeight: 'bold',
                                        color: style.color === 'red' ? '#d32f2f' : style.color === 'blue' ? '#0d47a1' : '#1b5e20',
                                        fontSize: '14px'
                                    }}>
                                        {formatCurrency(Math.abs(v.total_amount || 0))}
                                    </p>
                                    {isPending && <p style={{ color: '#f57c00', fontSize: '10px', fontWeight: 'bold' }}>Sync Pending</p>}
                                </div>
                            </Link>
                        );
                    })}
                    {filteredVouchers.length === 0 && (
                        <div className="page-m3__empty-state">
                            <p style={{ fontSize: '32px', marginBottom: '8px' }}>📭</p>
                            <p>No vouchers found</p>
                            <p style={{ fontSize: '12px', opacity: 0.7 }}>Try adjusting the filter</p>
                        </div>
                    )}
                </div>
            )}

            {/* FAB */}
            <Link to="/invoice/create" className="page-m3__fab" title="New Invoice">
                <span className="material-icons">+</span>
            </Link>
        </div>
    );
}
