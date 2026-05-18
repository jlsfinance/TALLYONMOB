import { supabase } from '@/lib/supabase';
import type {
  Product,
  Customer,
  Invoice,
  InvoiceItem,
  Payment,
  Expense,
  CompanyProfile,
  CustomerNotification,
} from '../types';

// ============================================================
// TYPES
// ============================================================

export interface FetchResult<T> {
  data: T[];
  error: string | null;
  empty: boolean;
}

export interface FetchSingleResult<T> {
  data: T | null;
  error: string | null;
}

export interface ErrorResult {
  error: string | null;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface InvoiceFilters extends PaginationOptions {
  type?: 'SALE' | 'PURCHASE' | 'CREDIT_NOTE';
  customerId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

/**
 * Typed Supabase data error for consistent error handling.
 */
export class SupabaseDataError extends Error {
  public code: string | undefined;
  public details: string | undefined;
  public hint: string | undefined;

  constructor(message: string, original?: { code?: string; details?: string; hint?: string; message?: string }) {
    super(message);
    this.name = 'SupabaseDataError';
    this.code = original?.code;
    this.details = original?.details;
    this.hint = original?.hint;
    if (original?.message) {
      this.message = `${message}: ${original.message}`;
    }
  }
}

// ============================================================
// COLUMN MAPPING HELPERS
// ============================================================
// Maps between app camelCase types (from ../types) and DB snake_case columns (from Supabase schema)
// App Type property  -> DB column name
// DB column name     -> App Type property

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Maps a DB row (snake_case keys) to an app type (camelCase keys).
 */
function mapRowToType<T>(row: Record<string, any>): T {
  if (!row) return row as unknown as T;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result as T;
}

/**
 * Maps an app type object (camelCase keys) to DB row format (snake_case keys).
 */
function mapTypeToRow<T>(obj: T): Record<string, any> {
  if (!obj) return {};
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    // Skip non-DB fields like 'items' on Invoice (handled separately)
    if (key === 'items') continue;
    result[toSnakeCase(key)] = value;
  }
  return result;
}

/**
 * Maps an array of DB rows to an array of app types.
 */
function mapRowsToTypes<T>(rows: Record<string, any>[]): T[] {
  return rows.map((row) => mapRowToType<T>(row));
}

// ============================================================
// SYSTEM TABLE NAMES (snake_case as in DB)
// ============================================================

const TABLES = {
  PRODUCTS: 'products',
  CUSTOMERS: 'customers',
  INVOICES: 'invoices',
  INVOICE_ITEMS: 'invoice_items',
  PAYMENTS: 'payments',
  EXPENSES: 'expenses',
  COMPANY_PROFILES: 'company_profiles',
} as const;

const BATCH_CHUNK_SIZE = 500;

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Retrieve the current Supabase user ID from the session.
 * Throws SupabaseDataError if not authenticated.
 */
async function getUserId(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new SupabaseDataError('Failed to get auth session', sessionError);
  }
  const userId = sessionData?.session?.user?.id;
  if (!userId) {
    throw new SupabaseDataError('User not authenticated. Ensure you are logged in before calling data operations.');
  }
  return userId;
}

/**
 * Internal fetch collection returning raw DB rows.
 * Applies userId filter for RLS enforcement.
 */
async function fetchRows<T = Record<string, any>>(
  table: string,
  userId: string,
  options?: PaginationOptions & { filters?: Record<string, any> },
): Promise<{ data: T[]; error: string | null }> {
  try {
    let query = supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(options?.orderBy ?? 'created_at', { ascending: (options?.orderDirection ?? 'desc') === 'asc' });

    // Apply additional filters
    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 1000) - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data ?? []) as T[], error: null };
  } catch (err: any) {
    const message = err instanceof SupabaseDataError ? err.message : `Unexpected error fetching ${table}`;
    return { data: [], error: message };
  }
}

/**
 * Internal fetch single document by id (includes user_id check for RLS).
 */
async function fetchRowById<T = Record<string, any>>(
  table: string,
  id: string,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const userId = await getUserId();

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 = no rows returned (not an error for our purposes)
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err: any) {
    const message = err instanceof SupabaseDataError ? err.message : `Unexpected error fetching document ${id} from ${table}`;
    return { data: null, error: message };
  }
}

/**
 * Upsert a document. If id exists, update. Otherwise insert.
 */
async function saveRow<T = Record<string, any>>(
  table: string,
  id: string,
  data: Record<string, any>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const userId = await getUserId();

    // Ensure user_id is set for RLS
    const rowData = { ...data, id, user_id: userId };

    const { data: result, error } = await supabase
      .from(table)
      .upsert(rowData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: result as T, error: null };
  } catch (err: any) {
    const message = err instanceof SupabaseDataError ? err.message : `Unexpected error saving to ${table}`;
    return { data: null, error: message };
  }
}

/**
 * Delete a document by id (with user_id check for RLS).
 */
async function deleteRow(
  table: string,
  id: string,
): Promise<{ error: string | null }> {
  try {
    const userId = await getUserId();

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err: any) {
    const message = err instanceof SupabaseDataError ? err.message : `Unexpected error deleting from ${table}`;
    return { error: message };
  }
}

/**
 * Split an array into chunks. Used to work around Supabase batch limits.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============================================================
// SUPABASE DATA SERVICE
// ============================================================

export const supabaseData = {
  // ------------------------------------------------------------------
  // INIT / READY
  // ------------------------------------------------------------------

  /**
   * Attempt to connect to Supabase by checking session validity.
   * Returns true if a valid session is found, false otherwise.
   */
  init: async (): Promise<boolean> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      return !!sessionData?.session;
    } catch {
      return false;
    }
  },

  /**
   * Check if the service is ready (i.e., a user session exists).
   */
  isReady: (): boolean => {
    // We can't call async getSession here synchronously, so we return true
    // and let individual methods handle auth failures. For a real check,
    // call supabaseData.init().
    return true;
  },

  // ------------------------------------------------------------------
  // fetchCollection — returns { data, error, empty }
  // ------------------------------------------------------------------

  /**
   * Fetch multiple documents from a table with userId-based RLS filtering.
   *
   * Returns:
   *  - data: array of typed documents (empty array if none found)
   *  - error: string | null (null on success)
   *  - empty: true if data.length === 0 AND error === null
   */
  fetchCollection: async <T>(
    table: string,
    userId: string,
    options?: PaginationOptions & { filters?: Record<string, any> },
  ): Promise<FetchResult<T>> => {
    const { data: rawData, error } = await fetchRows<Record<string, any>>(table, userId, options);

    if (error) {
      return { data: [], error, empty: false };
    }

    const data = mapRowsToTypes<T>(rawData);
    return { data, error: null, empty: data.length === 0 };
  },

  // ------------------------------------------------------------------
  // fetchDocument — returns { data, error }
  // ------------------------------------------------------------------

  /**
   * Fetch a single document by its id.
   */
  fetchDocument: async <T>(
    table: string,
    id: string,
  ): Promise<FetchSingleResult<T>> => {
    const { data: rawData, error } = await fetchRowById<Record<string, any>>(table, id);

    if (error) {
      return { data: null, error };
    }

    const data = rawData ? mapRowToType<T>(rawData) : null;
    return { data, error: null };
  },

  // ------------------------------------------------------------------
  // saveDocument — returns { data, error }
  // ------------------------------------------------------------------

  /**
   * Save (upsert) a document. Maps camelCase app types to snake_case DB columns.
   */
  saveDocument: async <T>(
    table: string,
    id: string,
    data: Partial<T>,
  ): Promise<FetchSingleResult<T>> => {
    const rowData = mapTypeToRow(data);
    const { data: savedData, error } = await saveRow<Record<string, any>>(table, id, rowData);

    if (error) {
      return { data: null, error };
    }

    const typedData = savedData ? mapRowToType<T>(savedData) : null;
    return { data: typedData, error: null };
  },

  // ------------------------------------------------------------------
  // deleteDocument — returns { error }
  // ------------------------------------------------------------------

  /**
   * Delete a document by id.
   */
  deleteDocument: async (table: string, id: string): Promise<ErrorResult> => {
    return deleteRow(table, id);
  },

  // ------------------------------------------------------------------
  // batchSave — chunked at 500, returns { error }
  // ------------------------------------------------------------------

  /**
   * Batch save (upsert) multiple documents. Automatically chunks at 500 items
   * to comply with Supabase limits. All items share the same userId.
   */
  batchSave: async <T>(
    table: string,
    items: (T & { id: string })[],
  ): Promise<ErrorResult> => {
    if (items.length === 0) {
      return { error: null };
    }

    try {
      const userId = await getUserId();
      const chunks = chunkArray(items, BATCH_CHUNK_SIZE);

      for (const chunk of chunks) {
        const rowsToInsert = chunk.map((item) => ({
          ...mapTypeToRow(item),
          id: item.id,
          user_id: userId,
        }));

        const { error } = await supabase.from(table).upsert(rowsToInsert, { onConflict: 'id' });

        if (error) {
          return { error: `Batch save failed at chunk: ${error.message}` };
        }
      }

      return { error: null };
    } catch (err: any) {
      const message = err instanceof SupabaseDataError ? err.message : `Unexpected error in batchSave for ${table}`;
      return { error: message };
    }
  },

  // ------------------------------------------------------------------
  // INVOICE-SPECIFIC OPERATIONS
  // ------------------------------------------------------------------

  /**
   * Get the next invoice number for a company profile.
   * Reads the invoice_settings.nextInvoiceNumber from company_profiles.
   */
  getNextInvoiceNumber: async (companyProfileId: string): Promise<number> => {
    try {
      const userId = await getUserId();

      const { data, error } = await supabase
        .from(TABLES.COMPANY_PROFILES)
        .select('invoice_settings')
        .eq('id', companyProfileId)
        .eq('user_id', userId)
        .single();

      if (error) {
        throw new SupabaseDataError('Failed to fetch invoice settings', error);
      }

      const settings = data?.invoice_settings as { nextInvoiceNumber?: number } | null;
      return settings?.nextInvoiceNumber ?? 1;
    } catch (err: any) {
      if (err instanceof SupabaseDataError) throw err;
      throw new SupabaseDataError('Unexpected error reading next invoice number');
    }
  },

  /**
   * Atomically update customer balance using a Supabase RPC call.
   * This prevents race conditions when multiple payments/invoices
   * update the same customer's balance simultaneously.
   *
   * The RPC function should be created in your Supabase project as:
   *
   * CREATE OR REPLACE FUNCTION update_customer_balance(
   *   p_customer_id UUID,
   *   p_delta NUMERIC(10,2)
   * ) RETURNS void AS $$
   * BEGIN
   *   UPDATE customers
   *   SET balance = COALESCE(balance, 0) + p_delta
   *   WHERE id = p_customer_id;
   * END;
   * $$ LANGUAGE plpgsql;
   */
  updateCustomerBalanceAtomic: async (
    customerId: string,
    delta: number,
  ): Promise<ErrorResult> => {
    try {
      const userId = await getUserId();

      // Verify the customer belongs to this user (RLS enforcement)
      const { data: customer, error: customerError } = await supabase
        .from(TABLES.CUSTOMERS)
        .select('id')
        .eq('id', customerId)
        .eq('user_id', userId)
        .single();

      if (customerError || !customer) {
        return { error: customerError?.message ?? 'Customer not found or access denied' };
      }

      const { error } = await supabase.rpc('update_customer_balance', {
        p_customer_id: customerId,
        p_delta: delta,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err: any) {
      const message = err instanceof SupabaseDataError
        ? err.message
        : `Unexpected error updating balance for customer ${customerId}`;
      return { error: message };
    }
  },

  /**
   * Fetch invoices joined with their items.
   * Supports filtering by type (SALE/PURCHASE/CREDIT_NOTE), status, dates, and search.
   */
  getInvoicesWithItems: async (
    filters?: InvoiceFilters,
  ): Promise<FetchResult<Invoice>> => {
    try {
      const userId = await getUserId();

      let query = supabase
        .from(TABLES.INVOICES)
        .select(`
          *,
          ${TABLES.INVOICE_ITEMS} (*)
        `)
        .eq('user_id', userId)
        .order(filters?.orderBy ?? 'created_at', {
          ascending: (filters?.orderDirection ?? 'desc') === 'asc',
        });

      // Apply filters
      if (filters?.type) {
        query = query.eq('type', filters.type);
      }
      if (filters?.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.fromDate) {
        query = query.gte('date', filters.fromDate);
      }
      if (filters?.toDate) {
        query = query.lte('date', filters.toDate);
      }
      if (filters?.search) {
        query = query.or(
          `invoice_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`,
        );
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit ?? 1000) - 1,
        );
      }

      const { data: rawData, error } = await query;

      if (error) {
        return { data: [], error: error.message, empty: false };
      }

      if (!rawData || rawData.length === 0) {
        return { data: [], error: null, empty: true };
      }

      // Map results: each row has invoice fields + nested invoice_items
      const invoices = rawData.map((row: Record<string, any>) => {
        const invoice = mapRowToType<Invoice>(row);
        const itemsRaw = row[TABLES.INVOICE_ITEMS] ?? [];
        invoice.items = itemsRaw.map((itemRow: Record<string, any>) =>
          mapRowToType<InvoiceItem>(itemRow),
        );
        return invoice;
      });

      return { data: invoices, error: null, empty: invoices.length === 0 };
    } catch (err: any) {
      const message = err instanceof SupabaseDataError
        ? err.message
        : 'Unexpected error fetching invoices with items';
      return { data: [], error: message, empty: false };
    }
  },

  /**
   * Save an invoice together with its line items in a transactional manner.
   * Steps:
   *  1. Upsert the invoice record
   *  2. Delete existing invoice_items for this invoice (in case of update)
   *  3. Insert the new invoice_items
   *
   * NOTE: Supabase REST API does not support true multi-table transactions.
   * For production, create a Supabase RPC function to handle this atomically.
   * This implementation uses sequential calls with error rollback awareness.
   */
  saveInvoiceWithItems: async (
    invoice: Invoice,
    items: InvoiceItem[],
  ): Promise<FetchSingleResult<Invoice>> => {
    try {
      const userId = await getUserId();
      const invoiceId = invoice.id;

      // --- Step 1: Upsert the invoice ---
      const invoiceRow = mapTypeToRow(invoice);
      invoiceRow.user_id = userId;

      const { data: savedInvoice, error: invoiceError } = await supabase
        .from(TABLES.INVOICES)
        .upsert({ ...invoiceRow, id: invoiceId }, { onConflict: 'id' })
        .select()
        .single();

      if (invoiceError) {
        return { data: null, error: `Invoice save failed: ${invoiceError.message}` };
      }

      // --- Step 2: Delete existing items for this invoice (clean slate) ---
      const { error: deleteItemsError } = await supabase
        .from(TABLES.INVOICE_ITEMS)
        .delete()
        .eq('invoice_id', invoiceId);

      if (deleteItemsError) {
        // Attempt rollback of invoice
        await supabase.from(TABLES.INVOICES).delete().eq('id', invoiceId).eq('user_id', userId);
        return { data: null, error: `Failed to clear old invoice items: ${deleteItemsError.message}` };
      }

      // --- Step 3: Insert new invoice items ---
      if (items.length > 0) {
        const itemRows = items.map((item) => ({
          ...mapTypeToRow(item),
          invoice_id: invoiceId,
        }));

        // Chunk if too many items
        const itemChunks = chunkArray(itemRows, BATCH_CHUNK_SIZE);
        for (const chunk of itemChunks) {
          const { error: insertItemsError } = await supabase
            .from(TABLES.INVOICE_ITEMS)
            .insert(chunk);

          if (insertItemsError) {
            // Attempt rollback of invoice
            await supabase.from(TABLES.INVOICES).delete().eq('id', invoiceId).eq('user_id', userId);
            return { data: null, error: `Failed to save invoice items: ${insertItemsError.message}` };
          }
        }
      }

      // --- Return the saved invoice with items ---
      const mappedInvoice = mapRowToType<Invoice>(savedInvoice);
      mappedInvoice.items = items;

      return { data: mappedInvoice, error: null };
    } catch (err: any) {
      const message = err instanceof SupabaseDataError
        ? err.message
        : 'Unexpected error saving invoice with items';
      return { data: null, error: message };
    }
  },

  // ------------------------------------------------------------------
  // CONVENIENCE ENTITY METHODS
  // ------------------------------------------------------------------

  /**
   * Fetch all products for a user.
   */
  fetchProducts: async (
    userId: string,
    options?: PaginationOptions & { filters?: Record<string, any> },
  ): Promise<FetchResult<Product>> => {
    return supabaseData.fetchCollection<Product>(TABLES.PRODUCTS, userId, {
      orderBy: 'created_at',
      orderDirection: 'desc',
      ...options,
    });
  },

  /**
   * Fetch a single product by id.
   */
  fetchProduct: async (id: string): Promise<FetchSingleResult<Product>> => {
    return supabaseData.fetchDocument<Product>(TABLES.PRODUCTS, id);
  },

  /**
   * Save (upsert) a product.
   */
  saveProduct: async (
    id: string,
    data: Partial<Product>,
  ): Promise<FetchSingleResult<Product>> => {
    return supabaseData.saveDocument<Product>(TABLES.PRODUCTS, id, data);
  },

  /**
   * Delete a product by id.
   */
  deleteProduct: async (id: string): Promise<ErrorResult> => {
    return supabaseData.deleteDocument(TABLES.PRODUCTS, id);
  },

  /**
   * Batch save products.
   */
  batchSaveProducts: async (
    items: (Product & { id: string })[],
  ): Promise<ErrorResult> => {
    return supabaseData.batchSave<Product>(TABLES.PRODUCTS, items);
  },

  /**
   * Fetch all customers for a user.
   */
  fetchCustomers: async (
    userId: string,
    options?: PaginationOptions & { filters?: Record<string, any> },
  ): Promise<FetchResult<Customer>> => {
    return supabaseData.fetchCollection<Customer>(TABLES.CUSTOMERS, userId, {
      orderBy: 'created_at',
      orderDirection: 'desc',
      ...options,
    });
  },

  /**
   * Fetch a single customer by id.
   */
  fetchCustomer: async (id: string): Promise<FetchSingleResult<Customer>> => {
    return supabaseData.fetchDocument<Customer>(TABLES.CUSTOMERS, id);
  },

  /**
   * Save (upsert) a customer.
   */
  saveCustomer: async (
    id: string,
    data: Partial<Customer>,
  ): Promise<FetchSingleResult<Customer>> => {
    return supabaseData.saveDocument<Customer>(TABLES.CUSTOMERS, id, data);
  },

  /**
   * Delete a customer by id.
   */
  deleteCustomer: async (id: string): Promise<ErrorResult> => {
    return supabaseData.deleteDocument(TABLES.CUSTOMERS, id);
  },

  /**
   * Batch save customers.
   */
  batchSaveCustomers: async (
    items: (Customer & { id: string })[],
  ): Promise<ErrorResult> => {
    return supabaseData.batchSave<Customer>(TABLES.CUSTOMERS, items);
  },

  /**
   * Fetch invoices (optionally filtered by type e.g. 'SALE', 'PURCHASE', 'CREDIT_NOTE').
   */
  fetchInvoices: async (
    userId: string,
    options?: InvoiceFilters,
  ): Promise<FetchResult<Invoice>> => {
    // If specific filters are provided, use the JOIN query
    if (options) {
      return supabaseData.getInvoicesWithItems(options);
    }
    return supabaseData.fetchCollection<Invoice>(TABLES.INVOICES, userId, {
      orderBy: 'created_at',
      orderDirection: 'desc',
    });
  },

  /**
   * Fetch a single invoice by id (includes items).
   */
  fetchInvoice: async (id: string): Promise<FetchSingleResult<Invoice>> => {
    try {
      const userId = await getUserId();

      const { data: invoiceRow, error: invoiceError } = await supabase
        .from(TABLES.INVOICES)
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (invoiceError) {
        if (invoiceError.code === 'PGRST116') {
          return { data: null, error: null };
        }
        return { data: null, error: invoiceError.message };
      }

      // Fetch items for this invoice
      const { data: itemsRows, error: itemsError } = await supabase
        .from(TABLES.INVOICE_ITEMS)
        .select('*')
        .eq('invoice_id', id);

      if (itemsError) {
        return { data: null, error: itemsError.message };
      }

      const invoice = mapRowToType<Invoice>(invoiceRow);
      invoice.items = itemsRows
        ? itemsRows.map((item: Record<string, any>) => mapRowToType<InvoiceItem>(item))
        : [];

      return { data: invoice, error: null };
    } catch (err: any) {
      const message = err instanceof SupabaseDataError
        ? err.message
        : `Unexpected error fetching invoice ${id}`;
      return { data: null, error: message };
    }
  },

  /**
   * Save an invoice (alias for saveInvoiceWithItems, keeps items separate).
   * For full control, use saveInvoiceWithItems directly.
   */
  saveInvoice: async (
    invoice: Invoice,
    items: InvoiceItem[],
  ): Promise<FetchSingleResult<Invoice>> => {
    return supabaseData.saveInvoiceWithItems(invoice, items);
  },

  /**
   * Delete an invoice and its items.
   */
  deleteInvoice: async (id: string): Promise<ErrorResult> => {
    try {
      const userId = await getUserId();

      // Delete invoice_items first (enforce FK constraint via app logic)
      const { error: deleteItemsError } = await supabase
        .from(TABLES.INVOICE_ITEMS)
        .delete()
        .eq('invoice_id', id);

      if (deleteItemsError) {
        return { error: `Failed to delete invoice items: ${deleteItemsError.message}` };
      }

      // Delete the invoice
      const { error } = await supabase
        .from(TABLES.INVOICES)
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err: any) {
      const message = err instanceof SupabaseDataError
        ? err.message
        : `Unexpected error deleting invoice ${id}`;
      return { error: message };
    }
  },

  /**
   * Fetch payments for a user (or optionally filtered by customerId).
   */
  fetchPayments: async (
    userId: string,
    options?: PaginationOptions & { filters?: Record<string, any> },
  ): Promise<FetchResult<Payment>> => {
    return supabaseData.fetchCollection<Payment>(TABLES.PAYMENTS, userId, {
      orderBy: 'created_at',
      orderDirection: 'desc',
      ...options,
    });
  },

  /**
   * Fetch a single payment by id.
   */
  fetchPayment: async (id: string): Promise<FetchSingleResult<Payment>> => {
    return supabaseData.fetchDocument<Payment>(TABLES.PAYMENTS, id);
  },

  /**
   * Save (upsert) a payment.
   */
  savePayment: async (
    id: string,
    data: Partial<Payment>,
  ): Promise<FetchSingleResult<Payment>> => {
    return supabaseData.saveDocument<Payment>(TABLES.PAYMENTS, id, data);
  },

  /**
   * Delete a payment by id.
   */
  deletePayment: async (id: string): Promise<ErrorResult> => {
    return supabaseData.deleteDocument(TABLES.PAYMENTS, id);
  },

  /**
   * Batch save payments.
   */
  batchSavePayments: async (
    items: (Payment & { id: string })[],
  ): Promise<ErrorResult> => {
    return supabaseData.batchSave<Payment>(TABLES.PAYMENTS, items);
  },

  /**
   * Fetch expenses for a user.
   */
  fetchExpenses: async (
    userId: string,
    options?: PaginationOptions & { filters?: Record<string, any> },
  ): Promise<FetchResult<Expense>> => {
    return supabaseData.fetchCollection<Expense>(TABLES.EXPENSES, userId, {
      orderBy: 'created_at',
      orderDirection: 'desc',
      ...options,
    });
  },

  /**
   * Fetch a single expense by id.
   */
  fetchExpense: async (id: string): Promise<FetchSingleResult<Expense>> => {
    return supabaseData.fetchDocument<Expense>(TABLES.EXPENSES, id);
  },

  /**
   * Save (upsert) an expense.
   */
  saveExpense: async (
    id: string,
    data: Partial<Expense>,
  ): Promise<FetchSingleResult<Expense>> => {
    return supabaseData.saveDocument<Expense>(TABLES.EXPENSES, id, data);
  },

  /**
   * Delete an expense by id.
   */
  deleteExpense: async (id: string): Promise<ErrorResult> => {
    return supabaseData.deleteDocument(TABLES.EXPENSES, id);
  },

  /**
   * Batch save expenses.
   */
  batchSaveExpenses: async (
    items: (Expense & { id: string })[],
  ): Promise<ErrorResult> => {
    return supabaseData.batchSave<Expense>(TABLES.EXPENSES, items);
  },

  /**
   * Fetch company profiles for a user.
   */
  fetchCompanyProfiles: async (
    userId: string,
  ): Promise<FetchResult<CompanyProfile>> => {
    return supabaseData.fetchCollection<CompanyProfile>(
      TABLES.COMPANY_PROFILES,
      userId,
      { orderBy: 'created_at', orderDirection: 'desc' },
    );
  },

  /**
   * Fetch a single company profile by id.
   */
  fetchCompanyProfile: async (id: string): Promise<FetchSingleResult<CompanyProfile>> => {
    return supabaseData.fetchDocument<CompanyProfile>(TABLES.COMPANY_PROFILES, id);
  },

  /**
   * Save (upsert) a company profile.
   */
  saveCompanyProfile: async (
    id: string,
    data: Partial<CompanyProfile>,
  ): Promise<FetchSingleResult<CompanyProfile>> => {
    return supabaseData.saveDocument<CompanyProfile>(TABLES.COMPANY_PROFILES, id, data);
  },

  /**
   * Delete a company profile by id.
   */
  deleteCompanyProfile: async (id: string): Promise<ErrorResult> => {
    return supabaseData.deleteDocument(TABLES.COMPANY_PROFILES, id);
  },

  // ------------------------------------------------------------------
  // PURCHASES (type='PURCHASE')
  // ------------------------------------------------------------------

  /**
   * Fetch purchases (invoices with type = 'PURCHASE').
   */
  fetchPurchases: async (
    userId: string,
    options?: Omit<InvoiceFilters, 'type'>,
  ): Promise<FetchResult<Invoice>> => {
    return supabaseData.getInvoicesWithItems({
      ...options,
      type: 'PURCHASE',
    });
  },

  /**
   * Save a purchase (alias for saveInvoiceWithItems with type='PURCHASE').
   */
  savePurchase: async (
    purchase: Invoice,
    items: InvoiceItem[],
  ): Promise<FetchSingleResult<Invoice>> => {
    const purchaseWithType = { ...purchase, type: 'PURCHASE' as const };
    return supabaseData.saveInvoiceWithItems(purchaseWithType, items);
  },

  /**
   * Delete a purchase by id.
   */
  deletePurchase: async (id: string): Promise<ErrorResult> => {
    return supabaseData.deleteInvoice(id);
  },

  // ------------------------------------------------------------------
  // UTILITY / ADMIN
  // ------------------------------------------------------------------

  /**
   * Purge all data for a user (for account deletion scenarios).
   * Deletes data from all bill book tables for the given userId.
   */
  purgeUserData: async (userId: string): Promise<ErrorResult> => {
    try {
      // Delete in order respecting foreign key constraints
      // invoice_items first (child of invoices)
      const { error: itemsErr } = await supabase
        .from(TABLES.INVOICE_ITEMS)
        .delete()
        .in(
          'invoice_id',
          (
            await supabase
              .from(TABLES.INVOICES)
              .select('id')
              .eq('user_id', userId)
          ).data?.map((r: any) => r.id) ?? [],
        );
      if (itemsErr) return { error: itemsErr.message };

      // Then delete invoices
      const { error: invErr } = await supabase
        .from(TABLES.INVOICES)
        .delete()
        .eq('user_id', userId);
      if (invErr) return { error: invErr.message };

      // Payments
      const { error: payErr } = await supabase
        .from(TABLES.PAYMENTS)
        .delete()
        .eq('user_id', userId);
      if (payErr) return { error: payErr.message };

      // Customers
      const { error: custErr } = await supabase
        .from(TABLES.CUSTOMERS)
        .delete()
        .eq('user_id', userId);
      if (custErr) return { error: custErr.message };

      // Products
      const { error: prodErr } = await supabase
        .from(TABLES.PRODUCTS)
        .delete()
        .eq('user_id', userId);
      if (prodErr) return { error: prodErr.message };

      // Expenses
      const { error: expErr } = await supabase
        .from(TABLES.EXPENSES)
        .delete()
        .eq('user_id', userId);
      if (expErr) return { error: expErr.message };

      // Company profiles
      const { error: compErr } = await supabase
        .from(TABLES.COMPANY_PROFILES)
        .delete()
        .eq('user_id', userId);
      if (compErr) return { error: compErr.message };

      return { error: null };
    } catch (err: any) {
      return { error: err?.message ?? 'Unexpected error purging user data' };
    }
  },
};

export default supabaseData;
