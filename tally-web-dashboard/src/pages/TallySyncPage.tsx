import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    AlertTriangle, ArrowRight, CheckCircle2, Download, Loader2, RefreshCw,
    Search, Send, Wifi, WifiOff
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { generateTallyVoucherXml, sendToTally, exportVouchersToTally } from '@/services/tallyExportService';

type ConnectionStatus = 'checking' | 'connected' | 'offline' | 'unchecked';
type SyncResult = { exported: number; failed: number; errors: string[] };
type SyncProgress = { current: number; total: number };

function isValidPort(value: string | number) {
    const port = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535 && String(value).trim() !== '';
}

function readSavedPort() {
    try {
        const value = window.localStorage.getItem('tallyPort') || '9000';
        return isValidPort(value) ? value : '9000';
    } catch {
        return '9000';
    }
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(Number(amount)) || 0);
}

function formatVoucherDate(value: string | null | undefined) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : format(date, 'dd MMM yyyy');
}

export default function TallySyncPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
    const [connectionError, setConnectionError] = useState('');
    const [lastConnectionCheck, setLastConnectionCheck] = useState<Date | null>(null);
    const [portInput, setPortInput] = useState(readSavedPort);
    const [syncing, setSyncing] = useState(false);
    const [syncingSingleId, setSyncingSingleId] = useState<string | null>(null);
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [pendingVouchers, setPendingVouchers] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [voucherLoadError, setVoucherLoadError] = useState('');
    const connectionCheckId = useRef(0);
    const voucherLoadId = useRef(0);

    const portNumber = Number(portInput);
    const portIsValid = isValidPort(portInput);

    useEffect(() => {
        if (!selectedCompany?.id) {
            voucherLoadId.current += 1;
            setPendingVouchers([]);
            setSelectedIds([]);
            setVoucherLoadError('');
            setLoading(false);
            return;
        }
        void loadPendingVouchers();
        void checkTallyConnection();
        // Re-run when the active company changes; port edits require an explicit retry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCompany?.id]);

    const loadPendingVouchers = async () => {
        const companyId = selectedCompany?.id;
        if (!companyId) return;
        const requestId = ++voucherLoadId.current;
        setLoading(true);
        setVoucherLoadError('');
        try {
            const { data: vouchers, error } = await supabase
                .from('vouchers')
                .select('id, voucher_type, voucher_number, party_name, grand_total, voucher_date, narration')
                .eq('company_id', companyId)
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(50);

            if (requestId !== voucherLoadId.current) return;
            if (error) {
                setPendingVouchers([]);
                setSelectedIds([]);
                setVoucherLoadError(error.message || 'Could not load vouchers. Please try again.');
                return;
            }

            const nextVouchers = vouchers || [];
            setPendingVouchers(nextVouchers);
            setSelectedIds(current => current.filter(id => nextVouchers.some((voucher: any) => voucher.id === id)));
        } catch (error: any) {
            if (requestId !== voucherLoadId.current) return;
            console.error('Load vouchers error:', error);
            setPendingVouchers([]);
            setSelectedIds([]);
            setVoucherLoadError(error?.message || 'Could not load vouchers. Please try again.');
        } finally {
            if (requestId === voucherLoadId.current) setLoading(false);
        }
    };

    const checkTallyConnection = async () => {
        const requestId = ++connectionCheckId.current;
        if (!portIsValid) {
            setConnectionStatus('offline');
            setConnectionError('Enter a valid port number from 1 to 65535.');
            setLastConnectionCheck(new Date());
            return;
        }

        setConnectionStatus('checking');
        setConnectionError('');
        try {
            try { window.localStorage.setItem('tallyPort', String(portNumber)); } catch { /* Keep the current-session setting. */ }
            const response = await fetch(`http://localhost:${portNumber}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>',
                signal: AbortSignal.timeout(3000),
            });
            if (requestId !== connectionCheckId.current) return;
            if (response.ok) {
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('offline');
                setConnectionError(`Tally responded with HTTP ${response.status}. Check that its HTTP/XML interface is enabled.`);
            }
        } catch {
            if (requestId !== connectionCheckId.current) return;
            setConnectionStatus('offline');
            setConnectionError(`Tally did not respond on port ${portNumber}. Open Tally on this device, enable its HTTP/XML interface, and retry.`);
        } finally {
            if (requestId === connectionCheckId.current) setLastConnectionCheck(new Date());
        }
    };

    const handlePortChange = (value: string) => {
        connectionCheckId.current += 1;
        setPortInput(value);
        setConnectionStatus('unchecked');
        setConnectionError('');
        if (isValidPort(value)) {
            try { window.localStorage.setItem('tallyPort', value); } catch { /* Keep the current-session setting. */ }
        }
    };

    const visibleVouchers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return pendingVouchers;
        return pendingVouchers.filter((voucher: any) => [
            voucher.voucher_number, voucher.party_name, voucher.voucher_type
        ].some(value => String(value || '').toLowerCase().includes(query)));
    }, [pendingVouchers, searchTerm]);

    const visibleIds = visibleVouchers.map((voucher: any) => voucher.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id: string) => selectedIds.includes(id));

    const toggleSelect = (id: string) => {
        setSelectedIds(current => current.includes(id)
            ? current.filter(selectedId => selectedId !== id)
            : [...current, id]);
    };

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds(current => current.filter(id => !visibleIds.includes(id)));
        } else {
            setSelectedIds(current => Array.from(new Set([...current, ...visibleIds])));
        }
    };

    const syncSelectedToTally = async () => {
        if (connectionStatus !== 'connected') {
            toast.error('Connect to Tally before starting a sync.');
            return;
        }
        if (selectedIds.length === 0) {
            toast.error('Select at least one voucher to sync.');
            return;
        }

        const vouchersToSync = pendingVouchers
            .filter(voucher => selectedIds.includes(voucher.id))
            .map(voucher => ({ ...voucher, company_name: selectedCompany?.name || '' }));
        if (!vouchersToSync.length) {
            toast.error('No selected vouchers are available. Refresh the list and try again.');
            return;
        }

        setSyncing(true);
        setSyncProgress({ current: 0, total: vouchersToSync.length });
        setSyncResult(null);
        try {
            const result = await exportVouchersToTally(
                vouchersToSync,
                (current, total) => setSyncProgress({ current, total }),
                portNumber
            );
            setSyncResult(result);
            if (result.exported > 0) toast.success(`${result.exported} voucher${result.exported === 1 ? '' : 's'} sent to Tally.`);
            if (result.failed > 0) toast.error(`${result.failed} voucher${result.failed === 1 ? '' : 's'} could not be sent.`);
            setSelectedIds([]);
            await loadPendingVouchers();
        } catch (error: any) {
            toast.error(`Sync failed: ${error?.message || 'Unexpected error'}`);
            setSyncResult({ exported: 0, failed: vouchersToSync.length, errors: [error?.message || 'Unexpected error'] });
        } finally {
            setSyncing(false);
            setSyncProgress(null);
        }
    };

    const syncSingleVoucher = async (voucher: any) => {
        if (connectionStatus !== 'connected') {
            toast.error('Connect to Tally before starting a sync.');
            return;
        }
        setSyncingSingleId(voucher.id);
        try {
            const xml = generateTallyVoucherXml({ ...voucher, company_name: selectedCompany?.name || '' });
            const result = await sendToTally(xml, portNumber);
            if (result.success) toast.success(`Voucher ${voucher.voucher_number || ''} sent to Tally.`);
            else toast.error(`Could not sync voucher: ${result.error || 'Tally did not accept the request.'}`);
        } catch (error: any) {
            toast.error(`Sync failed: ${error?.message || 'Unexpected error'}`);
        } finally {
            setSyncingSingleId(null);
        }
    };

    const exportXml = (voucher: any) => {
        const xml = generateTallyVoucherXml({ ...voucher, company_name: selectedCompany?.name || '' });
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${voucher.voucher_number || 'voucher'}.xml`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        toast.success('Voucher XML downloaded.');
    };

    const connectionLabel: Record<ConnectionStatus, string> = {
        checking: 'Checking Tally',
        connected: 'Tally connected',
        offline: 'Tally offline',
        unchecked: 'Connection not checked',
    };
    const connectionTone: Record<ConnectionStatus, string> = {
        checking: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
        connected: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        offline: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        unchecked: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
    };
    const resultTone = syncResult?.failed === 0
        ? 'border-emerald-500/25 bg-emerald-500/5'
        : syncResult?.exported
            ? 'border-amber-500/25 bg-amber-500/5'
            : 'border-rose-500/25 bg-rose-500/5';
    const syncPercent = syncProgress?.total ? Math.round((syncProgress.current / syncProgress.total) * 100) : 0;

    return (
        <div className="mx-auto max-w-[1500px] space-y-5 pb-24 animate-fade-in sm:space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Operations</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--on-surface)] sm:text-3xl">Tally Sync Center</h1>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Review vouchers, verify your local Tally connection, and send data with confidence.</p>
                </div>
                <span className={`inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${connectionTone[connectionStatus]}`} role="status" aria-live="polite">
                    {connectionStatus === 'connected' ? <Wifi size={15} /> : connectionStatus === 'checking' ? <RefreshCw size={14} className="animate-spin" /> : <WifiOff size={15} />}
                    {connectionLabel[connectionStatus]}
                </span>
            </header>

            <section className={`rounded-2xl border p-4 shadow-[var(--shadow-xs)] sm:p-5 ${connectionStatus === 'connected' ? 'border-emerald-500/20 bg-emerald-500/[0.035]' : connectionStatus === 'offline' ? 'border-rose-500/20 bg-rose-500/[0.035]' : 'border-[var(--border)] bg-[var(--surface)]'}`} aria-labelledby="tally-connection-title">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${connectionStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : connectionStatus === 'offline' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-[var(--surface-container)] text-[var(--primary)]'}`}>
                            {connectionStatus === 'connected' ? <Wifi size={20} /> : connectionStatus === 'checking' ? <RefreshCw size={19} className="animate-spin" /> : <WifiOff size={20} />}
                        </span>
                        <div className="min-w-0">
                            <h2 id="tally-connection-title" className="font-bold text-[var(--on-surface)]">{connectionLabel[connectionStatus]}</h2>
                            <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--text-muted)]">
                                {connectionStatus === 'connected'
                                    ? `Tally is responding on this device at port ${portNumber}.`
                                    : connectionStatus === 'checking'
                                        ? `Checking the local Tally HTTP/XML service on port ${portNumber}…`
                                        : connectionError || 'Check the connection for this port before sending vouchers.'}
                            </p>
                            {lastConnectionCheck && <p className="mt-1 text-xs text-[var(--text-muted)]">Last checked {lastConnectionCheck.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-[var(--on-surface-variant)]">Tally port</span>
                            <input
                                aria-label="Tally HTTP/XML port"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={65535}
                                step={1}
                                disabled={syncing || syncingSingleId !== null}
                                value={portInput}
                                onChange={(event) => handlePortChange(event.target.value)}
                                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--on-surface)] outline-none transition focus:border-[var(--primary)] sm:w-32"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void checkTallyConnection()}
                            disabled={connectionStatus === 'checking'}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--on-primary)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                        >
                            <RefreshCw size={15} className={connectionStatus === 'checking' ? 'animate-spin' : ''} />
                            {connectionStatus === 'connected' ? 'Check again' : 'Retry connection'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Sync summary">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Vouchers loaded</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--on-surface)]">{loading ? '—' : pendingVouchers.length}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Latest 50 for this company</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Selected</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--primary)]">{selectedIds.length}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Ready for batch export</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Tally status</p>
                    <p className={`mt-2 text-lg font-bold ${connectionStatus === 'connected' ? 'text-emerald-600 dark:text-emerald-400' : connectionStatus === 'offline' ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--on-surface)]'}`}>{connectionLabel[connectionStatus]}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Port {portIsValid ? portNumber : '—'}</p>
                </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
                <button
                    type="button"
                    onClick={() => void syncSelectedToTally()}
                    disabled={syncing || selectedIds.length === 0 || connectionStatus !== 'connected' || !portIsValid}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] shadow-[var(--shadow-sm)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {syncing ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
                    {syncing ? `Sending ${syncProgress?.current || 0} of ${syncProgress?.total || selectedIds.length}…` : `Send ${selectedIds.length} selected to Tally`}
                </button>
                <button
                    type="button"
                    onClick={toggleSelectAll}
                    disabled={loading || syncing || visibleVouchers.length === 0}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--on-surface)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
                </button>
                <button
                    type="button"
                    onClick={() => void loadPendingVouchers()}
                    disabled={loading || syncing}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--on-surface)] transition hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-50"
                >
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    Refresh vouchers
                </button>
            </div>

            {syncing && syncProgress && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)]" role="status" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-[var(--on-surface)]">Sending vouchers to Tally</span>
                        <span className="tabular-nums text-[var(--text-muted)]">{syncProgress.current} / {syncProgress.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-container)]" role="progressbar" aria-valuemin={0} aria-valuemax={syncProgress.total} aria-valuenow={syncProgress.current} aria-label="Voucher sync progress">
                        <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300" style={{ width: `${syncPercent}%` }} />
                    </div>
                </div>
            )}

            {syncResult && (
                <section className={`rounded-2xl border p-4 shadow-[var(--shadow-xs)] sm:p-5 ${resultTone}`} aria-live="polite">
                    <div className="flex items-start gap-3">
                        <span className={`mt-0.5 ${syncResult.failed === 0 ? 'text-emerald-600 dark:text-emerald-400' : syncResult.exported > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {syncResult.failed === 0 ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-bold text-[var(--on-surface)]">{syncResult.exported} sent · {syncResult.failed} failed</h2>
                            <p className="mt-1 text-sm text-[var(--text-muted)]">{syncResult.failed === 0 ? 'Tally accepted all selected vouchers.' : syncResult.exported > 0 ? 'Some vouchers were sent. Review the failed items and retry them.' : 'No vouchers were confirmed. Check Tally and try again.'}</p>
                            {!!syncResult.errors.length && (
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">View {syncResult.errors.length} error{syncResult.errors.length === 1 ? '' : 's'}</summary>
                                    <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-rose-700 dark:text-rose-300">
                                        {syncResult.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
                                    </ul>
                                </details>
                            )}
                        </div>
                    </div>
                </section>
            )}

            <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)]" aria-labelledby="voucher-list-title">
                <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div>
                        <h2 id="voucher-list-title" className="font-bold text-[var(--on-surface)]">Vouchers available to send</h2>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Select one or more vouchers, then send them to your connected Tally company.</p>
                    </div>
                    <label className="relative block w-full sm:max-w-xs">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            type="search"
                            aria-label="Search vouchers"
                            placeholder="Search number, party or type"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 text-sm text-[var(--on-surface)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
                        />
                    </label>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                        <RefreshCw size={22} className="mb-3 animate-spin text-[var(--primary)]" />
                        <p className="text-sm font-semibold text-[var(--on-surface)]">Loading vouchers</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Getting the latest records for this company.</p>
                    </div>
                ) : voucherLoadError ? (
                    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><AlertTriangle size={20} /></span>
                        <p className="mt-3 text-sm font-semibold text-[var(--on-surface)]">Could not load vouchers</p>
                        <p className="mt-1 max-w-lg text-xs text-[var(--text-muted)]">{voucherLoadError}</p>
                        <button type="button" onClick={() => void loadPendingVouchers()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)]"><RefreshCw size={14} /> Try again</button>
                    </div>
                ) : pendingVouchers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-container)] text-[var(--text-muted)]"><Download size={19} /></span>
                        <p className="mt-3 text-sm font-semibold text-[var(--on-surface)]">No vouchers to show yet</p>
                        <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">Create a voucher or invoice first, then return here to send it to Tally.</p>
                        <button type="button" onClick={() => navigate('/create-invoice')} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)]">Create invoice <ArrowRight size={14} /></button>
                    </div>
                ) : visibleVouchers.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                        <p className="text-sm font-semibold text-[var(--on-surface)]">No matching vouchers</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Try another voucher number, party name, or type.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--border)]">
                        {visibleVouchers.map((voucher: any) => {
                            const typeTone = voucher.voucher_type === 'Sales'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : voucher.voucher_type === 'Purchase'
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : voucher.voucher_type === 'Receipt'
                                        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                        : 'bg-[var(--surface-container)] text-[var(--on-surface-variant)]';
                            const amount = Number(voucher.grand_total) || 0;
                            return (
                                <div key={voucher.id} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--surface-hover)] sm:px-5">
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${voucher.voucher_type || 'voucher'} ${voucher.voucher_number || ''}`}
                                        checked={selectedIds.includes(voucher.id)}
                                        onChange={() => toggleSelect(voucher.id)}
                                        className="h-4 w-4 shrink-0 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${typeTone}`}>{voucher.voucher_type || 'Voucher'}</span>
                                            <p className="truncate text-sm font-semibold text-[var(--on-surface)]">{voucher.party_name || 'Unknown party'}</p>
                                        </div>
                                        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">#{voucher.voucher_number || 'Not numbered'} · {formatVoucherDate(voucher.voucher_date)}</p>
                                    </div>
                                    <p className="shrink-0 text-right text-sm font-bold tabular-nums text-[var(--on-surface)]">{formatCurrency(amount)}</p>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button type="button" onClick={() => exportXml(voucher)} aria-label={`Download XML for voucher ${voucher.voucher_number || ''}`} title="Download XML" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]">
                                            <Download size={16} />
                                        </button>
                                        <button type="button" onClick={() => void syncSingleVoucher(voucher)} disabled={connectionStatus !== 'connected' || syncing || syncingSingleId !== null} aria-label={`Send voucher ${voucher.voucher_number || ''} to Tally`} title="Send to Tally" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-container)] disabled:cursor-not-allowed disabled:opacity-40">
                                            {syncingSingleId === voucher.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                                        </button>
                                        <button type="button" onClick={() => navigate(`/invoice/${voucher.id}`, { state: { voucher, from: '/tally-sync' } })} aria-label={`View voucher ${voucher.voucher_number || ''}`} title="View voucher" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]">
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {!loading && !voucherLoadError && pendingVouchers.length > 0 && (
                    <div className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5">
                        Showing {visibleVouchers.length} of {pendingVouchers.length} loaded vouchers · maximum 50 per refresh
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] sm:p-5" aria-labelledby="sync-steps-title">
                <h2 id="sync-steps-title" className="font-bold text-[var(--on-surface)]">How sync works</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    {[
                        { number: '01', title: 'Connect Tally', description: 'Open Tally on this device and verify the HTTP/XML port above.' },
                        { number: '02', title: 'Review vouchers', description: 'Search the latest vouchers and select the records you want to send.' },
                        { number: '03', title: 'Check the result', description: 'Follow batch progress and review any voucher-specific errors.' },
                    ].map(step => (
                        <div key={step.number} className="flex gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-container)] text-xs font-bold text-[var(--primary)]">{step.number}</span>
                            <div>
                                <p className="text-sm font-semibold text-[var(--on-surface)]">{step.title}</p>
                                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{step.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
