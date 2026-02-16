import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { syncHistoryApi, companyApi, supabase } from '@/lib/supabase';
import { RefreshCw, Trash2, CheckCircle, XCircle, Clock, ArrowLeft, AlertTriangle, FileEdit, Monitor } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';
import toast from 'react-hot-toast';

export default function SyncHistoryPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [syncHistory, setSyncHistory] = useState<any[]>([]);
    const [pendingTxns, setPendingTxns] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'sync' | 'audit'>('sync');
    const [deleting, setDeleting] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedSync, setSelectedSync] = useState<any>(null);
    const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadData();
        }
    }, [selectedCompany, activeTab]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'sync') {
                const [historyRes, statsRes] = await Promise.all([
                    syncHistoryApi.list(selectedCompany.id),
                    syncHistoryApi.getStats(selectedCompany.id)
                ]);
                setSyncHistory(historyRes.data || []);
                setStats(statsRes.data);
            } else {
                // Load Pending Transactions (Audit Log)
                const { data, error } = await supabase
                    .from('pending_transactions')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setPendingTxns(data || []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load data');
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
                loadData();
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
                        <h1 className="text-3xl font-bold text-white">Sync Status</h1>
                        <p className="text-gray-500 mt-1">{selectedCompany.name}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowDeleteAllModal(true)}
                        className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors flex items-center gap-2"
                    >
                        <Trash2 size={16} />
                        Reset Data
                    </button>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex p-1 bg-white/5 rounded-xl w-fit border border-white/10">
                <button
                    onClick={() => setActiveTab('sync')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'sync' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    <RefreshCw size={16} /> Sync History
                </button>
                <button
                    onClick={() => setActiveTab('audit')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'audit' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    <FileEdit size={16} /> Web Audit Log
                </button>
            </div>

            {activeTab === 'sync' ? (
                <>
                    {/* Stats */}
                    {stats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard title="Total Syncs" value={stats.totalSyncs?.toString()} icon={<RefreshCw size={20} />} color="info" />
                            <MetricCard title="Successful" value={stats.successCount?.toString()} icon={<CheckCircle size={20} />} color="success" />
                            <MetricCard title="Failed" value={stats.failedCount?.toString()} icon={<XCircle size={20} />} color="warning" />
                            <MetricCard title="Records Synced" value={stats.totalRecordsSynced?.toLocaleString()} icon={<RefreshCw size={20} />} color="primary" />
                        </div>
                    )}

                    {/* Sync History Table */}
                    <GlassCard className="p-0 overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                            <h2 className="font-semibold text-white">Incoming Syncs (from Tally)</h2>
                            <p className="text-xs text-gray-500">History of data pushed from Tally Desktop App</p>
                        </div>
                        {/* Existing Table Code... */}
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-gray-500">Loading...</p>
                            </div>
                        ) : syncHistory.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <RefreshCw size={48} className="mx-auto mb-4 opacity-30" />
                                <p className="font-medium">No sync history found</p>
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
                                                    <span className="px-2 py-1 rounded-lg text-xs font-bold bg-white/5 text-gray-300 border border-white/10 uppercase">
                                                        {sync.sync_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold border ${sync.status === 'completed' ? 'text-green-400 border-green-500/20 bg-green-500/10' : 'text-red-400 border-red-500/20 bg-red-500/10'}`}>
                                                        {sync.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-400">{sync.vouchers_synced}</td>
                                                <td className="px-6 py-4 text-right text-gray-400">{sync.ledgers_synced}</td>
                                                <td className="px-6 py-4 text-right text-white font-bold">{sync.total_records}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </GlassCard>
                </>
            ) : (
                <GlassCard className="p-0 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                        <h2 className="font-semibold text-white">Web Audit Log (Pending Push)</h2>
                        <p className="text-xs text-gray-500">Edits made on Web Dashboard waiting to sync to Tally</p>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-gray-500">Loading Log...</p>
                        </div>
                    ) : pendingTxns.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">
                            <FileEdit size={48} className="mx-auto mb-4 opacity-30" />
                            <p className="font-medium">No pending edits found</p>
                            <p className="text-sm">Edits made here appear until Tally syncs them.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Action</th>
                                        <th className="px-6 py-4">Details</th>
                                        <th className="px-6 py-4">Sync Status</th>
                                        <th className="px-6 py-4">Error/Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {pendingTxns.map((txn: any) => (
                                        <tr key={txn.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-medium text-white">{formatDate(txn.created_at)}</p>
                                                <p className="text-xs text-gray-500">{txn.id.slice(0, 8)}...</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`
                                                        px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest w-fit
                                                        ${txn.voucher_data?.is_modification ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}
                                                    `}>
                                                        {txn.voucher_data?.is_modification ? 'EDIT' : 'NEW'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                                        {txn.transaction_type?.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-300">
                                                    <p className="font-bold text-white">{txn.voucher_data?.party_name || 'Unknown Party'}</p>
                                                    <p className="text-xs">
                                                        {txn.voucher_data?.voucher_type_name} • ₹{txn.voucher_data?.grand_total?.toLocaleString('en-IN')}
                                                    </p>
                                                    {txn.voucher_data?.original_voucher_number && (
                                                        <p className="text-[10px] text-gray-500">Ref: #{txn.voucher_data.original_voucher_number}</p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`
                                                    px-2 py-1 rounded-lg text-xs font-bold border flex items-center gap-1 w-fit
                                                    ${txn.status === 'pending' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : ''}
                                                    ${txn.status === 'synced' ? 'bg-green-500/10 border-green-500/20 text-green-500' : ''}
                                                    ${txn.status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-500' : ''}
                                                `}>
                                                    {txn.status === 'pending' && <Clock size={12} />}
                                                    {txn.status === 'synced' && <CheckCircle size={12} />}
                                                    {txn.status === 'failed' && <XCircle size={12} />}
                                                    {txn.status?.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {txn.error_message ? (
                                                    <p className="text-xs text-red-400 max-w-[200px]">{txn.error_message}</p>
                                                ) : (
                                                    <span className="text-gray-600">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </GlassCard>
            )}

            {/* Existing Delete Modal Code... */}
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
