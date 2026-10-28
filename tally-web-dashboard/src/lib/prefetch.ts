import { queryClient } from './queryClient';
import { supabase } from './supabase';

/**
 * Prefetch dashboard data
 */
export function prefetchDashboard(companyId: string, fyDates?: { from: string; to: string }) {
    const key = ['dashboard', companyId];
    if (queryClient.getQueryData(key)) return;

    queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => {
            const now = new Date();
            const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            const from = fyDates?.from || `${fyStartYear}-04-01`;
            const to = fyDates?.to || `${fyStartYear + 1}-03-31`;

            const [salesRes, purchaseRes, ledgerRes, stockRes] = await Promise.all([
                supabase.from('vouchers').select('grand_total, total_amount, voucher_date')
                    .eq('company_id', companyId).eq('voucher_type', 'Sales')
                    .gte('voucher_date', from).lte('voucher_date', to).limit(50000),
                supabase.from('vouchers').select('grand_total, total_amount, voucher_date')
                    .eq('company_id', companyId).eq('voucher_type', 'Purchase')
                    .gte('voucher_date', from).lte('voucher_date', to).limit(50000),
                supabase.from('ledgers').select('current_balance, parent')
                    .eq('company_id', companyId),
                supabase.from('stock_items').select('current_stock, rate')
                    .eq('company_id', companyId),
            ]);

            const toNum = (v: any) => Number(v) || 0;
            const sales = (salesRes.data || []).reduce((s: number, v: any) => s + toNum(v.grand_total || v.total_amount), 0);
            const purchases = (purchaseRes.data || []).reduce((s: number, v: any) => s + toNum(v.grand_total || v.total_amount), 0);
            const debtors = (ledgerRes.data || []).filter((l: any) => String(l.parent || '').toLowerCase().includes('debtor'))
                .reduce((s: number, l: any) => s + Math.abs(toNum(l.current_balance)), 0);
            const creditors = (ledgerRes.data || []).filter((l: any) => String(l.parent || '').toLowerCase().includes('creditor'))
                .reduce((s: number, l: any) => s + Math.abs(toNum(l.current_balance)), 0);
            const stockValue = (stockRes.data || []).reduce((s: number, i: any) => s + Math.abs(toNum(i.current_stock) * toNum(i.rate)), 0);
            const lowStock = (stockRes.data || []).filter((i: any) => toNum(i.current_stock) <= 5);

            return {
                sales, purchases, debtors, creditors, stockValue,
                lowStockItems: lowStock.slice(0, 3).map((s: any) => s.name),
            };
        },
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Prefetch vouchers list — handles 'all' month by querying full FY
 */
export function prefetchVouchers(companyId: string, month: string, fyStart?: string) {
    if (!fyStart || month !== 'all') return;
    const year = Number(fyStart);
    if (!Number.isFinite(year)) return;
    const fy = `FY ${year}-${String(year + 1).slice(-2)}`;
    queryClient.prefetchQuery({
        queryKey: ['vouchers-all', companyId, fy],
        queryFn: async () => {
            const rows: any[] = [];
            for (let offset = 0; rows.length < 50000; offset += 1000) {
                const { data, error } = await supabase.from('vouchers')
                    .select('id, voucher_number, party_name, voucher_type, voucher_date, total_amount, grand_total, narration, created_at')
                    .eq('company_id', companyId).eq('is_deleted', false)
                    .gte('voucher_date', `${year}-04-01`).lte('voucher_date', `${year + 1}-03-31`)
                    .order('voucher_date', { ascending: false }).range(offset, offset + 999);
                if (error) throw error;
                const batch = data || [];
                rows.push(...batch);
                if (batch.length < 1000) break;
            }
            return rows.map(v => ({ ...v, total_amount: Number(v.total_amount ?? v.grand_total ?? 0), sync_status: 'synced' }));
        },
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Prefetch ledgers list — no is_deleted filter (column may not exist)
 */
export function prefetchLedgers(companyId: string) {
    const key = ['ledgers', companyId];
    if (queryClient.getQueryData(key)) return;

    queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => {
            const { data, error } = await supabase.from('ledgers')
                .select('*')
                .eq('company_id', companyId)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        staleTime: 3 * 60 * 1000,
    });
}

/**
 * Prefetch stock items — no is_deleted filter (column may not exist)
 */
export function prefetchStock(companyId: string) {
    const key = ['stockItems', companyId];
    if (queryClient.getQueryData(key)) return;

    queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => {
            const { data, error } = await supabase.from('stock_items')
                .select('*')
                .eq('company_id', companyId)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        staleTime: 3 * 60 * 1000,
    });
}

/**
 * Prefetch sales data
 */
export function prefetchSales(companyId: string, start: string, end: string) {
    if (!start || !end || start.includes('NaN') || end.includes('NaN')) return;
    queryClient.prefetchQuery({
        queryKey: ['sales', companyId, start, end],
        queryFn: async () => {
            const { data: syncedData, error } = await supabase.from('vouchers')
                .select('id, party_name, voucher_number, voucher_date, voucher_type, grand_total, total_amount')
                .eq('company_id', companyId).eq('voucher_type', 'Sales').or('is_deleted.eq.false,is_deleted.is.null')
                .gte('voucher_date', start).lte('voucher_date', end)
                .order('voucher_date', { ascending: false }).limit(1000);
            if (error) throw error;
            const { data: pendingData, error: pendingError } = await supabase.from('pending_transactions')
                .select('*').eq('company_id', companyId).eq('transaction_type', 'Sales').in('status', ['pending', 'failed']);
            if (pendingError) throw pendingError;
            const pending = (pendingData || []).map((p: any) => ({
                id: p.id, party_name: p.voucher_data?.customerName || 'Pending Customer',
                voucher_number: p.voucher_data?.invoiceNumber || 'NEW', voucher_date: p.voucher_data?.date || p.created_at,
                grand_total: p.voucher_data?.total, total_amount: p.voucher_data?.total,
                sync_status: p.status, status: p.status, voucher_type: 'Sales',
            }));
            return [...pending, ...(syncedData || [])];
        }, staleTime: 3 * 60 * 1000,
    });
}

/**
 * Invalidate and refetch — call after mutations
 */
export function invalidateDashboard(companyId: string) {
    queryClient.invalidateQueries({ queryKey: ['dashboard', companyId] });
    queryClient.invalidateQueries({ queryKey: ['vouchers-all', companyId] });
    queryClient.invalidateQueries({ queryKey: ['sales', companyId] });
    queryClient.invalidateQueries({ queryKey: ['sales-count', companyId] });
    queryClient.invalidateQueries({ queryKey: ['purchases', companyId] });
    queryClient.invalidateQueries({ queryKey: ['daybook', companyId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-fy-v4', companyId] });
    queryClient.invalidateQueries({ queryKey: ['party-recent', companyId] });
    queryClient.invalidateQueries({ queryKey: ['ledgers', companyId] });
    queryClient.invalidateQueries({ queryKey: ['stockItems', companyId] });
}
