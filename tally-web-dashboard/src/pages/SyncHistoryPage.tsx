import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { syncHistoryApi, companyApi } from '@/lib/supabase';
import { RefreshCw, Trash2, CheckCircle, XCircle, Clock, ArrowLeft, AlertTriangle } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';
import toast from 'react-hot-toast';

export default function SyncHistoryPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [syncHistory, setSyncHistory] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedSync, setSelectedSync] = useState<any>(null);
    const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadSyncHistory();
        }
    }, [selectedCompany]);

    const loadSyncHistory = async () => {
        setLoading(true);
        try {
            const [historyRes, statsRes] = await Promise.all([
                syncHistoryApi.list(selectedCompany.id),
                syncHistoryApi.getStats(selectedCompany.id)
            ]);
            setSyncHistory(historyRes.data || []);
            setStats(statsRes.data);
        } catch (error) {
            console.error('Error loading sync history:', error);
        }
        setLoading(false);
    };

    const handleDeleteSync = async (sync: any) => {
        setSelectedSync(sync);
        setShowDeleteModal(true);
    };

    const confirmDeleteSync = async () => {
        if (!selectedSync) return;

        setDeleting(selectedSync.id);
        setShowDeleteModal(false);

        try {
            const result = await syncHistoryApi.deleteSync(selectedSync.id, selectedCompany.id);
            if (result.success) {
                toast.success(`Sync deleted! ${result.deletedVouchers} vouchers removed.`);
                loadSyncHistory();
            } else {
                toast.error('Error: ' + result.error);
            }
        } catch (error: any) {
            toast.error('Error deleting sync: ' + error.message);
        }
        setDeleting(null);
        setSelectedSync(null);
    };

    const handleDeleteAllData = async () => {
        setShowDeleteAllModal(false);
        setLoading(true);

        try {
            const result = await companyApi.deleteCompanyData(selectedCompany.id);
            if (result.success) {
                toast.success('All data deleted! Re-sync from Windows App.');
                navigate('/');
            } else {
                toast.error('Error: ' + result.error);
            }
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        }
        setLoading(false);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-[#121214] border border-white/10 text-gray-400 hover:text-white">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Sync History</h1>
                        <p className="text-gray-500 mt-1">{selectedCompany.name}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowDeleteAllModal(true)}
                    className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors flex items-center gap-2"
                >
                    <Trash2 size={16} />
                    Delete All Data
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard title="Total Syncs" value={stats.totalSyncs?.toString()} icon={<RefreshCw size={20} />} color="blue" />
                    <MetricCard title="Successful" value={stats.successCount?.toString()} icon={<CheckCircle size={20} />} color="green" />
                    <MetricCard title="Failed" value={stats.failedCount?.toString()} icon={<XCircle size={20} />} color="orange" />
                    <MetricCard title="Records Synced" value={stats.totalRecordsSynced?.toLocaleString()} icon={<RefreshCw size={20} />} color="purple" />
                </div>
            )}

            {/* Sync History Table */}
            <GlassCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <h2 className="font-semibold text-white">Recent Syncs</h2>
                    <p className="text-xs text-gray-500">Click delete to rollback sync data</p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-gray-500">Loading...</p>
                    </div>
                ) : syncHistory.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <RefreshCw size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="font-medium">No sync history found</p>
                        <p className="text-sm">Run a sync from Windows App</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Date/Time</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Vouchers</th>
                                    <th className="px-6 py-4 text-right">Ledgers</th>
                                    <th className="px-6 py-4 text-right">Total</th>
                                    <th className="px-6 py-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {syncHistory.map((sync: any) => (
                                    <tr key={sync.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-white">{formatDate(sync.started_at)}</p>
                                            {sync.completed_at && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {Math.round((new Date(sync.completed_at).getTime() - new Date(sync.started_at).getTime()) / 1000)}s
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`
                                                px-2 py-1 rounded-lg text-xs font-bold border
                                                ${sync.sync_type === 'full' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : ''}
                                                ${sync.sync_type === 'incremental' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : ''}
                                                ${sync.sync_type === 'force' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : ''}
                                            `}>
                                                {sync.sync_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`
                                                px-2 py-1 rounded-lg text-xs font-bold border
                                                ${sync.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : ''}
                                                ${sync.status === 'running' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse' : ''}
                                                ${sync.status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-400' : ''}
                                            `}>
                                                {sync.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-white">{sync.vouchers_synced || 0}</td>
                                        <td className="px-6 py-4 text-right font-mono text-white">{sync.ledgers_synced || 0}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-white">{sync.total_records || 0}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleDeleteSync(sync)}
                                                disabled={deleting === sync.id}
                                                className="px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-sm disabled:opacity-50 transition-colors"
                                            >
                                                {deleting === sync.id ? '...' : <Trash2 size={14} />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>

            {/* Delete Sync Modal */}
            {showDeleteModal && selectedSync && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#121214] border border-white/10 rounded-3xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-bold text-white mb-2">Delete This Sync?</h3>
                        <p className="text-gray-400 mb-4">
                            This will delete <strong className="text-white">{selectedSync.vouchers_synced || 0} vouchers</strong> from this sync batch.
                        </p>
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-orange-400">This action cannot be undone. Re-sync to recover data.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteModal(false)} className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors">
                                Cancel
                            </button>
                            <button onClick={confirmDeleteSync} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">
                                Delete Sync
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete All Modal */}
            {showDeleteAllModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#121214] border border-white/10 rounded-3xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
                            <AlertTriangle size={20} />
                            Delete ALL Data?
                        </h3>
                        <p className="text-gray-400 mb-4">
                            This will permanently delete <strong className="text-white">ALL</strong> data for <strong className="text-white">{selectedCompany.name}</strong>:
                        </p>
                        <ul className="text-sm text-gray-400 mb-4 space-y-1">
                            <li>• All vouchers</li>
                            <li>• All sales & purchases</li>
                            <li>• All ledgers</li>
                            <li>• All stock items</li>
                            <li>• All sync history</li>
                        </ul>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                            <p className="text-sm text-red-400">Run "Sync Now" in Windows App to re-sync everything after deleting.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteAllModal(false)} className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleDeleteAllData} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">
                                Delete Everything
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
