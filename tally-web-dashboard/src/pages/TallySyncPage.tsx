import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    RefreshCw, Send, CheckCircle2, XCircle, ArrowRight,
    Wifi, WifiOff, Download, Upload, Loader2, AlertTriangle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { generateTallyVoucherXml, sendToTally, exportVouchersToTally } from '@/services/tallyExportService';
import TallySyncIndicator from '@/components/common/TallySyncIndicator';

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(amount) || 0);
}

export default function TallySyncPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [tallyConnected, setTallyConnected] = useState<boolean | null>(null);
    const [tallyPort, setTallyPort] = useState(9000);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ exported: number; failed: number; errors: string[] } | null>(null);
    const [pendingVouchers, setPendingVouchers] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncHistory, setSyncHistory] = useState<any[]>([]);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadPendingVouchers();
            checkTallyConnection();
        }
    }, [selectedCompany]);

    const checkTallyConnection = async () => {
        try {
            const res = await fetch(`http://localhost:${tallyPort}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`,
                signal: AbortSignal.timeout(3000),
            });
            setTallyConnected(res.ok);
        } catch {
            setTallyConnected(false);
        }
    };

    const loadPendingVouchers = async () => {
        setLoading(true);
        try {
            // Get vouchers that haven't been synced to Tally
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('id, voucher_type, voucher_number, party_name, grand_total, voucher_date, narration')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(50);

            setPendingVouchers(vouchers || []);
        } catch (err) {
            console.error('Load error:', err);
        } finally {
            setLoading(false);
        }
    };

    const syncSelectedToTally = async () => {
        if (selectedIds.length === 0) {
            toast.error('Select vouchers to sync');
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
            const result = await sendToTally(xml, tallyPort);

            if (result.success) {
                toast.success(`Voucher ${voucher.voucher_number} synced!`);
            } else {
                toast.error(`Failed: ${result.error}`);
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
        <div className="space-y-3 md:space-y-5 pb-24 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-[var(--on-background)]">Tally Sync</h1>
                    <p className="text-[10px] md:text-sm text-[var(--text-muted)]">Sync vouchers from website to Tally</p>
                </div>
                <TallySyncIndicator port={tallyPort} compact />
            </div>

            {/* Connection Status */}
            {tallyConnected === false && (
                <div className="card p-2 md:p-4 border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/10 rounded-xl md:rounded-2xl">
                    <div className="flex items-start gap-2 md:gap-3">
                        <AlertTriangle size={14} className="text-amber-600 mt-0.5 md:w-[18px] md:h-[18px]" />
                        <div className="min-w-0">
                            <p className="text-xs md:text-sm font-bold text-amber-800">Tally Not Connected</p>
                            <p className="text-[10px] md:text-xs text-amber-600 mt-0.5 md:mt-1">
                                Make sure Tally is running on port {tallyPort}. 
                                Go to Tally → Gateway → Configure → Set port to {tallyPort}.
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 md:mt-2">
                                <input
                                    type="number"
                                    value={tallyPort}
                                    onChange={e => setTallyPort(Number(e.target.value))}
                                    className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-white border border-amber-300 text-xs md:text-sm w-16 md:w-20"
                                />
                                <button onClick={checkTallyConnection} className="text-[10px] md:text-xs font-bold text-amber-700 hover:underline">
                                    Retry Connection
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sync Summary */}
            <div className="grid grid-cols-3 gap-1.5 md:gap-3">
                <div className="card p-2 md:p-3 text-center rounded-xl md:rounded-2xl">
                    <p className="text-lg md:text-2xl font-bold text-[var(--on-background)]">{pendingVouchers.length}</p>
                    <p className="text-[9px] md:text-[10px] font-bold text-[var(--text-muted)] uppercase">Total Vouchers</p>
                </div>
                <div className="card p-2 md:p-3 text-center rounded-xl md:rounded-2xl">
                    <p className="text-lg md:text-2xl font-bold text-emerald-600">{selectedIds.length}</p>
                    <p className="text-[9px] md:text-[10px] font-bold text-[var(--text-muted)] uppercase">Selected</p>
                </div>
                <div className="card p-2 md:p-3 text-center rounded-xl md:rounded-2xl">
                    <p className="text-lg md:text-2xl font-bold text-blue-600">{tallyConnected === true ? '✓' : '✗'}</p>
                    <p className="text-[9px] md:text-[10px] font-bold text-[var(--text-muted)] uppercase">Tally Status</p>
                </div>
            </div>

            {/* Sync Button */}
            <div className="flex gap-2 md:gap-3">
                <button
                    onClick={syncSelectedToTally}
                    disabled={syncing || selectedIds.length === 0 || tallyConnected === false}
                    className="flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2 md:py-3 rounded-xl md:rounded-2xl bg-[var(--primary)] text-white font-bold text-xs md:text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md transition-all"
                >
                    {syncing ? (
                        <><Loader2 size={14} className="animate-spin" /> <span className="hidden md:inline">Syncing...</span><span className="md:hidden">Sync...</span></>
                    ) : (
                        <><Send size={14} /> Sync {selectedIds.length}</>
                    )}
                </button>
                <button
                    onClick={toggleSelectAll}
                    className="px-3 md:px-4 py-2 md:py-3 rounded-xl md:rounded-2xl border border-[var(--border)] text-xs md:text-sm font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container)]"
                >
                    {selectedIds.length === pendingVouchers.length ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            {/* Sync Result */}
            {syncResult && (
                <div className={`card p-2 md:p-4 border-l-4 rounded-xl md:rounded-2xl ${
                    syncResult.failed === 0 ? 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' :
                    'border-l-amber-500 bg-amber-50 dark:bg-amber-900/10'
                }`}>
                    <div className="flex items-start gap-2 md:gap-3">
                        {syncResult.failed === 0 ? (
                            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 md:w-[18px] md:h-[18px]" />
                        ) : (
                            <AlertTriangle size={14} className="text-amber-600 mt-0.5 md:w-[18px] md:h-[18px]" />
                        )}
                        <div>
                            <p className="text-xs md:text-sm font-bold">
                                {syncResult.exported} exported, {syncResult.failed} failed
                            </p>
                            {syncResult.errors.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {syncResult.errors.map((err, i) => (
                                        <p key={i} className="text-xs text-red-600">{err}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Voucher List */}
            <div className="card overflow-hidden rounded-xl md:rounded-2xl">
                <div className="p-2 md:p-4 border-b border-[var(--border)]">
                    <p className="text-xs md:text-sm font-bold text-[var(--on-surface)]">Vouchers to Sync</p>
                </div>
                {loading ? (
                    <div className="p-4 md:p-8 text-center">
                        <RefreshCw size={16} className="animate-spin text-[var(--primary)] mx-auto mb-2 md:w-5 md:h-5" />
                        <p className="text-[10px] md:text-xs text-[var(--text-muted)]">Loading vouchers...</p>
                    </div>
                ) : pendingVouchers.length === 0 ? (
                    <div className="p-4 md:p-8 text-center text-xs md:text-sm text-[var(--text-muted)]">No vouchers found</div>
                ) : (
                    <div className="divide-y divide-[var(--border-light)]">
                        {pendingVouchers.map((v: any) => (
                            <div key={v.id} className="flex items-center gap-2 md:gap-3 py-1.5 md:py-3 px-2 md:px-4 hover:bg-[var(--surface-hover)] transition-all">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(v.id)}
                                    onChange={() => toggleSelect(v.id)}
                                    className="w-3.5 h-3.5 md:w-4 md:h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 md:gap-2">
                                        <span className={`text-[9px] md:text-[10px] font-bold px-1 md:px-1.5 py-0.5 rounded ${
                                            v.voucher_type === 'Sales' ? 'bg-emerald-100 text-emerald-700' :
                                            v.voucher_type === 'Purchase' ? 'bg-orange-100 text-orange-700' :
                                            v.voucher_type === 'Receipt' ? 'bg-blue-100 text-blue-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                            {v.voucher_type}
                                        </span>
                                        <p className="text-[10px] md:text-sm font-semibold text-[var(--on-surface)] truncate">{v.party_name || 'Unknown'}</p>
                                    </div>
                                    <p className="text-[9px] md:text-xs text-[var(--text-muted)] mt-0.5">
                                        #{v.voucher_number || 'NA'} · {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : ''}
                                    </p>
                                </div>
                                <p className="text-[10px] md:text-sm font-bold text-[var(--on-surface)] whitespace-nowrap">{formatCurrency(v.grand_total)}</p>
                                <div className="flex items-center gap-0.5 md:gap-1">
                                    <button
                                        onClick={() => exportXml(v)}
                                        className="p-1 md:p-1.5 rounded-lg hover:bg-[var(--surface-container)] text-[var(--text-muted)]"
                                        title="Download XML"
                                    >
                                        <Download size={12} className="md:w-[14px] md:h-[14px]" />
                                    </button>
                                    <button
                                        onClick={() => syncSingleVoucher(v)}
                                        disabled={tallyConnected === false}
                                        className="p-1 md:p-1.5 rounded-lg hover:bg-[var(--primary-container)] text-[var(--primary)] disabled:opacity-30"
                                        title="Sync to Tally"
                                    >
                                        <Send size={12} className="md:w-[14px] md:h-[14px]" />
                                    </button>
                                    <button
                                        onClick={() => navigate(`/invoice/${v.id}`, { state: { voucher: v, from: '/sync-history' } })}
                                        className="p-1 md:p-1.5 rounded-lg hover:bg-[var(--surface-container)] text-[var(--text-muted)]"
                                        title="View"
                                    >
                                        <ArrowRight size={12} className="md:w-[14px] md:h-[14px]" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* How It Works */}
            <div className="card p-2 md:p-4 rounded-xl md:rounded-2xl">
                <p className="text-xs md:text-sm font-bold text-[var(--on-surface)] mb-2 md:mb-3">How It Works</p>
                <div className="space-y-2 md:space-y-3">
                    {[
                        { step: '1', title: 'Create Entry on Website', desc: 'Add voucher/invoice from the website' },
                        { step: '2', title: 'Click Sync to Tally', desc: 'Select vouchers and click sync button' },
                        { step: '3', title: 'Data Appears in Tally', desc: 'Voucher is imported into Tally automatically' },
                    ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2 md:gap-3">
                            <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-[10px] md:text-xs font-bold flex-shrink-0">
                                {item.step}
                            </div>
                            <div>
                                <p className="text-[10px] md:text-sm font-semibold text-[var(--on-surface)]">{item.title}</p>
                                <p className="text-[9px] md:text-xs text-[var(--text-muted)]">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
