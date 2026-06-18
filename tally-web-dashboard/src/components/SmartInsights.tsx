import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    Sparkles, TrendingUp, AlertTriangle, IndianRupee, Users,
    ArrowRight, Loader2, BarChart3, ShieldAlert, Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Insight {
    type: 'positive' | 'warning' | 'risk' | 'info';
    icon: string;
    title: string;
    message: string;
    action?: string;
}

export default function SmartInsights() {
    const { selectedCompany } = useAuth() as any;
    const [insights, setInsights] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (selectedCompany?.id) generateInsights();
    }, [selectedCompany]);

    const generateInsights = async () => {
        setLoading(true);
        try {
            const [salesRes, purchasesRes, ledgersRes, stockRes] = await Promise.all([
                supabase.from('vouchers').select('grand_total').eq('company_id', selectedCompany.id).eq('voucher_type', 'Sales').eq('is_deleted', false),
                supabase.from('vouchers').select('grand_total').eq('company_id', selectedCompany.id).eq('voucher_type', 'Purchase').eq('is_deleted', false),
                supabase.from('ledgers').select('name, current_balance, parent').eq('company_id', selectedCompany.id),
                supabase.from('stock_items').select('name, id').eq('company_id', selectedCompany.id)
            ]);

            const sales = salesRes.data || [];
            const purchases = purchasesRes.data || [];
            const ledgers = ledgersRes.data || [];
            const stocks = stockRes.data || [];

            const totalSales = sales.reduce((s, v) => s + (Math.abs(Number(v.grand_total)) || 0), 0);
            const totalPurchases = purchases.reduce((s, v) => s + (Math.abs(Number(v.grand_total)) || 0), 0);
            const debtors = ledgers.filter(l => l.parent === 'Sundry Debtors');
            const creditors = ledgers.filter(l => l.parent === 'Sundry Creditors');
            const totalReceivable = debtors.reduce((s, d) => s + (Number(d.current_balance) || 0), 0);
            const totalPayable = creditors.reduce((s, c) => s + Math.abs(Number(c.current_balance) || 0), 0);

            const newInsights: Insight[] = [];

            if (totalReceivable > totalSales * 0.5 && totalSales > 0) {
                newInsights.push({
                    type: 'warning', icon: '⚠️',
                    title: 'High Outstanding',
                    message: `₹${(totalReceivable / 100000).toFixed(1)}L receivable - 50%+ of sales. Send reminders!`,
                    action: '/payment-reminders'
                });
            }

            const topDebtor = debtors.sort((a, b) => (Number(b.current_balance) || 0) - (Number(a.current_balance) || 0))[0];
            if (topDebtor && totalReceivable > 0 && (Number(topDebtor.current_balance) / totalReceivable) > 0.3) {
                newInsights.push({
                    type: 'risk', icon: '🔴',
                    title: 'Risk: ' + topDebtor.name,
                    message: `Owes ₹${(Number(topDebtor.current_balance) / 100000).toFixed(1)}L - over 30% of total receivables`,
                    action: '/aging-report'
                });
            }

            if (totalSales > totalPurchases * 1.3 && totalPurchases > 0) {
                newInsights.push({
                    type: 'positive', icon: '📈',
                    title: 'Healthy Margins',
                    message: `Sales ${((totalSales / totalPurchases - 1) * 100).toFixed(0)}% above purchases.`,
                    action: '/profit-loss'
                });
            }

            if (totalPayable > totalReceivable && totalPayable > 0) {
                newInsights.push({
                    type: 'warning', icon: '💸',
                    title: 'Cash Flow Alert',
                    message: `Payables (₹${(totalPayable / 100000).toFixed(1)}L) > Receivables. Monitor closely!`,
                    action: '/balance-sheet'
                });
            }

            if (stocks.length < 5) {
                newInsights.push({
                    type: 'info', icon: '📦',
                    title: 'Stock Items',
                    message: `${stocks.length} items tracked. Add more stock items for better inventory management.`,
                    action: '/stock'
                });
            }

            newInsights.push({
                type: 'info', icon: '📊',
                title: 'Summary',
                message: `${sales.length} sales, ${purchases.length} purchases, ${debtors.length + creditors.length} parties, ${stocks.length} stock items`,
                action: '/dashboard'
            });

            setInsights(newInsights);
        } catch (err) {
            console.error('Smart insights error:', err);
        } finally {
            setLoading(false);
        }
    };

    const typeColors: Record<string, string> = {
        positive: 'border-emerald-500/30 bg-emerald-500/5',
        warning: 'border-amber-500/30 bg-amber-500/5',
        risk: 'border-red-500/30 bg-red-500/5',
        info: 'border-blue-500/30 bg-blue-500/5'
    };

    const typeIconColor: Record<string, string> = {
        positive: 'text-emerald-500',
        warning: 'text-amber-500',
        risk: 'text-red-500',
        info: 'text-blue-500'
    };

    if (loading) {
        return (
            <div className="rounded-2xl p-6 border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={18} className="text-amber-400" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Smart Insights</h3>
                </div>
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl p-6 border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-amber-400" />
                <h3 className="font-semibold text-[var(--on-surface)]">Smart Insights</h3>
                <span className="ml-auto text-xs text-[var(--text-muted)] bg-[var(--background)] px-2 py-0.5 rounded-full">
                    AI Powered
                </span>
            </div>

            <div className="space-y-2.5">
                {insights.map((insight, i) => (
                    <div key={i}
                        onClick={() => insight.action && navigate(insight.action)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${typeColors[insight.type]}`}>
                        <div className="flex items-start gap-2.5">
                            <span className="text-lg mt-0.5">{insight.icon}</span>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${typeIconColor[insight.type]}`}>
                                    {insight.title}
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                                    {insight.message}
                                </p>
                            </div>
                            {insight.action && (
                                <ArrowRight size={14} className="text-[var(--text-muted)] mt-1 flex-shrink-0" />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
