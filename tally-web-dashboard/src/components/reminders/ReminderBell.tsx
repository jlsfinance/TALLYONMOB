import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import './ReminderBell.css';

type Reminder = { id: string; party_ledger_id: string; party_name: string; message: string; due_at: string };

export function ReminderBell({ userId, companyId, variant = 'desktop' }: { userId?: string; companyId?: string; variant?: 'desktop' | 'mobile' }) {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const { data: reminders = [], isLoading, isError, refetch } = useQuery<Reminder[]>(
        ['reminder-bell', userId, companyId],
        async () => {
            const rows: Reminder[] = [];
            const pageSize = 200;
            for (let offset = 0; ; offset += pageSize) {
                const { data, error } = await supabase.from('party_reminders')
                    .select('id,party_ledger_id,party_name,message,due_at')
                    .eq('company_id', companyId).eq('user_id', userId)
                    .order('due_at', { ascending: false }).order('id', { ascending: false })
                    .range(offset, offset + pageSize - 1);
                if (error) throw error;
                rows.push(...(data || []));
                if ((data || []).length < pageSize) break;
            }
            return rows;
        },
        { enabled: !!userId && !!companyId, staleTime: 30000, refetchInterval: 60000 }
    );
    useEffect(() => {
        const refresh = () => { void refetch(); };
        window.addEventListener('party-reminder-changed', refresh);
        return () => window.removeEventListener('party-reminder-changed', refresh);
    }, [refetch]);
    useEffect(() => {
        if (!open) return;
        const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [open]);
    const due = reminders.filter(item => new Date(item.due_at).getTime() <= Date.now()).length;
    return <div className={`reminder-bell reminder-bell--${variant}`}>
        <button type="button" className="reminder-bell__button" aria-label="Reminders" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <Bell size={19} />{due > 0 && <span className="reminder-bell__badge">{due > 99 ? '99+' : due}</span>}
        </button>
        {open && <>
            <div className="reminder-bell__backdrop" onClick={() => setOpen(false)} />
            <section className="reminder-bell__panel" aria-label="Saved reminders">
                <div className="reminder-bell__heading"><div><strong>Reminders</strong><span>{reminders.length} saved</span></div><button type="button" aria-label="Close reminders" onClick={() => setOpen(false)}><X size={18}/></button></div>
                <div className="reminder-bell__list">
                    {isLoading ? <p className="reminder-bell__empty">Loading reminders…</p> : isError ? <p className="reminder-bell__empty">Could not load reminders. <button type="button" onClick={() => refetch()}>Retry</button></p> : reminders.length === 0 ? <p className="reminder-bell__empty">No reminders for this company yet.</p> : reminders.map(item => {
                        const date = new Date(item.due_at);
                        const isDue = date.getTime() <= Date.now();
                        return <button key={item.id} type="button" className="reminder-bell__item" onClick={() => { setOpen(false); if (item.party_ledger_id) navigate(`/ledgers/${encodeURIComponent(item.party_ledger_id)}`); }}>
                            <span className="reminder-bell__item-head"><strong>{item.party_name}</strong><span className={isDue ? 'reminder-bell__due' : 'reminder-bell__upcoming'}>{isDue ? 'Due' : 'Upcoming'}</span></span>
                            <span className="reminder-bell__message">{item.message}</span>
                            <time dateTime={item.due_at}>{Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                        </button>;
                    })}
                </div>
            </section>
        </>}
    </div>;
}
