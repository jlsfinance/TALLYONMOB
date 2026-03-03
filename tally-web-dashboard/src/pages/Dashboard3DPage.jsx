import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { GlassCard, KPICard, ProgressRing, BarChart3D } from '../components/3d';
import TopAnalyticsSection from '../components/TopAnalyticsSection';
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
            const todayStr = format(today, 'yyyy-MM-dd');

            const fyStart = today.getMonth() >= 3
                ? new Date(today.getFullYear(), 3, 1)
                : new Date(today.getFullYear() - 1, 3, 1);
            const fyStartStr = format(fyStart, 'yyyy-MM-dd');

            // ── ALL queries in parallel ──────────────────────────
            const [
                salesRes,
                purchasesRes,
                ledgersRes,
                vouchersRes,
                pendingRes,
                todaySalesRes,
                receiptsRes
            ] = await Promise.all([
                // 1. FY Sales
                supabase.from('vouchers')
                    .select('total_amount, grand_total, voucher_date')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Sales')
                    .gte('vch_date', fyStartStr)
                    .eq('is_deleted', false),
                // 2. FY Purchases
                supabase.from('vouchers')
                    .select('total_amount, grand_total')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Purchase')
                    .gte('vch_date', fyStartStr)
                    .eq('is_deleted', false),
                // 3. Outstanding receivables
                supabase.from('ledgers')
                    .select('current_balance, parent')
                    .eq('company_id', selectedCompany.id)
                    .eq('parent', 'Sundry Debtors'),
                // 4. Recent vouchers
                supabase.from('vouchers')
                    .select('id, voucher_number, party_name, voucher_type, total_amount, grand_total')
                    .eq('company_id', selectedCompany.id)
                    .order('vch_date', { ascending: false })
                    .limit(5),
                // 5. Pending count
                supabase.from('pending_transactions')
                    .select('*', { count: 'exact', head: true })
                    .eq('company_id', selectedCompany.id)
                    .eq('status', 'pending'),
                // 6. Today's sales
                supabase.from('vouchers')
                    .select('total_amount, grand_total')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Sales')
                    .eq('vch_date', todayStr)
                    .eq('is_deleted', false),
                // 7. Receipts for collection %
                supabase.from('vouchers')
                    .select('total_amount')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Receipt')
                    .gte('vch_date', fyStartStr)
                    .lte('vch_date', todayStr)
            ]);

            const sales = salesRes.data || [];
            const purchases = purchasesRes.data || [];
            const ledgers = ledgersRes.data || [];
            const vouchers = vouchersRes.data || [];
            const tSales = todaySalesRes.data || [];
            const receipts = receiptsRes.data || [];

            // ── Process sales ────────────────────────────────────
            const totalSales = sales.reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);

            const thisMonthSales = sales
                .filter(s => (s.voucher_date || s.vch_date) >= monthStart && (s.voucher_date || s.vch_date) <= monthEnd)
                .reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);

            const lastMonth = subMonths(today, 1);
            const lastMonthStart = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
            const lastMonthEnd = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
            const lastMonthSales = sales
                .filter(s => (s.voucher_date || s.vch_date) >= lastMonthStart && (s.voucher_date || s.vch_date) <= lastMonthEnd)
                .reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);

            const salesTrend = lastMonthSales > 0
                ? ((thisMonthSales - lastMonthSales) / lastMonthSales * 100).toFixed(1)
                : 0;

            setSalesData({
                total: totalSales,
                thisMonth: thisMonthSales,
                trend: { value: Math.abs(salesTrend), direction: salesTrend >= 0 ? 'up' : 'down' }
            });

            // ── Process purchases ────────────────────────────────
            const totalPurchases = purchases.reduce((sum, p) => sum + Math.abs(Number(p.grand_total) || Number(p.total_amount) || 0), 0);
            setPurchaseData({ total: totalPurchases });

            // ── Process outstanding ──────────────────────────────
            const totalReceivables = ledgers.reduce((sum, l) => sum + Math.abs(Number(l.current_balance) || 0), 0);
            setOutstandingData({ receivables: totalReceivables });

            // ── Monthly chart ────────────────────────────────────
            const monthlyData = [];
            for (let i = 5; i >= 0; i--) {
                const month = subMonths(today, i);
                const mStart = format(startOfMonth(month), 'yyyy-MM-dd');
                const mEnd = format(endOfMonth(month), 'yyyy-MM-dd');
                const monthSalesTotal = sales
                    .filter(s => (s.voucher_date || s.vch_date) >= mStart && (s.voucher_date || s.vch_date) <= mEnd)
                    .reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0);
                monthlyData.push({ label: format(month, 'MMM'), value: monthSalesTotal });
            }
            setMonthlySales(monthlyData);

            setRecentVouchers(vouchers);
            setPendingCount(pendingRes.count || 0);
            setTodaySales(tSales.reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0));

            // ── KPI Ratios ───────────────────────────────────────
            const totalReceipts = receipts.reduce((sum, r) => sum + (Math.abs(Number(r.total_amount)) || 0), 0);
            const netProfitCalc = totalSales - totalPurchases;
            const collectionRate = totalSales > 0 ? (totalReceipts / totalSales) * 100 : 0;
            const expenseRate = totalSales > 0 ? (totalPurchases / totalSales) * 100 : 0;
            const profitMargin = totalSales > 0 ? (netProfitCalc / totalSales) * 100 : 0;

            setKpiRatios({
                collection: Math.min(collectionRate, 100),
                expense: Math.min(expenseRate, 100),
                profit: profitMargin
            });

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
        setLoading(false);
    };

    const [kpiRatios, setKpiRatios] = useState({ collection: 0, expense: 0, profit: 0 });

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
                    <p className="dashboard-3d__subtitle">{selectedCompany.name} (FY {new Date().getMonth() >= 3 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`})</p>
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
                            title="Total Sales (Gross)"
                            value={salesData?.total || 0}
                            icon="💰"
                            trend={salesData?.trend}
                            variant="sales"
                            subtitle="This FY"
                            onClick={() => navigate('/sales')}
                        />
                        <KPICard
                            title="Total Purchases (Gross)"
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
                                <span>🎯</span> Business Health
                            </h3>
                            <div className="dashboard-3d__progress-grid">
                                <ProgressRing
                                    value={kpiRatios.collection}
                                    label="Collection"
                                    color="emerald"
                                    size={100}
                                />
                                <ProgressRing
                                    value={kpiRatios.expense}
                                    label="Expense %"
                                    color="blue"
                                    size={100}
                                />
                                <ProgressRing
                                    value={kpiRatios.profit}
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
                                        key={voucher.id || idx}
                                        className="dashboard-3d__voucher-item"
                                        onClick={() => navigate(`/vouchers/${encodeURIComponent(voucher.id)}`)}
                                    >
                                        <div className="dashboard-3d__voucher-info">
                                            <span className="dashboard-3d__voucher-number">{voucher.voucher_number}</span>
                                            <span className="dashboard-3d__voucher-party">{voucher.party_name || 'N/A'}</span>
                                        </div>
                                        <div className="dashboard-3d__voucher-details">
                                            <span className="dashboard-3d__voucher-type">{voucher.voucher_type}</span>
                                            <span className="dashboard-3d__voucher-amount">{formatCurrency(Math.abs(Number(voucher.grand_total) || Number(voucher.total_amount) || 0))}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </section>

                    {/* Top Analytics Section */}
                    <TopAnalyticsSection />

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

