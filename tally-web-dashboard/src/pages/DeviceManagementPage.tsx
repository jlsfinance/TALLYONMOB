import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Laptop, RefreshCw, ShieldOff, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

type Device = { id: string; device_id: string; name?: string; platform?: string; status: string; last_seen_at?: string; revoked_at?: string };
type Run = { id: string; data_type?: string; status?: string; processed_records?: number; failed_records?: number; started_at?: string; completed_at?: string; last_error?: string };
type Audit = { id: string; action?: string; entity_type?: string; created_at?: string; user_email?: string; details?: unknown };

const relative = (value?: string) => value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : 'Never';
const isFresh = (value?: string) => Boolean(value && Date.now() - new Date(value).getTime() < 15 * 60 * 1000);

export default function DeviceManagementPage() {
  const { selectedCompany } = useAuth() as any;
  const [devices, setDevices] = useState<Device[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedCompany?.id) return;
    setLoading(true);
    try {
      const [deviceRes, runRes, auditRes] = await Promise.all([
        supabase.from('sync_devices').select('id,device_id,name,platform,status,last_seen_at,created_at,revoked_at').eq('company_id', selectedCompany.id).order('last_seen_at', { ascending: false }),
        supabase.from('sync_runs').select('*').eq('company_id', selectedCompany.id).order('started_at', { ascending: false }).limit(20),
        supabase.from('sync_history').select('*').eq('company_id', selectedCompany.id).order('created_at', { ascending: false }).limit(25),
      ]);
      if (deviceRes.error && !String(deviceRes.error.message).includes('sync_devices')) throw deviceRes.error;
      setDevices(deviceRes.data || []);
      setRuns(runRes.data || []);
      setAudit(auditRes.data || []);
    } catch (error: any) {
      toast.error(error.message || 'Unable to load sync operations');
    } finally { setLoading(false); }
  }, [selectedCompany?.id]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (device: Device) => {
    if (!selectedCompany?.id || device.status === 'revoked') return;
    setBusy(device.id);
    const { error } = await supabase.from('sync_devices').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', device.id).eq('company_id', selectedCompany.id);
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success(`${device.name || device.device_id} revoked`); load(); }
  };

  const activeDevices = devices.filter(d => d.status === 'active');
  const openFailures = runs.filter(r => r.status === 'failed' || Number(r.failed_records) > 0).length;
  const lastSeen = devices.map(d => d.last_seen_at).filter(Boolean).sort().pop();
  const health = useMemo(() => activeDevices.length === 0 ? 'offline' : openFailures > 0 ? 'degraded' : 'healthy', [activeDevices.length, openFailures]);

  if (!selectedCompany) return <div className="p-6 text-sm text-[var(--text-muted)]">Select a company to manage sync operations.</div>;
  return <div className="space-y-5 pb-24">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Operations</p><h1 className="text-xl font-bold text-[var(--on-surface)]">{selectedCompany.name} sync health</h1><p className="text-xs text-[var(--text-muted)] mt-1">Manage connected devices, failures and the company audit trail.</p></div>
      <button onClick={load} disabled={loading} className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-container)]"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Metric icon={<Activity size={15} />} label="Health" value={health} tone={health === 'healthy' ? 'text-emerald-600' : health === 'degraded' ? 'text-amber-600' : 'text-red-600'} />
      <Metric icon={<Laptop size={15} />} label="Active devices" value={`${activeDevices.length}/${devices.length}`} tone="text-blue-600" />
      <Metric icon={<Clock3 size={15} />} label="Last device seen" value={relative(lastSeen)} tone="text-purple-600" />
      <Metric icon={<AlertTriangle size={15} />} label="Failed runs" value={String(openFailures)} tone={openFailures ? 'text-red-600' : 'text-emerald-600'} />
    </div>
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between"><div><h2 className="font-bold text-sm">Connected devices</h2><p className="text-[10px] text-[var(--text-muted)]">Revoked devices can no longer upload sync batches.</p></div><span className="text-[10px] text-[var(--text-muted)]">{devices.length} registered</span></div>
      {devices.length === 0 ? <Empty text="No sync devices registered yet." /> : <div className="divide-y divide-[var(--border)]">{devices.map(device => <div key={device.id} className="p-4 flex items-center gap-3"><div className={`p-2 rounded-xl ${device.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-500'}`}><Laptop size={17} /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{device.name || device.device_id}</p><p className="text-[10px] text-[var(--text-muted)]">{device.platform || 'windows'} · {relative(device.last_seen_at)}</p></div><span className={`text-[10px] font-bold uppercase ${device.status === 'active' && isFresh(device.last_seen_at) ? 'text-emerald-600' : device.status === 'active' ? 'text-amber-600' : 'text-gray-500'}`}>{device.status === 'active' && isFresh(device.last_seen_at) ? 'online' : device.status}</span><button onClick={() => revoke(device)} disabled={busy === device.id || device.status === 'revoked'} className="p-2 rounded-lg text-red-600 hover:bg-red-500/10 disabled:opacity-30" title="Revoke device"><ShieldOff size={15} /></button></div>)}</div>}
    </section>
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden"><div className="p-4 border-b border-[var(--border)]"><h2 className="font-bold text-sm">Recent sync health</h2></div>{runs.length === 0 ? <Empty text="No sync runs recorded." /> : <div className="divide-y divide-[var(--border)]">{runs.slice(0, 10).map(run => <div key={run.id} className="p-4 flex items-center gap-3"><div>{run.status === 'success' || run.status === 'completed' ? <CheckCircle2 className="text-emerald-600" size={16} /> : run.status === 'failed' ? <XCircle className="text-red-600" size={16} /> : <Activity className="text-amber-600" size={16} />}</div><div className="flex-1"><p className="text-xs font-semibold">{run.data_type || 'Sync run'}</p><p className="text-[10px] text-[var(--text-muted)]">{relative(run.started_at)} · {run.processed_records || 0} processed · {run.failed_records || 0} failed</p></div><span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{run.status}</span></div>)}</div>}</section>
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden"><div className="p-4 border-b border-[var(--border)]"><h2 className="font-bold text-sm">Audit trail</h2></div>{audit.length === 0 ? <Empty text="No audit entries available." /> : <div className="divide-y divide-[var(--border)]">{audit.slice(0, 12).map(entry => <div key={entry.id} className="p-4 flex items-center gap-3"><div className="p-2 rounded-xl bg-purple-500/10 text-purple-600"><Activity size={14} /></div><div className="flex-1"><p className="text-xs font-semibold">{entry.action || entry.entity_type || 'Sync activity'}</p><p className="text-[10px] text-[var(--text-muted)]">{entry.user_email || 'System'} · {relative(entry.created_at)}</p></div></div>)}</div>}</section>
  </div>;
}
function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) { return <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3"><div className={`flex items-center gap-1.5 ${tone} mb-1`}>{icon}<span className="text-[9px] font-bold uppercase">{label}</span></div><p className="text-sm font-bold text-[var(--on-surface)] capitalize">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-xs text-[var(--text-muted)]">{text}</div>; }
