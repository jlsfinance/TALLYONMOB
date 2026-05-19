import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INFORGE_URL;
const anonKey = import.meta.env.VITE_INFORGE_ANON_KEY || '';

const insforge = createClient({
    baseUrl,
    anonKey,
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
    },
    global: {
        fetch: async (url, options) => {
            try {
                const response = await fetch(url, options);
                return response;
            } catch (error) {
                console.error('Insforge Fetch Error Details:', {
                    url,
                    method: options?.method,
                    error: error.message,
                    name: error.name,
                    status: error.status
                });
                throw error;
            }
        }
    }
});

export const supabase = insforge;

// Auth helper functions
export const auth = {
    signUp: async (email, password, fullName) => {
        const { data, error } = await insforge.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName }
            }
        });
        return { data, error };
    },

    signIn: async (email, password) => {
        const { data, error } = await insforge.auth.signInWithPassword({
            email,
            password
        });
        return { data, error };
    },

    // Google OAuth Login
    signInWithGoogle: async () => {
        const redirectUrl = Capacitor.isNativePlatform()
            ? 'com.tallysync.app://auth/callback'
            : window.location.origin + '/auth/callback';

        const { data, error } = await insforge.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        return { data, error };
    },

    signOut: async () => {
        const { error } = await insforge.auth.signOut();
        return { error };
    },

    getSession: async () => {
        const { data: { session } } = await insforge.auth.getSession();
        return session;
    },

    getUser: async () => {
        const { data: { user } } = await insforge.auth.getUser();
        return user;
    },

    onAuthStateChange: (callback) => {
        return insforge.auth.onAuthStateChange(callback);
    }
};

// Company API
export const companyApi = {
    // List only companies owned by current user
    list: async () => {
        const { data: { user } } = await insforge.auth.getUser();

        if (!user) {
            return { data: [], error: 'Not authenticated' };
        }

        const { data, error } = await insforge.database
            .from('companies')
            .select('*')
            // RLS policy handles security (showing owned + unowned companies)
            .order('name');
        return { data: data || [], error };
    },


    getById: async (id) => {
        const { data, error } = await insforge.database
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    // Get app settings (for download URL, etc.)
    getAppSettings: async () => {
        const { data, error } = await insforge.database
            .from('app_settings')
            .select('key, value');

        if (error || !data) return { data: null, error };

        // Convert array to object for easy access
        const settings = {};
        data.forEach(s => {
            settings[s.key] = s.value;
        });
        return { data: settings, error: null };
    },

    getSummary: async (companyId) => {
        const [ledgers, vouchers, salesVouchers, purchaseVouchers, stockItems] = await Promise.all([
            insforge.database.from('ledgers').select('id', { count: 'exact' }).eq('company_id', companyId),
            insforge.database.from('vouchers').select('id', { count: 'exact' }).eq('company_id', companyId),
            insforge.database.from('vouchers').select('total_amount, grand_total').eq('company_id', companyId).eq('voucher_type', 'Sales').eq('is_deleted', false),
            insforge.database.from('vouchers').select('total_amount, grand_total').eq('company_id', companyId).eq('voucher_type', 'Purchase').eq('is_deleted', false),
            insforge.database.from('stock_items').select('id', { count: 'exact' }).eq('company_id', companyId)
        ]);

        return {
            ledgerCount: ledgers.count || 0,
            voucherCount: vouchers.count || 0,
            stockCount: stockItems.count || 0,
            totalSales: salesVouchers.data?.reduce((sum, s) => sum + Math.abs(Number(s.grand_total) || Number(s.total_amount) || 0), 0) || 0,
            totalPurchases: purchaseVouchers.data?.reduce((sum, p) => sum + Math.abs(Number(p.grand_total) || Number(p.total_amount) || 0), 0) || 0
        };
    },

    // DELETE ALL COMPANY DATA - Clears everything for fresh re-sync
    deleteCompanyData: async (companyId) => {
        try {
            // Delete in order (children first, then parents)
            const tables = [
                'voucher_stock_entries',
                'voucher_ledger_entries',
                'vouchers',
                'ledgers',
                'stock_items',
                'sync_history',
                'companies'
            ];

            for (const table of tables) {
                const { error } = await insforge.database
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



// Ledger API
export const ledgerApi = {
    list: async (companyId, parentGroup = null) => {
        let query = insforge.database
            .from('ledgers')
            .select('*')
            .eq('company_id', companyId)
            .order('name');

        if (parentGroup) {
            query = query.eq('parent', parentGroup);
        }

        const { data, error } = await query.limit(10000);
        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await insforge.database
            .from('ledgers')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getGroups: async (companyId) => {
        const { data, error } = await insforge.database
            .from('ledgers')
            .select('parent')
            .eq('company_id', companyId)
            .not('parent', 'is', null);

        const uniqueGroups = [...new Set(data?.map(l => l.parent) || [])];
        return { data: uniqueGroups, error };
    },

    getTransactions: async (ledgerId, fromDate, toDate) => {
        const { data, error } = await insforge.database
            .from('vouchers')
            .select('*')
            .or(`party_name.eq.${ledgerId}`)
            .gte('voucher_date', fromDate)
            .lte('voucher_date', toDate)
            .order('voucher_date', { ascending: false })
            .limit(5000);
        return { data, error };
    }
};

// Voucher API
export const voucherApi = {
    list: async (companyId, { fromDate, toDate, type, party } = {}) => {
        let query = insforge.database
            .from('vouchers')
            .select('*')
            .eq('company_id', companyId)
            .eq('is_deleted', false)
            .order('voucher_date', { ascending: false });

        if (fromDate) query = query.gte('voucher_date', fromDate);
        if (toDate) query = query.lte('voucher_date', toDate);
        if (type) query = query.eq('voucher_type', type);
        if (party) query = query.ilike('party_name', `%${party}%`);

        const { data, error } = await query.limit(10000);
        return { data, error };
    },

    getById: async (id) => {
        // First try by id, then by voucher_id
        let { data, error } = await insforge.database
            .from('vouchers')
            .select('*')
            .eq('id', id)
            .single();

        if (!data) {
            const fallback = await insforge.database
                .from('vouchers')
                .select('*')
                .eq('voucher_id', id)
                .single();
            data = fallback.data;
            error = fallback.error;
        }

        // Fetch related entries
        if (data) {
            const [ledgerEntries, stockEntries] = await Promise.all([
                insforge.database.from('voucher_ledger_entries').select('*').eq('voucher_id', data.id),
                insforge.database.from('voucher_stock_entries').select('*').eq('voucher_id', data.id)
            ]);
            data.ledger_entries = ledgerEntries.data || [];
            data.stock_entries = stockEntries.data || [];
        }
        return { data, error };
    },

    getTypes: async (companyId) => {
        const { data, error } = await insforge.database
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
        const { data, error } = await insforge.database
            .from('ledgers')
            .select('id, name, parent, current_balance')
            .eq('company_id', companyId)
            .order('name')
            .limit(10000);
        return { data, error };
    },

    getStockItems: async (companyId) => {
        const { data, error } = await insforge.database
            .from('stock_items')
            .select('*') // Get all fields
            .eq('company_id', companyId)
            .order('name')
            .limit(10000);
        return { data, error };
    }
};

// Sales API (using vouchers table with voucher_type filter)
export const salesApi = {
    list: async (companyId, { fromDate, toDate, party } = {}) => {
        let query = insforge.database
            .from('vouchers')
            .select('*')
            .eq('company_id', companyId)
            .eq('voucher_type', 'Sales')
            .eq('is_deleted', false)
            .order('voucher_date', { ascending: false });

        if (fromDate) query = query.gte('voucher_date', fromDate);
        if (toDate) query = query.lte('voucher_date', toDate);
        if (party) query = query.ilike('party_name', `%${party}%`);

        const { data, error } = await query.limit(10000);
        return { data, error };
    },

    getById: async (id) => {
        // Fetch voucher record
        const { data, error } = await insforge.database
            .from('vouchers')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            // Fetch voucher_ledger_entries
            const { data: ledgerEntries } = await insforge.database
                .from('voucher_ledger_entries')
                .select('*')
                .eq('voucher_id', id);
            data.ledger_entries = ledgerEntries || [];

            // Fetch voucher_stock_entries
            const { data: stockEntries } = await insforge.database
                .from('voucher_stock_entries')
                .select('*')
                .eq('voucher_id', id);
            data.stock_entries = stockEntries || [];
        }

        return { data, error };
    }
};

// Purchases API (using vouchers table with voucher_type filter)
export const purchasesApi = {
    list: async (companyId, { fromDate, toDate, party } = {}) => {
        let query = insforge.database
            .from('vouchers')
            .select('*')
            .eq('company_id', companyId)
            .eq('voucher_type', 'Purchase')
            .eq('is_deleted', false)
            .order('voucher_date', { ascending: false });

        if (fromDate) query = query.gte('voucher_date', fromDate);
        if (toDate) query = query.lte('voucher_date', toDate);
        if (party) query = query.ilike('party_name', `%${party}%`);

        const { data, error } = await query.limit(10000);
        return { data, error };
    },

    getById: async (id) => {
        // Fetch voucher record
        const { data, error } = await insforge.database
            .from('vouchers')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            // Fetch voucher_ledger_entries
            const { data: ledgerEntries } = await insforge.database
                .from('voucher_ledger_entries')
                .select('*')
                .eq('voucher_id', id);
            data.ledger_entries = ledgerEntries || [];

            // Fetch voucher_stock_entries
            const { data: stockEntries } = await insforge.database
                .from('voucher_stock_entries')
                .select('*')
                .eq('voucher_id', id);
            data.stock_entries = stockEntries || [];
        }

        return { data, error };
    }
};

// Stock API
export const stockApi = {
    list: async (companyId, stockGroup = null) => {
        let query = insforge.database
            .from('stock_items')
            .select('*')
            .eq('company_id', companyId)
            .order('name');

        if (stockGroup) {
            query = query.eq('stock_group', stockGroup);
        }

        const { data, error } = await query.limit(10000);

        return { data, error };
    },

    getById: async (id) => {
        const { data, error } = await insforge.database
            .from('stock_items')
            .select('*')
            .eq('id', id)
            .single();
        return { data, error };
    },

    getGroups: async (companyId) => {
        const { data, error } = await insforge.database
            .from('stock_items')
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
        const { data, error } = await insforge.database
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
        const { data, error } = await insforge.database
            .from('vouchers')
            .select('voucher_date, total_amount, grand_total, party_name')
            .eq('company_id', companyId)
            .eq('voucher_type', 'Sales')
            .eq('is_deleted', false)
            .gte('voucher_date', fromDate)
            .lte('voucher_date', toDate);
        return { data, error };
    },

    getPurchaseSummary: async (companyId, fromDate, toDate) => {
        const { data, error } = await insforge.database
            .from('vouchers')
            .select('voucher_date, total_amount, grand_total, party_name')
            .eq('company_id', companyId)
            .eq('voucher_type', 'Purchase')
            .eq('is_deleted', false)
            .gte('voucher_date', fromDate)
            .lte('voucher_date', toDate);
        return { data, error };
    },

    getStockSummary: async (companyId) => {
        const { data, error } = await insforge.database
            .from('stock_items')
            .select('name, unit, opening_stock, current_stock, rate')
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
        const { data, error } = await insforge.database
            .from('sync_history')
            .select('*')
            .eq('company_id', companyId)
            .order('started_at', { ascending: false })
            .limit(limit);
        return { data, error };
    },

    // Get single sync details
    getById: async (syncId) => {
        const { data, error } = await insforge.database
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
            const { data: sync, error: fetchError } = await insforge.database
                .from('sync_history')
                .select('voucher_ids')
                .eq('id', syncId)
                .single();

            if (fetchError) throw fetchError;

            // Delete vouchers from this sync batch
            if (sync?.voucher_ids && sync.voucher_ids.length > 0) {
                // Delete related voucher_ledger_entries first
                await insforge.database
                    .from('voucher_ledger_entries')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);

                // Delete related voucher_stock_entries
                await insforge.database
                    .from('voucher_stock_entries')
                    .delete()
                    .in('voucher_id', sync.voucher_ids);

                // Delete vouchers
                await insforge.database
                    .from('vouchers')
                    .delete()
                    .in('id', sync.voucher_ids);
            }

            // Delete the sync history record
            const { error: deleteError } = await insforge.database
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
        const { data, error } = await insforge.database
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

// ============================================
// TWO-WAY SYNC: Pending Transactions API
// Create transactions on Web/Mobile that will be pushed to Tally by Windows app
// ============================================
export const pendingTransactionApi = {
    // Create a new pending transaction
    create: async (companyId, transactionType, voucherData) => {
        const { data: { user } } = await insforge.auth.getUser();

        const { data, error } = await insforge.database
            .from('pending_transactions')
            .insert({
                company_id: companyId,
                transaction_type: transactionType,
                voucher_data: voucherData,
                status: 'pending',
                created_by: user?.id
            })
            .select()
            .single();

        return { data, error };
    },

    // Get all pending transactions for a company
    list: async (companyId, status = null) => {
        let query = insforge.database
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

    // Get pending count
    getPendingCount: async (companyId) => {
        const { count, error } = await insforge.database
            .from('pending_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'pending');

        return { count: count || 0, error };
    },

    // Create Sales invoice for Tally sync
    createSalesInvoice: async (companyId, invoiceData) => {
        return pendingTransactionApi.create(companyId, 'Sales', invoiceData);
    },

    // Create Purchase invoice for Tally sync
    createPurchaseInvoice: async (companyId, invoiceData) => {
        return pendingTransactionApi.create(companyId, 'Purchase', invoiceData);
    },

    // Create Receipt for Tally sync
    createReceipt: async (companyId, receiptData) => {
        return pendingTransactionApi.create(companyId, 'Receipt', receiptData);
    },

    // Create Payment for Tally sync
    createPayment: async (companyId, paymentData) => {
        return pendingTransactionApi.create(companyId, 'Payment', paymentData);
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

        const { data, error } = await insforge.database
            .from('pending_transactions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        return { data, error };
    },

    // Delete pending transaction
    delete: async (id) => {
        const { error } = await insforge.database
            .from('pending_transactions')
            .delete()
            .eq('id', id)
            .eq('status', 'pending');

        return { error };
    }
};

export default supabase;
