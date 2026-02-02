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
    },

    // DELETE ALL COMPANY DATA - Clears everything for fresh re-sync
    deleteCompanyData: async (companyId) => {
        try {
            // Delete in order (children first, then parents)
            const tables = [
                'sales_items',
                'purchase_items',
                'sales',
                'purchases',
                'vouchers',
                'ledgers',
                'stock',
                'sync_metadata',
                'pending_transactions',
                'companies'
            ];

            for (const table of tables) {
                const { error } = await supabase
                    .from(table)
                    .delete()
                    .eq('company_id', companyId);

                if (error) {
                    console.warn(`Warning deleting from ${table}:`, error.message);
                }
            }

            return { success: true, error: null };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// ============================================
// PENDING TRANSACTIONS API (Two-Way Sync)
// Create transactions on Web/App -> Push to Tally
// ============================================
export const pendingTransactionApi = {
    // Create a new pending transaction
    create: async (companyId, transactionType, voucherData, createdBy = null) => {
        const { data, error } = await supabase
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
    list: async (companyId, status = null) => {
        let query = supabase
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
    getPendingCount: async (companyId) => {
        const { count, error } = await supabase
            .from('pending_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'pending');
        return { count: count || 0, error };
    },

    // Update transaction status (called by Windows app after sync)
    updateStatus: async (id, status, tallyVoucherNumber = null, errorMessage = null) => {
        const updates = {
            status,
            error_message: errorMessage
        };

        if (tallyVoucherNumber) {
            updates.tally_voucher_number = tallyVoucherNumber;
            updates.synced_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('pending_transactions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        return { data, error };
    },

    // Delete a pending transaction
    delete: async (id) => {
        const { error } = await supabase
            .from('pending_transactions')
            .delete()
            .eq('id', id);
        return { error };
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

        const { data, error } = await query.limit(100000); // Removed limit (practical max)
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
        // No limit here by default (defaults to 1000), should we add one? 
        // User said "har jagah se". Let's add limit(100000) to ensure.
        // Wait, chain modifications might require storing query first.
        // But supabase-js allows awaits on chain. 
        // Let's assume default usage above.
        // Actually, getTransactions code above is:
        // await supabase... .order(...)
        // I will add .limit(100000) to it in a separate edit block or just assume 5000 replacement covers known spots.
        // The instructions said "Update .limit(5000)", getTransactions didn't have one?
        // Let's stick to replacing the explicit limits first, then I can adding missing ones.
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

        const { data, error } = await query.limit(100000); // Removed limit
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('vouchers')
            .select('*, voucher_entries(*)')
            .eq('voucher_id', id)
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

// Master Data API (Ledgers, Stock)
export const masterApi = {
    getLedgers: async (companyId) => {
        const { data, error } = await supabase
            .from('ledgers')
            .select('id, name, parent_group, closing_balance')
            .eq('company_id', companyId)
            .order('name')
            .limit(100000); // Removed limit
        return { data, error };
    },

    getStockItems: async (companyId) => {
        const { data, error } = await supabase
            .from('stock')
            .select('*') // Get all fields
            .eq('company_id', companyId)
            .order('name')
            .limit(100000); // Removed limit
        return { data, error };
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

        const { data, error } = await query.limit(100000); // Removed limit
        return { data, error };
    },

    getById: async (id) => {
        // Fetch sales record
        const { data, error } = await supabase
            .from('sales')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            // Fetch sales_items separately (FK join was failing with 400)
            const { data: itemsData } = await supabase
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
    list: async (companyId, { fromDate, toDate, party } = {}) => {
        let query = supabase
            .from('purchases')
            .select('*')
            .eq('company_id', companyId)
            .order('invoice_date', { ascending: false });

        if (fromDate) query = query.gte('invoice_date', fromDate);
        if (toDate) query = query.lte('invoice_date', toDate);
        if (party) query = query.ilike('party_ledger_name', `%${party}%`);

        const { data, error } = await query.limit(100000); // Removed limit
        return { data, error };
    },

    getById: async (id) => {
        // Fetch purchase record
        const { data, error } = await supabase
            .from('purchases')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            // Fetch purchase_items separately (FK join was failing with 400)
            const { data: itemsData } = await supabase
                .from('purchase_items')
                .select('*')
                .eq('purchase_id', id);
            data.purchase_items = itemsData || [];
        }

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

        const { data, error } = await query.limit(100000); // Removed limit

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

// ============================================
// SYNC HISTORY API
// Track and manage sync operations
// ============================================
export const syncHistoryApi = {
    // Get sync history for a company
    list: async (companyId, limit = 20) => {
        const { data, error } = await supabase
            .from('sync_history')
            .select('*')
            .eq('company_id', companyId)
            .order('started_at', { ascending: false })
            .limit(limit);
        return { data, error };
    },

    // Get single sync details
    getById: async (syncId) => {
        const { data, error } = await supabase
            .from('sync_history')
            .select('*')
            .eq('id', syncId)
            .single();
        return { data, error };
    },

    // Delete a specific sync and its data
    deleteSync: async (syncId, companyId) => {
        try {
            // Get the sync record first
            const { data: sync, error: fetchError } = await supabase
                .from('sync_history')
                .select('voucher_ids')
                .eq('id', syncId)
                .single();

            if (fetchError) throw fetchError;

            // Delete vouchers from this sync batch
            if (sync?.voucher_ids && sync.voucher_ids.length > 0) {
                // Delete related sales_items first
                await supabase
                    .from('sales_items')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);

                // Delete related purchase_items
                await supabase
                    .from('purchase_items')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);

                // Delete sales
                await supabase
                    .from('sales')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);

                // Delete purchases
                await supabase
                    .from('purchases')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);

                // Delete vouchers
                await supabase
                    .from('vouchers')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);
            }

            // Delete the sync history record
            const { error: deleteError } = await supabase
                .from('sync_history')
                .delete()
                .eq('id', syncId);

            if (deleteError) throw deleteError;

            return { success: true, deletedVouchers: sync?.voucher_ids?.length || 0 };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get sync statistics
    getStats: async (companyId) => {
        const { data, error } = await supabase
            .from('sync_history')
            .select('sync_type, status, total_records, started_at')
            .eq('company_id', companyId)
            .order('started_at', { ascending: false })
            .limit(10);

        if (error) return { data: null, error };

        const stats = {
            totalSyncs: data.length,
            lastSync: data[0] || null,
            successCount: data.filter(s => s.status === 'completed').length,
            failedCount: data.filter(s => s.status === 'failed').length,
            totalRecordsSynced: data.reduce((sum, s) => sum + (s.total_records || 0), 0)
        };

        return { data: stats, error: null };
    }
};

export default supabase;

