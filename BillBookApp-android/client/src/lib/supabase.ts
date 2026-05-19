import { createClient } from '@insforge/sdk';

const insforgeUrl = import.meta.env.VITE_INFORGE_URL;
const insforgeAnonKey = import.meta.env.VITE_INFORGE_ANON_KEY || '';

export const supabase = createClient({
  baseUrl: insforgeUrl,
  anonKey: insforgeAnonKey,
});

// Auth helper functions
export const auth = {
    signUp: async (email: string, password: string, fullName: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName }
            }
        });
        return { data, error };
    },

    signIn: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        return { data, error };
    },

    signOut: async () => {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    getSession: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    getUser: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange: (callback: any) => {
        return supabase.auth.onAuthStateChange(callback);
    }
};

// Company API
export const companyApi = {
    list: async () => {
        const { data, error } = await supabase.database
            .from('companies')
            .select('*')
            .order('name');
        return { data, error };
    },

    getById: async (id: string) => {
        const { data, error } = await supabase.database
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getSummary: async (companyId: string) => {
        const [ledgers, vouchers, sales, purchases, stock] = await Promise.all([
            supabase.database.from('ledgers').select('id', { count: 'exact' }).eq('company_id', companyId),
            supabase.database.from('vouchers').select('voucher_id', { count: 'exact' }).eq('company_id', companyId),
            supabase.database.from('sales').select('net_amount').eq('company_id', companyId),
            supabase.database.from('purchases').select('net_amount').eq('company_id', companyId),
            supabase.database.from('stock').select('id', { count: 'exact' }).eq('company_id', companyId)
        ]);

        return {
            ledgerCount: ledgers.count || 0,
            voucherCount: vouchers.count || 0,
            stockCount: stock.count || 0,
            totalSales: sales.data?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0,
            totalPurchases: purchases.data?.reduce((sum, p) => sum + (p.net_amount || 0), 0) || 0
        };
    }
};

// ============================================
// PENDING TRANSACTIONS API (Two-Way Sync)
// Create transactions on Web/App -> Push to Tally
// ============================================
export const pendingTransactionApi = {
    // Create a new pending transaction
    create: async (companyId: string, transactionType: string, voucherData: any, createdBy: string | null = null) => {
        const { data, error } = await supabase.database
            .from('pending_transactions')
            .insert({
                company_id: companyId,
                transaction_type: transactionType,
                voucher_data: voucherData,
                status: 'pending',
                created_by: createdBy
            })
            .select()
            .single();
        return { data, error };
    },

    // List pending transactions for a company
    list: async (companyId: string, status: string | null = null) => {
        let query = supabase.database
            .from('pending_transactions')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        return { data, error };
    },

    // Get pending count (for badge/notification)
    getPendingCount: async (companyId: string) => {
        const { count, error } = await supabase.database
            .from('pending_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'pending');
        return { count: count || 0, error };
    }
};

// Master Data API (Ledgers, Stock)
export const masterApi = {
    getLedgers: async (companyId: string) => {
        const { data, error } = await supabase.database
            .from('ledgers')
            .select('id, name, parent_group, closing_balance')
            .eq('company_id', companyId)
            .order('name')
            .limit(10000);
        return { data, error };
    },

    getStockItems: async (companyId: string) => {
        const { data, error } = await supabase.database
            .from('stock')
            .select('*')
            .eq('company_id', companyId)
            .order('name')
            .limit(10000);
        return { data, error };
    }
};

// Sales API
export const salesApi = {
    list: async (companyId: string, { fromDate, toDate, party }: any = {}) => {
        let query = supabase.database
            .from('sales')
            .select('*')
            .eq('company_id', companyId)
            .order('invoice_date', { ascending: false });

        if (fromDate) query = query.gte('invoice_date', fromDate);
        if (toDate) query = query.lte('invoice_date', toDate);
        if (party) query = query.ilike('party_ledger_name', `%${party}%`);

        const { data, error } = await query.limit(5000);
        return { data, error };
    },

    getById: async (id: string) => {
        // Fetch sales record
        const { data, error } = await supabase.database
            .from('sales')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            // Fetch sales_items separately
            const { data: itemsData } = await supabase.database
                .from('sales_items')
                .select('*')
                .eq('sale_id', id);
            data.sales_items = itemsData || [];
        }

        return { data, error };
    }
};

// Purchases API
export const purchasesApi = {
    list: async (companyId: string, { fromDate, toDate, party }: any = {}) => {
        let query = supabase.database
            .from('purchases')
            .select('*')
            .eq('company_id', companyId)
            .order('invoice_date', { ascending: false });

        if (fromDate) query = query.gte('invoice_date', fromDate);
        if (toDate) query = query.lte('invoice_date', toDate);
        if (party) query = query.ilike('party_ledger_name', `%${party}%`);

        const { data, error } = await query.limit(5000);
        return { data, error };
    },

    getById: async (id: string) => {
        // Fetch purchase record
        const { data, error } = await supabase.database
            .from('purchases')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            // Fetch purchase_items separately
            const { data: itemsData } = await supabase.database
                .from('purchase_items')
                .select('*')
                .eq('purchase_id', id);
            data.purchase_items = itemsData || [];
        }

        return { data, error };
    }
};

export default supabase;
