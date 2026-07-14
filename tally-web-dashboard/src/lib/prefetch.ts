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
                    .gte('voucher_date', from).lte('voucher_date', to),
                supabase.from('vouchers').select('grand_total, total_amount, voucher_date')
                    .eq('company_id', companyId).eq('voucher_type', 'Purchase')
                    .gte('voucher_date', from).lte('voucher_date', to),
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
    const key = ['vouchers', companyId, month];
    if (queryClient.getQueryData(key)) return;

    queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => {
            let start: string;
            let end: string;

            if (month === 'all' || !month || month.includes('NaN')) {
                // Full FY query
                const startYear = fyStart ? parseInt(fyStart) : (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
                start = `${startYear}-04-01`;
                end = `${startYear + 1}-03-31`;
            } else {
                const [year, mon] = month.split('-').map(Number);
                if (isNaN(year) || isNaN(mon)) {
                    // Fallback to current FY
                    const startYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
                    start = `${startYear}-04-01`;
                    end = `${startYear + 1}-03-31`;
                } else {
                    start = `${year}-${String(mon).padStart(2, '0')}-01`;
                    const lastDay = new Date(year, mon, 0).getDate();
                    end = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`;
                }
            }

            const { data, error } = await supabase.from('vouchers')
                .select('id, voucher_number, party_name, voucher_type, voucher_date, total_amount, grand_total')
                .eq('company_id', companyId)
                .eq('is_deleted', false)
                .gte('voucher_date', start)
                .lte('voucher_date', end)
                .order('voucher_date', { ascending: false });

            if (error) throw error;
            return (data || []).map((v: any) => ({
                ...v,
                total_amount: Number(v.total_amount ?? v.grand_total ?? 0)
            }));
        },
        staleTime: 3 * 60 * 1000,
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
    const key = ['sales', companyId, start, end];
    if (queryClient.getQueryData(key)) return;

    queryClient.prefetchQuery({
        queryKey: key,
        queryFn: async () => {
            const { data, error } = await supabase.from('vouchers')
                .select('*')
                .eq('company_id', companyId)
                .eq('voucher_type', 'Sales')
                .gte('voucher_date', start)
                .lte('voucher_date', end)
                .order('voucher_date', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        staleTime: 3 * 60 * 1000,
    });
}

/**
 * Invalidate and refetch — call after mutations
 */
export function invalidateDashboard(companyId: string) {
    queryClient.invalidateQueries({ queryKey: ['dashboard', companyId] });
    queryClient.invalidateQueries({ queryKey: ['vouchers', companyId] });
    queryClient.invalidateQueries({ queryKey: ['ledgers', companyId] });
    queryClient.invalidateQueries({ queryKey: ['stockItems', companyId] });
}
