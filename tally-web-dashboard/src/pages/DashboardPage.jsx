import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { GlassCard, KPICard, ProgressRing, BarChart3D } from '../components/3d';
import './DashboardPage.css';

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

            const totalSales = dbStats.sales_total || 0;
            const totalPurchases = dbStats.purchases_total || 0;
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

    const netProfit = stats.sales - stats.purchases;
    const collectionRate = stats.sales > 0 ? Math.min((stats.receipts / stats.sales) * 100, 100) : 0;

    const quickActions = [
        { icon: '📖', label: 'Day Book', to: '/vouchers' },
        { icon: '📊', label: 'Ledgers', to: '/ledgers' },
        { icon: '📈', label: 'Sales', to: '/sales' },
        { icon: '📉', label: 'Purchases', to: '/purchases' },
        { icon: '📦', label: 'Stock', to: '/stock' },
        { icon: '🧾', label: 'GST', to: '/gst-reports' },
    ];

    return (
        <div className="dashboard-page">
            {/* Header Section */}
            <header className="dashboard-page__header">
                <div className="dashboard-page__header-info">
                    <h1 className="dashboard-page__title">
                        <span className="dashboard-page__title-icon">📊</span>
                        Dashboard
                    </h1>
                    <p className="dashboard-page__company">{selectedCompany.name}</p>
                </div>
                {syncStatus.lastSync && (
                    <div className="dashboard-page__sync-status">
                        <span className="dashboard-page__sync-dot" />
                        <span>Synced {formatDistanceToNow(new Date(syncStatus.lastSync))} ago</span>
                    </div>
                )}
            </header>

            {/* Period Filter */}
            <div className="dashboard-page__period-filter">
                <div className="dashboard-page__period-pills">
                    {['Today', 'This Month', 'Last 30 Days', 'This Year', 'Custom'].map((p) => (
                        <button
                            key={p}
                            onClick={() => handlePeriodChange(p)}
                            className={`dashboard-page__period-btn ${period === p ? 'active' : ''}`}
                        >
                            {p}
                        </button>
                    ))}
                </div>

                {period === 'Custom' && (
                    <div className="dashboard-page__date-range">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="dashboard-page__date-input"
                        />
                        <span>to</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="dashboard-page__date-input"
                        />
                    </div>
                )}
            </div>

            {loading ? (
                <div className="dashboard-page__loading">
                    <div className="dashboard-page__spinner" />
                    <p>Loading analytics...</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <section className="dashboard-page__kpi-section">
                        <KPICard
                            title="Total Sales"
                            value={stats.sales}
                            icon="📈"
                            variant="sales"
                            subtitle={`Txbl: ${formatCurrency(stats.salesTaxable)} • ${stats.salesCount} Inv`}
                            onClick={() => window.location.href = '/sales'}
                        />
                        <KPICard
                            title="Purchases"
                            value={stats.purchases}
                            icon="🛒"
                            variant="purchases"
                            subtitle={`Txbl: ${formatCurrency(stats.purchasesTaxable)} • ${stats.purchasesCount} Inv`}
                            onClick={() => window.location.href = '/purchases'}
                        />
                        <KPICard
                            title="Receivables"
                            value={stats.receivables}
                            icon="💰"
                            variant="outstanding"
                            subtitle="Outstanding"
                            onClick={() => window.location.href = '/ledgers'}
                        />
                        <KPICard
                            title="Payables"
                            value={stats.payables}
                            icon="📤"
                            variant="profit"
                            subtitle="Outstanding"
                            onClick={() => window.location.href = '/ledgers'}
                        />
                    </section>

                    {/* Charts Row */}
                    <section className="dashboard-page__charts">
                        <GlassCard size="lg" className="dashboard-page__chart-card glass-card--prismatic">
                            <h3 className="dashboard-page__section-title">
                                <span>💹</span> Net Position
                            </h3>
                            <div className="dashboard-page__net-position">
                                <div className="dashboard-page__net-item">
                                    <span className="dashboard-page__net-label">Net Profit</span>
                                    <span className={`dashboard-page__net-value ${netProfit >= 0 ? 'positive' : 'negative'}`}>
                                        {formatCurrency(netProfit)}
                                    </span>
                                </div>
                                <div className="dashboard-page__net-item">
                                    <span className="dashboard-page__net-label">Receipts</span>
                                    <span className="dashboard-page__net-value positive">
                                        {formatCurrency(stats.receipts)}
                                    </span>
                                </div>
                                <div className="dashboard-page__net-item">
                                    <span className="dashboard-page__net-label">Payments</span>
                                    <span className="dashboard-page__net-value negative">
                                        {formatCurrency(stats.payments)}
                                    </span>
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard size="lg" className="dashboard-page__progress-card">
                            <h3 className="dashboard-page__section-title">
                                <span>🎯</span> Key Metrics
                            </h3>
                            <div className="dashboard-page__progress-grid">
                                <ProgressRing
                                    value={collectionRate}
                                    label="Collection"
                                    color="emerald"
                                    size={90}
                                />
                                <ProgressRing
                                    value={netProfit > 0 ? Math.min((netProfit / stats.sales) * 100, 100) : 0}
                                    label="Profit %"
                                    color="purple"
                                    size={90}
                                />
                            </div>
                        </GlassCard>
                    </section>

                    {/* Quick Actions */}
                    <section className="dashboard-page__quick-actions">
                        <h3 className="dashboard-page__section-title">
                            <span>⚡</span> Quick Access
                        </h3>
                        <div className="dashboard-page__actions-grid">
                            {quickActions.map((action, idx) => (
                                <Link key={idx} to={action.to} className="dashboard-page__action-card">
                                    <span className="dashboard-page__action-icon">{action.icon}</span>
                                    <span className="dashboard-page__action-label">{action.label}</span>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* Recent Vouchers */}
                    <section className="dashboard-page__recent">
                        <GlassCard size="lg">
                            <div className="dashboard-page__recent-header">
                                <h3 className="dashboard-page__section-title">
                                    <span>📄</span> Recent Vouchers
                                </h3>
                                <Link to="/vouchers" className="dashboard-page__view-all">
                                    View All →
                                </Link>
                            </div>
                            <div className="dashboard-page__voucher-list">
                                {recentVouchers.slice(0, 5).map((v, idx) => (
                                    <Link
                                        key={v.voucher_id || idx}
                                        to={`/vouchers/${v.id}`}
                                        className="dashboard-page__voucher-item"
                                    >
                                        <div className="dashboard-page__voucher-left">
                                            <span className={`dashboard-page__voucher-icon ${v.voucher_type?.toLowerCase()}`}>
                                                {v.voucher_type === 'Sales' ? '📈' :
                                                    v.voucher_type === 'Receipt' ? '💰' :
                                                        v.voucher_type === 'Purchase' ? '🛒' : '📝'}
                                            </span>
                                            <div className="dashboard-page__voucher-info">
                                                <span className="dashboard-page__voucher-party">
                                                    {v.party_name || 'Cash'}
                                                </span>
                                                <span className="dashboard-page__voucher-meta">
                                                    {formatDate(v.voucher_date)} • #{v.voucher_number}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="dashboard-page__voucher-right">
                                            <span className={`dashboard-page__voucher-amount ${v.voucher_type === 'Receipt' || v.voucher_type === 'Sales' ? 'credit' : 'debit'
                                                }`}>
                                                {formatCurrency(Math.abs(v.total_amount || 0))}
                                            </span>
                                            <span className={`dashboard-page__voucher-type ${v.voucher_type?.toLowerCase()}`}>
                                                {v.voucher_type}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                                {recentVouchers.length === 0 && (
                                    <div className="dashboard-page__empty">
                                        <span>📭</span>
                                        <p>No vouchers found</p>
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    </section>

                    {/* Action Buttons */}
                    <section className="dashboard-page__cta-buttons">
                        <Link to="/vouchers?type=Receipt" className="dashboard-page__cta dashboard-page__cta--primary">
                            <span>💰</span> Collect Payment
                        </Link>
                        <Link to="/create-invoice" className="dashboard-page__cta dashboard-page__cta--secondary">
                            <span>📝</span> Create Invoice
                        </Link>
                    </section>
                </>
            )}
        </div>
    );
}
