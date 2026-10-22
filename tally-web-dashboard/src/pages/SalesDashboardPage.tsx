import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { TrendingUp, FileText, DollarSign, BarChart3, Users, Package, ChevronDown, Calendar } from 'lucide-react';
import { GlassCard, MetricCard, Spinner } from '@/components/ui/GlassUI';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { motion } from 'framer-motion';
import {
    LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

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
                            <TrendingUp size={14} className="text-[var(--primary)]" /> Revenue Trend
                        </h2>
                        <div className="h-48">
                            {dailySales.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={dailySales.map(d => ({ ...d, dayLabel: format(new Date(d.date), 'dd MMM') }))}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                        <XAxis dataKey="dayLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v: number) => v >= 100000 ? `${(v / 100000).toFixed(0)}L` : `${(v / 1000).toFixed(0)}K`} />
                                        <Tooltip
                                            contentStyle={{ background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }}
                                            formatter={(value: number) => [new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value), 'Revenue']}
                                            labelFormatter={(label) => `Date: ${label}`}
                                        />
                                        <Line type="monotone" dataKey="amount" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3, fill: '#3B82F6' }} activeDot={{ r: 5, strokeWidth: 0 }} animationDuration={1200} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[9px] font-black uppercase text-gray-500">No trend data for selected range</div>
                            )}
                        </div>
                    </GlassCard>

                    <div className="grid md:grid-cols-2 gap-4">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                        >
                            <GlassCard className="p-4">
                                <h2 className="text-[10px] font-black text-[var(--on-surface)] mb-4 uppercase tracking-widest flex items-center gap-2">
                                    <Users size={14} className="text-[var(--primary)]" /> Customer Contribution
                                </h2>
                                <div className="h-48">
                                    {topCustomers.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={topCustomers.slice(0, 5)}
                                                    dataKey="amount"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={70}
                                                    innerRadius={30}
                                                    animationBegin={300}
                                                    animationDuration={1000}
                                                    label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {topCustomers.slice(0, 5).map((_: any, index: number) => (
                                                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }}
                                                    formatter={(value: number) => [new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value), 'Revenue']}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[9px] font-black uppercase text-gray-500">No data</div>
                                    )}
                                </div>
                                {/* Mini list below chart */}
                                <div className="mt-3 space-y-2">
                                    {topCustomers.slice(0, 5).map((cust, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                                <p className="text-xs font-bold text-[var(--on-surface)] truncate uppercase">{cust.name}</p>
                                            </div>
                                            <p className="text-xs font-black text-[var(--success)] shrink-0">{formatCurrency(cust.amount)}</p>
                                        </div>
                                    ))}
                                </div>
                            </GlassCard>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                        >
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
                        </motion.div>
                    </div>
                </div>
            )}
        </div>
    );
}
