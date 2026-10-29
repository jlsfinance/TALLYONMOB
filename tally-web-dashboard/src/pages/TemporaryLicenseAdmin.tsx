import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/insforge';

type LicenseRow = { user_id: string; email: string; company_names: string; license_type: string | null; status: string; expiry: string | null };

export default function TemporaryLicenseAdmin() {
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<LicenseRow[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [days, setDays] = useState('30');
    const [reason, setReason] = useState('');
    const [offset, setOffset] = useState(0);
    const pendingRequest = useRef<{ key: string; id: string } | null>(null);

    const load = useCallback(async () => {
        setBusy(true);
        const { data, error: queryError } = await supabase.rpc('admin_list_temporary_licenses', { p_search: search.trim(), p_limit: 50, p_offset: offset });
        setBusy(false);
        if (queryError) { setRows([]); setError('License management is not available. Check backend configuration.'); return; }
        setError(''); setRows(data || []);
    }, [search, offset]);
    useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 300); return () => window.clearTimeout(timer); }, [load]);

    const act = async (row: LicenseRow, action: 'EXTEND' | 'REVOKE' | 'RESTORE') => {
        const duration = Number(days);
        if (action !== 'REVOKE' && (!Number.isSafeInteger(duration) || duration < 1 || duration > 36500)) { setError('Enter a valid number of days (1–36500).'); return; }
        if (action === 'REVOKE' && !window.confirm(`Revoke temporary access for ${row.email}?`)) return;
        const requestKey = JSON.stringify([row.user_id, action, action === 'REVOKE' ? null : duration, reason.trim()]);
        if (!pendingRequest.current || pendingRequest.current.key !== requestKey) {
            pendingRequest.current = { key: requestKey, id: crypto.randomUUID() };
        }
        setBusy(true);
        const { error: actionError } = await supabase.rpc('temporary_license_admin_action', {
            p_user_id: row.user_id, p_action: action, p_days: action === 'REVOKE' ? null : duration,
            p_reason: reason.trim() || null, p_request_id: pendingRequest.current.id,
        });
        setBusy(false);
        if (actionError) { setError(actionError.message || 'License action failed.'); return; }
        pendingRequest.current = null;
        await load();
    };
    return <section className="space-y-3 p-2">
        <div><h2 className="text-lg font-bold">License Management</h2><p className="text-sm text-[var(--text-muted)]">One license per user, shared across their companies.</p></div>
        <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm">License changes are unavailable until the temporary licensing backend is installed and verified.</p>
        <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search email or company" aria-label="Search email or company" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" />
        <div className="flex flex-wrap gap-2"><label className="text-sm">Days <input value={days} onChange={e => setDays(e.target.value)} type="number" min="1" max="36500" className="w-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" /></label><input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Reason (optional)" className="min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm" /></div>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {busy && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {!busy && !error && rows.length === 0 && <p className="p-3 text-sm text-[var(--text-muted)]">No matching users.</p>}
        {rows.map(row => <article key={row.user_id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="break-all text-sm font-bold">{row.email}</p><p className="text-xs text-[var(--text-muted)]">{row.company_names || 'No company'}</p></div><span className="text-xs font-semibold">{row.license_type || 'No temporary license'} · {row.status}</span></div>
            {row.expiry && <p className="mt-2 text-xs text-[var(--text-muted)]">Expiry: {new Date(row.expiry).toLocaleDateString('en-IN')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">{(['EXTEND', 'REVOKE', 'RESTORE'] as const).map(action => <button type="button" key={action} disabled title="Backend setup required" onClick={() => void act(row, action)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-50">{action === 'EXTEND' ? 'Grant / Extend' : action === 'REVOKE' ? 'Revoke' : 'Restore'}</button>)}</div>
        </article>)}
        <div className="flex gap-3"><button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} className="text-sm disabled:opacity-40">Previous</button><button disabled={busy || rows.length < 50} onClick={() => setOffset(offset + 50)} className="text-sm disabled:opacity-40">Next</button></div>
    </section>;
}
