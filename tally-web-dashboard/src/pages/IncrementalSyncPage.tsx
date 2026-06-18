import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    runIncrementalSync, runFullSync, getSyncStatus, validateSyncData,
    type SyncProgress, type SyncState
} from '../lib/incrementalSync';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import {
    RefreshCw, Play, Pause, CheckCircle2, XCircle, AlertTriangle,
    Database, Clock, Zap, Shield, Activity, TrendingUp, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

const MODULE_LABELS: Record<string, string> = {
    vouchers: 'Vouchers',
    ledgers: 'Ledgers',
    stock_items: 'Stock Items',
    masters: 'Masters',
};

const MODULE_ICONS: Record<string, React.ReactNode> = {
    vouchers: <Database size={16} />,
    ledgers: <Activity size={16} />,
    stock_items: <TrendingUp size={16} />,
    masters: <Shield size={16} />,
};

export default function IncrementalSyncPage() {
    const { selectedCompany } = useAuth() as any;
    const [syncStates, setSyncStates] = useState<SyncState[]>([]);
    const [pendingQueue, setPendingQueue] = useState(0);
    const [failedQueue, setFailedQueue] = useState(0);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncType, setSyncType] = useState<'incremental' | 'full'>('incremental');
    const [progress, setProgress] = useState<SyncProgress | null>(null);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<any[]>([]);
    const [validation, setValidation] = useState<{ valid: boolean; mismatches: string[] } | null>(null);

    const loadStatus = useCallback(async () => {
        if (!selectedCompany?.id) return;
        try {
            const status = await getSyncStatus(selectedCompany.id);
            setSyncStates(status.states);
            setPendingQueue(status.pendingQueue);
            setFailedQueue(status.failedQueue);
            setLastSync(status.lastSync);
        } catch (err) {
            console.warn('Failed to load sync status:', err);
        }
    }, [selectedCompany?.id]);

    const loadHistory = useCallback(async () => {
        if (!selectedCompany?.id) return;
        const { data } = await supabase
            .from('sync_history')
            .select('*')
            .eq('company_id', selectedCompany.id)
            .order('created_at', { ascending: false })
            .limit(20);
        setHistory(data || []);
    }, [selectedCompany?.id]);

    useEffect(() => {
        if (selectedCompany?.id) {
            Promise.all([loadStatus(), loadHistory()]).finally(() => setLoading(false));
        }
    }, [selectedCompany?.id, loadStatus, loadHistory]);

    const handleSync = async (type: 'incremental' | 'full') => {
        if (!selectedCompany?.id || syncing) return;
        setSyncing(true);
        setSyncType(type);
        setProgress(null);

        try {
            const syncFn = type === 'full' ? runFullSync : runIncrementalSync;
            const result = await syncFn(selectedCompany.id, (p) => setProgress(p));

            if (result.success) {
                toast.success(`Sync complete! ${result.modules.reduce((s, m) => s + m.synced, 0)} records in ${(result.totalDurationMs / 1000).toFixed(1)}s`);
            } else {
                toast.error(`Sync completed with errors: ${result.errors.join(', ')}`);
            }

            await Promise.all([loadStatus(), loadHistory()]);
        } catch (err: any) {
            toast.error('Sync failed: ' + err.message);
        } finally {
            setSyncing(false);
            setProgress(null);
        }
    };

    const handleValidate = async () => {
        if (!selectedCompany?.id) return;
        const result = await validateSyncData(selectedCompany.id);
        setValidation(result);
        if (result.valid) {
            toast.success('All data is in sync!');
        } else {
            toast.error(`Found ${result.mismatches.length} mismatches`);
        }
    };

    const totalSynced = syncStates.reduce((s, st) => s + (st.total_records_synced || 0), 0);
    const formatTime = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <div className="space-y-4 pb-24">
            <HeaderPortal type="title">
                <h1 className="text-lg font-bold text-[var(--on-background)]">Sync Engine</h1>
            </HeaderPortal>

            {/* Status Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-[var(--primary)] mb-1">
                        <Clock size={12} />
                        <span className="text-[9px] font-bold uppercase">Last Sync</span>
                    </div>
                    <p className="text-xs font-bold text-[var(--on-surface)]">
                        {lastSync ? new Date(lastSync).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-emerald-500 mb-1">
                        <Database size={12} />
                        <span className="text-[9px] font-bold uppercase">Total Synced</span>
                    </div>
                    <p className="text-xs font-bold text-[var(--on-surface)]">{totalSynced.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-amber-500 mb-1">
                        <Zap size={12} />
                        <span className="text-[9px] font-bold uppercase">Pending</span>
                    </div>
                    <p className="text-xs font-bold text-[var(--on-surface)]">{pendingQueue}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-red-500 mb-1">
                        <AlertTriangle size={12} />
                        <span className="text-[9px] font-bold uppercase">Failed</span>
                    </div>
                    <p className="text-xs font-bold text-[var(--on-surface)]">{failedQueue}</p>
                </div>
            </div>

            {/* Sync Actions */}
            <div className="flex gap-2">
                <button
                    onClick={() => handleSync('incremental')}
                    disabled={syncing}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--primary)] text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                    {syncing && syncType === 'incremental' ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <RefreshCw size={16} />
                    )}
                    {syncing && syncType === 'incremental' ? 'Syncing...' : 'Incremental Sync'}
                </button>
                <button
                    onClick={() => handleSync('full')}
                    disabled={syncing}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--on-surface)] font-bold text-sm disabled:opacity-50 hover:bg-[var(--surface-container)] transition-all"
                >
                    <Play size={14} />
                    Full
                </button>
                <button
                    onClick={handleValidate}
                    disabled={syncing}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--on-surface)] font-bold text-sm disabled:opacity-50 hover:bg-[var(--surface-container)] transition-all"
                >
                    <Shield size={14} />
                </button>
            </div>

            {/* Progress Bar */}
            {progress && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[var(--on-surface)]">{MODULE_LABELS[progress.module] || progress.module}</span>
                        <span className="text-[10px] font-bold text-[var(--text-muted)]">
                            Chunk {progress.currentChunk}/{progress.totalChunks} • {progress.recordsSynced.toLocaleString('en-IN')} records
                        </span>
                    </div>
                    <div className="h-1.5 bg-[var(--surface-container)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
                            style={{ width: `${progress.totalRecords > 0 ? (progress.recordsSynced / progress.totalRecords) * 100 : 0}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-[9px] text-[var(--text-muted)]">
                            {progress.speed > 0 ? `${Math.round(progress.speed)} rec/s` : 'Calculating...'}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                            ETA: {progress.eta > 0 ? formatTime(progress.eta * 1000) : '...'}
                        </span>
                    </div>
                </div>
            )}

            {/* Module Status */}
            <div>
                <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Module Status</h3>
                <div className="space-y-1.5">
                    {syncStates.map((state) => (
                        <div key={state.module} className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                            <div className={`p-1.5 rounded-lg ${state.status === 'syncing' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : state.status === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {MODULE_ICONS[state.module]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[var(--on-surface)]">{MODULE_LABELS[state.module] || state.module}</p>
                                <p className="text-[9px] text-[var(--text-muted)]">
                                    AlterID: {state.last_alter_id} • {state.total_records_synced?.toLocaleString('en-IN') || 0} records
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {state.status === 'syncing' && <Loader2 size={12} className="animate-spin text-[var(--primary)]" />}
                                {state.status === 'idle' && <CheckCircle2 size={12} className="text-emerald-500" />}
                                {state.status === 'error' && <XCircle size={12} className="text-red-500" />}
                                <span className={`text-[9px] font-bold uppercase ${state.status === 'error' ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                                    {state.status}
                                </span>
                            </div>
                        </div>
                    ))}
                    {syncStates.length === 0 && !loading && (
                        <div className="text-center py-6 text-[var(--text-muted)]">
                            <Database size={24} className="mx-auto mb-2 opacity-30" />
                            <p className="text-xs">No sync data yet. Run first sync to start.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Validation Result */}
            {validation && (
                <div className={`p-3 rounded-xl border ${validation.valid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <div className="flex items-center gap-2 mb-1">
                        {validation.valid ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-red-500" />}
                        <span className="text-xs font-bold">{validation.valid ? 'Data Valid' : 'Mismatches Found'}</span>
                    </div>
                    {validation.mismatches.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {validation.mismatches.map((m, i) => (
                                <p key={i} className="text-[10px] text-red-400">{m}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Sync History */}
            {history.length > 0 && (
                <div>
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Recent History</h3>
                    <div className="space-y-1">
                        {history.slice(0, 10).map((h) => (
                            <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface)]/50 border border-[var(--border)]/50">
                                <div className={`w-1.5 h-1.5 rounded-full ${h.status === 'completed' ? 'bg-emerald-500' : h.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                <span className="text-[10px] font-bold text-[var(--on-surface)] flex-1">{MODULE_LABELS[h.module] || h.module}</span>
                                <span className="text-[9px] text-[var(--text-muted)]">{h.records_synced} rec</span>
                                <span className="text-[9px] text-[var(--text-muted)]">{h.duration_ms ? formatTime(h.duration_ms) : '-'}</span>
                                <span className="text-[9px] text-[var(--text-muted)]">{new Date(h.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
