import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

// In-app catch-up for reminders due while the user was away.
export function useDueReminders(userId?: string, companyId?: string) {
    useEffect(() => {
        if (!userId || !companyId) return;
        let active = true;
        let running = false;
        let failures = 0;
        let timer: number | undefined;
        const schedule = (delay: number) => {
            if (!active) return;
            if (timer !== undefined) window.clearTimeout(timer);
            timer = window.setTimeout(() => { timer = undefined; void check(); }, delay);
        };
        const check = async () => {
            if (running) return;
            if (!navigator.onLine) { schedule(30000); return; }
            running = true;
            try {
                // Paginate the entire due set; old seen entries must not hide newer reminders.
                const pageSize = 200;
                for (let offset = 0; active; offset += pageSize) {
                    const { data, error } = await supabase.from('party_reminders')
                        .select('id,party_name,message,due_at').eq('company_id', companyId).eq('user_id', userId)
                        .lte('due_at', new Date().toISOString()).order('due_at', { ascending: true })
                        .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
                    if (!active) return;
                    if (error) throw error;
                    for (const reminder of data || []) {
                        const key = `party-reminder-seen:${userId}:${reminder.id}`;
                        if (localStorage.getItem(key)) continue;
                        toast(`${reminder.party_name}: ${reminder.message}`, { duration: 12000, icon: '🔔' });
                        localStorage.setItem(key, '1');
                    }
                    if ((data || []).length < pageSize) break;
                }
                failures = 0;
            } catch (error) {
                if (!active) return;
                failures += 1;
                if (failures === 2) toast.error('Reminder connection unavailable. We will retry automatically.', { id: 'reminder-connection', duration: 5000 });
                console.warn('Reminder check failed; retry scheduled.', error);
            } finally {
                running = false;
                if (active) schedule(failures ? Math.min(30000 * 2 ** (failures - 1), 300000) : 30000);
            }
        };
        void check();
        const handleChange = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; void check(); };
        window.addEventListener('party-reminder-changed', handleChange);
        window.addEventListener('online', handleChange);
        return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener('party-reminder-changed', handleChange); window.removeEventListener('online', handleChange); };
    }, [userId, companyId]);
}
