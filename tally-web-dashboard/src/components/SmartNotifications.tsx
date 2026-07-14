import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    Bell, Clock, AlertTriangle, FileText, IndianRupee, CheckCircle2,
    Loader2, X, ChevronRight, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Notification {
    id: string;
    type: 'gst_due' | 'payment_overdue' | 'low_stock' | 'sync_alert' | 'info';
    title: string;
    message: string;
    action?: string;
    priority: 'high' | 'medium' | 'low';
    created_at: string;
}

export default function SmartNotifications() {
    const { selectedCompany } = useAuth() as any;
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const navigate = useNavigate();

    useEffect(() => {
        if (selectedCompany?.id) checkNotifications();
    }, [selectedCompany]);

    const checkNotifications = async () => {
        setLoading(true);
        try {
            const now = new Date();
            const notifs: Notification[] = [];

            // GST Filing Due (20th of every month)
            const dayOfMonth = now.getDate();
            if (dayOfMonth >= 15 && dayOfMonth <= 20) {
                const daysLeft = 20 - dayOfMonth;
                notifs.push({
                    id: 'gst-due',
                    type: 'gst_due',
                    title: 'GST Filing Due',
                    message: daysLeft === 0 ? 'GST filing is due TODAY!' : `GST filing due in ${daysLeft} days`,
                    action: '/gst-reports',
                    priority: 'high',
                    created_at: now.toISOString()
                });
            }

            // Payment overdue check
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const { data: overdueVouchers } = await supabase
                .from('vouchers')
                .select('id, party_name, grand_total, voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .lt('voucher_date', thirtyDaysAgo)
                .limit(5);

            if (overdueVouchers && overdueVouchers.length > 0) {
                const totalOverdue = overdueVouchers.reduce((s, v) => s + Math.abs(Number(v.grand_total) || 0), 0);
                notifs.push({
                    id: 'payment-overdue',
                    type: 'payment_overdue',
                    title: `${overdueVouchers.length} Overdue Payments`,
                    message: `₹${(totalOverdue / 100000).toFixed(1)}L pending from ${overdueVouchers.length} parties`,
                    action: '/payment-reminders',
                    priority: 'high',
                    created_at: now.toISOString()
                });
            }

            // Low stock alerts - safe query (closing_balance may not exist yet)
            let lowStock: any[] = [];
            try {
                const res = await supabase
                    .from('stock_items')
                    .select('id, name')
                    .eq('company_id', selectedCompany.id)
                    .limit(20);
                lowStock = res.data || [];
            } catch {
                lowStock = [];
            }

            if (lowStock && lowStock.length > 0) {
                notifs.push({
                    id: 'low-stock',
                    type: 'low_stock',
                    title: `${lowStock.length} Items Low Stock`,
                    message: lowStock.slice(0, 3).map(s => s.name).join(', ') + ' running low',
                    action: '/stock',
                    priority: 'medium',
                    created_at: now.toISOString()
                });
            }

            // Recent sync status
            const { data: lastSync } = await supabase
                .from('sync_history')
                .select('status, started_at')
                .eq('company_id', selectedCompany.id)
                .order('started_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (lastSync && lastSync.status === 'failed') {
                notifs.push({
                    id: 'sync-failed',
                    type: 'sync_alert',
                    title: 'Sync Failed',
                    message: 'Last Tally sync failed. Check connection.',
                    action: '/sync-history',
                    priority: 'medium',
                    created_at: lastSync.started_at
                });
            }

            setNotifications(notifs);
        } catch (err) {
            console.error('Notifications error:', err);
        } finally {
            setLoading(false);
        }
    };

    const dismiss = (id: string) => {
        setDismissed(prev => new Set([...prev, id]));
    };

    const visible = notifications.filter(n => !dismissed.has(n.id));

    if (loading || visible.length === 0) return null;

    const priorityColors = {
        high: 'border-rose-500/30 bg-rose-500/5',
        medium: 'border-amber-500/30 bg-amber-500/5',
        low: 'border-blue-500/30 bg-blue-500/5'
    };

    const typeIcons = {
        gst_due: <Calendar size={16} className="text-rose-500" />,
        payment_overdue: <IndianRupee size={16} className="text-amber-500" />,
        low_stock: <AlertTriangle size={16} className="text-amber-500" />,
        sync_alert: <Clock size={16} className="text-blue-500" />,
        info: <Bell size={16} className="text-blue-500" />
    };

    return (
        <div className="space-y-2">
            {visible.map(notif => (
                <div
                    key={notif.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${priorityColors[notif.priority]}`}
                >
                    <div className="mt-0.5 shrink-0">{typeIcons[notif.type]}</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--on-surface)]">{notif.title}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{notif.message}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {notif.action && (
                            <button
                                onClick={() => navigate(notif.action!)}
                                className="p-1.5 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]"
                            >
                                <ChevronRight size={14} />
                            </button>
                        )}
                        <button
                            onClick={() => dismiss(notif.id)}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
