const OFFLINE_QUEUE_KEY = 'tally_offline_queue';

export interface OfflineVoucher {
    id: string;
    company_id: string;
    voucher_type: string;
    voucher_number: string;
    voucher_date: string;
    party_name: string;
    total_amount: number;
    grand_total: number;
    narration?: string;
    items?: any[];
    created_at: string;
    synced: boolean;
}

export function getOfflineQueue(): OfflineVoucher[] {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function addToOfflineQueue(voucher: Omit<OfflineVoucher, 'id' | 'created_at' | 'synced'>): OfflineVoucher {
    const queue = getOfflineQueue();
    const entry: OfflineVoucher = {
        ...voucher,
        id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        synced: false,
    };
    queue.push(entry);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return entry;
}

export function markOfflineVoucherSynced(id: string) {
    const queue = getOfflineQueue();
    const updated = queue.map(v => v.id === id ? { ...v, synced: true } : v);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updated));
}

export function removeSyncedFromQueue() {
    const queue = getOfflineQueue().filter(v => !v.synced);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function getPendingCount(): number {
    return getOfflineQueue().filter(v => !v.synced).length;
}

export function isOnline(): boolean {
    return navigator.onLine;
}
