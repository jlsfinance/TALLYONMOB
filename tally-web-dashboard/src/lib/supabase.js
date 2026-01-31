import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helper functions
export const auth = {
    signUp: async (email, password, fullName) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName }
            }
        });
        return { data, error };
    },

    signIn: async (email, password) => {
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

    onAuthStateChange: (callback) => {
        return supabase.auth.onAuthStateChange(callback);
    }
};

// Company API
export const companyApi = {
    list: async () => {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('name');
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getSummary: async (companyId) => {
        const [ledgers, vouchers, sales, purchases, stock] = await Promise.all([
            supabase.from('ledgers').select('id', { count: 'exact' }).eq('company_id', companyId),
            supabase.from('vouchers').select('voucher_id', { count: 'exact' }).eq('company_id', companyId),
            supabase.from('sales').select('net_amount').eq('company_id', companyId),
            supabase.from('purchases').select('net_amount').eq('company_id', companyId),
            supabase.from('stock').select('id', { count: 'exact' }).eq('company_id', companyId)
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

// Ledger API
export const ledgerApi = {
    list: async (companyId, parentGroup = null) => {
        let query = supabase
            .from('ledgers')
            .select('*')
            .eq('company_id', companyId)
            .order('name');

        if (parentGroup) {
            query = query.eq('parent_group', parentGroup);
        }

        const { data, error } = await query;
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('ledgers')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getGroups: async (companyId) => {
        const { data, error } = await supabase
            .from('ledgers')
            .select('parent_group')
            .eq('company_id', companyId)
            .not('parent_group', 'is', null);

        const uniqueGroups = [...new Set(data?.map(l => l.parent_group) || [])];
        return { data: uniqueGroups, error };
    },

    getTransactions: async (ledgerId, fromDate, toDate) => {
        const { data, error } = await supabase
            .from('vouchers')
            .select('*')
            .or(`party_name.eq.${ledgerId}`)
            .gte('voucher_date', fromDate)
            .lte('voucher_date', toDate)
            .order('voucher_date', { ascending: false });
        return { data, error };
    }
};

// Voucher API
export const voucherApi = {
    list: async (companyId, { fromDate, toDate, type, party } = {}) => {
        let query = supabase
            .from('vouchers')
            .select('*')
            .eq('company_id', companyId)
            .order('voucher_date', { ascending: false });

        if (fromDate) query = query.gte('voucher_date', fromDate);
        if (toDate) query = query.lte('voucher_date', toDate);
        if (type) query = query.eq('voucher_type', type);
        if (party) query = query.ilike('party_name', `%${party}%`);

        const { data, error } = await query;
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('vouchers')
            .select('*, voucher_entries(*)')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getTypes: async (companyId) => {
        const { data, error } = await supabase
            .from('vouchers')
            .select('voucher_type')
            .eq('company_id', companyId);

        const uniqueTypes = [...new Set(data?.map(v => v.voucher_type) || [])];
        return { data: uniqueTypes, error };
    }
};

// Sales API
export const salesApi = {
    list: async (companyId, { fromDate, toDate, party } = {}) => {
        let query = supabase
            .from('sales')
            .select('*')
            .eq('company_id', companyId)
            .order('invoice_date', { ascending: false });

        if (fromDate) query = query.gte('invoice_date', fromDate);
        if (toDate) query = query.lte('invoice_date', toDate);
        if (party) query = query.ilike('party_ledger_name', `%${party}%`);

        const { data, error } = await query;
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('sales')
            .select('*, sales_items(*)')
            .eq('id', id)
            .single();
        return { data, error };
    }
};

// Purchases API
export const purchasesApi = {
    list: async (companyId, { fromDate, toDate, party } = {}) => {
        let query = supabase
            .from('purchases')
            .select('*')
            .eq('company_id', companyId)
            .order('invoice_date', { ascending: false });

        if (fromDate) query = query.gte('invoice_date', fromDate);
        if (toDate) query = query.lte('invoice_date', toDate);
        if (party) query = query.ilike('party_ledger_name', `%${party}%`);

        const { data, error } = await query;
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('purchases')
            .select('*, purchase_items(*)')
            .eq('id', id)
            .single();
        return { data, error };
    }
};

// Stock API
export const stockApi = {
    list: async (companyId, stockGroup = null) => {
        let query = supabase
            .from('stock')
            .select('*')
            .eq('company_id', companyId)
            .order('name');

        if (stockGroup) {
            query = query.eq('stock_group', stockGroup);
        }

        const { data, error } = await query;
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('stock')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getGroups: async (companyId) => {
        const { data, error } = await supabase
            .from('stock')
            .select('stock_group')
            .eq('company_id', companyId)
            .not('stock_group', 'is', null);

        const uniqueGroups = [...new Set(data?.map(s => s.stock_group) || [])];
        return { data: uniqueGroups, error };
    }
};

// Reports API
export const reportsApi = {
    getLedgerStatement: async (companyId, ledgerName, fromDate, toDate) => {
        const { data, error } = await supabase
            .from('vouchers')
            .select('*')
            .eq('company_id', companyId)
            .eq('party_name', ledgerName)
            .gte('voucher_date', fromDate)
            .lte('voucher_date', toDate)
            .order('voucher_date');
        return { data, error };
    },

    getSalesSummary: async (companyId, fromDate, toDate) => {
        const { data, error } = await supabase
            .from('sales')
            .select('invoice_date, net_amount, party_ledger_name')
            .eq('company_id', companyId)
            .gte('invoice_date', fromDate)
            .lte('invoice_date', toDate);
        return { data, error };
    },

    getPurchaseSummary: async (companyId, fromDate, toDate) => {
        const { data, error } = await supabase
            .from('purchases')
            .select('invoice_date, net_amount, party_ledger_name')
            .eq('company_id', companyId)
            .gte('invoice_date', fromDate)
            .lte('invoice_date', toDate);
        return { data, error };
    },

    getStockSummary: async (companyId) => {
        const { data, error } = await supabase
            .from('stock')
            .select('name, stock_group, closing_balance, closing_value, base_unit')
            .eq('company_id', companyId)
            .order('name');
        return { data, error };
    }
};

export default supabase;
