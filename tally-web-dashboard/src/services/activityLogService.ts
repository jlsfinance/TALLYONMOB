import { supabase } from '@/lib/insforge';

interface LogEntry {
    company_id: string;
    user_id?: string;
    user_email?: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    details?: Record<string, any>;
}

/**
 * Log a user activity. Lightweight, fire-and-forget.
 * Never throws - failures are silently logged.
 */
export async function logActivity(entry: LogEntry): Promise<void> {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('activity_logs').insert({
            company_id: entry.company_id,
            user_id: entry.user_id || user?.id || null,
            user_email: entry.user_email || user?.email || null,
            action: entry.action,
            entity_type: entry.entity_type,
            entity_id: entry.entity_id || null,
            entity_name: entry.entity_name || null,
            details: entry.details || {},
            ip_address: null,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        });
    } catch (err) {
        console.warn('[ActivityLog] Failed to log:', err);
    }
}

/**
 * Predefined activity actions
 */
export const ActivityActions = {
    VOUCHER_CREATED: 'voucher_created',
    VOUCHER_UPDATED: 'voucher_updated',
    VOUCHER_DELETED: 'voucher_deleted',
    VOUCHER_VIEWED: 'voucher_viewed',
    LEDGER_CREATED: 'ledger_created',
    LEDGER_UPDATED: 'ledger_updated',
    STOCK_UPDATED: 'stock_updated',
    SYNC_STARTED: 'sync_started',
    SYNC_COMPLETED: 'sync_completed',
    SYNC_FAILED: 'sync_failed',
    INVOICE_EXPORTED: 'invoice_exported',
    EMBEDDINGS_GENERATED: 'embeddings_generated',
    COMPANY_SWITCHED: 'company_switched',
    USER_LOGIN: 'user_login',
} as const;
