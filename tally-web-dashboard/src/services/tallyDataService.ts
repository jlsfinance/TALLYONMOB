import { supabase } from '@/lib/insforge';

export interface TallyLedger {
    id: string;
    name: string;
    parent: string;
    ledger_type: string;
    opening_balance: number;
    current_balance: number;
    phone?: string;
    email?: string;
    gstin?: string;
}

export interface TallyVoucherItem {
    name: string;
    description?: string;
    billed_qty?: string;
    actual_qty?: string;
    rate: number;
    amount: number;
    hsn?: string;
    gst_rate?: number;
}

export interface TallyLedgerEntry {
    ledger_name: string;
    amount: number;
    is_deemed_positive?: boolean;
    is_party_ledger?: boolean;
}

export interface TallyVoucher {
    id: string;
    voucher_number: string;
    voucher_type: string;
    voucher_date: string;
    party_name: string;
    narration?: string;
    total_amount: number;
    grand_total: number;
    ledger_entries: TallyLedgerEntry[];
    items: TallyVoucherItem[];
    gst: {
        cgst: number;
        sgst: number;
        igst: number;
        cess: number;
        taxableValue: number;
        totalTax: number;
        rates: number[];
    };
}

export interface TallyDataPayload {
    ok: boolean;
    source: string;
    status?: string;
    generatedAt?: string;
    fromDate: string;
    toDate: string;
    error?: string;
    hint?: string;
    dashboard: {
        totalSales: number;
        totalPurchase: number;
        cashBankBalance: number;
        receivables: number;
        payables: number;
        recentTransactions: TallyVoucher[];
    };
    ledgers: TallyLedger[];
    vouchers: TallyVoucher[];
    invoices: TallyVoucher[];
    reports: {
        trialBalance: {
            rows: Array<{ ledger_name: string; group: string; debit: number; credit: number }>;
            totalDebit: number;
            totalCredit: number;
            difference: number;
        };
        profitLoss: {
            sales: number;
            purchases: number;
            directIncome: number;
            directExpense: number;
            indirectIncome: number;
            indirectExpense: number;
            grossProfit: number;
            netProfit: number;
        };
        balanceSheet: {
            assets: Array<{ ledger_name: string; group: string; amount: number }>;
            liabilities: Array<{ ledger_name: string; group: string; amount: number }>;
            totalAssets: number;
            totalLiabilities: number;
        };
    };
}

type TallyCacheEnvelope = {
    version: number;
    savedAt: number;
    key: string;
    companyId?: string;
    companyName?: string;
    fromDate: string;
    toDate: string;
    data: TallyDataPayload;
};

const CACHE_KEY = 'tally-live-viewer-cache:v1';
const CACHE_VERSION = 2;
const CACHE_DB_NAME = 'tally-sync-cache';
const CACHE_STORE_NAME = 'payloads';
let cacheDbPromise: Promise<IDBDatabase | null> | null = null;
let memoryCachePayload: TallyDataPayload | null = null;

export async function fetchTallyData(params: {
    fromDate: string;
    toDate: string;
    companyId?: string;
    companyName?: string;
    signal?: AbortSignal;
}): Promise<{ data: TallyDataPayload | null; error: string | null; fromCache: boolean }> {
    const endpoint = getTallyEndpoint();
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set('fromDate', params.fromDate);
    url.searchParams.set('toDate', params.toDate);
    if (params.companyName) url.searchParams.set('companyName', params.companyName);

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: params.signal,
        });
        const payload = await readJsonResponse(response);

        if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error || `Tally sync failed (${response.status})`);
        }

        const normalized = normalizePayload(payload, params.fromDate, params.toDate);
        void saveCache(normalized, params.companyId, params.companyName);
        return { data: normalized, error: null, fromCache: false };
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            return { data: null, error: null, fromCache: false };
        }

        if (params.companyId) {
            const cloudData = await fetchCloudSyncedTallyData(params.companyId, params.fromDate, params.toDate);
            if (cloudData && (cloudData.ledgers.length > 0 || cloudData.vouchers.length > 0)) {
                void saveCache(cloudData, params.companyId, params.companyName);
                return {
                    data: cloudData,
                    error: error?.message || 'Tally is offline. Showing synced cloud data.',
                    fromCache: true,
                };
            }
        }

        const cached = readCache();
        if (cached) {
            return {
                data: { ...cached, status: 'offline', error: error?.message || 'Tally is offline' },
                error: error?.message || 'Tally is offline',
                fromCache: true,
            };
        }

        return { data: null, error: error?.message || 'Tally is offline', fromCache: false };
    }
}

async function fetchCloudSyncedTallyData(companyId: string, fromDate: string, toDate: string): Promise<TallyDataPayload | null> {
    try {
        const [ledgerRows, voucherRows] = await Promise.all([
            fetchAllRows((fromIndex, toIndex) => supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', companyId)
                .order('name', { ascending: true })
                .range(fromIndex, toIndex), 1000),
            fetchAllRows((fromIndex, toIndex) => supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', companyId)
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .order('voucher_date', { ascending: false })
                .range(fromIndex, toIndex), 1000, 5000),
        ]);

        const voucherIds = voucherRows.map((voucher: any) => voucher.id).filter(Boolean);
        const [ledgerEntryRows, stockEntryRows] = voucherIds.length > 0
            ? await Promise.all([
                fetchRowsByVoucherIds('voucher_ledger_entries', companyId, voucherIds, 'voucher_id, ledger_name, amount, is_debit'),
                fetchRowsByVoucherIds('voucher_stock_entries', companyId, voucherIds, 'voucher_id, stock_item_name, quantity, unit, rate, amount, tax_rate, hsn_code'),
            ])
            : [[], []];

        const ledgerEntriesByVoucher = groupBy(ledgerEntryRows, 'voucher_id');
        const stockEntriesByVoucher = groupBy(stockEntryRows, 'voucher_id');
        const ledgers = ledgerRows.map(mapCloudLedger);
        const vouchers = voucherRows.map((voucher: any) => mapCloudVoucher(
            voucher,
            ledgerEntriesByVoucher.get(voucher.id) || [],
            stockEntriesByVoucher.get(voucher.id) || []
        ));

        const dashboard = buildDashboard(ledgers, vouchers);
        const reports = buildReports(ledgers, vouchers);

        return {
            ok: true,
            source: 'insforge-cloud',
            status: 'cloud-cache',
            generatedAt: new Date().toISOString(),
            fromDate,
            toDate,
            error: 'Tally is offline. Showing synced cloud data.',
            dashboard,
            ledgers,
            vouchers,
            invoices: vouchers.filter((voucher) => ['Sales', 'Purchase'].includes(voucher.voucher_type)),
            reports,
        };
    } catch (error) {
        console.warn('Cloud Tally fallback failed', error);
        return null;
    }
}

async function fetchAllRows(buildQuery: (fromIndex: number, toIndex: number) => any, pageSize = 1000, maxRows = 10000) {
    const rows: any[] = [];
    for (let fromIndex = 0; fromIndex < maxRows; fromIndex += pageSize) {
        const { data, error } = await buildQuery(fromIndex, Math.min(fromIndex + pageSize - 1, maxRows - 1));
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
    }
    return rows;
}

async function fetchRowsByVoucherIds(table: string, companyId: string, voucherIds: string[], select: string) {
    const rows: any[] = [];
    const chunkSize = 200;
    for (let index = 0; index < voucherIds.length; index += chunkSize) {
        const chunk = voucherIds.slice(index, index + chunkSize);
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .eq('company_id', companyId)
            .in('voucher_id', chunk);
        if (error) throw error;
        rows.push(...(data || []));
    }
    return rows;
}

function groupBy(rows: any[], key: string) {
    return rows.reduce((map, row) => {
        const value = row?.[key];
        if (!value) return map;
        const bucket = map.get(value) || [];
        bucket.push(row);
        map.set(value, bucket);
        return map;
    }, new Map<string, any[]>());
}

function mapCloudLedger(row: any): TallyLedger {
    const currentBalance = Number(row?.current_balance ?? row?.closing_balance ?? 0);
    const parent = String(row?.parent || '').trim();
    return {
        id: String(row?.id || row?.name || crypto.randomUUID()),
        name: String(row?.name || 'Unnamed Ledger'),
        parent,
        ledger_type: row?.ledger_type || inferLedgerType(parent, currentBalance),
        opening_balance: Number(row?.opening_balance || 0),
        current_balance: currentBalance,
        phone: row?.phone || undefined,
        email: row?.email || undefined,
        gstin: row?.gstin || undefined,
    };
}

function mapCloudVoucher(voucher: any, ledgerEntries: any[], stockEntries: any[]): TallyVoucher {
    const items = stockEntries.map((item) => ({
        name: String(item?.stock_item_name || 'Item'),
        billed_qty: item?.quantity != null ? `${item.quantity} ${item?.unit || ''}`.trim() : undefined,
        actual_qty: item?.quantity != null ? `${item.quantity} ${item?.unit || ''}`.trim() : undefined,
        rate: Number(item?.rate || 0),
        amount: Number(item?.amount || 0),
        hsn: item?.hsn_code || undefined,
        gst_rate: Number(item?.tax_rate || 0),
    }));
    const mappedLedgerEntries = ledgerEntries.map((entry) => ({
        ledger_name: String(entry?.ledger_name || entry?.name || ''),
        amount: Number(entry?.amount || 0),
        is_deemed_positive: entry?.is_debit === true,
        is_party_ledger: normalizeName(entry?.ledger_name || entry?.name) === normalizeName(voucher?.party_name),
    }));
    const amount = Math.abs(Number(voucher?.grand_total ?? voucher?.total_amount ?? 0));

    return {
        id: String(voucher?.id || crypto.randomUUID()),
        voucher_number: String(voucher?.voucher_number || voucher?.id || ''),
        voucher_type: String(voucher?.voucher_type || 'Voucher'),
        voucher_date: String(voucher?.voucher_date || '').slice(0, 10),
        party_name: String(voucher?.party_name || 'Unknown Party'),
        narration: voucher?.narration || undefined,
        total_amount: amount,
        grand_total: amount,
        ledger_entries: mappedLedgerEntries,
        items,
        gst: buildCloudGstBreakdown(mappedLedgerEntries, items),
    };
}

function buildCloudGstBreakdown(ledgerEntries: TallyLedgerEntry[], items: TallyVoucherItem[]) {
    const byLedgerName = (term: string) => ledgerEntries
        .filter((entry) => normalizeName(entry.ledger_name).includes(term))
        .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);
    const cgst = byLedgerName('cgst');
    const sgst = byLedgerName('sgst');
    const igst = byLedgerName('igst');
    const cess = byLedgerName('cess');
    const taxableValue = items.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
    const rates = Array.from(new Set(items.map((item) => Number(item.gst_rate || 0)).filter(Boolean)));
    return { cgst, sgst, igst, cess, taxableValue, totalTax: cgst + sgst + igst + cess, rates };
}

function buildDashboard(ledgers: TallyLedger[], vouchers: TallyVoucher[]) {
    const totalSales = sumVouchers(vouchers, 'Sales');
    const totalPurchase = sumVouchers(vouchers, 'Purchase');
    const cashBankBalance = ledgers
        .filter((ledger) => ledger.ledger_type === 'Cash/Bank')
        .reduce((sum, ledger) => sum + Number(ledger.current_balance || 0), 0);
    const receivables = ledgers
        .filter((ledger) => ledger.ledger_type === 'Receivable')
        .reduce((sum, ledger) => sum + Math.abs(Number(ledger.current_balance || 0)), 0);
    const payables = ledgers
        .filter((ledger) => ledger.ledger_type === 'Payable')
        .reduce((sum, ledger) => sum + Math.abs(Number(ledger.current_balance || 0)), 0);

    return {
        totalSales,
        totalPurchase,
        cashBankBalance,
        receivables,
        payables,
        recentTransactions: vouchers.slice(0, 10),
    };
}

function buildReports(ledgers: TallyLedger[], vouchers: TallyVoucher[]) {
    const trialRows = ledgers.map((ledger) => {
        const amount = Number(ledger.current_balance || 0);
        return {
            ledger_name: ledger.name,
            group: ledger.parent,
            debit: amount >= 0 ? Math.abs(amount) : 0,
            credit: amount < 0 ? Math.abs(amount) : 0,
        };
    });
    const totalDebit = trialRows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = trialRows.reduce((sum, row) => sum + row.credit, 0);
    const sales = sumVouchers(vouchers, 'Sales');
    const purchases = sumVouchers(vouchers, 'Purchase');
    const directIncome = sumLedgerGroup(ledgers, ['Direct Income']);
    const directExpense = sumLedgerGroup(ledgers, ['Direct Expenses']);
    const indirectIncome = sumLedgerGroup(ledgers, ['Indirect Income']);
    const indirectExpense = sumLedgerGroup(ledgers, ['Indirect Expenses']);
    const assets = ledgers
        .filter((ledger) => ['Cash/Bank', 'Receivable'].includes(ledger.ledger_type) || /asset/i.test(ledger.parent))
        .map((ledger) => ({ ledger_name: ledger.name, group: ledger.parent, amount: Math.abs(Number(ledger.current_balance || 0)) }));
    const liabilities = ledgers
        .filter((ledger) => ledger.ledger_type === 'Payable' || /capital|loan|liabil/i.test(ledger.parent))
        .map((ledger) => ({ ledger_name: ledger.name, group: ledger.parent, amount: Math.abs(Number(ledger.current_balance || 0)) }));

    return {
        trialBalance: {
            rows: trialRows,
            totalDebit,
            totalCredit,
            difference: totalDebit - totalCredit,
        },
        profitLoss: {
            sales,
            purchases,
            directIncome,
            directExpense,
            indirectIncome,
            indirectExpense,
            grossProfit: sales + directIncome - purchases - directExpense,
            netProfit: sales + directIncome + indirectIncome - purchases - directExpense - indirectExpense,
        },
        balanceSheet: {
            assets,
            liabilities,
            totalAssets: assets.reduce((sum, row) => sum + row.amount, 0),
            totalLiabilities: liabilities.reduce((sum, row) => sum + row.amount, 0),
        },
    };
}

function sumVouchers(vouchers: TallyVoucher[], voucherType: string) {
    return vouchers
        .filter((voucher) => voucher.voucher_type === voucherType)
        .reduce((sum, voucher) => sum + Math.abs(Number(voucher.grand_total || voucher.total_amount || 0)), 0);
}

function sumLedgerGroup(ledgers: TallyLedger[], groups: string[]) {
    return ledgers
        .filter((ledger) => groups.some((group) => normalizeName(ledger.parent).includes(normalizeName(group))))
        .reduce((sum, ledger) => sum + Math.abs(Number(ledger.current_balance || 0)), 0);
}

function inferLedgerType(parent: string, balance: number) {
    const normalizedParent = normalizeName(parent);
    if (normalizedParent.includes('sundry debtor')) return 'Receivable';
    if (normalizedParent.includes('sundry creditor')) return 'Payable';
    if (normalizedParent.includes('cash') || normalizedParent.includes('bank')) return 'Cash/Bank';
    if (normalizedParent.includes('sales')) return 'Sales';
    if (normalizedParent.includes('purchase')) return 'Purchase';
    return balance >= 0 ? 'Receivable' : 'Payable';
}

export function getCachedTallyData(): TallyDataPayload | null {
    if (memoryCachePayload) {
        return memoryCachePayload;
    }
    return readCache();
}

export async function loadCachedTallyData(): Promise<TallyDataPayload | null> {
    return readCachedPayloadAsync();
}

export function buildLedgerStatement(ledger: TallyLedger, vouchers: TallyVoucher[], fromDate?: string, toDate?: string) {
    const rows = vouchers
        .filter((voucher) => {
            const matchesParty = normalizeName(voucher.party_name) === normalizeName(ledger.name)
                || voucher.ledger_entries?.some((entry) => normalizeName(entry.ledger_name) === normalizeName(ledger.name));
            if (!matchesParty) return false;
            if (fromDate && voucher.voucher_date < fromDate) return false;
            if (toDate && voucher.voucher_date > toDate) return false;
            return true;
        })
        .sort((a, b) => String(a.voucher_date).localeCompare(String(b.voucher_date)));

    let running = Number(ledger.opening_balance || 0);
    return rows.map((voucher) => {
        const directEntry = voucher.ledger_entries?.find((entry) => normalizeName(entry.ledger_name) === normalizeName(ledger.name));
        const signedAmount = directEntry ? Number(directEntry.amount || 0) : inferVoucherEffect(voucher);
        running += signedAmount;
        return {
            ...voucher,
            debit: signedAmount >= 0 ? Math.abs(signedAmount) : 0,
            credit: signedAmount < 0 ? Math.abs(signedAmount) : 0,
            running_balance: running,
        };
    });
}

async function readJsonResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (contentType.includes('application/json')) {
        return text ? JSON.parse(text) : {};
    }

    try {
        return JSON.parse(text);
    } catch (_) {
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
        throw new Error(
            snippet.startsWith('import ') || snippet.includes('<script type="module"')
                ? 'Local Tally API is not running. Restart the dev server and try refresh.'
                : `Tally sync returned a non-JSON response${snippet ? `: ${snippet}` : ''}`
        );
    }
}

function inferVoucherEffect(voucher: TallyVoucher) {
    const amount = Math.abs(Number(voucher.grand_total || voucher.total_amount || 0));
    if (['Sales', 'Payment'].includes(voucher.voucher_type)) return amount;
    if (['Purchase', 'Receipt'].includes(voucher.voucher_type)) return -amount;
    return amount;
}

function normalizePayload(payload: any, fromDate: string, toDate: string): TallyDataPayload {
    return {
        ok: true,
        source: payload?.source || 'tally-xml',
        status: payload?.status || 'online',
        generatedAt: payload?.generatedAt || new Date().toISOString(),
        fromDate: payload?.fromDate || fromDate,
        toDate: payload?.toDate || toDate,
        dashboard: payload?.dashboard || emptyPayload(fromDate, toDate).dashboard,
        ledgers: Array.isArray(payload?.ledgers) ? payload.ledgers : [],
        vouchers: Array.isArray(payload?.vouchers) ? payload.vouchers : [],
        invoices: Array.isArray(payload?.invoices) ? payload.invoices : [],
        reports: payload?.reports || emptyPayload(fromDate, toDate).reports,
    };
}

function emptyPayload(fromDate: string, toDate: string): TallyDataPayload {
    return {
        ok: true,
        source: 'empty',
        fromDate,
        toDate,
        dashboard: {
            totalSales: 0,
            totalPurchase: 0,
            cashBankBalance: 0,
            receivables: 0,
            payables: 0,
            recentTransactions: [],
        },
        ledgers: [],
        vouchers: [],
        invoices: [],
        reports: {
            trialBalance: { rows: [], totalDebit: 0, totalCredit: 0, difference: 0 },
            profitLoss: {
                sales: 0,
                purchases: 0,
                directIncome: 0,
                directExpense: 0,
                indirectIncome: 0,
                indirectExpense: 0,
                grossProfit: 0,
                netProfit: 0,
            },
            balanceSheet: { assets: [], liabilities: [], totalAssets: 0, totalLiabilities: 0 },
        },
    };
}

function getTallyEndpoint() {
    const configured = String(import.meta.env.VITE_TALLY_MIDDLEWARE_URL || '').trim();
    if (configured) return configured.replace(/\/$/, '');
    return '/api/tally/sync';
}

async function saveCache(data: TallyDataPayload, companyId?: string, companyName?: string) {
    try {
        const envelope: TallyCacheEnvelope = {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            key: CACHE_KEY,
            companyId,
            companyName,
            fromDate: data.fromDate,
            toDate: data.toDate,
            data,
        };
        memoryCachePayload = data;
        localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
        await writeCacheEnvelope(envelope);
    } catch (_) {
        // Cache is an optimization only.
    }
}

function readCache(): TallyDataPayload | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.version && parsed.version !== CACHE_VERSION) return null;
        memoryCachePayload = parsed?.data || null;
        return memoryCachePayload;
    } catch (_) {
        return null;
    }
}

async function readCachedPayloadAsync(): Promise<TallyDataPayload | null> {
    const stored = await readCacheEnvelope();
    if (stored?.data) {
        memoryCachePayload = stored.data;
        return normalizePayload(stored.data, stored.fromDate, stored.toDate);
    }

    return readCache();
}

async function writeCacheEnvelope(envelope: TallyCacheEnvelope) {
    const db = await openCacheDb();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
        try {
            const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
            tx.objectStore(CACHE_STORE_NAME).put(envelope, CACHE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to persist Tally cache.'));
        } catch (error) {
            reject(error);
        }
    });
}

async function readCacheEnvelope(): Promise<TallyCacheEnvelope | null> {
    const db = await openCacheDb();
    if (db) {
        const envelope = await new Promise<TallyCacheEnvelope | null>((resolve) => {
            try {
                const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
                const request = tx.objectStore(CACHE_STORE_NAME).get(CACHE_KEY);
                request.onsuccess = () => resolve((request.result as TallyCacheEnvelope | undefined) || null);
                request.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });

        if (envelope?.version === CACHE_VERSION && envelope.data) {
            return envelope;
        }
    }

    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as TallyCacheEnvelope;
        if (parsed?.version && parsed.version !== CACHE_VERSION) return null;
        return parsed?.data ? parsed : null;
    } catch {
        return null;
    }
}

function openCacheDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return Promise.resolve(null);
    }

    if (!cacheDbPromise) {
        cacheDbPromise = new Promise((resolve) => {
            const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                    db.createObjectStore(CACHE_STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    return cacheDbPromise;
}

function normalizeName(value: string) {
    return String(value || '').trim().toLowerCase();
}
