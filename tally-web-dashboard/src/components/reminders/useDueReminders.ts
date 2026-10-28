import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

// In-app catch-up for reminders due while the user was away.
export function useDueReminders(userId?: string, companyId?: string) {
    useEffect(() => {
        if (!userId || !companyId) return;
        let active = true;
        let running = false;
        const check = async () => {
            if (running) return;
            running = true;
            try {
                // Paginate the entire due set; old seen entries must not hide newer reminders.
                const pageSize = 200;
                for (let offset = 0; active; offset += pageSize) {
                    const { data, error } = await supabase.from('party_reminders')
                        .select('id,party_name,message,due_at').eq('company_id', companyId).eq('user_id', userId)
                        .lte('due_at', new Date().toISOString()).order('due_at', { ascending: true })
                        .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
                    if (error || !active) return;
                    for (const reminder of data || []) {
                        const key = `party-reminder-seen:${userId}:${reminder.id}`;
                        if (localStorage.getItem(key)) continue;
                        toast(`${reminder.party_name}: ${reminder.message}`, { duration: 12000, icon: '🔔' });
                        localStorage.setItem(key, '1');
                    }
                    if ((data || []).length < pageSize) break;
                }
            } finally { running = false; }
        };
        void check();
        const timer = window.setInterval(check, 30000);
        const handleChange = () => { void check(); };
        window.addEventListener('party-reminder-changed', handleChange);
        return () => { active = false; window.clearInterval(timer); window.removeEventListener('party-reminder-changed', handleChange); };
    }, [userId, companyId]);
}
