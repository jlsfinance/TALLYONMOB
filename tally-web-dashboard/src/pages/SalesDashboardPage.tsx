import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { TrendingUp, FileText, DollarSign, BarChart3, Users, Package, ChevronDown, Calendar } from 'lucide-react';
import { GlassCard, MetricCard, Spinner } from '@/components/ui/GlassUI';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

export default function SalesDashboardPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [period, setPeriod] = useState('thisYear');
    const [salesData, setSalesData] = useState<any>(null);
    const [topCustomers, setTopCustomers] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [dailySales, setDailySales] = useState<any[]>([]);

    useEffect(() => {
        if (!selectedCompany?.id) return;
        const detectFy = async () => {
            try {
                const { data, error } = await supabase
                    .from('vouchers')
                    .select('voucher_date')
                    .eq('company_id', selectedCompany.id)
                    .eq('voucher_type', 'Sales')
                    .eq('is_deleted', false)
                    .order('voucher_date', { ascending: false })
                    .limit(1);
                if (error) return;
                if (data && data.length > 0 && data[0].voucher_date) {
                    const latestDate = new Date(data[0].voucher_date);
                    const month = latestDate.getMonth();
                    const year = latestDate.getFullYear();
                    const fyStartYear = month >= 3 ? year : year - 1;
                    const endYr = (fyStartYear + 1).toString().slice(2);
                    const detectedFy = `FY ${fyStartYear}-${endYr}`;
                    setSelectedFy(detectedFy);
                }
            } catch (e) {
                console.error('FY detection failed', e);
            }
        };
        detectFy();
    }, [selectedCompany?.id]);

    const periods = [
        { key: 'today', label: 'Today' },
        { key: 'thisWeek', label: 'Week' },
        { key: 'thisMonth', label: 'Month' },
        { key: 'lastMonth', label: 'Last' },
        { key: 'thisYear', label: 'All FY' },
    ];

    const getPeriodDates = () => {
        const today = new Date();
        const fyYear = parseInt(selectedFy.split(' ')[1].split('-')[0]);
        const fyStart = new Date(fyYear, 3, 1);
        const fyEnd = new Date(fyYear + 1, 2, 31);

        if (period === 'thisYear') {
            return { start: format(fyStart, 'yyyy-MM-dd'), end: format(fyEnd, 'yyyy-MM-dd') };
        }

        switch (period) {
            case 'today': return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisWeek': return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
            case 'thisMonth': return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
            case 'lastMonth': const lastMonth = subMonths(today, 1); return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
            default: return { start: format(fyStart, 'yyyy-MM-dd'), end: format(fyEnd, 'yyyy-MM-dd') };
        }
    };

    const loadDashboardData = async () => {
        if (!selectedCompany?.id) return;
        setLoading(true);
        try {
            const { start, end } = getPeriodDates();
            const { data: analytics } = await supabase.rpc('get_sales_dashboard_data', {
                p_company_id: selectedCompany.id,
                p_start_date: start,
                p_end_date: end
            });

            const stats = analytics || { total_sales: 0, total_invoices: 0, total_tax: 0, taxable_amount: 0, top_customers: [], top_products: [], daily_trend: [] };
            setSalesData({
                totalSales: stats.total_sales || 0,
                totalInvoices: stats.total_invoices || 0,
                avgInvoice: stats.total_invoices > 0 ? (stats.total_sales / stats.total_invoices) : 0,
                totalTax: stats.total_tax || 0,
            });

            setTopCustomers(stats.top_customers || []);
            setTopProducts(stats.top_products || []);
            setDailySales(stats.daily_trend || []);
        } catch (error) {
            console.error('Error loading sales data:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(1)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(1)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    useEffect(() => {
        loadDashboardData();
    }, [selectedCompany, period, selectedFy]);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Sales Alpha</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{selectedCompany?.name}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-1.5">
                    <CompactYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />
                    <div className="flex bg-[var(--surface-container)] rounded-[var(--radius-md)] p-0.5 border border-[var(--border)] scale-90 md:scale-100 origin-right">
                        {periods.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => setPeriod(p.key)}
                                className={`px-2 py-1 md:px-3 md:py-1.5 rounded-[var(--radius-sm)] text-[9px] md:text-[10px] font-black uppercase transition-all whitespace-nowrap ${period === p.key ? 'bg-[var(--surface)] text-[var(--on-surface)] shadow-[var(--shadow-xs)]' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </HeaderPortal>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24">
                    <Spinner size="md" />
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] rounded-2xl p-4 text-white shadow-lg">
                            <p className="text-[8px] font-black uppercase tracking-widest opacity-80">Revenue Volume</p>
                            <p className="text-xl font-black mt-1">{formatCurrency(salesData?.totalSales)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-4 border border-[var(--border)]">
                            <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Invoices</p>
                            <p className="text-lg font-black text-[var(--on-surface)] mt-1">{salesData?.totalInvoices}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-4 border border-[var(--border)]">
                            <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Avg Ticket</p>
                            <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(salesData?.avgInvoice)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-4 border border-[var(--border)]">
                            <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Tax Component</p>
                            <p className="text-lg font-black text-[var(--on-surface)] mt-1">{formatCurrency(salesData?.totalTax)}</p>
                        </div>
                    </div>

                    <GlassCard className="p-4">
                        <h2 className="text-[10px] font-black text-[var(--on-surface)] mb-4 uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp size={14} className="text-[var(--primary)]" /> Trend Stream
                        </h2>
                        <div className="h-32 flex items-end gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                            {dailySales.length > 0 ? dailySales.map((day, idx) => (
                                <div key={idx} className="flex flex-col items-center min-w-[24px]">
                                    <div className="w-full bg-[var(--primary)]/20 rounded-t-sm relative" style={{ height: `${(day.amount / (Math.max(...dailySales.map(d => d.amount)) || 1)) * 100}%` }}>
                                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--primary)] to-[var(--secondary)] rounded-t-sm" />
                                    </div>
                                    <span className="text-[7px] font-bold text-[var(--text-muted)] mt-1 shrink-0">{format(new Date(day.date), 'dd')}</span>
                                </div>
                            )) : (
                                <div className="w-full h-full flex items-center justify-center text-[9px] font-black uppercase text-gray-500">No trend data for selected range</div>
                            )}
                        </div>
                    </GlassCard>

                    <div className="grid md:grid-cols-2 gap-4">
                        <GlassCard className="p-4">
                            <h2 className="text-[10px] font-black text-[var(--on-surface)] mb-4 uppercase tracking-widest flex items-center gap-2">
                                <Users size={14} className="text-[var(--primary)]" /> Top Partners
                            </h2>
                            <div className="space-y-4">
                                {topCustomers.slice(0, 5).map((cust, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-[var(--on-surface)] truncate uppercase">{cust.name}</p>
                                            <div className="w-full bg-[var(--surface-active)] h-1 rounded-full mt-1 overflow-hidden">
                                                <div className="bg-[var(--primary)] h-1 rounded-full" style={{ width: `${(cust.amount / (topCustomers[0]?.amount || 1)) * 100}%` }} />
                                            </div>
                                        </div>
                                        <p className="text-xs font-black text-[var(--success)] shrink-0">{formatCurrency(cust.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-4">
                            <h2 className="text-[10px] font-black text-[var(--on-surface)] mb-4 uppercase tracking-widest flex items-center gap-2">
                                <Package size={14} className="text-[var(--secondary)]" /> Top Stock
                            </h2>
                            <div className="space-y-4">
                                {topProducts.slice(0, 5).map((prod, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-[var(--on-surface)] truncate uppercase">{prod.name}</p>
                                            <p className="text-[8px] font-black text-[var(--text-muted)] uppercase mt-0.5">Moving Qty: {prod.qty}</p>
                                        </div>
                                        <p className="text-xs font-black text-[var(--secondary)] shrink-0">{formatCurrency(prod.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}
        </div>
    );
}
