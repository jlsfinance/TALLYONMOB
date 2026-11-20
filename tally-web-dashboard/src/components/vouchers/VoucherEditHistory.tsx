import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function VoucherEditHistory({ companyId, voucherId, voucherGuid }: { companyId?: string; voucherId?: string; voucherGuid?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading || !companyId || !voucherId || document.hidden) return;
      const identities = [
        /^[a-f\d-]{36}$/i.test(voucherId) ? `id.eq.${voucherId},voucher_data->>original_voucher_id.eq.${voucherId}` : '',
        voucherGuid && /^[a-f\d-]+$/i.test(voucherGuid) ? `voucher_data->>tally_guid.eq.${voucherGuid}` : ''
      ].filter(Boolean).join(',');
      if (!identities) return;
      loading = true;
      try {
        const { data, error: queryError } = await supabase.from('pending_transactions')
          .select('id,status,created_at,updated_at,synced_at,error_message,voucher_data')
          .eq('company_id', companyId).eq('transaction_type', 'VOUCHER_EDIT')
          .or(identities).order('created_at', { ascending: false }).limit(20);
        if (alive) { setError(Boolean(queryError)); if (!queryError) setRows(data || []); }
      } catch { if (alive) setError(true); }
      finally { loading = false; }
    };
    setRows([]); setError(false);
    void load();
    const timer = window.setInterval(load, 10000);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [companyId, voucherId, voucherGuid]);

  if (!rows.length && !error) return null;
  return <section className="print:hidden my-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text-primary)]" aria-label="Syncora edit history">
    <h2 className="font-bold text-base">Syncora edit history</h2>
    {error && <p role="status" className="text-sm mt-2">Edit status could not refresh. Please retry when connected.</p>}
    <div className="space-y-3 mt-3">{rows.map(row => {
      const audit = row.voucher_data?.edit_audit;
      const synced = row.status === 'synced';
      const failed = row.status === 'failed';
      const needsReview = row.status === 'processing' && Date.now() - Date.parse(row.updated_at || row.created_at) > 15 * 60 * 1000;
      return <details key={row.id} open={row.status !== 'synced'} className="rounded-xl border border-[var(--border)] p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          <span className={synced ? 'text-emerald-600' : failed ? 'text-red-500' : 'text-amber-600'}>
            {synced ? 'Edited in Tally via Syncora' : failed ? 'Edit failed — not confirmed in Tally' : needsReview ? 'Check this edit in Tally before retrying' : row.status === 'processing' ? 'Edit syncing to Tally' : 'Edited on website — waiting for Tally sync'}
          </span>
          <span className="block mt-1 text-xs font-normal text-[var(--text-muted)]">{new Date(audit?.edited_at || row.created_at).toLocaleString()} {audit?.edited_by && `· ${audit.edited_by}`}</span>
        </summary>
        {synced && row.synced_at && <p className="mt-2 text-xs">Synced {new Date(row.synced_at).toLocaleString()}</p>}
        {row.error_message && <p className="mt-2 text-sm text-red-500">{row.error_message}</p>}
        {audit?.changes?.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Field</th><th className="p-2">Original</th><th className="p-2">Your edit</th></tr></thead><tbody>{audit.changes.map((change: any) => <tr key={change.field} className="border-t border-[var(--border)]"><th className="p-2 align-top font-medium">{change.label}</th><td className="p-2 align-top whitespace-pre-wrap break-words">{change.before}</td><td className="p-2 align-top whitespace-pre-wrap break-words">{change.after}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm">This older request has no stored before/after snapshot.</p>}
      </details>;
    })}</div>
  </section>;
}
