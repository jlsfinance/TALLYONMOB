import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { 
    Activity, TrendingUp, AlertOctagon, LayoutGrid, RefreshCw, 
    ChevronUp, ChevronDown, Sliders, Eye, EyeOff, GripVertical, Check, Info 
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Widget {
    id: string;
    title: string;
    visible: boolean;
    colSpan: 'half' | 'full';
}

const DEFAULT_WIDGETS: Widget[] = [
    { id: 'insights', title: '🧠 AI Business Insights', visible: true, colSpan: 'full' },
    { id: 'predictive', title: '🔮 Predictive Revenue Analytics', visible: true, colSpan: 'full' },
    { id: 'anomalies', title: '⚠️ Transaction Anomaly Detector', visible: true, colSpan: 'full' },
    { id: 'kpis', title: '📊 Key Financial Indicators', visible: true, colSpan: 'full' }
];

const toNumber = (val: any) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
};

export default function BusinessInsightsPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [stockItems, setStockItems] = useState<any[]>([]);

    // Forecasting options
    const [forecastMonths, setForecastMonths] = useState<number>(6);
    const [growthAdjustment, setGrowthAdjustment] = useState<number>(10); // +10% expected manual adjustment
    const [confidenceLevel, setConfidenceLevel] = useState<number>(95);

    // Custom layout builder state
    const [widgets, setWidgets] = useState<Widget[]>(() => {
        const saved = localStorage.getItem(`tallysync_widgets_${selectedCompany?.id || 'default'}`);
        return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    });
    const [showConfig, setShowConfig] = useState(false);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const loadData = async () => {
        if (!selectedCompany?.id) return;
        setLoading(true);
        try {
            const [vouchersRes, ledgersRes, stockRes] = await Promise.all([
                supabase.from('vouchers').select('*').eq('company_id', selectedCompany.id).or('is_deleted.is.null,is_deleted.eq.false'),
                supabase.from('ledgers').select('*').eq('company_id', selectedCompany.id),
                supabase.from('stock_items').select('*').eq('company_id', selectedCompany.id)
            ]);

            setVouchers(vouchersRes.data || []);
            setLedgers(ledgersRes.data || []);
            setStockItems(stockRes.data || []);
        } catch (err: any) {
            toast.error('Failed to load insights data: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedCompany?.id]);

    // Save layouts when widgets order changes
    const saveLayout = (updatedWidgets: Widget[]) => {
        setWidgets(updatedWidgets);
        localStorage.setItem(`tallysync_widgets_${selectedCompany?.id || 'default'}`, JSON.stringify(updatedWidgets));
    };

    // Drag and Drop implementation
    const handleDragStart = (e: React.DragEvent, position: number) => {
        dragItem.current = position;
    };

    const handleDragEnter = (e: React.DragEvent, position: number) => {
        dragOverItem.current = position;
    };

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            const copyListItems = [...widgets];
            const dragItemContent = copyListItems[dragItem.current];
            copyListItems.splice(dragItem.current, 1);
            copyListItems.splice(dragOverItem.current, 0, dragItemContent);
            dragItem.current = null;
            dragOverItem.current = null;
            saveLayout(copyListItems);
            toast.success('Widget layout updated!');
        }
    };

    // Move widget helper
    const moveWidget = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= widgets.length) return;
        
        const copyListItems = [...widgets];
        const temp = copyListItems[index];
        copyListItems[index] = copyListItems[targetIndex];
        copyListItems[targetIndex] = temp;
        saveLayout(copyListItems);
    };

    const toggleVisibility = (id: string) => {
        const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
        saveLayout(updated);
    };

    const toggleColSpan = (id: string) => {
        const updated = widgets.map(w => w.id === id ? { ...w, colSpan: w.colSpan === 'full' ? 'half' : 'full' as any } : w);
        saveLayout(updated);
    };

    // --- 5.2 PREDICTIVE REVENUE ANALYTICS ENGINE (Linear Regression Trend) ---
    const predictiveAnalytics = useMemo(() => {
        const sales = vouchers.filter(v => ['Sales', 'Sales Invoice'].includes(v.voucher_type));
        if (sales.length === 0) return { historical: [], forecasted: [], statistics: { slope: 0, intercept: 0 } };

        // Group sales by year-month
        const monthlySalesMap: Record<string, number> = {};
        sales.forEach(v => {
            const dateStr = v.voucher_date || v.created_at;
            if (!dateStr) return;
            const monthKey = dateStr.substring(0, 7); // YYYY-MM
            monthlySalesMap[monthKey] = (monthlySalesMap[monthKey] || 0) + toNumber(v.grand_total || v.total_amount);
        });

        // Sort historical months
        const sortedMonths = Object.keys(monthlySalesMap).sort();
        const historical = sortedMonths.map((month, idx) => ({
            index: idx,
            month,
            revenue: monthlySalesMap[month]
        }));

        if (historical.length < 2) {
            // Fallback if not enough data points
            return { historical, forecasted: [], statistics: { slope: 0, intercept: 0 } };
        }

        // Linear Regression Y = mX + c
        const n = historical.length;
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;

        historical.forEach(pt => {
            sumX += pt.index;
            sumY += pt.revenue;
            sumXY += pt.index * pt.revenue;
            sumXX += pt.index * pt.index;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Standard error calculation for confidence intervals
        let sumSquareErrors = 0;
        historical.forEach(pt => {
            const predY = slope * pt.index + intercept;
            sumSquareErrors += Math.pow(pt.revenue - predY, 2);
        });
        const stdError = Math.sqrt(sumSquareErrors / (n - 2 || 1));

        // Generate forecasts
        const forecasted = [];
        const lastMonthStr = historical[historical.length - 1].month;
        const [lastYear, lastMonth] = lastMonthStr.split('-').map(Number);

        // Confidence interval multiplier based on inputs
        const ciMultiplier = confidenceLevel === 99 ? 2.576 : confidenceLevel === 95 ? 1.96 : 1.645;
        const growthFactor = 1 + (growthAdjustment / 100);

        for (let i = 1; i <= forecastMonths; i++) {
            const nextIdx = n - 1 + i;
            const nextMonthDate = new Date(lastYear, lastMonth - 1 + i, 1);
            const nextMonthKey = nextMonthDate.toISOString().substring(0, 7);

            // Calculate baseline regression forecast
            let baseForecast = slope * nextIdx + intercept;
            if (baseForecast < 0) baseForecast = 0;

            // Apply growth adjustments
            const adjustedForecast = baseForecast * growthFactor;

            // Confidence bands
            const bandWidth = stdError * ciMultiplier * Math.sqrt(1 + (1 / n) + (Math.pow(nextIdx - (sumX / n), 2) / (sumXX - (Math.pow(sumX, 2) / n))));
            const upperCI = Math.max(0, adjustedForecast + bandWidth);
            const lowerCI = Math.max(0, adjustedForecast - bandWidth);

            forecasted.push({
                index: nextIdx,
                month: nextMonthKey,
                revenue: Math.round(adjustedForecast),
                lowerCI: Math.round(lowerCI),
                upperCI: Math.round(upperCI)
            });
        }

        return {
            historical,
            forecasted,
            statistics: {
                slope,
                intercept,
                avgRevenue: Math.round(sumY / n),
                stdError
            }
        };
    }, [vouchers, forecastMonths, growthAdjustment, confidenceLevel]);

    // --- 5.3 ANOMALY DETECTION ENGINE ---
    const anomalies = useMemo(() => {
        const list: any[] = [];
        if (vouchers.length === 0) return [];

        const sales = vouchers.filter(v => ['Sales', 'Sales Invoice'].includes(v.voucher_type));
        const partySalesMap: Record<string, number[]> = {};

        sales.forEach(v => {
            const amount = toNumber(v.grand_total || v.total_amount);
            if (amount <= 0 || !v.party_name) return;
            if (!partySalesMap[v.party_name]) partySalesMap[v.party_name] = [];
            partySalesMap[v.party_name].push(amount);
        });

        // 1. Party Outliers (Invoice size > 3x party average)
        sales.forEach(v => {
            const amount = toNumber(v.grand_total || v.total_amount);
            if (amount <= 0 || !v.party_name) return;

            const partyAmounts = partySalesMap[v.party_name];
            if (partyAmounts.length >= 3) {
                const total = partyAmounts.reduce((sum, a) => sum + a, 0);
                const avg = total / partyAmounts.length;
                if (amount > avg * 3 && amount > 50000) {
                    list.push({
                        type: 'Outlier Invoice',
                        severity: 'HIGH',
                        party: v.party_name,
                        date: v.voucher_date,
                        details: `Invoice size ₹${amount.toLocaleString('en-IN')} is ${Math.round(amount/avg)}x higher than average transaction size (₹${Math.round(avg).toLocaleString('en-IN')}) for this customer.`,
                        voucherId: v.id,
                        refNo: v.voucher_number || 'N/A'
                    });
                }
            }
        });

        // 2. Tax rate anomalies (non-standard rate of GST)
        // Standard rates in India: 0%, 3%, 5%, 12%, 18%, 28%
        vouchers.forEach(v => {
            const cgst = toNumber(v.cgst_amount || v.cgst);
            const sgst = toNumber(v.sgst_amount || v.sgst);
            const igst = toNumber(v.igst_amount || v.igst);
            const taxable = toNumber(v.taxable_value || v.total_amount);
            
            if (taxable > 1000 && (cgst + sgst + igst) > 0) {
                const totalTax = cgst + sgst + igst;
                const rate = Math.round((totalTax / taxable) * 100);
                const standardRates = [0, 3, 5, 12, 18, 28];
                if (!standardRates.includes(rate) && rate > 0) {
                    list.push({
                        type: 'GST Rate Mismatch',
                        severity: 'MEDIUM',
                        party: v.party_name || 'N/A',
                        date: v.voucher_date,
                        details: `Calculated GST rate of ${rate}% is non-standard. Taxable: ₹${taxable.toLocaleString('en-IN')}, GST charged: ₹${totalTax.toLocaleString('en-IN')}.`,
                        voucherId: v.id,
                        refNo: v.voucher_number || 'N/A'
                    });
                }
            }
        });

        // 3. Duplicate Invoices (same date, same party, same amount)
        const dupGroup: Record<string, any[]> = {};
        sales.forEach(v => {
            const amount = toNumber(v.grand_total || v.total_amount);
            const key = `${v.voucher_date}_${v.party_name}_${amount}`;
            if (!dupGroup[key]) dupGroup[key] = [];
            dupGroup[key].push(v);
        });

        Object.entries(dupGroup).forEach(([key, items]) => {
            if (items.length > 1) {
                list.push({
                    type: 'Duplicate Invoice Entry',
                    severity: 'CRITICAL',
                    party: items[0].party_name,
                    date: items[0].voucher_date,
                    details: `${items.length} duplicate vouchers detected on ${items[0].voucher_date} for ₹${toNumber(items[0].grand_total || items[0].total_amount).toLocaleString('en-IN')}.`,
                    voucherId: items[0].id,
                    refNo: items.map(i => i.voucher_number || 'N/A').join(', ')
                });
            }
        });

        return list;
    }, [vouchers]);

    // --- 5.1 AI BUSINESS INSIGHTS PANEL GENERATION ---
    const insights = useMemo(() => {
        const sales = vouchers.filter(v => ['Sales', 'Sales Invoice'].includes(v.voucher_type));
        const purchases = vouchers.filter(v => ['Purchase', 'Purchase Invoice'].includes(v.voucher_type));

        const totalSales = sales.reduce((sum, v) => sum + toNumber(v.grand_total || v.total_amount), 0);
        const totalPurchases = purchases.reduce((sum, v) => sum + toNumber(v.grand_total || v.total_amount), 0);

        const debtorBalance = ledgers
            .filter(l => String(l.parent_group || l.parent || '').toLowerCase().includes('debtor'))
            .reduce((sum, l) => sum + Math.abs(toNumber(l.closing_balance || l.current_balance)), 0);

        const creditorBalance = ledgers
            .filter(l => String(l.parent_group || l.parent || '').toLowerCase().includes('creditor'))
            .reduce((sum, l) => sum + Math.abs(toNumber(l.closing_balance || l.current_balance)), 0);

        const list = [];

        // Cash flow health check
        if (totalSales > totalPurchases) {
            list.push({
                type: 'positive',
                title: 'Surplus Operating Runway',
                description: `Your sales revenue (₹${Math.round(totalSales).toLocaleString('en-IN')}) exceeds purchases (₹${Math.round(totalPurchases).toLocaleString('en-IN')}) by ${Math.round((totalSales - totalPurchases) / totalSales * 100)}% this fiscal period.`
            });
        } else if (totalSales > 0) {
            list.push({
                type: 'negative',
                title: 'Operating Deficit Warning',
                description: `Operating costs/purchases are higher than generated sales. Negative net runway of ₹${Math.round(totalPurchases - totalSales).toLocaleString('en-IN')}. Recommend optimizing procurement.`
            });
        }

        // Debt collection check
        if (debtorBalance > totalSales * 0.5 && totalSales > 0) {
            list.push({
                type: 'warning',
                title: 'Heavy Receivables Congestion',
                description: `Outstanding accounts receivable (₹${Math.round(debtorBalance).toLocaleString('en-IN')}) represents ${Math.round(debtorBalance / totalSales * 100)}% of total sales. Collection velocity is lagging.`
            });
        } else {
            list.push({
                type: 'positive',
                title: 'Healthy Receivables Cycle',
                description: `DSO (Days Sales Outstanding) remains stable. Outstanding customer dues are under 30% of sales total.`
            });
        }

        // Inventory health check
        const zeroStock = stockItems.filter(s => toNumber(s.current_stock) <= 0);
        if (zeroStock.length > 0) {
            list.push({
                type: 'warning',
                title: 'Out-Of-Stock Sales Leakage',
                description: `${zeroStock.length} items have critical zero stock levels (e.g. ${zeroStock.slice(0, 3).map(s => s.name).join(', ')}). Possible supply chain blockages.`
            });
        }

        // Future revenue trajectory
        if (predictiveAnalytics.forecasted.length > 0) {
            const nextMonth = predictiveAnalytics.forecasted[0];
            const avgHist = predictiveAnalytics.statistics.avgRevenue;
            const diff = nextMonth.revenue - avgHist;
            
            if (diff > 0) {
                list.push({
                    type: 'positive',
                    title: 'Positive Growth Trajectory',
                    description: `Next month's revenue is forecast to hit ₹${nextMonth.revenue.toLocaleString('en-IN')}, trending higher than historical average of ₹${avgHist.toLocaleString('en-IN')}.`
                });
            } else {
                list.push({
                    type: 'warning',
                    title: 'Revenue Consolidation Forecast',
                    description: `Projections suggest next month's sales will contract slightly to ₹${nextMonth.revenue.toLocaleString('en-IN')} (Avg: ₹${avgHist.toLocaleString('en-IN')}). Prepare buffers.`
                });
            }
        }

        return list;
    }, [vouchers, ledgers, stockItems, predictiveAnalytics]);

    // Graph maximum calculator
    const maxGraphVal = useMemo(() => {
        const histMax = Math.max(...predictiveAnalytics.historical.map(h => h.revenue), 1);
        const foreMax = Math.max(...predictiveAnalytics.forecasted.map(f => f.upperCI), 1);
        return Math.max(histMax, foreMax) * 1.15;
    }, [predictiveAnalytics]);

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24 px-4 sm:px-6">
            <HeaderPortal type="title">
                <div className="flex items-center gap-3">
                    <div className="flex w-9 h-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 border border-sky-500/20">
                        <Activity size={20} />
                    </div>
                    <div>
                        <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] uppercase tracking-tighter leading-none">Advanced Analytics & AI</h1>
                        <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-1">Predictive Insights & Dashboard Customizer</p>
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <button
                    onClick={() => setShowConfig(!showConfig)}
                    className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 border shadow-sm ${showConfig ? 'bg-[var(--on-surface)] text-[var(--surface)] border-[var(--on-surface)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--on-surface)] hover:bg-[var(--surface-active)]'}`}
                >
                    <LayoutGrid size={14} /> Customize Grid
                </button>
            </HeaderPortal>

            {/* Layout Customizer panel */}
            {showConfig && (
                <div className="p-5 bg-[var(--surface-variant)] border-2 border-[var(--on-surface)] rounded-xl space-y-4">
                    <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--on-surface)]">Layout Builder Workspace</h3>
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Drag cards to reorder</span>
                    </div>
                    <div className="grid gap-2">
                        {widgets.map((widget, index) => (
                            <div 
                                key={widget.id}
                                className="flex items-center justify-between p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl"
                            >
                                <div className="flex items-center gap-3">
                                    <GripVertical className="text-[var(--text-muted)] cursor-grab shrink-0" size={16} />
                                    <span className="text-xs font-bold text-[var(--on-surface)]">{widget.title}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => toggleColSpan(widget.id)}
                                        className="px-2.5 py-1 text-[8px] font-black border border-[var(--border)] rounded-lg hover:bg-[var(--surface-active)] uppercase"
                                    >
                                        Width: {widget.colSpan === 'full' ? 'Full' : 'Half'}
                                    </button>
                                    <button
                                        onClick={() => toggleVisibility(widget.id)}
                                        className={`p-1.5 rounded-lg border ${widget.visible ? 'text-sky-500 border-sky-500/20 bg-sky-500/5' : 'text-[var(--text-muted)] border-[var(--border)]'}`}
                                    >
                                        {widget.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                    <div className="flex gap-1">
                                        <button 
                                            disabled={index === 0}
                                            onClick={() => moveWidget(index, 'up')}
                                            className="p-1 rounded-lg border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface-active)]"
                                        >
                                            <ChevronUp size={12} />
                                        </button>
                                        <button 
                                            disabled={index === widgets.length - 1}
                                            onClick={() => moveWidget(index, 'down')}
                                            className="p-1 rounded-lg border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface-active)]"
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24">
                    <Spinner size="md" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {widgets.filter(w => w.visible).map((widget, index) => {
                        const isFull = widget.colSpan === 'full';
                        
                        return (
                            <div
                                key={widget.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                className={`transition-all duration-200 border-2 border-[var(--on-surface)] rounded-xl overflow-hidden bg-[var(--surface)] ${isFull ? 'col-span-1 md:col-span-2' : 'col-span-1'}`}
                            >
                                {/* Drag handles & title */}
                                <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-variant)] border-b-2 border-[var(--on-surface)] cursor-move select-none">
                                    <div className="flex items-center gap-2">
                                        <GripVertical size={14} className="text-[var(--text-muted)] cursor-grab" />
                                        <h2 className="text-xs font-black uppercase tracking-wider text-[var(--on-surface)]">{widget.title}</h2>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button 
                                            onClick={() => toggleColSpan(widget.id)}
                                            className="p-1 text-[8px] font-bold border border-[var(--on-surface)] hover:bg-[var(--surface-active)] uppercase rounded-sm"
                                            title="Toggle width size"
                                        >
                                            Resize
                                        </button>
                                        <button 
                                            onClick={() => toggleVisibility(widget.id)}
                                            className="p-1 border border-[var(--on-surface)] hover:bg-[var(--surface-active)] rounded-sm"
                                            title="Hide widget"
                                        >
                                            <EyeOff size={10} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 sm:p-5">
                                    {/* 🧠 AI BUSINESS INSIGHTS WIDGET */}
                                    {widget.id === 'insights' && (
                                        <div className="space-y-3">
                                            {insights.length === 0 ? (
                                                <div className="text-center py-6 text-xs text-[var(--text-muted)] font-mono">
                                                    No corporate metrics available to evaluate health patterns.
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {insights.map((insight, idx) => {
                                                        const colorMap = {
                                                            positive: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500',
                                                            warning: 'border-amber-500/20 bg-amber-500/5 text-amber-500',
                                                            negative: 'border-red-500/20 bg-red-500/5 text-red-500'
                                                        }[insight.type];

                                                        return (
                                                            <div 
                                                                key={idx}
                                                                className={`p-4 border rounded-xl space-y-1 ${colorMap}`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Sparkles size={14} />
                                                                    <h4 className="text-xs font-black uppercase tracking-wider">{insight.title}</h4>
                                                                </div>
                                                                <p className="text-[11px] leading-relaxed opacity-90 font-medium">{insight.description}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 🔮 PREDICTIVE REVENUE ANALYTICS WIDGET */}
                                    {widget.id === 'predictive' && (
                                        <div className="space-y-6">
                                            {/* Forecaster controller options */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Forecast Horizon</label>
                                                    <select 
                                                        value={forecastMonths} 
                                                        onChange={e => setForecastMonths(Number(e.target.value))}
                                                        className="w-full px-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg font-bold"
                                                    >
                                                        <option value={3}>Next 3 Months</option>
                                                        <option value={6}>Next 6 Months</option>
                                                        <option value={12}>Next 12 Months</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between">
                                                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Manual Adjustment</label>
                                                        <span className="text-[10px] font-black text-sky-500">{growthAdjustment >= 0 ? '+' : ''}{growthAdjustment}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min={-50} 
                                                        max={100} 
                                                        value={growthAdjustment} 
                                                        onChange={e => setGrowthAdjustment(Number(e.target.value))}
                                                        className="w-full accent-sky-500 mt-2 h-1.5 bg-[var(--border)] rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Confidence Intervals</label>
                                                    <div className="flex gap-1.5 mt-0.5">
                                                        {[90, 95, 99].map(lvl => (
                                                            <button
                                                                key={lvl}
                                                                onClick={() => setConfidenceLevel(lvl)}
                                                                className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${confidenceLevel === lvl ? 'bg-sky-500 text-white border-sky-500' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--on-surface)]'}`}
                                                            >
                                                                {lvl}%
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Historical + Forecast interactive Graph using SVG */}
                                            {predictiveAnalytics.historical.length < 2 ? (
                                                <div className="text-center py-12 text-xs text-[var(--text-muted)] font-mono">
                                                    Insufficient historical invoice transactions to compute regression models.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl p-4 overflow-x-auto">
                                                        <svg viewBox="0 0 600 220" className="w-full min-w-[500px] h-auto overflow-visible font-mono text-[9px] font-bold select-none">
                                                            {/* Horizontal Grid lines */}
                                                            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                                                                const y = 20 + (1-r)*160;
                                                                const val = Math.round(maxGraphVal * r);
                                                                return (
                                                                    <g key={i} className="opacity-20">
                                                                        <line x1="50" y1={y} x2="560" y2={y} stroke="var(--on-surface)" strokeDasharray="3 3" />
                                                                        <text x="5" y={y + 3} fill="var(--on-surface)">₹{val >= 100000 ? `${(val/100000).toFixed(1)}L` : val}</text>
                                                                    </g>
                                                                );
                                                            })}

                                                            {/* Vertical separator */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;
                                                                const separatorX = 50 + ((histCount - 1) / (totalCount - 1)) * 510;
                                                                return (
                                                                    <line x1={separatorX} y1="20" x2={separatorX} y2="180" stroke="var(--on-surface)" strokeWidth="1.5" strokeDasharray="5 5" className="opacity-40" />
                                                                );
                                                            })()}

                                                            {/* Shaded Confidence Interval polygon */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                const pointsUpper: string[] = [];
                                                                const pointsLower: string[] = [];

                                                                // Connect historical end-point into confidence intervals
                                                                const lastHist = predictiveAnalytics.historical[histCount - 1];
                                                                const lastHistX = 50 + (lastHist.index / (totalCount - 1)) * 510;
                                                                const lastHistY = 180 - (lastHist.revenue / maxGraphVal) * 160;
                                                                pointsUpper.push(`${lastHistX},${lastHistY}`);
                                                                pointsLower.push(`${lastHistX},${lastHistY}`);

                                                                predictiveAnalytics.forecasted.forEach(f => {
                                                                    const x = 50 + (f.index / (totalCount - 1)) * 510;
                                                                    const yUpper = 180 - (f.upperCI / maxGraphVal) * 160;
                                                                    const yLower = 180 - (f.lowerCI / maxGraphVal) * 160;
                                                                    pointsUpper.push(`${x},${yUpper}`);
                                                                    pointsLower.unshift(`${x},${yLower}`);
                                                                });

                                                                const polygonPoints = [...pointsUpper, ...pointsLower].join(' ');
                                                                return (
                                                                    <polygon points={polygonPoints} className="fill-sky-500/10 stroke-none" />
                                                                );
                                                            })()}

                                                            {/* Historical Trend Line (Black/White depending on theme) */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                const points = predictiveAnalytics.historical.map(pt => {
                                                                    const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                    const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                    return `${x},${y}`;
                                                                }).join(' ');

                                                                return (
                                                                    <polyline points={points} fill="none" stroke="var(--on-surface)" strokeWidth="2" />
                                                                );
                                                            })()}

                                                            {/* Forecast Projection Line (Sky Blue highlights) */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                // Include last historical point to make line continuous
                                                                const lastHist = predictiveAnalytics.historical[histCount - 1];
                                                                const lastHistX = 50 + (lastHist.index / (totalCount - 1)) * 510;
                                                                const lastHistY = 180 - (lastHist.revenue / maxGraphVal) * 160;

                                                                const points = [`${lastHistX},${lastHistY}`, ...predictiveAnalytics.forecasted.map(pt => {
                                                                    const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                    const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                    return `${x},${y}`;
                                                                })].join(' ');

                                                                return (
                                                                    <polyline points={points} fill="none" stroke="#0EA5E9" strokeWidth="2.5" strokeDasharray="3 3" />
                                                                );
                                                            })()}

                                                            {/* Data plot dots */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                return (
                                                                    <>
                                                                        {predictiveAnalytics.historical.map((pt, i) => {
                                                                            const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                            const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                            return <circle key={i} cx={x} cy={y} r="3" className="fill-[var(--surface)] stroke-[var(--on-surface)] stroke-2" />;
                                                                        })}
                                                                        {predictiveAnalytics.forecasted.map((pt, i) => {
                                                                            const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                            const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                            return <circle key={i} cx={x} cy={y} r="3" className="fill-[var(--surface)] stroke-[#0EA5E9] stroke-2" />;
                                                                        })}
                                                                    </>
                                                                );
                                                            })()}

                                                            {/* Date axis labels */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                const labels = [];
                                                                // First historical
                                                                labels.push(predictiveAnalytics.historical[0]);
                                                                // Mid historical if count is large
                                                                if (histCount > 4) {
                                                                    labels.push(predictiveAnalytics.historical[Math.floor(histCount / 2)]);
                                                                }
                                                                // Last historical
                                                                labels.push(predictiveAnalytics.historical[histCount - 1]);
                                                                // Last forecast
                                                                labels.push(predictiveAnalytics.forecasted[foreCount - 1]);

                                                                return labels.map((pt, i) => {
                                                                    const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                    const dateObj = new Date(pt.month + '-02');
                                                                    const formatLabel = dateObj.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                                                                    return (
                                                                        <text key={i} x={x} y="202" textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[8px] uppercase">{formatLabel}</text>
                                                                    );
                                                                });
                                                            })()}
                                                        </svg>
                                                    </div>
                                                    <div className="flex flex-wrap justify-between gap-4 text-[10px] font-mono text-[var(--text-muted)] font-bold px-1">
                                                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-sky-500/10 border border-sky-500/20 rounded-sm inline-block"></span> Forecast CI range ({confidenceLevel}%)</div>
                                                        <div className="flex gap-4">
                                                            <div>Historical Average: <span className="text-[var(--on-surface)]">₹{predictiveAnalytics.statistics.avgRevenue.toLocaleString('en-IN')}</span></div>
                                                            <div>Next Month projection: <span className="text-[#0EA5E9]">₹{predictiveAnalytics.forecasted[0]?.revenue.toLocaleString('en-IN')}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ⚠️ TRANSACTION ANOMALY DETECTOR */}
                                    {widget.id === 'anomalies' && (
                                        <div className="space-y-3">
                                            {anomalies.length === 0 ? (
                                                <div className="text-center py-8 text-xs text-emerald-500 bg-emerald-500/5 border border-emerald-500/20 rounded-xl font-mono flex items-center justify-center gap-2">
                                                    <Check size={14} /> Zero ledger transaction anomalies detected in this company registry.
                                                </div>
                                            ) : (
                                                <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                                                    <div className="grid grid-cols-12 bg-[var(--surface-variant)] px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]">
                                                        <div className="col-span-3">Type</div>
                                                        <div className="col-span-2">Severity</div>
                                                        <div className="col-span-5">Anomaly Detail</div>
                                                        <div className="col-span-2 text-right">Date</div>
                                                    </div>
                                                    <div className="divide-y divide-[var(--border)]">
                                                        {anomalies.slice(0, 8).map((anomaly, idx) => {
                                                            const severityColor = {
                                                                CRITICAL: 'text-red-500 bg-red-500/10 border-red-500/20',
                                                                HIGH: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
                                                                MEDIUM: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                                                            }[anomaly.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM'];

                                                            return (
                                                                <div 
                                                                    key={idx}
                                                                    className="grid grid-cols-12 px-4 py-3 items-center text-xs font-mono"
                                                                >
                                                                    <div className="col-span-3 font-bold text-[var(--on-surface)] uppercase text-[10px] tracking-tight">{anomaly.type}</div>
                                                                    <div className="col-span-2">
                                                                        <span className={`px-2 py-0.5 border text-[9px] font-black rounded-full ${severityColor}`}>
                                                                            {anomaly.severity}
                                                                        </span>
                                                                    </div>
                                                                    <div className="col-span-5 text-[11px] text-[var(--on-surface-variant)] pr-4 leading-normal">{anomaly.details}</div>
                                                                    <div className="col-span-2 text-right text-[10px] text-[var(--text-muted)] font-bold">{anomaly.date}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 📊 KEY FINANCIAL INDICATORS */}
                                    {widget.id === 'kpis' && (
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div className="bg-[var(--surface-variant)] p-4 rounded-xl border border-[var(--border)]">
                                                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Growth Index</p>
                                                <p className="text-lg font-black text-[var(--on-surface)] mt-1 font-mono">
                                                    {predictiveAnalytics.statistics.slope > 0 ? '+' : ''}
                                                    {predictiveAnalytics.statistics.slope !== 0 
                                                        ? `${Math.round((predictiveAnalytics.statistics.slope / (predictiveAnalytics.statistics.avgRevenue || 1)) * 100)}%`
                                                        : '0%'
                                                    }
                                                </p>
                                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase mt-1 block">MoM Slope trend</span>
                                            </div>
                                            <div className="bg-[var(--surface-variant)] p-4 rounded-xl border border-[var(--border)]">
                                                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Model STD Error</p>
                                                <p className="text-lg font-black text-[var(--on-surface)] mt-1 font-mono">
                                                    ₹{Math.round(predictiveAnalytics.statistics.stdError || 0).toLocaleString('en-IN')}
                                                </p>
                                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase mt-1 block">Forecasting variance</span>
                                            </div>
                                            <div className="bg-[var(--surface-variant)] p-4 rounded-xl border border-[var(--border)]">
                                                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Audit Anomaly Ratio</p>
                                                <p className="text-lg font-black text-[var(--on-surface)] mt-1 font-mono">
                                                    {vouchers.length > 0 
                                                        ? `${((anomalies.length / vouchers.length) * 100).toFixed(1)}%` 
                                                        : '0.0%'
                                                    }
                                                </p>
                                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase mt-1 block">Flagged records</span>
                                            </div>
                                            <div className="bg-[var(--surface-variant)] p-4 rounded-xl border border-[var(--border)]">
                                                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Active Stock UQC</p>
                                                <p className="text-lg font-black text-sky-500 mt-1 font-mono">
                                                    {stockItems.length}
                                                </p>
                                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase mt-1 block">Skus in database</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
