import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { syncHistoryApi, companyApi } from '../lib/supabase';

export default function SyncHistoryPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [syncHistory, setSyncHistory] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedSync, setSelectedSync] = useState(null);
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

    const handleDeleteSync = async (sync) => {
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
                alert(`Sync deleted! ${result.deletedVouchers} vouchers removed.`);
                loadSyncHistory();
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            alert('Error deleting sync: ' + error.message);
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
                alert('All company data deleted! Click "Sync Now" in Windows App to re-sync.');
                navigate('/');
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
        setLoading(false);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadge = (status) => {
        const styles = {
            completed: 'bg-emerald-100 text-emerald-700',
            running: 'bg-blue-100 text-blue-700 animate-pulse',
            failed: 'bg-red-100 text-red-700'
        };
        return styles[status] || 'bg-gray-100 text-gray-700';
    };

    const getSyncTypeBadge = (type) => {
        const styles = {
            full: 'bg-purple-100 text-purple-700',
            incremental: 'bg-sky-100 text-sky-700',
            force: 'bg-orange-100 text-orange-700'
        };
        return styles[type] || 'bg-gray-100 text-gray-700';
    };

    if (!selectedCompany) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-500">Please select a company first</p>
                <button
                    onClick={() => navigate('/')}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg"
                >
                    Select Company
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sync History</h1>
                    <p className="text-gray-500">{selectedCompany.name}</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        ← Back
                    </button>
                    <button
                        onClick={() => setShowDeleteAllModal(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                        🗑️ Delete All Data
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <p className="text-sm text-gray-500">Total Syncs</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.totalSyncs}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <p className="text-sm text-gray-500">Successful</p>
                        <p className="text-2xl font-bold text-emerald-600">{stats.successCount}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <p className="text-sm text-gray-500">Failed</p>
                        <p className="text-2xl font-bold text-red-600">{stats.failedCount}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <p className="text-sm text-gray-500">Records Synced</p>
                        <p className="text-2xl font-bold text-indigo-600">{stats.totalRecordsSynced.toLocaleString()}</p>
                    </div>
                </div>
            )}

            {/* Sync History Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Recent Syncs</h2>
                    <p className="text-sm text-gray-500">Click on a sync to delete it and rollback its data</p>
                </div>

                {loading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
                        <p className="text-gray-500 mt-2">Loading...</p>
                    </div>
                ) : syncHistory.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-500">No sync history found</p>
                        <p className="text-sm text-gray-400 mt-1">Run a sync from Windows App to see history here</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 text-left text-sm text-gray-600">
                                <tr>
                                    <th className="px-4 py-3">Date/Time</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Vouchers</th>
                                    <th className="px-4 py-3 text-right">Ledgers</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {syncHistory.map((sync) => (
                                    <tr key={sync.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{formatDate(sync.started_at)}</p>
                                            {sync.completed_at && (
                                                <p className="text-xs text-gray-400">
                                                    Duration: {Math.round((new Date(sync.completed_at) - new Date(sync.started_at)) / 1000)}s
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSyncTypeBadge(sync.sync_type)}`}>
                                                {sync.sync_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(sync.status)}`}>
                                                {sync.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {sync.vouchers_synced || 0}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {sync.ledgers_synced || 0}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold">
                                            {sync.total_records || 0}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleDeleteSync(sync)}
                                                disabled={deleting === sync.id}
                                                className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg text-sm disabled:opacity-50"
                                            >
                                                {deleting === sync.id ? '...' : '🗑️ Delete'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Delete Sync Modal */}
            {showDeleteModal && selectedSync && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete This Sync?</h3>
                        <p className="text-gray-600 mb-4">
                            This will delete <strong>{selectedSync.vouchers_synced || 0} vouchers</strong> and
                            related sales/purchase data from this sync batch.
                        </p>
                        <p className="text-sm text-orange-600 bg-orange-50 p-3 rounded-lg mb-4">
                            ⚠️ This action cannot be undone. You will need to re-sync to get this data back.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteSync}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete Sync
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete All Modal */}
            {showDeleteAllModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold text-red-600 mb-2">⚠️ Delete ALL Company Data?</h3>
                        <p className="text-gray-600 mb-4">
                            This will permanently delete <strong>ALL</strong> data for <strong>{selectedCompany.name}</strong>:
                        </p>
                        <ul className="text-sm text-gray-600 mb-4 list-disc list-inside">
                            <li>All vouchers</li>
                            <li>All sales & purchases</li>
                            <li>All ledgers</li>
                            <li>All stock items</li>
                            <li>All sync history</li>
                        </ul>
                        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4">
                            This is useful for a complete reset. After deleting, run "Sync Now" in Windows App to re-sync everything.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteAllModal(false)}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAllData}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete Everything
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
