import { useState } from 'react';
import { supabase } from '@/lib/insforge';

type Plan = { id: string; name: string; slug: string; price_monthly: number | null; price_yearly: number | null; max_users: number | null; max_vouchers: number | null; gst_percent: number | null; features: unknown; is_active: boolean };
export default function AdminPlansEditor({ plans, reload }: { plans: Plan[]; reload: () => void }) {
 const [editing, setEditing] = useState<Plan | null>(null);
 const [features, setFeatures] = useState('');
 const [error, setError] = useState('');
 const [saving, setSaving] = useState(false);
 const [activeOnly, setActiveOnly] = useState(false);
 const open = (plan: Plan) => { setEditing({ ...plan }); setFeatures(Array.isArray(plan.features) ? plan.features.join('\n') : ''); setError(''); };
 const save = async () => {
  if (!editing) return;
  const values = [editing.price_monthly, editing.price_yearly, editing.gst_percent];
  if (values.some(x => x != null && (!Number.isFinite(Number(x)) || Number(x) < 0)) || Number(editing.gst_percent || 0) > 100) { setError('Enter valid prices and GST between 0 and 100.'); return; }
  if ([editing.max_users, editing.max_vouchers].some(x => x != null && (!Number.isInteger(Number(x)) || Number(x) < -1))) { setError('Limits must be whole numbers; -1 means unlimited.'); return; }
  if (editing.features != null && (!Array.isArray(editing.features) || editing.features.some(x => typeof x !== 'string'))) { setError('This plan uses an unsupported feature format; no changes saved.'); return; }
  setSaving(true);
  const { data, error: err } = await supabase.from('subscription_plans').update({ price_monthly: editing.price_monthly, price_yearly: editing.price_yearly, max_users: editing.max_users, max_vouchers: editing.max_vouchers, gst_percent: editing.gst_percent, is_active: editing.is_active, features: features.split('\n').map(s => s.trim()).filter(Boolean) }).eq('id', editing.id).select('id').maybeSingle();
  setSaving(false);
  if (err || !data) { setError(err?.message || 'Plan was not updated.'); return; }
  setEditing(null); reload();
 };
 return <section className="space-y-2 p-2"><label className="flex gap-2 text-sm"><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> Active plans only</label>
  {plans.filter(p => !activeOnly || p.is_active).map(p => <article key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="flex justify-between gap-2"><div><strong>{p.name}</strong><p className="text-xs text-[var(--text-muted)]">{p.is_active ? 'Active' : 'Inactive'} · ₹{p.price_monthly ?? '—'} / month · ₹{p.price_yearly ?? '—'} / year</p></div><button onClick={() => open(p)} className="rounded-lg border border-[var(--border)] px-3 text-sm">Edit Plan</button></div></article>)}
  {editing && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setEditing(null)}><div role="dialog" aria-modal="true" aria-label={`Edit ${editing.name}`} onClick={e => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-[var(--surface)] p-5"><h3 className="font-bold">Edit {editing.name}</h3>
   {(['price_monthly','price_yearly','max_users','max_vouchers','gst_percent'] as const).map(field => <label key={field} className="block text-sm">{field.replaceAll('_',' ')}<input type="number" step={field.startsWith('price') || field === 'gst_percent' ? '0.01' : '1'} value={editing[field] ?? ''} onChange={e => setEditing({ ...editing, [field]: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2" /></label>)}
   <label className="block text-sm">Features, one per line<textarea value={features} onChange={e => setFeatures(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2" rows={4} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>
   {error && <p role="alert" className="text-sm text-red-500">{error}</p>}<div className="flex gap-2"><button disabled={saving} onClick={() => void save()} className="rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">Save</button><button disabled={saving} onClick={() => setEditing(null)} className="rounded-lg border border-[var(--border)] px-4 py-2">Cancel</button></div>
  </div></div>}
 </section>;
}
