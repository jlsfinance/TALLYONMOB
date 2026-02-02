import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { GlassCard, KPICard, ProgressRing, BarChart3D } from '../components/3d';
import './Dashboard3DPage.css';

export default function Dashboard3DPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [loading, setLoading] = useState(true);
    const [salesData, setSalesData] = useState(null);
    const [purchaseData, setPurchaseData] = useState(null);
    const [outstandingData, setOutstandingData] = useState(null);
    const [monthlySales, setMonthlySales] = useState([]);
    const [recentVouchers, setRecentVouchers] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [todaySales, setTodaySales] = useState(0);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadDashboardData();
        }
    }, [selectedCompany]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const today = new Date();
            const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
            const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');

            // Get current financial year
            const fyStart = today.getMonth() >= 3
                ? new Date(today.getFullYear(), 3, 1)
                : new Date(today.getFullYear() - 1, 3, 1);

            // Fetch sales data
            const { data: sales } = await supabase
                .from('sales')
                .select('net_amount, invoice_date')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', format(fyStart, 'yyyy-MM-dd'))
                .eq('is_cancelled', false);

            const totalSales = (sales || []).reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);

            // This month sales
            const thisMonthSales = (sales || [])
                .filter(s => s.invoice_date >= monthStart && s.invoice_date <= monthEnd)
                .reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);

            // Previous month sales for comparison
            const lastMonth = subMonths(today, 1);
            const lastMonthStart = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
            const lastMonthEnd = format(endOfMonth(lastMonth), 'yyyy-MM-dd');

            const lastMonthSales = (sales || [])
                .filter(s => s.invoice_date >= lastMonthStart && s.invoice_date <= lastMonthEnd)
                .reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);

            const salesTrend = lastMonthSales > 0
                ? ((thisMonthSales - lastMonthSales) / lastMonthSales * 100).toFixed(1)
                : 0;

            setSalesData({
                total: totalSales,
                thisMonth: thisMonthSales,
                trend: {
                    value: Math.abs(salesTrend),
                    direction: salesTrend >= 0 ? 'up' : 'down'
                }
            });

            // Fetch purchases data
            const { data: purchases } = await supabase
                .from('purchases')
                .select('net_amount')
                .eq('company_id', selectedCompany.id)
                .gte('invoice_date', format(fyStart, 'yyyy-MM-dd'))
                .eq('is_cancelled', false);

            const totalPurchases = (purchases || []).reduce((sum, p) => sum + (Number(p.net_amount) || 0), 0);
            setPurchaseData({ total: totalPurchases });

            // Fetch outstanding receivables
            const { data: ledgers } = await supabase
                .from('ledgers')
                .select('closing_balance, ledger_type')
                .eq('company_id', selectedCompany.id)
                .eq('ledger_type', 'Sundry Debtors');

            const totalReceivables = (ledgers || []).reduce((sum, l) => sum + Math.abs(Number(l.closing_balance) || 0), 0);
            setOutstandingData({ receivables: totalReceivables });

            // Monthly sales for chart (last 6 months)
            const monthlyData = [];
            for (let i = 5; i >= 0; i--) {
                const month = subMonths(today, i);
                const mStart = format(startOfMonth(month), 'yyyy-MM-dd');
                const mEnd = format(endOfMonth(month), 'yyyy-MM-dd');

                const monthSales = (sales || [])
                    .filter(s => s.invoice_date >= mStart && s.invoice_date <= mEnd)
                    .reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);

                monthlyData.push({
                    label: format(month, 'MMM'),
                    value: monthSales
                });
            }
            setMonthlySales(monthlyData);

            setRecentVouchers(vouchers || []);

            // Fetch pending transactions count
            const { count: pending } = await supabase
                .from('pending_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('company_id', selectedCompany.id)
                .eq('status', 'pending');

            setPendingCount(pending || 0);

            // Fetch today's actual sales
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const { data: tSales } = await supabase
                .from('sales')
                .select('net_amount')
                .eq('company_id', selectedCompany.id)
                .eq('invoice_date', todayStr)
                .eq('is_cancelled', false);

            setTodaySales((tSales || []).reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0));

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
        setLoading(false);
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

    const netProfit = (salesData?.total || 0) - (purchaseData?.total || 0);

    if (!selectedCompany) {
        return (
            <div className="dashboard-3d__empty">
                <p>Please select a company first</p>
            </div>
        );
    }

    return (
        <div className="dashboard-3d">
            {/* Background Grid */}
            <div className="dashboard-3d__bg-grid" />

            {/* Header */}
            <header className="dashboard-3d__header">
                <div className="dashboard-3d__title-section">
                    <h1 className="dashboard-3d__title">
                        <span className="dashboard-3d__title-icon">📊</span>
                        Analytics Dashboard
                    </h1>
                    <p className="dashboard-3d__subtitle">{selectedCompany.name}</p>
                </div>
                <div className="dashboard-3d__stats-strip">
                    <div className="dashboard-3d__stat" onClick={() => navigate('/sales')}>
                        <span className="dashboard-3d__stat-label">Today</span>
                        <span className="dashboard-3d__stat-value">{formatCurrency(todaySales)}</span>
                    </div>
                    <div className="dashboard-3d__stat clickable" onClick={() => navigate('/vouchers?status=pending')}>
                        <span className="dashboard-3d__stat-label">Pending</span>
                        <span className="dashboard-3d__stat-value dashboard-3d__stat-value--warning">
                            {pendingCount}
                        </span>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="dashboard-3d__loading">
                    <div className="dashboard-3d__spinner" />
                    <p>Loading analytics...</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <section className="dashboard-3d__kpi-section">
                        <KPICard
                            title="Total Sales"
                            value={salesData?.total || 0}
                            icon="💰"
                            trend={salesData?.trend}
                            variant="sales"
                            subtitle="This FY"
                            onClick={() => navigate('/sales')}
                        />
                        <KPICard
                            title="Purchases"
                            value={purchaseData?.total || 0}
                            icon="🛒"
                            variant="purchases"
                            subtitle="This FY"
                            onClick={() => navigate('/purchases')}
                        />
                        <KPICard
                            title="Outstanding"
                            value={outstandingData?.receivables || 0}
                            icon="📋"
                            variant="outstanding"
                            subtitle="Receivables"
                            onClick={() => navigate('/ledgers')}
                        />
                        <KPICard
                            title="Net Profit"
                            value={netProfit}
                            icon="📈"
                            variant="profit"
                            subtitle="Gross"
                        />
                    </section>

                    {/* Charts Section */}
                    <section className="dashboard-3d__charts">
                        {/* Monthly Sales Chart */}
                        <GlassCard size="lg" className="dashboard-3d__chart-card">
                            <h3 className="dashboard-3d__section-title">
                                <span>📈</span> Monthly Sales Trend
                            </h3>
                            <BarChart3D
                                data={monthlySales}
                                height={180}
                                barColor="purple"
                                animated
                            />
                        </GlassCard>

                        {/* Progress Rings */}
                        <GlassCard size="lg" className="dashboard-3d__progress-card">
                            <h3 className="dashboard-3d__section-title">
                                <span>🎯</span> Key Metrics
                            </h3>
                            <div className="dashboard-3d__progress-grid">
                                <ProgressRing
                                    value={75}
                                    label="Collection"
                                    color="emerald"
                                    size={100}
                                />
                                <ProgressRing
                                    value={92}
                                    label="GST"
                                    color="blue"
                                    size={100}
                                />
                                <ProgressRing
                                    value={netProfit > 0 ? Math.min((netProfit / (salesData?.total || 1)) * 100, 100) : 0}
                                    label="Profit %"
                                    color="purple"
                                    size={100}
                                />
                            </div>
                        </GlassCard>
                    </section>

                    {/* Recent Vouchers */}
                    <section className="dashboard-3d__recent">
                        <GlassCard size="lg">
                            <h3 className="dashboard-3d__section-title">
                                <span>📄</span> Recent Vouchers
                            </h3>
                            <div className="dashboard-3d__voucher-list">
                                {recentVouchers.slice(0, 5).map((voucher, idx) => (
                                    <div
                                        key={idx}
                                        className="dashboard-3d__voucher-item"
                                        onClick={() => navigate(`/vouchers/${encodeURIComponent(voucher.voucher_id)}`)}
                                    >
                                        <div className="dashboard-3d__voucher-info">
                                            <span className="dashboard-3d__voucher-number">{voucher.voucher_number}</span>
                                            <span className="dashboard-3d__voucher-party">{voucher.party_name || 'N/A'}</span>
                                        </div>
                                        <div className="dashboard-3d__voucher-details">
                                            <span className="dashboard-3d__voucher-type">{voucher.voucher_type}</span>
                                            <span className="dashboard-3d__voucher-amount">{formatCurrency(Number(voucher.total_amount))}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </section>

                    {/* Quick Actions */}
                    <section className="dashboard-3d__actions">
                        <button className="dashboard-3d__action-btn" onClick={() => navigate('/sales')}>
                            <span>📊</span> Sales Report
                        </button>
                        <button className="dashboard-3d__action-btn" onClick={() => navigate('/gst-reports')}>
                            <span>📋</span> GST Reports
                        </button>
                        <button className="dashboard-3d__action-btn" onClick={() => navigate('/stock')}>
                            <span>📦</span> Stock
                        </button>
                        <button className="dashboard-3d__action-btn" onClick={() => navigate('/vouchers')}>
                            <span>📄</span> Vouchers
                        </button>
                        <button className="dashboard-3d__action-btn" onClick={() => window.open('/TallyLink.exe', '_blank')}>
                            <img src="/tallylink_logo.png" alt="TallyLink" style={{ width: '24px', height: '24px', marginRight: '8px' }} />
                            Download TallyLink PC App
                        </button>
                    </section>
                </>
            )}
        </div>
    );
}
