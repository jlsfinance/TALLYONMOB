import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/insforge';

type DirectoryRow = { user_id: string; email: string; full_name: string; phone: string; registered_at: string; last_active_at: string | null; account_status: string; company_names: string; company_count: number; license_type: string | null; status: string; expiry: string | null };
type CompanyRow = { company_id: string; company_name: string; owner_id: string; owner_email: string; owner_name: string; member_count: number; member_emails: string; license_status: string; license_expiry: string | null; last_sync_at: string | null; is_active: boolean; created_at: string };

export default function AdminDirectory({ mode, onOpenCompany }: { mode: 'users' | 'companies'; onOpenCompany?: (companyId: string) => void }) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [offset, setOffset] = useState(0);
    const [rows, setRows] = useState<DirectoryRow[]>([]);
    const [companies, setCompanies] = useState<CompanyRow[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isCompanies = mode === 'companies';
    const load = useCallback(async () => {
        setLoading(true);
        const { data, error: err } = isCompanies
            ? await supabase.rpc('admin_company_directory', { p_search: search.trim(), p_limit: 50, p_offset: offset })
            : await supabase.rpc('admin_filtered_user_directory', { p_search: search.trim(), p_limit: 50, p_offset: offset, p_mode: mode, p_filter: filter });
        setLoading(false);
        if (err) { setRows([]); setCompanies([]); setError(err.message || 'Could not load directory'); return; }
        setError('');
        if (isCompanies) setCompanies((data as CompanyRow[]) || []);
        else setRows(data || []);
    }, [search, offset, mode, filter, isCompanies]);
    useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 250); return () => window.clearTimeout(timer); }, [load]);

    const visible = isCompanies
        ? companies.filter(c => filter === 'all' || (filter === 'inactive' ? !c.is_active : c.is_active))
        : rows;

    return <section className="space-y-3 p-2">
        <h2 className="text-lg font-bold">{isCompanies ? 'Companies' : 'User Directory'}</h2>
        <div className="flex flex-wrap gap-2"><input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} aria-label="Search directory" placeholder={isCompanies ? 'Search company or owner' : 'Search name, email or company'} className="min-w-48 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm" /><select value={filter} onChange={e => { setFilter(e.target.value); setOffset(0); }} aria-label="Filter results" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"><option value="all">All</option>{isCompanies ? <><option value="inactive">Inactive</option><option value="active">Active</option></> : <><option value="ACTIVE">Active</option><option value="TRIAL">Trial</option><option value="EXPIRED">Expired</option><option value="NONE">No license</option></>}</select></div>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm">{error} <button className="underline" onClick={() => void load()}>Retry</button></p>}
        {loading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {!loading && !error && visible.length === 0 && <p className="text-sm text-[var(--text-muted)]">No matching records.</p>}
        {isCompanies
            ? companies.map(c => <article key={c.company_id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap justify-between gap-2">
                    <div className="min-w-0">
                        <button type="button" onClick={() => onOpenCompany?.(c.company_id)} className="text-left text-sm font-bold hover:underline">{c.company_name}</button>
                        <p className="break-all text-xs text-[var(--text-muted)]">Owner: {c.owner_email || c.owner_id?.slice(0, 8) || 'Unknown'}{c.owner_name ? ` (${c.owner_name})` : ''}</p>
                    </div>
                    <span className="text-xs font-semibold">{c.license_status}{c.license_expiry ? ` · ${new Date(c.license_expiry).toLocaleDateString('en-IN')}` : ''}</span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">{c.member_count ? `${c.member_count} member: ${c.member_emails}` : 'No team members'}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{c.is_active ? 'Active' : 'Inactive'} · Last sync: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleDateString('en-IN') : 'Never'}</p>
                <button type="button" onClick={() => onOpenCompany?.(c.company_id)} className="mt-2 text-xs font-bold text-[var(--primary)] hover:underline">Open company</button>
            </article>)
            : rows.map(row => <article key={row.user_id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="text-sm font-bold">{row.full_name || 'Name not provided'}</p><p className="break-all text-xs text-[var(--text-muted)]">{row.email || 'Email not provided'}{row.phone ? ` · ${row.phone}` : ''}</p></div><span className="text-xs font-semibold">{row.account_status} · {row.status}</span></div><p className="mt-2 text-xs text-[var(--text-muted)]">Registered: {row.registered_at ? new Date(row.registered_at).toLocaleDateString('en-IN') : 'Unavailable'}{row.license_type ? ` · Plan: ${row.license_type}` : ''}</p><p className="mt-2 text-xs">{row.company_count ? `${row.company_count} company: ${row.company_names}` : 'No Company Linked'}</p></article>)}
        <div className="flex gap-3 text-sm"><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} className="disabled:opacity-40">Previous</button><button disabled={loading || (isCompanies ? companies.length : rows.length) < 50} onClick={() => setOffset(offset + 50)} className="disabled:opacity-40">Next</button></div>
    </section>;
}
