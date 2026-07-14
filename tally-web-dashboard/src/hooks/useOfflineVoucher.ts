import { useState, useEffect, useCallback } from 'react';
import { addToOfflineQueue, getPendingCount, isOnline, removeSyncedFromQueue, type OfflineVoucher } from '@/lib/offlineQueue';
import toast from 'react-hot-toast';

export function useOfflineVoucher() {
    const [pendingCount, setPendingCount] = useState(getPendingCount());
    const [online, setOnline] = useState(isOnline());

    useEffect(() => {
        const handleOnline = () => { setOnline(true); toast.success('Back online! Syncing pending vouchers...'); };
        const handleOffline = () => { setOnline(false); toast.error('You are offline. Vouchers will be saved locally.'); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        setPendingCount(getPendingCount());
    }, [online]);

    const saveVoucher = useCallback(async (voucherData: any, supabaseInsert: () => Promise<any>) => {
        if (isOnline()) {
            try {
                await supabaseInsert();
                toast.success('Voucher saved!');
            } catch (err: any) {
                // If save fails, queue offline
                addToOfflineQueue(voucherData);
                setPendingCount(getPendingCount());
                toast.error(`Save failed, queued offline. Error: ${err.message}`);
            }
        } else {
            addToOfflineQueue(voucherData);
            setPendingCount(getPendingCount());
            toast.success('Voucher queued for offline sync');
        }
    }, []);

    return { pendingCount, online, saveVoucher };
}
