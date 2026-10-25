import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/insforge';

type RealtimeCallback = (payload: any) => void;

/**
 * Lightweight hook for Supabase Realtime subscriptions.
 * Auto-cleans on unmount. No memory leaks, no crashes.
 */
export function useRealtimeSubscription(
    table: string,
    companyId: string | undefined,
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*' = '*',
    callback: RealtimeCallback,
    enabled = true
) {
    const channelRef = useRef<any>(null);
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!enabled || !companyId || !table) return;

        const channel = supabase
            .channel(`realtime:${table}:${companyId}`)
            .on(
                'postgres_changes' as any,
                {
                    event,
                    schema: 'public',
                    table,
                    filter: `company_id=eq.${companyId}`,
                },
                (payload: any) => {
                    callbackRef.current(payload);
                }
            )
            .subscribe((status: string) => {
                if (status !== 'SUBSCRIBED') {
                    console.warn(`[Realtime] ${table} subscription status:`, status);
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [table, companyId, event, enabled]);
}

/**
 * Subscribe to multiple tables at once (lightweight).
 */
export function useMultiTableRealtime(
    tables: Array<{ table: string; event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*' }>,
    companyId: string | undefined,
    callback: (table: string, payload: any) => void,
    enabled = true
) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!enabled || !companyId || tables.length === 0) return;

        const channels = tables.map(({ table, event = '*' }) =>
            supabase
                .channel(`realtime:${table}:${companyId}`)
                .on(
                    'postgres_changes' as any,
                    {
                        event,
                        schema: 'public',
                        table,
                        filter: `company_id=eq.${companyId}`,
                    },
                    (payload: any) => {
                        callbackRef.current(table, payload);
                    }
                )
                .subscribe()
        );

        return () => {
            channels.forEach(ch => supabase.removeChannel(ch));
        };
    }, [companyId, enabled]);
}
