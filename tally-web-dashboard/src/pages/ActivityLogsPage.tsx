import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { logActivity, ActivityActions } from '../services/activityLogService';
import {
    Clock, User, FileText, ArrowRight, Filter, Loader2, Activity
} from 'lucide-react';

interface ActivityLog {
    id: string;
    user_email: string;
    action: string;
    entity_type: string;
    entity_name: string;
    details: Record<string, any>;
    created_at: string;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(amount) || 0);
}

const actionLabels: Record<string, string> = {
    [ActivityActions.VOUCHER_CREATED]: 'Created Voucher',
    [ActivityActions.VOUCHER_UPDATED]: 'Updated Voucher',
    [ActivityActions.VOUCHER_DELETED]: 'Deleted Voucher',
    [ActivityActions.VOUCHER_VIEWED]: 'Viewed Voucher',
    [ActivityActions.LEDGER_CREATED]: 'Created Ledger',
    [ActivityActions.LEDGER_UPDATED]: 'Updated Ledger',
    [ActivityActions.STOCK_UPDATED]: 'Updated Stock',
    [ActivityActions.SYNC_STARTED]: 'Started Sync',
    [ActivityActions.SYNC_COMPLETED]: 'Completed Sync',
    [ActivityActions.SYNC_FAILED]: 'Sync Failed',
    [ActivityActions.INVOICE_EXPORTED]: 'Exported Invoice',
    [ActivityActions.EMBEDDINGS_GENERATED]: 'Generated Embeddings',
    [ActivityActions.COMPANY_SWITCHED]: 'Switched Company',
    [ActivityActions.USER_LOGIN]: 'Logged In',
};

const actionColors: Record<string, string> = {
    [ActivityActions.VOUCHER_CREATED]: 'text-emerald-500',
    [ActivityActions.VOUCHER_UPDATED]: 'text-blue-500',
    [ActivityActions.VOUCHER_DELETED]: 'text-rose-500',
    [ActivityActions.SYNC_COMPLETED]: 'text-emerald-500',
    [ActivityActions.SYNC_FAILED]: 'text-rose-500',
    [ActivityActions.USER_LOGIN]: 'text-blue-500',
};

export default function ActivityLogsPage() {
    const { selectedCompany } = useAuth() as any;
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    useEffect(() => {
        if (selectedCompany?.id) loadLogs();
    }, [selectedCompany, filter]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('activity_logs')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (filter !== 'all') {
                query = query.eq('entity_type', filter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setLogs(data || []);
        } catch (err) {
            console.error('Activity logs error:', err);
        } finally {
            setLoading(false);
        }
    };

    const entityTypes = ['all', 'voucher', 'ledger', 'stock', 'sync', 'invoice', 'auth'];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Activity size={20} className="text-[var(--primary)]" />
                <h2 className="text-lg font-bold text-[var(--on-surface)]">Activity Logs</h2>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {entityTypes.map(type => (
                    <button
                        key={type}
                        onClick={() => { setFilter(type); setPage(0); }}
                        className={`shrink-0 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                            filter === type
                                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface-variant)]'
                        }`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
                </div>
            ) : logs.length === 0 ? (
                <div className="text-center py-12 text-sm text-[var(--text-muted)]">No activity logs found</div>
            ) : (
                <div className="space-y-2">
                    {logs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                            <div className="mt-0.5 shrink-0">
                                <User size={14} className="text-[var(--text-muted)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold ${actionColors[log.action] || 'text-[var(--on-surface)]'}`}>
                                        {actionLabels[log.action] || log.action}
                                    </span>
                                    {log.entity_name && (
                                        <span className="text-xs text-[var(--text-muted)] truncate">— {log.entity_name}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                                    <span>{log.user_email || 'System'}</span>
                                    <span>{new Date(log.created_at).toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {logs.length === PAGE_SIZE && (
                <div className="flex justify-center">
                    <button
                        onClick={() => { setPage(p => p + 1); }}
                        className="text-xs font-bold text-[var(--primary)] hover:underline"
                    >
                        Load More
                    </button>
                </div>
            )}
        </div>
    );
}
