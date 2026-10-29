import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    RefreshCw, Send, CheckCircle2, ArrowRight,
    Download, Upload, Loader2, Database, Users, Package,
    Clock, ShieldCheck, ArrowDownCircle, ArrowUpCircle,
    Check, RotateCcw, FileText, ChevronRight, Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import './InsightsSyncPages.css';
import { supabase } from '@/lib/insforge';
import { generateTallyVoucherXml, sendToTally, exportVouchersToTally } from '@/services/tallyExportService';

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(amount) || 0);
}

export default function TallySyncPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();

    // Tabs: 'tally-to-web' (Pull) vs 'web-to-tally' (Push)
    const [activeTab, setActiveTab] = useState<'tally-to-web' | 'web-to-tally'>('tally-to-web');

    // Web to Tally Push states
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ exported: number; failed: number; errors: string[] } | null>(null);
    const [pendingVouchers, setPendingVouchers] = useState<any[]>([]);
    const [queue, setQueue] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Tally to Web Pull states
    const [tallyToWebSyncing, setTallyToWebSyncing] = useState(false);
    const [stats, setStats] = useState({
        vouchers: 0,
        ledgers: 0,
        stockItems: 0,
        lastSync: null as string | null
    });
    const [syncHistory, setSyncHistory] = useState<any[]>([]);

    const loadTallyToWebData = useCallback(async () => {
        if (!selectedCompany?.id) return;
        try {
            const [vouchersRes, ledgersRes, stockRes, historyRes] = await Promise.all([
                supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('company_id', selectedCompany.id).eq('is_deleted', false),
                supabase.from('ledgers').select('*', { count: 'exact', head: true }).eq('company_id', selectedCompany.id).eq('is_deleted', false),
                supabase.from('stock_items').select('*', { count: 'exact', head: true }).eq('company_id', selectedCompany.id).eq('is_deleted', false),
                supabase.from('sync_history').select('*').eq('company_id', selectedCompany.id).order('created_at', { ascending: false }).limit(15)
            ]);

            setStats({
                vouchers: vouchersRes.count || 0,
                ledgers: ledgersRes.count || 0,
                stockItems: stockRes.count || 0,
                lastSync: historyRes.data?.[0]?.created_at || null
            });
            setSyncHistory(historyRes.data || []);
        } catch (err) {
            console.error('Error loading Tally to Web data:', err);
        }
    }, [selectedCompany?.id]);

    const loadPendingVouchers = useCallback(async () => {
        if (!selectedCompany?.id) return;
        setLoading(true);
        try {
            // Get vouchers from web
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('id, voucher_type, voucher_number, party_name, grand_total, voucher_date, narration')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(50);

            setPendingVouchers(vouchers || []);

            // Reverse-sync push queue (created on web -> PC app pushes to Tally)
            const { data: queueRows } = await supabase
                .from('pending_transactions')
                .select('id, transaction_type, status, error_message, tally_voucher_number, created_at, synced_at, voucher_data')
                .eq('company_id', selectedCompany.id)
                .order('created_at', { ascending: false })
                .limit(100);
            setQueue(queueRows || []);
        } catch (err) {
            console.error('Load error:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?.id]);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadPendingVouchers();
            loadTallyToWebData();
        }
    }, [selectedCompany?.id, loadPendingVouchers, loadTallyToWebData]);

    const handleTallyToWebSync = async () => {
        setTallyToWebSyncing(true);
        toast.loading('Refreshing cloud records...', { id: 'tally-pull-sync' });
        try {
            await Promise.all([loadTallyToWebData(), loadPendingVouchers()]);
            toast.success('Refresh requested.', { id: 'tally-pull-sync' });
        } catch (err: any) {
            toast.error('Sync error: ' + (err.message || 'Unknown error'), { id: 'tally-pull-sync' });
        } finally {
            setTallyToWebSyncing(false);
        }
    };

    const syncSelectedToTally = async () => {
        if (selectedIds.length === 0) {
            toast.error('Select vouchers to push to Tally');
            return;
        }

        setSyncing(true);
        setSyncResult(null);

        try {
            const vouchersToSync = pendingVouchers.filter(v => selectedIds.includes(v.id));
            const result = await exportVouchersToTally(vouchersToSync);
            setSyncResult(result);

            if (result.exported > 0) {
                toast.success(`${result.exported} vouchers synced to Tally!`);
            }
            if (result.failed > 0) {
                toast.error(`${result.failed} vouchers failed to sync`);
            }

            setSelectedIds([]);
            loadPendingVouchers();
        } catch (err: any) {
            toast.error('Sync failed: ' + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const syncSingleVoucher = async (voucher: any) => {
        try {
            const xml = generateTallyVoucherXml({
                ...voucher,
                company_name: selectedCompany?.name || ''
            });
            const result = await sendToTally(xml);

            if (result.success) {
                toast.success(`Voucher ${voucher.voucher_number || ''} synced!`);
            } else {
                toast.error(`Push notice: ${result.error || 'Check PC companion app'}`);
            }
        } catch (err: any) {
            toast.error('Sync error: ' + err.message);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const retryTransaction = async (t: any) => {
        const { error } = await supabase
            .from('pending_transactions')
            .update({ status: 'pending', error_message: null })
            .eq('id', t.id);
        if (error) {
            toast.error('Retry failed: ' + error.message);
        } else {
            toast.success('Queued again for Tally push');
            loadPendingVouchers();
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === pendingVouchers.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(pendingVouchers.map(v => v.id));
        }
    };

    const exportXml = (voucher: any) => {
        const xml = generateTallyVoucherXml({
            ...voucher,
            company_name: selectedCompany?.name || ''
        });
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${voucher.voucher_number || 'voucher'}.xml`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('XML downloaded!');
    };

    return (
        <div className="sync-hub bg-[#0B1118] text-slate-100 pb-24 px-3 sm:px-6 pt-3 sm:pt-6 space-y-4 max-w-6xl mx-auto font-sans">
            <HeaderPortal type="title"><h1 className="insights-page-title">Tally Sync Hub</h1></HeaderPortal>
            {/* Top Bar Header */}
            <div className="sync-intro flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121B24] border border-[#1E2B38] rounded-2xl p-4 shadow-sm">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="sync-overview-label">SYNC OVERVIEW</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/25 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] animate-pulse"></span>
                            Sync overview
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Bi-directional real-time data sync between Tally Prime &amp; Mobile Web
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        onClick={activeTab === 'tally-to-web' ? handleTallyToWebSync : loadPendingVouchers}
                        disabled={syncing || tallyToWebSyncing}
                        className="px-3.5 py-2 rounded-xl bg-[#16202C] hover:bg-[#1C2A3A] border border-[#22334C] text-slate-200 text-xs font-bold flex items-center gap-2 active:scale-95 transition-all cursor-pointer shadow-xs"
                    >
                        <RefreshCw size={14} className={syncing || tallyToWebSyncing ? 'animate-spin text-[#00E599]' : ''} />
                        <span>Refresh Data</span>
                    </button>
                </div>
            </div>

            {/* High-Contrast Segmented Tabs */}
            <div className="sync-direction-tabs bg-[#121B24] p-1.5 rounded-2xl border border-[#1E2B38] grid grid-cols-2 gap-1.5 shadow-sm">
                <button
                    onClick={() => setActiveTab('tally-to-web')}
                    className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        activeTab === 'tally-to-web'
                            ? 'bg-[#1C2938] text-[#00E599] shadow-md border border-[#00E599]/30'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#16202C]/60'
                    }`}
                >
                    <ArrowDownCircle size={17} className={activeTab === 'tally-to-web' ? 'text-[#00E599]' : 'text-slate-400'} />
                    <div className="text-left">
                        <div className="leading-tight font-black">Tally to Web</div>
                        <div className="text-[10px] opacity-75 font-medium hidden sm:block">Pull Ledgers &amp; Vouchers to Cloud</div>
                    </div>
                </button>

                <button
                    onClick={() => setActiveTab('web-to-tally')}
                    className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        activeTab === 'web-to-tally'
                            ? 'bg-[#1C2938] text-[#00E599] shadow-md border border-[#00E599]/30'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#16202C]/60'
                    }`}
                >
                    <ArrowUpCircle size={17} className={activeTab === 'web-to-tally' ? 'text-[#00E599]' : 'text-slate-400'} />
                    <div className="text-left flex items-center gap-1.5">
                        <div>
                            <div className="leading-tight font-black">Web to Tally (Push)</div>
                            <div className="text-[10px] opacity-75 font-medium hidden sm:block">Push created invoices to Tally</div>
                        </div>
                        {pendingVouchers.length > 0 && (
                            <span className="w-5 h-5 rounded-full bg-[#00E599]/20 text-[#00E599] border border-[#00E599]/40 text-[10px] font-black flex items-center justify-center ml-1">
                                {pendingVouchers.length}
                            </span>
                        )}
                    </div>
                </button>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: TALLY TO WEB (PULL)                                                */}
            {/* ========================================================================= */}
            {activeTab === 'tally-to-web' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Live Sync Hero Card */}
                    <div className="sync-company-card bg-gradient-to-br from-[#121B24] via-[#121B24] to-[#14262E] border border-[#1E2B38] rounded-2xl p-4 sm:p-5 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black tracking-widest text-[#00E599] uppercase">
                                    CLOUD DATA REPOSITORY
                                </span>
                                <h2 className="text-lg sm:text-xl font-black text-white">
                                    {selectedCompany?.name || 'Selected Company'}
                                </h2>
                                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                                    <Clock size={13} className="text-slate-400" />
                                    Last synced: {stats.lastSync ? format(new Date(stats.lastSync), 'dd MMM yyyy, hh:mm a') : 'Not available'}
                                </p>
                            </div>

                            <button
                                onClick={handleTallyToWebSync}
                                disabled={tallyToWebSyncing}
                                className="px-5 py-2.5 rounded-xl bg-[#00E599] hover:bg-[#00c985] text-[#0B1118] font-black text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                                <RefreshCw size={15} className={tallyToWebSyncing ? 'animate-spin' : ''} />
                                <span>{tallyToWebSyncing ? 'Refreshing...' : 'Refresh Data'}</span>
                            </button>
                        </div>

                        {/* Module Counts Grid */}
                        <div className="sync-counts grid grid-cols-3 gap-2.5 sm:gap-4 mt-5 pt-4 border-t border-[#1E2B38]">
                            <div className="bg-[#0B1118]/70 border border-[#1E2B38] rounded-xl p-3 text-center">
                                <Database size={16} className="text-[#00E599] mx-auto mb-1 opacity-80" />
                                <div className="text-lg sm:text-2xl font-black text-white tracking-tight">
                                    {stats.vouchers.toLocaleString()}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Vouchers</div>
                            </div>

                            <div className="bg-[#0B1118]/70 border border-[#1E2B38] rounded-xl p-3 text-center">
                                <Users size={16} className="text-cyan-400 mx-auto mb-1 opacity-80" />
                                <div className="text-lg sm:text-2xl font-black text-white tracking-tight">
                                    {stats.ledgers.toLocaleString()}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Parties</div>
                            </div>

                            <div className="bg-[#0B1118]/70 border border-[#1E2B38] rounded-xl p-3 text-center">
                                <Package size={16} className="text-amber-400 mx-auto mb-1 opacity-80" />
                                <div className="text-lg sm:text-2xl font-black text-white tracking-tight">
                                    {stats.stockItems.toLocaleString()}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Items</div>
                            </div>
                        </div>
                    </div>

                    {/* Desktop Sync Agent Info Card */}
                    <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                                <ShieldCheck size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    TallyLink Windows Sync Agent
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        AUTOMATIC
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Runs seamlessly in background on PC to auto-sync vouchers, parties, and inventory without manual intervention.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => navigate('/sync-history')}
                                className="px-3.5 py-1.5 rounded-xl bg-[#16202C] hover:bg-[#1E2D3D] border border-[#22334C] text-xs font-bold text-slate-300 flex items-center gap-1.5 active:scale-95 transition-all"
                            >
                                <span>Detailed Logs</span>
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Sync History Logs */}
                    <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-3.5 sm:p-4 border-b border-[#1E2B38] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-[#00E599]" />
                                <h3 className="text-sm font-black text-white">Recent Sync Activities</h3>
                            </div>
                            <span className="text-xs text-slate-400 font-medium">{syncHistory.length} events</span>
                        </div>

                        {syncHistory.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                                No sync history records found yet. Use Refresh Data above to check again.
                            </div>
                        ) : (
                            <div className="sync-history-list divide-y divide-[#1A2634]">
                                {syncHistory.slice(0, 8).map((log: any, idx: number) => (
                                    <div key={log.id || idx} className="p-3.5 sm:px-4 flex items-center justify-between gap-3 hover:bg-[#16202C]/50 transition-colors">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#00E599] flex items-center justify-center shrink-0">
                                                <Check size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate">
                                                    {log.module_name || log.sync_type || 'Full Company Sync'}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    {log.created_at ? format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a') : 'Recent'} • {log.records_synced || log.record_count || 0} records updated
                                                </p>
                                            </div>
                                        </div>

                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shrink-0">
                                            Success
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: WEB TO TALLY (PUSH)                                                */}
            {/* ========================================================================= */}
            {activeTab === 'web-to-tally' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-3 sm:p-4 text-center shadow-sm">
                            <p className="text-lg sm:text-2xl font-black text-white">{pendingVouchers.length}</p>
                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mt-0.5">Total Vouchers</p>
                        </div>
                        <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-3 sm:p-4 text-center shadow-sm">
                            <p className="text-lg sm:text-2xl font-black text-[#00E599]">{selectedIds.length}</p>
                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mt-0.5">Selected</p>
                        </div>
                        <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-3 sm:p-4 text-center shadow-sm">
                            <p className="text-lg sm:text-2xl font-black text-cyan-400">{queue.length}</p>
                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mt-0.5">Push Queue</p>
                        </div>
                    </div>

                    {/* Sync Actions Bar */}
                    <div className="flex gap-2 sm:gap-3">
                        <button
                            onClick={syncSelectedToTally}
                            disabled={syncing || selectedIds.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-xl sm:rounded-2xl bg-[#00E599] hover:bg-[#00c985] text-[#0B1118] font-black text-xs sm:text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-98 transition-all cursor-pointer"
                        >
                            {syncing ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Pushing to Tally...</span>
                                </>
                            ) : (
                                <>
                                    <Send size={15} />
                                    <span>Push to Tally ({selectedIds.length})</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={toggleSelectAll}
                            className="px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-[#22334C] bg-[#16202C] hover:bg-[#1E2D3D] text-xs sm:text-sm font-bold text-slate-200 transition-all cursor-pointer active:scale-95"
                        >
                            {selectedIds.length === pendingVouchers.length && pendingVouchers.length > 0 ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    {/* Push Result Banner */}
                    {syncResult && (
                        <div className={`p-3 sm:p-4 border rounded-2xl flex items-start gap-3 shadow-sm ${
                            syncResult.failed === 0
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}>
                            {syncResult.failed === 0 ? (
                                <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                                <RefreshCw size={18} className="text-amber-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className="text-xs sm:text-sm font-bold">
                                    {syncResult.exported} exported successfully, {syncResult.failed} failed
                                </p>
                                {syncResult.errors.length > 0 && (
                                    <div className="mt-1 space-y-0.5 text-xs text-red-300">
                                        {syncResult.errors.map((err, i) => (
                                            <p key={i}>• {err}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Vouchers List */}
                    <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-3.5 sm:p-4 border-b border-[#1E2B38] flex items-center justify-between">
                            <h3 className="text-xs sm:text-sm font-black text-white">Vouchers Ready to Push</h3>
                            <span className="text-xs text-slate-400">{pendingVouchers.length} available</span>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center">
                                <RefreshCw size={20} className="animate-spin text-[#00E599] mx-auto mb-2" />
                                <p className="text-xs text-slate-400">Loading vouchers...</p>
                            </div>
                        ) : pendingVouchers.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                                No pending vouchers created on web found.
                            </div>
                        ) : (
                            <div className="divide-y divide-[#1A2634]">
                                {pendingVouchers.map((v: any) => (
                                    <div
                                        key={v.id}
                                        className="flex items-center gap-2.5 sm:gap-3 py-2.5 px-3 sm:px-4 hover:bg-[#16202C]/60 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(v.id)}
                                            onChange={() => toggleSelect(v.id)}
                                            className="w-4 h-4 rounded border-[#22334C] text-[#00E599] focus:ring-[#00E599] bg-[#0B1118] cursor-pointer"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                    v.voucher_type === 'Sales' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                                    v.voucher_type === 'Purchase' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' :
                                                    v.voucher_type === 'Receipt' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                                                    'bg-slate-700 text-slate-300'
                                                }`}>
                                                    {v.voucher_type}
                                                </span>
                                                <p className="text-xs sm:text-sm font-bold text-white truncate max-w-[150px] sm:max-w-xs">
                                                    {v.party_name || 'Unknown'}
                                                </p>
                                            </div>
                                            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                                                #{v.voucher_number || 'NA'} • {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : ''}
                                            </p>
                                        </div>

                                        <p className="text-xs sm:text-sm font-black text-white whitespace-nowrap">
                                            {formatCurrency(v.grand_total)}
                                        </p>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => exportXml(v)}
                                                className="p-1.5 rounded-lg bg-[#16202C] hover:bg-[#1E2D3D] border border-[#22334C] text-slate-300 hover:text-white transition-colors"
                                                title="Download XML"
                                            >
                                                <Download size={13} />
                                            </button>
                                            <button
                                                onClick={() => syncSingleVoucher(v)}
                                                className="p-1.5 rounded-lg bg-[#00E599]/15 hover:bg-[#00E599]/25 border border-[#00E599]/30 text-[#00E599] transition-colors"
                                                title="Push to Tally"
                                            >
                                                <Send size={13} />
                                            </button>
                                            <button
                                                onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/tally-sync' } })}
                                                className="p-1.5 rounded-lg bg-[#16202C] hover:bg-[#1E2D3D] border border-[#22334C] text-slate-400 hover:text-white transition-colors"
                                                title="View"
                                            >
                                                <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tally Push Queue (Reverse Sync via PC App) */}
                    <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-3.5 sm:p-4 border-b border-[#1E2B38] flex items-center justify-between">
                            <div>
                                <h3 className="text-xs sm:text-sm font-black text-white">
                                    Desktop App Push Queue
                                </h3>
                                <p className="text-[10px] text-slate-400">Transactions processed by TallyLink Companion</p>
                            </div>
                            <button
                                onClick={loadPendingVouchers}
                                className="p-1.5 rounded-lg bg-[#16202C] hover:bg-[#1E2D3D] border border-[#22334C] text-slate-300"
                                title="Refresh"
                            >
                                <RefreshCw size={12} />
                            </button>
                        </div>

                        {queue.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                                No entries yet — invoices created on mobile appear here as the PC companion pushes them to Tally.
                            </div>
                        ) : (
                            <div className="divide-y divide-[#1A2634]">
                                {queue.map((t: any) => {
                                    const vd = t.voucher_data || {};
                                    return (
                                        <div key={t.id} className="flex items-center gap-2.5 sm:gap-3 py-2.5 px-3 sm:px-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                        t.transaction_type === 'Sales' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                                        t.transaction_type === 'Purchase' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' :
                                                        'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                    }`}>
                                                        {t.transaction_type}
                                                    </span>
                                                    <p className="text-xs sm:text-sm font-bold text-white truncate">
                                                        {vd.party_name || 'Unknown party'}
                                                    </p>
                                                </div>
                                                <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                                                    {t.created_at ? format(new Date(t.created_at), 'dd MMM yyyy, HH:mm') : ''}
                                                    {t.status === 'pending' && ' • ⏳ Waiting for PC app sync'}
                                                    {t.status === 'synced' && ` • ✅ Tally #${t.tally_voucher_number || 'OK'}`}
                                                    {t.status === 'failed' && (t.error_message ? ` • ❌ ${t.error_message}` : ' • ❌ Failed')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <p className="text-xs sm:text-sm font-black text-white whitespace-nowrap">
                                                    {formatCurrency(Number(vd.grand_total ?? vd.total_amount ?? 0))}
                                                </p>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                    t.status === 'pending' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                                                    t.status === 'synced' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                                    'bg-red-500/15 text-red-400 border border-red-500/30'
                                                }`}>
                                                    {t.status}
                                                </span>
                                                {t.status === 'failed' && (
                                                    <button
                                                        onClick={() => retryTransaction(t)}
                                                        className="text-[10px] font-bold text-[#00E599] hover:underline"
                                                    >
                                                        Retry
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* How It Works Guide */}
                    <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-4 shadow-sm">
                        <p className="text-xs font-black text-white uppercase tracking-wider mb-3">How Web to Tally Push Works</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                                { step: '1', title: 'Create on Web/Mobile', desc: 'Generate bills, sales or payment entries on your phone' },
                                { step: '2', title: 'Auto-Queued or Push', desc: 'Select voucher and click Push to Tally or let PC agent auto-detect' },
                                { step: '3', title: 'Available in Tally', desc: 'Instant voucher insertion into Tally Prime company books' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0B1118]/60 border border-[#1E2B38]">
                                    <div className="w-6 h-6 rounded-lg bg-[#00E599]/15 border border-[#00E599]/30 text-[#00E599] flex items-center justify-center text-xs font-black shrink-0">
                                        {item.step}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white">{item.title}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
