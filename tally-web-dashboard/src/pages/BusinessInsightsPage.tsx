import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { 
    Activity, TrendingUp, AlertOctagon, LayoutGrid, RefreshCw, 
    ChevronUp, ChevronDown, Sliders, Eye, EyeOff, GripVertical, Check, Info, Sparkles,
    Search, ArrowUpRight, ArrowDownRight, Layers, DollarSign, AlertTriangle, ShieldCheck,
    BarChart3, Zap, Filter, ArrowRight
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

    // Filters & UI state
    const [anomalyFilter, setAnomalyFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');
    const [anomalySearch, setAnomalySearch] = useState('');
    const [insightFilter, setInsightFilter] = useState<'ALL' | 'positive' | 'warning' | 'negative'>('ALL');
    const [activeTab, setActiveTab] = useState<'all' | 'predictive' | 'insights' | 'anomalies' | 'kpis'>('all');

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
                supabase
                    .from('vouchers')
                    .select('id, voucher_type, voucher_number, party_name, grand_total, total_amount, amount, voucher_date, date, cgst_amount, sgst_amount, igst_amount, cgst, sgst, igst, taxable_value, is_deleted, created_at')
                    .eq('company_id', selectedCompany.id)
                    .or('is_deleted.is.null,is_deleted.eq.false')
                    .order('voucher_date', { ascending: false })
                    .limit(5000),
                supabase
                    .from('ledgers')
                    .select('id, name, parent, parent_group, current_balance, closing_balance')
                    .eq('company_id', selectedCompany.id)
                    .limit(2000),
                supabase
                    .from('stock_items')
                    .select('id, name, current_stock, closing_balance, closing_rate, standard_cost, purchase_price, rate, cost_price')
                    .eq('company_id', selectedCompany.id)
                    .limit(2000)
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

        const expenseLedgers = ledgers
            .filter(l => String(l.parent_group || l.parent || '').toLowerCase().includes('expense'))
            .reduce((sum, l) => sum + Math.abs(toNumber(l.closing_balance || l.current_balance)), 0);

        const capitalLedgers = ledgers
            .filter(l => {
                const group = String(l.parent_group || l.parent || '').toLowerCase();
                return group.includes('capital') || group.includes('equity') || group.includes('reserve');
            })
            .reduce((sum, l) => sum + Math.abs(toNumber(l.closing_balance || l.current_balance)), 0);

        const cashBankBalance = ledgers
            .filter(l => {
                const group = String(l.parent_group || l.parent || '').toLowerCase();
                return group.includes('cash') || group.includes('bank');
            })
            .reduce((sum, l) => sum + Math.abs(toNumber(l.closing_balance || l.current_balance)), 0);

        const stockValue = stockItems.reduce((sum, s) => {
            const qty = toNumber(s.current_stock);
            const rate = toNumber(s.purchase_price || s.rate || s.cost_price || 0);
            return sum + (qty * rate);
        }, 0);

        const currentAssets = debtorBalance + stockValue + cashBankBalance;
        const currentLiabilities = creditorBalance || 1;
        const totalLiabilities = creditorBalance;
        const shareholderEquity = capitalLedgers || 1;
        const cogs = totalPurchases;
        const avgInventory = stockValue;

        const list = [];

        // 1. Current Ratio
        const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
        list.push({
            type: currentRatio >= 1.5 ? 'positive' : currentRatio >= 1 ? 'warning' : 'negative',
            title: 'Current Ratio',
            description: `Current Ratio is ${currentRatio.toFixed(2)}x (Current Assets ₹${Math.round(currentAssets).toLocaleString('en-IN')} / Current Liabilities ₹${Math.round(currentLiabilities).toLocaleString('en-IN')}). ${currentRatio >= 1.5 ? 'Strong short-term liquidity position.' : currentRatio >= 1 ? 'Adequate but monitor closely.' : 'Insufficient assets to cover short-term obligations.'}`
        });

        // 2. Quick Ratio (Acid Test)
        const quickRatio = currentLiabilities > 0 ? (currentAssets - stockValue) / currentLiabilities : 0;
        list.push({
            type: quickRatio >= 1 ? 'positive' : quickRatio >= 0.7 ? 'warning' : 'negative',
            title: 'Quick Ratio (Acid Test)',
            description: `Quick Ratio is ${quickRatio.toFixed(2)}x (Liquid Assets ₹${Math.round(currentAssets - stockValue).toLocaleString('en-IN')} / Current Liabilities ₹${Math.round(currentLiabilities).toLocaleString('en-IN')}). ${quickRatio >= 1 ? 'Can meet short-term obligations without selling inventory.' : 'May struggle to cover obligations without inventory liquidation.'}`
        });

        // 3. Debt-to-Equity Ratio
        const debtEquityRatio = shareholderEquity > 0 ? totalLiabilities / shareholderEquity : 0;
        list.push({
            type: debtEquityRatio <= 1.5 ? 'positive' : debtEquityRatio <= 2.5 ? 'warning' : 'negative',
            title: 'Debt-to-Equity Ratio',
            description: `D/E Ratio is ${debtEquityRatio.toFixed(2)}x (Total Liabilities ₹${Math.round(totalLiabilities).toLocaleString('en-IN')} / Equity ₹${Math.round(shareholderEquity).toLocaleString('en-IN')}). ${debtEquityRatio <= 1.5 ? 'Healthy leverage — well within safe thresholds.' : debtEquityRatio <= 2.5 ? 'Elevated debt levels — consider equity infusion.' : 'Critically high leverage. Refinancing recommended.'}`
        });

        // 4. Gross Profit Margin
        const grossProfit = totalSales - totalPurchases;
        const grossProfitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
        list.push({
            type: grossProfitMargin >= 30 ? 'positive' : grossProfitMargin >= 15 ? 'warning' : 'negative',
            title: 'Gross Profit Margin',
            description: `Gross Margin is ${grossProfitMargin.toFixed(1)}% (Revenue ₹${Math.round(totalSales).toLocaleString('en-IN')} − COGS ₹${Math.round(totalPurchases).toLocaleString('en-IN')} = ₹${Math.round(grossProfit).toLocaleString('en-IN')}). ${grossProfitMargin >= 30 ? 'Excellent margin — strong pricing power.' : grossProfitMargin >= 15 ? 'Moderate margin — room for cost optimization.' : 'Thin margins — review procurement and pricing strategy.'}`
        });

        // 5. Net Profit Margin
        const netProfit = totalSales - totalPurchases - expenseLedgers;
        const netProfitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
        list.push({
            type: netProfitMargin >= 10 ? 'positive' : netProfitMargin >= 0 ? 'warning' : 'negative',
            title: 'Net Profit Margin',
            description: `Net Margin is ${netProfitMargin.toFixed(1)}% (Net Profit ₹${Math.round(netProfit).toLocaleString('en-IN')} on Revenue ₹${Math.round(totalSales).toLocaleString('en-IN')}). ${netProfitMargin >= 10 ? 'Healthy bottom-line conversion.' : netProfitMargin >= 0 ? 'Break-even territory — control overheads.' : 'Operating at a net loss — urgent restructuring needed.'}`
        });

        // 6. Inventory Turnover
        const inventoryTurnover = avgInventory > 0 ? cogs / avgInventory : 0;
        list.push({
            type: inventoryTurnover >= 6 ? 'positive' : inventoryTurnover >= 3 ? 'warning' : 'negative',
            title: 'Inventory Turnover',
            description: `Inventory turns over ${inventoryTurnover.toFixed(1)}x per period (COGS ₹${Math.round(cogs).toLocaleString('en-IN')} / Inventory ₹${Math.round(avgInventory).toLocaleString('en-IN')}). ${inventoryTurnover >= 6 ? 'Efficient stock management — fast-moving inventory.' : inventoryTurnover >= 3 ? 'Moderate turnover — optimize reorder cycles.' : 'Slow-moving stock — risk of obsolescence and carrying costs.'}`
        });

        // 7. Days Sales Outstanding (DSO)
        const dso = totalSales > 0 ? (debtorBalance / totalSales) * 365 : 0;
        list.push({
            type: dso <= 30 ? 'positive' : dso <= 60 ? 'warning' : 'negative',
            title: 'Days Sales Outstanding (DSO)',
            description: `DSO is ${Math.round(dso)} days — customers take ~${Math.round(dso)} days to pay on average. ${dso <= 30 ? 'Excellent collection cycle.' : dso <= 60 ? 'Moderate — tighten credit terms or follow up on overdue accounts.' : 'Critical delay in receivables. Implement stricter collection policy.'}`
        });

        // 8. Days Payable Outstanding (DPO)
        const dpo = totalPurchases > 0 ? (creditorBalance / totalPurchases) * 365 : 0;
        list.push({
            type: dpo >= 30 && dpo <= 60 ? 'positive' : dpo < 15 ? 'warning' : 'info',
            title: 'Days Payable Outstanding (DPO)',
            description: `DPO is ${Math.round(dpo)} days — you take ~${Math.round(dpo)} days to settle supplier payments. ${dpo >= 30 && dpo <= 60 ? 'Healthy payables management.' : dpo < 15 ? 'Paying too fast — optimize cash retention by extending terms.' : 'Review payment terms with suppliers to balance cash flow.'}`
        });

        // 9. Cash Conversion Cycle (CCC)
        const dio = inventoryTurnover > 0 ? 365 / inventoryTurnover : 0;
        const ccc = dso + dio - dpo;
        list.push({
            type: ccc <= 45 ? 'positive' : ccc <= 90 ? 'warning' : 'negative',
            title: 'Cash Conversion Cycle (CCC)',
            description: `CCC is ${Math.round(ccc)} days (DSO ${Math.round(dso)} + DIO ${Math.round(dio)} − DPO ${Math.round(dpo)}). ${ccc <= 45 ? 'Excellent — cash is recycled quickly through operations.' : ccc <= 90 ? 'Moderate cycle — working capital is tied up for ~3 months.' : 'Long cycle — significant cash lockup in operations.'}`
        });

        // 10. Revenue Growth Rate (Month-over-Month)
        const monthlySalesMap: Record<string, number> = {};
        sales.forEach(v => {
            const dateStr = v.voucher_date || v.created_at;
            if (!dateStr) return;
            const monthKey = dateStr.substring(0, 7);
            monthlySalesMap[monthKey] = (monthlySalesMap[monthKey] || 0) + toNumber(v.grand_total || v.total_amount);
        });
        const sortedMonths = Object.keys(monthlySalesMap).sort();
        if (sortedMonths.length >= 2) {
            const currentMonthSales = monthlySalesMap[sortedMonths[sortedMonths.length - 1]];
            const prevMonthSales = monthlySalesMap[sortedMonths[sortedMonths.length - 2]];
            const growthRate = prevMonthSales > 0 ? ((currentMonthSales - prevMonthSales) / prevMonthSales) * 100 : 0;
            list.push({
                type: growthRate > 5 ? 'positive' : growthRate > -5 ? 'warning' : 'negative',
                title: 'Revenue Growth Rate (MoM)',
                description: `Month-over-month growth is ${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}% (Current: ₹${Math.round(currentMonthSales).toLocaleString('en-IN')} vs Previous: ₹${Math.round(prevMonthSales).toLocaleString('en-IN')}). ${growthRate > 5 ? 'Strong revenue acceleration.' : growthRate > -5 ? 'Stable — minor fluctuation.' : 'Revenue contraction detected — investigate.'}`
            });
        }

        // 11. Top 5 Customers by Revenue
        const customerMap: Record<string, number> = {};
        sales.forEach(v => {
            if (v.party_name) {
                customerMap[v.party_name] = (customerMap[v.party_name] || 0) + toNumber(v.grand_total || v.total_amount);
            }
        });
        const topCustomers = Object.entries(customerMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (topCustomers.length > 0) {
            const topCustomerStr = topCustomers.map(([name, amt]) => `${name} (₹${Math.round(amt).toLocaleString('en-IN')})`).join(', ');
            list.push({
                type: 'info',
                title: 'Top 5 Customers by Revenue',
                description: `Your largest revenue contributors: ${topCustomerStr}.`
            });
        }

        // 12. Top 5 Suppliers by Purchases
        const supplierMap: Record<string, number> = {};
        purchases.forEach(v => {
            if (v.party_name) {
                supplierMap[v.party_name] = (supplierMap[v.party_name] || 0) + toNumber(v.grand_total || v.total_amount);
            }
        });
        const topSuppliers = Object.entries(supplierMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (topSuppliers.length > 0) {
            const topSupplierStr = topSuppliers.map(([name, amt]) => `${name} (₹${Math.round(amt).toLocaleString('en-IN')})`).join(', ');
            list.push({
                type: 'info',
                title: 'Top 5 Suppliers by Purchases',
                description: `Your largest procurement partners: ${topSupplierStr}.`
            });
        }

        // 13. Stock Coverage Days
        const dailyCogs = cogs > 0 ? cogs / 365 : 0;
        const stockCoverageDays = dailyCogs > 0 ? stockValue / dailyCogs : 0;
        list.push({
            type: stockCoverageDays >= 30 && stockCoverageDays <= 90 ? 'positive' : stockCoverageDays < 15 ? 'negative' : 'warning',
            title: 'Stock Coverage Days',
            description: `Current inventory covers ~${Math.round(stockCoverageDays)} days of operations at current COGS rate (Stock ₹${Math.round(stockValue).toLocaleString('en-IN')} / Daily COGS ₹${Math.round(dailyCogs).toLocaleString('en-IN')}). ${stockCoverageDays >= 30 && stockCoverageDays <= 90 ? 'Optimal stock levels — balanced availability and cost.' : stockCoverageDays < 15 ? 'Critically low stock — risk of stockouts.' : 'Excess inventory — carrying costs may erode margins.'}`
        });

        // 14. Receivables Concentration (% of sales outstanding)
        const overduePercentage = debtorBalance > 0 && totalSales > 0
            ? Math.min(100, Math.round((debtorBalance / totalSales) * 100))
            : 0;
        list.push({
            type: overduePercentage <= 25 ? 'positive' : overduePercentage <= 50 ? 'warning' : 'negative',
            title: 'Receivables Concentration',
            description: `Outstanding receivables represent ${overduePercentage}% of total sales (₹${Math.round(debtorBalance).toLocaleString('en-IN')} of ₹${Math.round(totalSales).toLocaleString('en-IN')}). ${overduePercentage <= 25 ? 'Well-managed receivables.' : overduePercentage <= 50 ? 'Monitor aging closely — follow up on overdue invoices.' : 'High receivables ratio — collections need immediate attention.'}`
        });

        // 15. Expense Breakdown by Category
        const expenseBreakdown: Record<string, number> = {};
        ledgers
            .filter(l => String(l.parent_group || l.parent || '').toLowerCase().includes('expense'))
            .forEach(l => {
                const group = String(l.parent_group || l.parent || 'Other Expenses');
                expenseBreakdown[group] = (expenseBreakdown[group] || 0) + Math.abs(toNumber(l.closing_balance || l.current_balance));
            });
        if (Object.keys(expenseBreakdown).length > 0) {
            const breakdownStr = Object.entries(expenseBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, amt]) => `${cat}: ₹${Math.round(amt).toLocaleString('en-IN')}`)
                .join(' | ');
            list.push({
                type: 'info',
                title: 'Expense Breakdown by Category',
                description: `Total expenses: ₹${Math.round(expenseLedgers).toLocaleString('en-IN')}. Top categories — ${breakdownStr}.`
            });
        }

        // 16. Monthly Burn Rate
        const monthlyExpenses: Record<string, number> = {};
        const expenseVouchers = vouchers.filter(v => {
            const type = String(v.voucher_type || '').toLowerCase();
            return type.includes('expense') || type.includes('payment') || type.includes('journal');
        });
        expenseVouchers.forEach(v => {
            const dateStr = v.voucher_date || v.created_at;
            if (!dateStr) return;
            const monthKey = dateStr.substring(0, 7);
            monthlyExpenses[monthKey] = (monthlyExpenses[monthKey] || 0) + toNumber(v.grand_total || v.total_amount);
        });
        const expenseMonths = Object.keys(monthlyExpenses);
        const avgBurnRate = expenseMonths.length > 0
            ? Object.values(monthlyExpenses).reduce((sum, v) => sum + v, 0) / expenseMonths.length
            : expenseLedgers / 12;
        list.push({
            type: 'info',
            title: 'Monthly Burn Rate',
            description: `Average monthly expenditure is ₹${Math.round(avgBurnRate).toLocaleString('en-IN')} (based on ${expenseMonths.length || 1} periods of data). At this rate, estimated annual spend: ₹${Math.round(avgBurnRate * 12).toLocaleString('en-IN')}.`
        });

        // 17. Working Capital
        const workingCapital = currentAssets - currentLiabilities;
        list.push({
            type: workingCapital > 0 ? 'positive' : 'negative',
            title: 'Working Capital',
            description: `Net Working Capital is ₹${Math.round(workingCapital).toLocaleString('en-IN')} (Current Assets ₹${Math.round(currentAssets).toLocaleString('en-IN')} − Current Liabilities ₹${Math.round(currentLiabilities).toLocaleString('en-IN')}). ${workingCapital > 0 ? 'Positive working capital — can fund day-to-day operations.' : 'Negative working capital — liquidity risk. Consider raising short-term finance.'}`
        });

        // 18. Payables-to-Receivables Ratio
        const payablesToReceivables = debtorBalance > 0 ? creditorBalance / debtorBalance : 0;
        list.push({
            type: payablesToReceivables >= 0.5 && payablesToReceivables <= 1 ? 'positive' : payablesToReceivables > 1.5 ? 'warning' : 'info',
            title: 'Payables-to-Receivables Ratio',
            description: `Ratio is ${payablesToReceivables.toFixed(2)}x (Payables ₹${Math.round(creditorBalance).toLocaleString('en-IN')} / Receivables ₹${Math.round(debtorBalance).toLocaleString('en-IN')}). ${payablesToReceivables >= 0.5 && payablesToReceivables <= 1 ? 'Balanced — healthy alignment of payables and receivables.' : payablesToReceivables > 1.5 ? 'Payables significantly exceed receivables — cash flow pressure.' : 'Low ratio — receivables are well-covered by payables buffer.'}`
        });

        // 19. Cash Flow Health (Sales vs Purchases surplus)
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

        // 20. Inventory Stockout Alert
        const zeroStock = stockItems.filter(s => toNumber(s.current_stock) <= 0);
        if (zeroStock.length > 0) {
            list.push({
                type: 'warning',
                title: 'Out-Of-Stock Sales Leakage',
                description: `${zeroStock.length} items have critical zero stock levels (e.g. ${zeroStock.slice(0, 3).map(s => s.name).join(', ')}). Possible supply chain blockages.`
            });
        }

        // 21. Future Revenue Trajectory
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

    const totalSalesAmount = useMemo(() => {
        return vouchers
            .filter(v => ['Sales', 'Sales Invoice'].includes(v.voucher_type))
            .reduce((sum, v) => sum + toNumber(v.grand_total || v.total_amount || v.amount), 0);
    }, [vouchers]);

    const criticalAnomaliesCount = useMemo(() => {
        return anomalies.filter(a => a.severity === 'CRITICAL').length;
    }, [anomalies]);

    const filteredAnomalies = useMemo(() => {
        return anomalies.filter(a => {
            if (anomalyFilter !== 'ALL' && a.severity !== anomalyFilter) return false;
            if (anomalySearch) {
                const q = anomalySearch.toLowerCase();
                return (
                    (a.party && a.party.toLowerCase().includes(q)) ||
                    (a.type && a.type.toLowerCase().includes(q)) ||
                    (a.details && a.details.toLowerCase().includes(q)) ||
                    (a.refNo && a.refNo.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [anomalies, anomalyFilter, anomalySearch]);

    const filteredInsights = useMemo(() => {
        if (insightFilter === 'ALL') return insights;
        return insights.filter(i => i.type === insightFilter);
    }, [insights, insightFilter]);

    // Graph maximum calculator
    const maxGraphVal = useMemo(() => {
        const histMax = Math.max(...predictiveAnalytics.historical.map(h => h.revenue), 1);
        const foreMax = Math.max(...predictiveAnalytics.forecasted.map(f => f.upperCI), 1);
        return Math.max(histMax, foreMax) * 1.15;
    }, [predictiveAnalytics]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24 px-4 sm:px-6">
            <HeaderPortal type="title">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                        <Sparkles size={20} className="animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg md:text-xl font-bold tracking-tight text-zinc-100">Advanced Analytics & AI</h1>
                            <span className="hidden sm:inline-flex items-center rounded-full bg-cyan-400/10 border border-cyan-400/30 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-400">
                                Live AI Engine
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400">Predictive forecasting, transaction anomaly detector & financial intelligence</p>
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all disabled:opacity-50"
                        title="Reload fresh data from database"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>
                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                            showConfig 
                                ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-300 shadow-md shadow-cyan-500/10' 
                                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                    >
                        <LayoutGrid size={14} /> 
                        <span>Customize Grid</span>
                    </button>
                </div>
            </HeaderPortal>

            {/* Quick Metrics Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 relative overflow-hidden backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400">Analyzed Revenue</span>
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-bold text-zinc-100 font-mono">
                            ₹{totalSalesAmount >= 10000000 
                                ? `${(totalSalesAmount / 10000000).toFixed(2)} Cr` 
                                : totalSalesAmount >= 100000 
                                ? `${(totalSalesAmount / 100000).toFixed(2)} L` 
                                : Math.round(totalSalesAmount).toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Historical sales analyzed</p>
                    </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 relative overflow-hidden backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400">Next Month Forecast</span>
                        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <Sparkles size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono">
                            {predictiveAnalytics.forecasted[0] ? (
                                `₹${predictiveAnalytics.forecasted[0].revenue >= 100000 
                                    ? `${(predictiveAnalytics.forecasted[0].revenue / 100000).toFixed(2)} L` 
                                    : Math.round(predictiveAnalytics.forecasted[0].revenue).toLocaleString('en-IN')}`
                            ) : 'Calculating...'}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                            {confidenceLevel}% confidence horizon
                        </p>
                    </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 relative overflow-hidden backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400">Growth Index (MoM)</span>
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Activity size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-bold text-zinc-100 font-mono">
                            {predictiveAnalytics.statistics.slope > 0 ? '+' : ''}
                            {predictiveAnalytics.statistics.slope !== 0 
                                ? `${Math.round((predictiveAnalytics.statistics.slope / (predictiveAnalytics.statistics.avgRevenue || 1)) * 100)}%`
                                : '0%'
                            }
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Regression trajectory slope</p>
                    </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 relative overflow-hidden backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400">Audit Anomalies</span>
                        <div className={`p-2 rounded-lg border ${criticalAnomaliesCount > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                            <AlertOctagon size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="flex items-baseline gap-2">
                            <p className="text-xl sm:text-2xl font-bold text-zinc-100 font-mono">{anomalies.length}</p>
                            {criticalAnomaliesCount > 0 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400">
                                    {criticalAnomaliesCount} Critical
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Pattern flags detected</p>
                    </div>
                </div>
            </div>

            {/* Layout Customizer panel */}
            {showConfig && (
                <div className="p-5 bg-zinc-900/80 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-md space-y-4">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-200">Customize Grid Layout</h3>
                            <p className="text-xs text-zinc-500">Reorder, hide, or resize individual analytical widgets</p>
                        </div>
                        <span className="text-xs font-medium text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-md border border-cyan-400/20">Drag cards to reorder</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {widgets.map((widget, index) => (
                            <div 
                                key={widget.id}
                                className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl"
                            >
                                <div className="flex items-center gap-3">
                                    <GripVertical className="text-zinc-600 cursor-grab shrink-0 hover:text-zinc-400" size={16} />
                                    <span className="text-xs font-medium text-zinc-200">{widget.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button 
                                        onClick={() => toggleColSpan(widget.id)}
                                        className="px-2 py-1 text-[10px] font-semibold border border-zinc-700 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
                                    >
                                        {widget.colSpan === 'full' ? 'Full Width' : 'Half Width'}
                                    </button>
                                    <button
                                        onClick={() => toggleVisibility(widget.id)}
                                        className={`p-1.5 rounded-lg border transition-colors ${widget.visible ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' : 'text-zinc-600 border-zinc-800'}`}
                                    >
                                        {widget.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                    <div className="flex gap-1">
                                        <button 
                                            disabled={index === 0}
                                            onClick={() => moveWidget(index, 'up')}
                                            className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:bg-zinc-800 transition-colors"
                                        >
                                            <ChevronUp size={12} />
                                        </button>
                                        <button 
                                            disabled={index === widgets.length - 1}
                                            onClick={() => moveWidget(index, 'down')}
                                            className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:bg-zinc-800 transition-colors"
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
                <div className="flex flex-col items-center justify-center py-24 text-zinc-500 space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                    <p className="text-sm font-medium">Running advanced AI mathematical models...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                                className={`transition-all duration-200 rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl shadow-xl overflow-hidden hover:border-zinc-700/80 ${isFull ? 'col-span-1 md:col-span-2' : 'col-span-1'}`}
                            >
                                {/* Drag handles & title */}
                                <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900/80 border-b border-zinc-800 cursor-move select-none">
                                    <div className="flex items-center gap-2.5">
                                        <GripVertical size={16} className="text-zinc-600 cursor-grab hover:text-zinc-400" />
                                        <h2 className="text-sm font-semibold text-zinc-100">{widget.title}</h2>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => toggleColSpan(widget.id)}
                                            className="px-2 py-0.5 text-[10px] font-medium border border-zinc-700/80 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                                            title="Toggle width size"
                                        >
                                            {widget.colSpan === 'full' ? 'Collapse' : 'Expand'}
                                        </button>
                                        <button 
                                            onClick={() => toggleVisibility(widget.id)}
                                            className="p-1 border border-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-md transition-colors"
                                            title="Hide widget"
                                        >
                                            <EyeOff size={12} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-5 sm:p-6">
                                    {/* 🧠 AI BUSINESS INSIGHTS WIDGET */}
                                    {widget.id === 'insights' && (
                                        <div className="space-y-4">
                                            {/* Insights Filter Tabs */}
                                            <div className="flex flex-wrap gap-2">
                                                {(['ALL', 'positive', 'warning', 'negative'] as const).map(f => (
                                                    <button
                                                        key={f}
                                                        onClick={() => setInsightFilter(f)}
                                                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                                            insightFilter === f
                                                                ? 'bg-cyan-400/15 border border-cyan-400/40 text-cyan-300'
                                                                : 'bg-zinc-800/40 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                                        }`}
                                                    >
                                                        {f === 'ALL' ? `All Insights (${insights.length})` : f === 'positive' ? 'Healthy Trajectories' : f === 'warning' ? 'Watchpoints' : 'Critical Risks'}
                                                    </button>
                                                ))}
                                            </div>

                                            {filteredInsights.length === 0 ? (
                                                <div className="text-center py-12 text-xs text-zinc-500 font-mono">
                                                    No metrics match the selected category.
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                                    {filteredInsights.map((insight, idx) => {
                                                        const isPos = insight.type === 'positive';
                                                        const isWarn = insight.type === 'warning';
                                                        const isNeg = insight.type === 'negative';

                                                        return (
                                                            <div 
                                                                key={idx}
                                                                className={`p-4 border rounded-xl space-y-1.5 transition-all hover:scale-[1.01] ${
                                                                    isPos ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400' :
                                                                    isWarn ? 'border-amber-500/25 bg-amber-500/5 text-amber-400' :
                                                                    isNeg ? 'border-rose-500/25 bg-rose-500/5 text-rose-400' :
                                                                    'border-cyan-500/25 bg-cyan-500/5 text-cyan-400'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <Sparkles size={14} />
                                                                        <h4 className="text-xs font-semibold uppercase tracking-wider">{insight.title}</h4>
                                                                    </div>
                                                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-current opacity-80">
                                                                        {insight.type}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs leading-relaxed text-zinc-300 font-normal pt-1">{insight.description}</p>
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
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-zinc-400">Forecast Horizon</label>
                                                    <select 
                                                        value={forecastMonths} 
                                                        onChange={e => setForecastMonths(Number(e.target.value))}
                                                        className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg outline-none focus:border-cyan-500"
                                                    >
                                                        <option value={3}>Next 3 Months</option>
                                                        <option value={6}>Next 6 Months</option>
                                                        <option value={12}>Next 12 Months</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-xs font-medium text-zinc-400">Manual Growth Factor</label>
                                                        <span className="text-xs font-bold text-cyan-400 font-mono">{growthAdjustment >= 0 ? '+' : ''}{growthAdjustment}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min={-50} 
                                                        max={100} 
                                                        value={growthAdjustment} 
                                                        onChange={e => setGrowthAdjustment(Number(e.target.value))}
                                                        className="w-full accent-cyan-400 mt-2 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-zinc-400">Confidence Band</label>
                                                    <div className="flex gap-2">
                                                        {[90, 95, 99].map(lvl => (
                                                            <button
                                                                key={lvl}
                                                                onClick={() => setConfidenceLevel(lvl)}
                                                                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                                    confidenceLevel === lvl 
                                                                        ? 'bg-cyan-500 text-zinc-950 font-bold border-cyan-400' 
                                                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                                                }`}
                                                            >
                                                                {lvl}%
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Historical + Forecast interactive Graph using SVG */}
                                            {predictiveAnalytics.historical.length < 2 ? (
                                                <div className="text-center py-12 text-xs text-zinc-500 font-mono">
                                                    Insufficient historical invoice transactions to compute regression models.
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 overflow-x-auto">
                                                        <svg viewBox="0 0 600 220" className="w-full min-w-[500px] h-auto overflow-visible select-none">
                                                            <defs>
                                                                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                                                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                                                                </linearGradient>
                                                                <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
                                                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                                                                </linearGradient>
                                                            </defs>

                                                            {/* Horizontal Grid lines */}
                                                            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                                                                const y = 20 + (1-r)*160;
                                                                const val = Math.round(maxGraphVal * r);
                                                                return (
                                                                    <g key={i} className="opacity-30">
                                                                        <line x1="50" y1={y} x2="560" y2={y} stroke="#52525b" strokeDasharray="3 3" />
                                                                        <text x="5" y={y + 3} fill="#a1a1aa" className="text-[9px] font-mono">
                                                                            ₹{val >= 10000000 ? `${(val/10000000).toFixed(1)}Cr` : val >= 100000 ? `${(val/100000).toFixed(1)}L` : val}
                                                                        </text>
                                                                    </g>
                                                                );
                                                            })}

                                                            {/* Vertical separator between historical and forecast */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;
                                                                const separatorX = 50 + ((histCount - 1) / (totalCount - 1)) * 510;
                                                                return (
                                                                    <g>
                                                                        <line x1={separatorX} y1="20" x2={separatorX} y2="180" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="4 4" className="opacity-50" />
                                                                        <text x={separatorX} y="15" textAnchor="middle" fill="#06b6d4" className="text-[8px] font-semibold uppercase tracking-wider">Forecast Split</text>
                                                                    </g>
                                                                );
                                                            })()}

                                                            {/* Shaded Confidence Interval polygon */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                const pointsUpper: string[] = [];
                                                                const pointsLower: string[] = [];

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
                                                                    <polygon points={polygonPoints} fill="url(#foreGrad)" stroke="none" />
                                                                );
                                                            })()}

                                                            {/* Historical Area Fill */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                const firstHist = predictiveAnalytics.historical[0];
                                                                const firstX = 50 + (firstHist.index / (totalCount - 1)) * 510;
                                                                const lastHist = predictiveAnalytics.historical[histCount - 1];
                                                                const lastX = 50 + (lastHist.index / (totalCount - 1)) * 510;

                                                                const linePts = predictiveAnalytics.historical.map(pt => {
                                                                    const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                    const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                    return `${x},${y}`;
                                                                }).join(' ');

                                                                const areaPoints = `${firstX},180 ${linePts} ${lastX},180`;
                                                                return (
                                                                    <polygon points={areaPoints} fill="url(#areaGrad)" stroke="none" />
                                                                );
                                                            })()}

                                                            {/* Historical Line */}
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
                                                                    <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="2.5" />
                                                                );
                                                            })()}

                                                            {/* Forecast Line */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                const lastHist = predictiveAnalytics.historical[histCount - 1];
                                                                const lastHistX = 50 + (lastHist.index / (totalCount - 1)) * 510;
                                                                const lastHistY = 180 - (lastHist.revenue / maxGraphVal) * 160;

                                                                const points = [`${lastHistX},${lastHistY}`, ...predictiveAnalytics.forecasted.map(pt => {
                                                                    const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                    const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                    return `${x},${y}`;
                                                                })].join(' ');

                                                                return (
                                                                    <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="4 4" />
                                                                );
                                                            })()}

                                                            {/* Data Dots */}
                                                            {(() => {
                                                                const histCount = predictiveAnalytics.historical.length;
                                                                const foreCount = predictiveAnalytics.forecasted.length;
                                                                const totalCount = histCount + foreCount;

                                                                return (
                                                                    <>
                                                                        {predictiveAnalytics.historical.map((pt, i) => {
                                                                            const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                            const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                            return <circle key={i} cx={x} cy={y} r="3.5" fill="#0891b2" stroke="#22d3ee" strokeWidth="2" />;
                                                                        })}
                                                                        {predictiveAnalytics.forecasted.map((pt, i) => {
                                                                            const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                            const y = 180 - (pt.revenue / maxGraphVal) * 160;
                                                                            return <circle key={i} cx={x} cy={y} r="3.5" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />;
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
                                                                labels.push(predictiveAnalytics.historical[0]);
                                                                if (histCount > 4) {
                                                                    labels.push(predictiveAnalytics.historical[Math.floor(histCount / 2)]);
                                                                }
                                                                labels.push(predictiveAnalytics.historical[histCount - 1]);
                                                                labels.push(predictiveAnalytics.forecasted[foreCount - 1]);

                                                                return labels.map((pt, i) => {
                                                                    const x = 50 + (pt.index / (totalCount - 1)) * 510;
                                                                    const dateObj = new Date(pt.month + '-02');
                                                                    const formatLabel = dateObj.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                                                                    return (
                                                                        <text key={i} x={x} y="205" textAnchor="middle" fill="#71717a" className="font-mono text-[9px] uppercase font-semibold">{formatLabel}</text>
                                                                    );
                                                                });
                                                            })()}
                                                        </svg>
                                                    </div>

                                                    <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-zinc-400 px-1 pt-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-3 h-3 bg-cyan-500/20 border border-cyan-400 rounded-sm inline-block"></span>
                                                            <span>Confidence Band ({confidenceLevel}%)</span>
                                                        </div>
                                                        <div className="flex gap-6">
                                                            <div>Historical Average: <span className="text-zinc-100 font-semibold font-mono">₹{predictiveAnalytics.statistics.avgRevenue.toLocaleString('en-IN')}</span></div>
                                                            <div>Next Month Projection: <span className="text-cyan-400 font-bold font-mono">₹{predictiveAnalytics.forecasted[0]?.revenue.toLocaleString('en-IN')}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ⚠️ TRANSACTION ANOMALY DETECTOR */}
                                    {widget.id === 'anomalies' && (
                                        <div className="space-y-4">
                                            {/* Anomaly Controls */}
                                            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                                                <div className="relative flex-1 w-full sm:max-w-xs">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                                                    <input
                                                        type="text"
                                                        placeholder="Search by party, type, or ref..."
                                                        value={anomalySearch}
                                                        onChange={e => setAnomalySearch(e.target.value)}
                                                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-950/60 border border-zinc-800 rounded-lg text-zinc-200 outline-none focus:border-cyan-500"
                                                    />
                                                </div>
                                                <div className="flex gap-1.5">
                                                    {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'] as const).map(sev => (
                                                        <button
                                                            key={sev}
                                                            onClick={() => setAnomalyFilter(sev)}
                                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                                                                anomalyFilter === sev
                                                                    ? sev === 'CRITICAL' ? 'bg-rose-500/15 border-rose-500/40 text-rose-300' :
                                                                      sev === 'HIGH' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' :
                                                                      'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                                                    : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                                            }`}
                                                        >
                                                            {sev}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {filteredAnomalies.length === 0 ? (
                                                <div className="text-center py-10 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl font-mono flex items-center justify-center gap-2">
                                                    <Check size={16} /> Zero transaction anomalies found matching your criteria.
                                                </div>
                                            ) : (
                                                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                                                    <div className="grid grid-cols-12 bg-zinc-950/80 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                                                        <div className="col-span-3">Type</div>
                                                        <div className="col-span-2">Severity</div>
                                                        <div className="col-span-5">Anomaly Detail</div>
                                                        <div className="col-span-2 text-right">Date</div>
                                                    </div>
                                                    <div className="divide-y divide-zinc-800/60 max-h-[360px] overflow-y-auto">
                                                        {filteredAnomalies.slice(0, 15).map((anomaly, idx) => {
                                                            const isCrit = anomaly.severity === 'CRITICAL';
                                                            const isHigh = anomaly.severity === 'HIGH';

                                                            return (
                                                                <div 
                                                                    key={idx}
                                                                    className="grid grid-cols-12 px-4 py-3 items-center text-xs font-mono transition-colors hover:bg-zinc-800/20"
                                                                >
                                                                    <div className="col-span-3 font-semibold text-zinc-200 text-xs">
                                                                        {anomaly.type}
                                                                        {anomaly.party && <p className="text-[10px] text-zinc-500 font-sans truncate">{anomaly.party}</p>}
                                                                    </div>
                                                                    <div className="col-span-2">
                                                                        <span className={`px-2 py-0.5 border text-[10px] font-bold rounded-full ${
                                                                            isCrit ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' :
                                                                            isHigh ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                                                                            'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
                                                                        }`}>
                                                                            {anomaly.severity}
                                                                        </span>
                                                                    </div>
                                                                    <div className="col-span-5 text-xs text-zinc-400 pr-4 leading-normal">{anomaly.details}</div>
                                                                    <div className="col-span-2 text-right text-xs text-zinc-500 font-medium">{anomaly.date}</div>
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
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                                            <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80">
                                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Growth Trajectory</p>
                                                <p className="text-xl font-bold text-zinc-100 mt-1 font-mono">
                                                    {predictiveAnalytics.statistics.slope > 0 ? '+' : ''}
                                                    {predictiveAnalytics.statistics.slope !== 0 
                                                        ? `${Math.round((predictiveAnalytics.statistics.slope / (predictiveAnalytics.statistics.avgRevenue || 1)) * 100)}%`
                                                        : '0%'
                                                    }
                                                </p>
                                                <span className="text-[10px] text-zinc-500 mt-1 block">MoM Regression Slope</span>
                                            </div>
                                            <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80">
                                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Model STD Error</p>
                                                <p className="text-xl font-bold text-zinc-100 mt-1 font-mono">
                                                    ₹{Math.round(predictiveAnalytics.statistics.stdError || 0).toLocaleString('en-IN')}
                                                </p>
                                                <span className="text-[10px] text-zinc-500 mt-1 block">Forecast variance</span>
                                            </div>
                                            <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80">
                                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Anomaly Ratio</p>
                                                <p className="text-xl font-bold text-zinc-100 mt-1 font-mono">
                                                    {vouchers.length > 0 
                                                        ? `${((anomalies.length / vouchers.length) * 100).toFixed(1)}%` 
                                                        : '0.0%'
                                                    }
                                                </p>
                                                <span className="text-[10px] text-zinc-500 mt-1 block">{anomalies.length} of {vouchers.length} vouchers</span>
                                            </div>
                                            <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80">
                                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Inventory SKUs</p>
                                                <p className="text-xl font-bold text-cyan-400 mt-1 font-mono">
                                                    {stockItems.length}
                                                </p>
                                                <span className="text-[10px] text-zinc-500 mt-1 block">Items registered</span>
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
