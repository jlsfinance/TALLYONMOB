import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { Package, AlertTriangle, Clock, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ReorderItem {
    id: string;
    name: string;
    currentStock: number;
    unit: string;
    dailyConsumption: number;
    daysRemaining: number;
    urgency: 'critical' | 'warning';
}

export default function ReorderAlerts() {
    const { selectedCompany } = useAuth() as any;
    const [alerts, setAlerts] = useState<ReorderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (selectedCompany?.id) loadAlerts();
    }, [selectedCompany]);

    const loadAlerts = async () => {
        setLoading(true);
        try {
            const { data: stockItems } = await supabase
                .from('stock')
                .select('id, name, closing_balance, outward_quantity, base_unit')
                .eq('company_id', selectedCompany.id)
                .gt('outward_quantity', 0);

            if (!stockItems) { setAlerts([]); return; }

            const reorderItems = stockItems
                .filter(item => {
                    const closing = parseFloat(item.closing_balance) || 0;
                    const daily = (parseFloat(item.outward_quantity) || 0) / 30;
                    return daily > 0 && (closing / daily) <= 7 && closing > 0;
                })
                .map(item => {
                    const closing = parseFloat(item.closing_balance) || 0;
                    const daily = (parseFloat(item.outward_quantity) || 0) / 30;
                    const daysRemaining = Math.round(closing / daily);

                    return {
                        id: item.id,
                        name: item.name,
                        currentStock: closing,
                        unit: item.base_unit || 'units',
                        dailyConsumption: Math.round(daily * 100) / 100,
                        daysRemaining,
                        urgency: daysRemaining <= 3 ? 'critical' as const : 'warning' as const
                    };
                })
                .sort((a, b) => a.daysRemaining - b.daysRemaining);

            setAlerts(reorderItems);
        } catch (err) {
            console.error('ReorderAlerts error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="rounded-2xl p-6 border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center gap-2 mb-4">
                    <Package size={18} className="text-orange-400" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Reorder Alerts</h3>
                </div>
                <div className="flex items-center justify-center py-6">
                    <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl p-6 border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Package size={18} className="text-orange-400" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Reorder Alerts</h3>
                    {alerts.length > 0 && (
                        <span className="px-2 py-0.5 text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/30 rounded-full">
                            {alerts.length}
                        </span>
                    )}
                </div>
                <button onClick={() => navigate('/stock')}
                    className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1">
                    View All <ArrowRight size={12} />
                </button>
            </div>

            {alerts.length === 0 ? (
                <div className="text-center py-6">
                    <Package size={32} className="mx-auto text-[var(--text-muted)] opacity-40 mb-2" />
                    <p className="text-sm text-[var(--text-muted)]">All stock levels healthy ✅</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {alerts.slice(0, 5).map(item => (
                        <div key={item.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:scale-[1.01] cursor-pointer ${item.urgency === 'critical'
                                ? 'border-red-500/30 bg-red-500/5'
                                : 'border-amber-500/30 bg-amber-500/5'
                                }`}
                            onClick={() => navigate('/stock')}>
                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${item.urgency === 'critical' ? 'bg-red-500/20' : 'bg-amber-500/20'
                                }`}>
                                {item.urgency === 'critical'
                                    ? <AlertTriangle size={16} className="text-red-500" />
                                    : <Clock size={16} className="text-amber-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--on-surface)] truncate">{item.name}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    {item.currentStock} {item.unit} left ? ~{item.dailyConsumption}/{item.unit} per day
                                </p>
                            </div>
                            <div className={`text-right flex-shrink-0 ${item.urgency === 'critical' ? 'text-red-500' : 'text-amber-500'
                                }`}>
                                <p className="text-lg font-bold">{item.daysRemaining}</p>
                                <p className="text-[10px]">days left</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

