import { enableReminderPush } from './reminderPush';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

export function ReminderDialog({ ledger, companyId, userId, onClose }: { ledger: any; companyId: string; userId: string; onClose: () => void }) {
    const [when, setWhen] = useState('');
    const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
    useEffect(() => { const media = window.matchMedia('(min-width: 768px)'); const update = () => setDesktop(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        const due = new Date(when);
        if (!when || !Number.isFinite(due.getTime()) || due.getTime() <= Date.now()) { toast.error('Choose a future date and time'); return; }
        if (!message.trim() || !companyId || !userId) { toast.error('Enter a message and select a company'); return; }
        setSaving(true);
        try {
            const { error } = await supabase.from('party_reminders').insert({ company_id: companyId, user_id: userId, party_ledger_id: String(ledger.id), party_name: ledger.name, message: message.trim(), due_at: due.toISOString() });
            if (error) throw error;
            toast.success('Reminder saved');
            window.dispatchEvent(new Event('party-reminder-changed'));
            onClose();
        } catch (error) {
            console.error('Reminder save failed', error);
            toast.error('Reminder could not be saved. Please try again.');
        } finally { setSaving(false); }
    };
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="reminder-heading">
        <form onSubmit={save} className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--on-surface)] shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4"><div><h2 id="reminder-heading" className="text-base font-bold">Set reminder</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{ledger.name}</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={20}/></button></div>
            {desktop ? <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0 text-xs font-semibold">Date<input required type="date" value={when.split('T')[0] || ''} onChange={e => setWhen(e.target.value + 'T' + (when.split('T')[1] || ''))} className="mt-1 block w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-container)] p-3 text-sm" /></label>
                <label className="block min-w-0 text-xs font-semibold">Time<input required type="time" value={when.split('T')[1] || ''} onChange={e => setWhen((when.split('T')[0] || '') + 'T' + e.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-container)] p-3 text-sm" /></label>
            </div> : <label className="block text-xs font-semibold">Date and time<input required type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container)] p-3 text-sm" /></label>}
            <label className="block text-xs font-semibold">Message<textarea required maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder="What would you like to remember?" rows={3} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container)] p-3 text-sm" /></label>
            <button type="button" disabled={pushBusy} onClick={async () => {
                setPushBusy(true);
                try { await enableReminderPush(userId, companyId); toast.success('Notifications enabled on this device'); }
                catch (error: any) { toast.error(error?.message || 'Could not enable notifications'); }
                finally { setPushBusy(false); }
            }} className="w-full rounded-lg border border-[var(--border)] py-2 text-sm font-semibold disabled:opacity-50">{pushBusy ? 'Enabling…' : 'Enable notifications on this device'}</button>
            <div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-semibold">Cancel</button><button disabled={saving} type="submit" className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save reminder'}</button></div>
        </form>
    </div>;
}
