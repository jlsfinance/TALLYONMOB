import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import '../styles/Material3.css';

export default function DashboardPage() {
    const { selectedCompany } = useAuth();
    const [stats, setStats] = useState({
        sales: 0,
        salesCount: 0,
        purchases: 0,
        purchasesCount: 0,
        receipts: 0,
        receiptsCount: 0,
        payments: 0,
        paymentsCount: 0,
        receivables: 0,
        payables: 0
    });
    const [recentVouchers, setRecentVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState({ pending: false, lastSync: null });
    const [period, setPeriod] = useState('This Year');
    const [dateRange, setDateRange] = useState({
        start: format(startOfYear(new Date()), 'yyyy-MM-dd'),
        end: format(endOfYear(new Date()), 'yyyy-MM-dd')
    });

    useEffect(() => {
        if (selectedCompany) loadDashboardData();
    }, [selectedCompany, dateRange]);

    const handlePeriodChange = (p) => {
        setPeriod(p);
        const today = new Date();
        let start = dateRange.start;
        let end = dateRange.end;

        if (p === 'Today') {
            start = format(today, 'yyyy-MM-dd');
            end = format(today, 'yyyy-MM-dd');
        } else if (p === 'This Month') {
            start = format(startOfMonth(today), 'yyyy-MM-dd');
            end = format(endOfMonth(today), 'yyyy-MM-dd');
        } else if (p === 'This Year') {
            start = format(startOfYear(today), 'yyyy-MM-dd');
            end = format(endOfYear(today), 'yyyy-MM-dd');
        } else if (p === 'Last 30 Days') {
            start = format(subDays(today, 30), 'yyyy-MM-dd');
            end = format(today, 'yyyy-MM-dd');
        }

        if (p !== 'Custom') {
            setDateRange({ start, end });
        }
    };

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const { data: dbStats, error: rpcErr } = await supabase.rpc('get_dashboard_stats', {
                p_company_id: selectedCompany.id,
                p_start_date: dateRange.start,
                p_end_date: dateRange.end
            });

            if (rpcErr) throw rpcErr;

            const totalReceipts = dbStats.receipts_total || 0;
            const totalPayments = dbStats.payments_total || 0;

            const { data: debtors } = await supabase.from('ledgers')
                .select('closing_balance')
                .eq('company_id', selectedCompany.id)
                .ilike('parent_group', '%Sundry Debtors%');

            const { data: creditors } = await supabase.from('ledgers')
                .select('closing_balance')
                .eq('company_id', selectedCompany.id)
                .ilike('parent_group', '%Sundry Creditors%');

            const totalReceivables = debtors?.reduce((sum, l) => sum + (l.closing_balance || 0), 0) || 0;
            const totalPayables = creditors?.reduce((sum, l) => sum + (l.closing_balance || 0), 0) || 0;

            setStats({
                sales: dbStats.sales_total || 0,
                salesGross: dbStats.sales_gross || 0,
                salesTaxable: dbStats.sales_taxable || 0,
                salesCount: dbStats.sales_count || 0,

                purchases: dbStats.purchases_total || 0,
                purchasesGross: dbStats.purchases_gross || 0,
                purchasesTaxable: dbStats.purchases_taxable || 0,
                purchasesCount: dbStats.purchases_count || 0,

                receipts: totalReceipts,
                receiptsCount: dbStats.receipts_count || 0,
                payments: totalPayments,
                paymentsCount: dbStats.payments_count || 0,
                receivables: Math.abs(totalReceivables),
                payables: Math.abs(totalPayables)
            });

            setSyncStatus({
                pending: false,
                lastSync: selectedCompany.last_sync_at
            });

            const { data: recent } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', dateRange.start)
                .lte('voucher_date', dateRange.end)
                .order('voucher_date', { ascending: false })
                .limit(10);

            setRecentVouchers(recent || []);
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };

    if (!selectedCompany) return null;

    return (
        <div className="page-m3">
            {/* Header Section */}
            <header className="page-m3__header">
                <div>
                    <h1 className="page-m3__title">
                        <span>📊</span> Dashboard
                    </h1>
                    <p className="page-m3__subtitle">{selectedCompany.name}</p>
                </div>
                {syncStatus.lastSync && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        Synced {formatDistanceToNow(new Date(syncStatus.lastSync))} ago
                    </div>
                )}
            </header>

            {/* Period Filter */}
            <div className="page-m3__filter-chips" style={{ marginBottom: '24px' }}>
                {['Today', 'This Month', 'Last 30 Days', 'This Year', 'Custom'].map((p) => (
                    <button
                        key={p}
                        onClick={() => handlePeriodChange(p)}
                        className={`page-m3__chip ${period === p ? 'page-m3__chip--active' : ''}`}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p>Loading analytics...</p>
                </div>
            ) : (
                <>
                    {/* Sync Flow Banner */}
                    <div style={{ marginBottom: '20px' }}>
                        <Link to="/landing" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px', background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                            borderRadius: '16px', color: 'white', textDecoration: 'none',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                                    <span style={{ fontSize: '20px' }}>✨</span> Visual Sync Flow
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                    See how your data moves from Tally PC to Mobile
                                </p>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' }}>
                                View 3D →
                            </div>
                        </Link>
                    </div>

                    {/* KPI Cards */}
                    <div className="page-m3__stats-grid" style={{ marginBottom: '24px' }}>
                        <Link to="/sales" className="page-m3__stat-card" style={{ textDecoration: 'none' }}>
                            <div className="page-m3__stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>📈</div>
                            <div>
                                <p className="page-m3__stat-value">{formatCurrency(stats.sales)}</p>
                                <p className="page-m3__stat-label">Total Sales</p>
                            </div>
                        </Link>
                        <Link to="/purchases" className="page-m3__stat-card" style={{ textDecoration: 'none' }}>
                            <div className="page-m3__stat-icon" style={{ background: '#f3e8ff', color: '#7e22ce' }}>🛒</div>
                            <div>
                                <p className="page-m3__stat-value" style={{ color: '#7e22ce' }}>{formatCurrency(stats.purchases)}</p>
                                <p className="page-m3__stat-label">Total Purchases</p>
                            </div>
                        </Link>
                        <Link to="/ledgers" className="page-m3__stat-card" style={{ textDecoration: 'none' }}>
                            <div className="page-m3__stat-icon" style={{ background: '#e0f2f1', color: '#0f766e' }}>💰</div>
                            <div>
                                <p className="page-m3__stat-value" style={{ color: '#0f766e' }}>{formatCurrency(stats.receivables)}</p>
                                <p className="page-m3__stat-label">Receivables</p>
                            </div>
                        </Link>
                        <Link to="/ledgers" className="page-m3__stat-card" style={{ textDecoration: 'none' }}>
                            <div className="page-m3__stat-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>📤</div>
                            <div>
                                <p className="page-m3__stat-value" style={{ color: '#b91c1c' }}>{formatCurrency(stats.payables)}</p>
                                <p className="page-m3__stat-label">Payables</p>
                            </div>
                        </Link>
                    </div>

                    {/* Quick Access */}
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>Quick Access</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '32px' }}>
                        <Link to="/create-invoice" className="page-m3__card" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '8px' }}>
                            <span style={{ fontSize: '24px' }}>📝</span>
                            <span style={{ fontSize: '12px', fontWeight: '500' }}>Invoice</span>
                        </Link>
                        <Link to="/vouchers" className="page-m3__card" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '8px' }}>
                            <span style={{ fontSize: '24px' }}>📖</span>
                            <span style={{ fontSize: '12px', fontWeight: '500' }}>Day Book</span>
                        </Link>
                        <Link to="/stock" className="page-m3__card" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '8px' }}>
                            <span style={{ fontSize: '24px' }}>📦</span>
                            <span style={{ fontSize: '12px', fontWeight: '500' }}>Stock</span>
                        </Link>
                    </div>

                    {/* Recent Transactions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>Recent</h3>
                        <Link to="/vouchers" style={{ fontSize: '14px', color: '#1b5e20', fontWeight: '500', textDecoration: 'none' }}>View All →</Link>
                    </div>

                    <div className="page-m3__list">
                        {recentVouchers.map(v => (
                            <Link
                                key={v.id}
                                to={`/vouchers/${v.id}`}
                                className="page-m3__list-item"
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: v.voucher_type === 'Sales' ? '#ecfdf5' :
                                            v.voucher_type === 'Receipt' ? '#eff6ff' :
                                                v.voucher_type === 'Payment' ? '#fee2e2' : '#f3f4f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px'
                                    }}>
                                        {v.voucher_type === 'Sales' ? '📈' :
                                            v.voucher_type === 'Receipt' ? '💰' :
                                                v.voucher_type === 'Purchase' ? '🛒' : '📝'}
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: '600', color: '#1f2937' }}>{v.party_name || 'Cash'}</p>
                                        <p style={{ fontSize: '11px', color: '#6b7280' }}>
                                            {formatDate(v.voucher_date)} • #{v.voucher_number}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{
                                        fontWeight: 'bold',
                                        color: (v.voucher_type === 'Receipt' || v.voucher_type === 'Sales') ? '#059669' : '#1f2937',
                                        fontSize: '14px'
                                    }}>
                                        {formatCurrency(Math.abs(v.total_amount || 0))}
                                    </p>
                                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>{v.voucher_type}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

