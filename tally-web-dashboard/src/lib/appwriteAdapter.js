import { Client, Account, Databases, Query, ID } from 'appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('69a320ff003acccf8024');

const account = new Account(client);
const databases = new Databases(client);

const DB_ID = 'tally_sync_db';

// Fields that exist as real Appwrite attributes (can be filtered/sorted server-side)
const COLLECTION_ATTRIBUTES = {
    vouchers: new Set(['company_id', 'voucher_type', 'vch_date', 'invoice_number', 'amount', 'is_deleted', 'name', 'status', 'sync_api_key', 'voucher_number', 'party_ledger_name', 'narration', 'alter_id']),
    ledgers: new Set(['company_id', 'name', 'parent', 'current_balance', 'status', 'sync_api_key']),
    stock_items: new Set(['company_id', 'name', 'stock_group', 'status', 'sync_api_key', 'unit', 'opening_stock', 'current_stock', 'rate']),
    voucher_ledger_entries: new Set(['voucher_id', 'company_id', 'name', 'amount', 'is_debit', 'transaction_type', 'party_name', 'sync_api_key']),
    voucher_stock_entries: new Set(['voucher_id', 'company_id', 'name', 'amount', 'sync_api_key', 'stock_item_name', 'quantity', 'rate', 'unit', 'hsn_code', 'is_inward', 'discount_percent', 'tax_rate', 'owner_id']),
    pending_transactions: new Set(['company_id', 'status', 'transaction_type', 'created_by', 'sync_api_key']),
    sync_history: new Set(['company_id', 'status', 'started_at', 'sync_api_key']),
    companies: new Set(['company_id', 'name', 'status', 'sync_api_key']),
    app_settings: new Set(['key', 'value', 'company_id']),
    team_members: new Set(['company_id', 'name', 'status']),
    sales_visits: new Set(['company_id', 'status']),
    recurring_invoices: new Set(['company_id', 'status']),
    payment_links: new Set(['company_id', 'status']),
    ledger_mappings: new Set(['userId', 'clientId', 'normalizedKeyword', 'ledgerName', 'createdAt']),
    invoices: new Set(['userId', 'clientId', 'gstin', 'invoiceNumber', 'date', 'taxableValue', 'cgst', 'sgst', 'igst', 'hsn', 'invoiceType', 'createdAt']),
    reminder_logs: new Set(['company_id'])
};

// Fields safe for remote sorting
const SORTABLE_FIELDS = new Set(['vch_date', 'voucher_date', 'amount', 'name', 'started_at', '$createdAt', '$updatedAt', 'created_at']);

const NUMERIC_ATTRIBUTES = new Set(['amount', 'current_balance', 'total_amount', 'grand_total', 'rate', 'opening_stock', 'current_stock', 'quantity', 'discount_percent', 'tax_rate', 'taxableValue', 'cgst', 'sgst', 'igst']);
const BOOLEAN_ATTRIBUTES = new Set(['is_deleted', 'is_debit', 'is_inward']);
const ATTRIBUTE_STRING_MAX = {
    company_id: 250,
    sync_api_key: 250,
    voucher_type: 250,
    transaction_type: 250,
    status: 250,
    voucher_id: 250,
    key: 250,
    created_by: 250,
    voucher_number: 500,
    invoice_number: 500,
    party_name: 500,
    name: 500,
    parent: 500,
    stock_group: 500,
    unit: 250,
    hsn_code: 250,
    stock_item_name: 500,
    owner_id: 250,
    value: 1000,
    vch_date: 50,
    voucher_date: 50,
    started_at: 50,
    userId: 250,
    clientId: 250,
    normalizedKeyword: 500,
    ledgerName: 500,
    createdAt: 50,
    gstin: 20,
    invoiceNumber: 250,
    date: 50,
    hsn: 50,
    invoiceType: 20
};

const queryCache = new Map();
const inFlightQueryCache = new Map();
const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_LIST_MS = 600_000; // 10 minutes for list queries (was 3 min)
const CACHE_TTL_MASTER_MS = 1_800_000; // 30 minutes for master data (was 5 min)
const MASTER_DATA_COLLECTIONS = new Set(['ledgers', 'stock_items', 'companies', 'app_settings']);
const PAGE_SIZE = 500; // Reduced from 2000 to save reads
const FALLBACK_PAGE_SIZE = 200; // Reduced from 500
const PARALLEL_PAGE_BATCH = 4;
const REMOTE_FIELD_BLOCKLIST = new Map();
let maxSupportedPageSize = PAGE_SIZE;

// ===== PERSISTENT LOCALSTORAGE CACHE (survives page refresh) =====
const LS_PREFIX = 'aw_c_';
function lsGet(key) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const e = JSON.parse(raw);
        if (Date.now() > e.ex) { localStorage.removeItem(LS_PREFIX + key); return null; }
        return e.d;
    } catch { return null; }
}
function lsSet(key, data, collectionId) {
    try {
        const ttl = getCacheTtlMs(collectionId);
        localStorage.setItem(LS_PREFIX + key, JSON.stringify({ d: data, ex: Date.now() + ttl }));
    } catch { /* full or unavailable */ }
}
function lsClearCollection(collectionId) {
    try {
        const rem = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(LS_PREFIX + collectionId + '|')) rem.push(k);
        }
        rem.forEach(k => localStorage.removeItem(k));
    } catch { }
}
// ===== END PERSISTENT CACHE =====

function getCacheTtlMs(collectionId) {
    return MASTER_DATA_COLLECTIONS.has(collectionId) ? CACHE_TTL_MASTER_MS : CACHE_TTL_LIST_MS;
}

function getCacheKey(collectionId, queries, limit) {
    return `${collectionId}|${JSON.stringify(queries)}|${limit}`;
}

function getCached(key) {
    // In-memory first (fastest)
    const entry = queryCache.get(key);
    if (entry && Date.now() <= entry.expiresAt) return entry.data;
    if (entry) queryCache.delete(key);
    // Fallback: localStorage (survives page refresh = saves reads!)
    const lsData = lsGet(key);
    if (lsData) {
        queryCache.set(key, { data: lsData, expiresAt: Date.now() + 120_000 });
        return lsData;
    }
    return null;
}

function setCache(key, data, collectionId) {
    if (queryCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = queryCache.keys().next().value;
        queryCache.delete(oldest);
    }
    const ttlMs = getCacheTtlMs(collectionId);
    queryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
    // Also persist to localStorage
    lsSet(key, data, collectionId);
}

function getBlockedRemoteFields(collectionId) {
    if (!REMOTE_FIELD_BLOCKLIST.has(collectionId)) {
        REMOTE_FIELD_BLOCKLIST.set(collectionId, new Set());
    }
    return REMOTE_FIELD_BLOCKLIST.get(collectionId);
}

function markRemoteFieldUnsupported(collectionId, field) {
    if (!field || field === 'company_id' || field.startsWith('$')) return;
    getBlockedRemoteFields(collectionId).add(field);
}

function isRemoteFieldBlocked(collectionId, field) {
    if (!field) return false;
    return getBlockedRemoteFields(collectionId).has(field);
}

export function invalidateCache(collectionId) {
    for (const key of queryCache.keys()) {
        if (key.startsWith(collectionId + '|')) {
            queryCache.delete(key);
        }
    }
    for (const key of inFlightQueryCache.keys()) {
        if (key.startsWith(collectionId + '|')) {
            inFlightQueryCache.delete(key);
        }
    }
    lsClearCollection(collectionId);
}

export function clearAllCache() {
    queryCache.clear();
    inFlightQueryCache.clear();
    REMOTE_FIELD_BLOCKLIST.clear();
    // Clear all localStorage cache entries
    try {
        const rem = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(LS_PREFIX)) rem.push(k);
        }
        rem.forEach(k => localStorage.removeItem(k));
    } catch { }
}

function normalizeField(field) {
    if (field === 'id') return '$id';
    if (field === 'created_at') return '$createdAt';
    // Appwrite schema uses vch_date as indexed top-level date field
    if (field === 'voucher_date') return 'vch_date';
    return field;
}

function parsePageLimitFromErrorMessage(message) {
    if (!message) return null;
    const rangeMatch = message.match(/between\s+1\s+and\s+(\d+)/i);
    if (rangeMatch) return Number(rangeMatch[1]);

    const maxMatch = message.match(/max(?:imum)?(?:\s+limit)?(?:\s+is)?\s+(\d+)/i);
    if (maxMatch) return Number(maxMatch[1]);

    return null;
}

function resolveRetryPageLimit(error, attemptedLimit) {
    if (!error || Number(error.code) !== 400 || attemptedLimit <= 1) return null;

    const parsed = parsePageLimitFromErrorMessage(String(error.message || ''));
    if (Number.isFinite(parsed) && parsed >= 1 && parsed < attemptedLimit) {
        return parsed;
    }

    if (attemptedLimit > FALLBACK_PAGE_SIZE) {
        return FALLBACK_PAGE_SIZE;
    }

    return null;
}

function getNested(obj, path) {
    return path.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), obj);
}

function parseJsonSafe(value) {
    if (!value || typeof value !== 'string') return {};
    try { return JSON.parse(value); } catch (_) { return {}; }
}

function sanitizeAttributeValue(field, rawValue) {
    if (rawValue === undefined || rawValue === null) return undefined;
    if (NUMERIC_ATTRIBUTES.has(field)) {
        const n = Number(rawValue);
        return Number.isFinite(n) ? n : 0;
    }
    if (BOOLEAN_ATTRIBUTES.has(field)) {
        return Boolean(rawValue);
    }
    const maxLen = ATTRIBUTE_STRING_MAX[field] || 500;
    return String(rawValue).slice(0, maxLen);
}

function liftKnownAttributes(collectionId, sourcePayload, targetPayload) {
    const attrs = COLLECTION_ATTRIBUTES[collectionId];
    if (!attrs || !sourcePayload || !targetPayload) return;
    const normalizedSource = { ...sourcePayload };

    // Preserve compatibility with Supabase-era payloads that send voucher_date/date
    if (collectionId === 'vouchers') {
        const resolvedDate = normalizedSource.vch_date
            || normalizedSource.voucher_date
            || normalizedSource.date
            || normalizedSource.invoice_date;
        if (resolvedDate && !normalizedSource.vch_date) {
            normalizedSource.vch_date = resolvedDate;
        }
        if (normalizedSource.is_deleted === undefined || normalizedSource.is_deleted === null) {
            normalizedSource.is_deleted = false;
        }
    }

    for (const field of attrs) {
        if (normalizedSource[field] === undefined || normalizedSource[field] === null) continue;
        const lifted = sanitizeAttributeValue(field, normalizedSource[field]);
        if (lifted !== undefined) {
            targetPayload[field] = lifted;
        }
    }
}

function isRemoteField(collectionId, field) {
    const attrs = COLLECTION_ATTRIBUTES[collectionId];
    if (!attrs) return false;
    // System fields are always remote
    if (field.startsWith('$')) return true;
    if (isRemoteFieldBlocked(collectionId, field)) return false;
    return attrs.has(field);
}

function parseRemoteQuery(rawQuery) {
    if (typeof rawQuery !== "string") return null;

    // Handle Appwrite SDK v14+ JSON string format
    if (rawQuery.startsWith('{')) {
        try {
            const obj = JSON.parse(rawQuery);
            return {
                method: obj.method,
                field: obj.attribute,
                value: Array.isArray(obj.values) ? (obj.values.length === 1 ? obj.values[0] : obj.values) : undefined
            };
        } catch (_) {
            return null;
        }
    }

    // Handle older Appwrite SDK format
    const methodEnd = rawQuery.indexOf("(\"");
    if (methodEnd < 0) return null;

    const fieldStart = methodEnd + 2;
    const fieldEnd = rawQuery.indexOf("\"", fieldStart);
    if (fieldEnd < 0) return null;

    const method = rawQuery.slice(0, methodEnd);
    const field = rawQuery.slice(fieldStart, fieldEnd);
    const commaIndex = rawQuery.indexOf(",", fieldEnd);
    let value = undefined;

    if (commaIndex > -1) {
        const valueRaw = rawQuery.slice(commaIndex + 1, -1).trim();
        try {
            value = JSON.parse(valueRaw);
        } catch {
            value = String(valueRaw).replace(/^"|"$/g, "");
        }
    }

    return { method, field, value };
}

class AppwriteQueryBuilder {
    constructor(collectionId) {
        this.collectionId = collectionId;
        this.remoteQueries = [];
        this.localFilters = [];
        this.modifiers = {
            single: false,
            order: null,
            limit: null,
            select: '*',
            selectOptions: {},
            updatePayload: null,
            deleteMode: false,
            orFilters: [],
            forceLocalOrder: false
        };
    }

    select(fields, options = {}) {
        this.modifiers.select = fields;
        this.modifiers.selectOptions = options || {};
        return this;
    }

    _addFilter(method, field, value) {
        const nField = normalizeField(field);
        const mappedMethod = method === 'neq' ? 'notEqual' : method;
        const forceLocal =
            nField === 'is_deleted'
            && mappedMethod === 'equal'
            && value === false;

        if (!forceLocal && isRemoteField(this.collectionId, nField)) {
            this.remoteQueries.push(Query[mappedMethod](nField, value));
        } else {
            this.localFilters.push({ method: mappedMethod, field: nField, value });
        }
    }

    eq(field, value) { this._addFilter('equal', field, value); return this; }
    neq(field, value) { this._addFilter('notEqual', field, value); return this; }
    gte(field, value) { this._addFilter('greaterThanEqual', field, value); return this; }
    lte(field, value) { this._addFilter('lessThanEqual', field, value); return this; }
    lt(field, value) { this._addFilter('lessThan', field, value); return this; }
    gt(field, value) { this._addFilter('greaterThan', field, value); return this; }

    in(field, values) {
        if (!Array.isArray(values) || values.length === 0) return this;
        const nField = normalizeField(field);

        if (isRemoteField(this.collectionId, nField)) {
            this.remoteQueries.push(Query.equal(nField, values));
        } else {
            this.localFilters.push({ method: 'in', field: nField, value: values });
        }
        return this;
    }

    ilike(field, value) {
        const nField = normalizeField(field);
        const cleanValue = String(value || '').replace(/%/g, '');

        // Avoid Query.search() by default; it requires fulltext indexes that are
        // often missing in migrated Appwrite schemas and causes 400 errors.
        this.localFilters.push({ method: 'ilike', field: nField, value: cleanValue });
        return this;
    }

    order(field, options = { ascending: true }) {
        const nField = normalizeField(field);
        const ascending = options?.ascending !== false;
        this.modifiers.order = { field: nField, ascending };

        if (SORTABLE_FIELDS.has(nField)) {
            this.remoteQueries.push(ascending ? Query.orderAsc(nField) : Query.orderDesc(nField));
        }
        return this;
    }

    limit(num) {
        this.modifiers.limit = Math.max(1, Math.min(Number(num) || 1, 10000));
        return this;
    }

    single() {
        this.modifiers.single = true;
        this.modifiers.limit = 1;
        return this;
    }

    maybeSingle() { return this.single(); }

    or(queryStr) {
        if (typeof queryStr === 'string' && queryStr.trim()) {
            const parts = queryStr.split(',').map(s => s.trim()).filter(Boolean);
            const parsed = [];
            for (const part of parts) {
                const match = part.match(/^([a-zA-Z0-9_.]+)\.eq\.(.+)$/);
                if (match) {
                    parsed.push({ field: normalizeField(match[1]), value: match[2] });
                }
            }

            if (parsed.length > 0 && parsed.every(f => isRemoteField(this.collectionId, f.field))) {
                const sameField = parsed.every(f => f.field === parsed[0].field);
                if (sameField) {
                    this.remoteQueries.push(Query.equal(parsed[0].field, parsed.map(f => f.value)));
                    return this;
                }
            }

            this.modifiers.orFilters.push(...parsed);
        }
        return this;
    }

    not(field, op, val) {
        if (op === 'is' && val === null) {
            const nField = normalizeField(field);
            if (isRemoteField(this.collectionId, nField)) {
                this.remoteQueries.push(Query.isNotNull(nField));
            } else {
                this.localFilters.push({ method: 'isNotNull', field: nField, value: null });
            }
        }
        return this;
    }

    update(payload) {
        this.modifiers.updatePayload = payload;
        return this;
    }

    delete() {
        this.modifiers.deleteMode = true;
        return this;
    }

    _downgradeUnsupportedRemoteQueries() {
        let changed = false;
        const retainedRemote = [];

        for (const rawQuery of this.remoteQueries) {
            const parsed = parseRemoteQuery(rawQuery);
            if (!parsed) {
                retainedRemote.push(rawQuery);
                continue;
            }

            const { method, field, value } = parsed;
            if (!field || field.startsWith("$") || field === "company_id") {
                retainedRemote.push(rawQuery);
                continue;
            }

            markRemoteFieldUnsupported(this.collectionId, field);
            changed = true;

            if (method === "orderAsc" || method === "orderDesc") {
                this.modifiers.forceLocalOrder = true;
                continue;
            }

            let localMethod = method;
            let localValue = value;

            if (method === "search") {
                localMethod = "ilike";
                if (Array.isArray(localValue)) localValue = localValue[0] ?? "";
                localValue = String(localValue || "");
            }

            if (["equal", "notEqual", "greaterThanEqual", "lessThanEqual", "greaterThan", "lessThan", "isNotNull", "ilike"].includes(localMethod)) {
                this.localFilters.push({ method: localMethod, field, value: localValue });
            }
        }

        if (!changed) return false;

        this.remoteQueries = retainedRemote;
        invalidateCache(this.collectionId);
        return true;
    }

    _normalizeDoc(doc) {
        const { $id, json_data, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...lifted } = doc;
        const unpacked = parseJsonSafe(json_data);

        // Merge: lifted attributes take priority, then unpacked json_data
        const merged = {
            id: $id,
            created_at: lifted.created_at || $createdAt,
            updated_at: lifted.updated_at || $updatedAt,
            ...unpacked,
            ...lifted
        };

        // Derive common aliases
        const vchDate = merged.voucher_date || merged.vch_date || merged.date || merged.invoice_date;
        if (vchDate) {
            if (!merged.voucher_date) merged.voucher_date = vchDate;
            if (!merged.vch_date) merged.vch_date = vchDate;
        }

        const party = merged.party_name || merged.party_ledger_name || merged.customer_name;
        if (party) {
            if (!merged.party_name) merged.party_name = party;
            if (!merged.party_ledger_name) merged.party_ledger_name = party;
        }

        if (merged.is_deleted === undefined || merged.is_deleted === null) {
            merged.is_deleted = false;
        }

        const amt = merged.amount ?? merged.grand_total ?? merged.total_amount ?? merged.net_amount ?? merged.gross_amount;
        if (amt !== undefined && amt !== null) {
            const n = parseFloat(amt);
            if (!Number.isNaN(n)) {
                if (merged.amount == null) merged.amount = n;
                if (merged.total_amount == null) merged.total_amount = n;
                if (merged.grand_total == null) merged.grand_total = n;
            }
        }

        delete merged.json_data;
        return merged;
    }

    async _fetchPaged(queries, cap) {
        const safeCap = Math.max(1, Math.min(Number(cap) || PAGE_SIZE, 10000));
        const cacheKey = getCacheKey(this.collectionId, queries, safeCap);
        const cached = getCached(cacheKey);
        if (cached) return cached;

        const inFlight = inFlightQueryCache.get(cacheKey);
        if (inFlight) {
            return await inFlight;
        }

        const fetchPromise = (async () => {
            const docs = [];
            let cursorAfter = null;

            while (docs.length < safeCap) {
                const remaining = safeCap - docs.length;
                let pageSize = Math.min(maxSupportedPageSize, remaining);
                const q = [...(Array.isArray(queries) ? queries : []), Query.limit(pageSize)];
                if (cursorAfter) q.push(Query.cursorAfter(cursorAfter));

                let resp;
                try {
                    resp = await databases.listDocuments(DB_ID, this.collectionId, q);
                } catch (error) {
                    const retryPageSize = resolveRetryPageLimit(error, pageSize);
                    if (!retryPageSize || retryPageSize >= pageSize) {
                        throw error;
                    }

                    maxSupportedPageSize = Math.max(1, Math.min(maxSupportedPageSize, retryPageSize));
                    pageSize = Math.min(maxSupportedPageSize, remaining);
                    const retryQueries = [...(Array.isArray(queries) ? queries : []), Query.limit(pageSize)];
                    if (cursorAfter) retryQueries.push(Query.cursorAfter(cursorAfter));
                    resp = await databases.listDocuments(DB_ID, this.collectionId, retryQueries);
                }

                const pageDocs = resp?.documents || [];
                docs.push(...pageDocs);

                if (pageDocs.length < pageSize) break;
                cursorAfter = pageDocs[pageDocs.length - 1]?.$id;
                if (!cursorAfter) break;
            }

            setCache(cacheKey, docs, this.collectionId);
            return docs;
        })();

        inFlightQueryCache.set(cacheKey, fetchPromise);
        try {
            return await fetchPromise;
        } finally {
            inFlightQueryCache.delete(cacheKey);
        }
    }
    async _joinVouchers(data) {
        const needsJoin = this.modifiers.select && this.modifiers.select.includes('vouchers');
        if (!needsJoin || data.length === 0) return data;

        const voucherIds = [...new Set(data.map(d => d.voucher_id).filter(Boolean))];
        if (voucherIds.length === 0) return data;

        // Fetch in larger chunks (100 instead of 50)
        const allVouchers = [];
        const chunkSize = 100;
        const chunks = [];
        for (let i = 0; i < voucherIds.length; i += chunkSize) {
            chunks.push(voucherIds.slice(i, i + chunkSize));
        }

        // Parallel chunk fetching
        const results = await Promise.all(
            chunks.map(chunk =>
                this._fetchPaged([Query.equal('$id', chunk)], chunk.length)
                    .then(docs => docs.map(d => this._normalizeDoc(d)))
                    .catch(() => [])
            )
        );
        results.forEach(r => allVouchers.push(...r));

        const lookup = Object.fromEntries(allVouchers.map(v => [v.id, v]));
        const withJoin = data.map(d => ({ ...d, vouchers: lookup[d.voucher_id] || null }));

        if (this.modifiers.select.includes('!inner')) {
            return withJoin.filter(d => d.vouchers !== null);
        }
        return withJoin;
    }

    _applyLocalFilters(data) {
        let result = data;

        for (const filter of this.localFilters) {
            result = result.filter(item => {
                const val = getNested(item, filter.field);
                switch (filter.method) {
                    case 'equal': {
                        if (filter.field === 'is_deleted' && filter.value === false) {
                            return val === false || val === undefined || val === null;
                        }
                        if (Array.isArray(filter.value)) {
                            return filter.value.map(v => String(v)).includes(String(val));
                        }
                        if (filter.field === 'voucher_type' && typeof val === 'string' && typeof filter.value === 'string') {
                            const lhs = val.toLowerCase();
                            const rhs = filter.value.toLowerCase();
                            if (rhs === 'sales') return lhs.includes('sale');
                            if (rhs === 'purchase') return lhs.includes('purchase');
                        }
                        return val === filter.value;
                    }
                    case 'notEqual': return val !== filter.value;
                    case 'greaterThanEqual': return val >= filter.value;
                    case 'lessThanEqual': return val <= filter.value;
                    case 'greaterThan': return val > filter.value;
                    case 'lessThan': return val < filter.value;
                    case 'in': return Array.isArray(filter.value) && filter.value.includes(val);
                    case 'ilike': return String(val || '').toLowerCase().includes(String(filter.value || '').toLowerCase());
                    case 'isNotNull': return val !== null && val !== undefined;
                    default: return true;
                }
            });
        }

        if (this.modifiers.orFilters.length > 0) {
            result = result.filter(item =>
                this.modifiers.orFilters.some(f => String(getNested(item, f.field) ?? '') === String(f.value))
            );
        }

        return result;
    }

    _applyLocalSortAndLimit(data) {
        let result = data;

        if (this.modifiers.order && (this.modifiers.forceLocalOrder || !SORTABLE_FIELDS.has(this.modifiers.order.field))) {
            const { field, ascending } = this.modifiers.order;
            result = [...result].sort((a, b) => {
                const va = getNested(a, field);
                const vb = getNested(b, field);
                if (va == null && vb == null) return 0;
                if (va == null) return ascending ? 1 : -1;
                if (vb == null) return ascending ? -1 : 1;
                if (va < vb) return ascending ? -1 : 1;
                if (va > vb) return ascending ? 1 : -1;
                return 0;
            });
        }

        if (this.modifiers.limit) {
            result = result.slice(0, this.modifiers.limit);
        }
        return result;
    }

    async execute() {
        try {
            // UPDATE operation
            if (this.modifiers.updatePayload) {
                return this._executeUpdate();
            }

            // Fast path: count-only queries do not need full document pagination
            if (this.modifiers.selectOptions?.head && this.modifiers.selectOptions?.count === 'exact'
                && this.localFilters.length === 0 && this.modifiers.orFilters.length === 0 && !this.modifiers.deleteMode) {
                const countResponse = await databases.listDocuments(DB_ID, this.collectionId, [...this.remoteQueries, Query.limit(1)]);
                return { data: null, error: null, count: Number(countResponse?.total || 0) };
            }

            // Determine fetch cap
            const shouldFetchLargeSet = this.modifiers.selectOptions?.count === 'exact' || this.modifiers.deleteMode;
            const cap = Math.min(
                this.modifiers.limit || (shouldFetchLargeSet ? 10000 : (this.localFilters.length > 0 || this.modifiers.orFilters.length > 0 ? 2000 : PAGE_SIZE)),
                10000
            );

            // Fetch with remote queries
            let rawDocs;
            try {
                rawDocs = await this._fetchPaged(this.remoteQueries, cap);
            } catch (error) {
                if (error?.code === 400 && this._downgradeUnsupportedRemoteQueries()) {
                    rawDocs = await this._fetchPaged(this.remoteQueries, cap);
                } else {
                    throw error;
                }
            }

            // Normalize
            let finalData = (Array.isArray(rawDocs) ? rawDocs : []).map(doc => this._normalizeDoc(doc));

            // Join vouchers if requested
            finalData = await this._joinVouchers(finalData);

            // Apply local filters (only for fields not handled remotely)
            if (this.localFilters.length > 0 || this.modifiers.orFilters.length > 0) {
                finalData = this._applyLocalFilters(finalData);
            }

            const totalCount = finalData.length;

            // DELETE operation
            if (this.modifiers.deleteMode) {
                const idsToDelete = finalData.map(d => d.id).filter(Boolean);
                const chunks = [];
                for (let i = 0; i < idsToDelete.length; i += 50) chunks.push(idsToDelete.slice(i, i + 50));
                for (const chunk of chunks) {
                    await Promise.all(chunk.map(id =>
                        databases.deleteDocument(DB_ID, this.collectionId, id).catch(() => null)
                    ));
                }
                invalidateCache(this.collectionId);
                return { data: null, error: null, count: idsToDelete.length };
            }

            // Sort & limit
            finalData = this._applyLocalSortAndLimit(finalData);

            // Head count
            if (this.modifiers.selectOptions?.head) {
                return { data: null, error: null, count: totalCount };
            }

            // Single
            if (this.modifiers.single) {
                if (finalData.length === 0) {
                    return { data: null, error: { message: 'Row not found' }, count: totalCount };
                }
                return { data: finalData[0], error: null, count: totalCount };
            }

            return { data: finalData, error: null, count: totalCount };

        } catch (error) {
            if (error?.code === 404) {
                if (this.modifiers.single) {
                    return { data: null, error: { message: 'Row not found' }, count: 0 };
                }
                return { data: [], error: null, count: 0 };
            }
            return { data: null, error: { message: error?.message || 'Unknown DB error' }, count: 0 };
        }
    }

    async _executeUpdate() {
        let docId = null;
        for (const q of this.remoteQueries) {
            const parsed = parseRemoteQuery(q);
            if (parsed && parsed.field === '$id' && parsed.method === 'equal') {
                docId = parsed.value;
                break;
            }
        }
        if (!docId) {
            const localFilter = this.localFilters.find(f => f.field === '$id' && f.method === 'equal');
            if (localFilter) docId = localFilter.value;
        }

        if (!docId) {
            return { data: null, error: { message: 'Missing ID for update' } };
        }

        const existing = await databases.getDocument(DB_ID, this.collectionId, docId);
        const currentData = parseJsonSafe(existing.json_data);
        const mergedData = { ...currentData, ...this.modifiers.updatePayload };
        const payload = { json_data: JSON.stringify(mergedData) };

        // Lift known attributes to top-level
        liftKnownAttributes(this.collectionId, mergedData, payload);

        await databases.updateDocument(DB_ID, this.collectionId, docId, payload);
        invalidateCache(this.collectionId);
        return { data: [mergedData], error: null };
    }

    then(onFulfilled, onRejected) {
        return this.execute().then(onFulfilled, onRejected);
    }
}

export const appwriteSupabaseMock = {
    functions: {
        invoke: async () => ({
            data: null,
            error: { message: 'Functions API is not configured in Appwrite adapter' }
        })
    },
    auth: {
        signUp: async ({ email, password, options }) => {
            try {
                try { await account.deleteSession('current'); } catch (_) { }
                const user = await account.create(ID.unique(), email, password, options?.data?.full_name);
                const session = await account.createEmailPasswordSession(email, password);
                return { data: { user, session: { access_token: session.$id, user } }, error: null };
            } catch (error) {
                return { data: null, error: { message: error?.message || 'Signup failed' } };
            }
        },
        signInWithPassword: async ({ email, password }) => {
            try {
                try { await account.deleteSession('current'); } catch (_) { }
                const session = await account.createEmailPasswordSession(email, password);
                return {
                    data: {
                        user: { id: session.userId, email },
                        session: { access_token: session.$id, user: { id: session.userId, email } }
                    },
                    error: null
                };
            } catch (error) {
                return { data: null, error: { message: error?.message || 'Login failed' } };
            }
        },
        signInWithOAuth: async () => ({ data: null, error: { message: 'OAuth disabled' } }),
        signOut: async () => {
            try {
                await account.deleteSession('current');
                clearAllCache();
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        getSession: async () => {
            try {
                const session = await account.getSession('current');
                let email = '';
                try {
                    const user = await account.get();
                    email = user.email;
                } catch (_) { }
                return { data: { session: { access_token: session.$id, user: { id: session.userId, email } } } };
            } catch {
                return { data: { session: null } };
            }
        },
        getUser: async () => {
            try {
                const user = await account.get();
                return { data: { user: { id: user.$id, email: user.email, user_metadata: { full_name: user.name } } } };
            } catch {
                return { data: { user: null } };
            }
        },
        onAuthStateChange: (cb) => {
            // Check real session asynchronously and fire callback with actual data
            (async () => {
                try {
                    const session = await account.getSession('current');
                    let email = '';
                    try { const u = await account.get(); email = u.email; } catch (_) { }
                    if (cb) cb('SIGNED_IN', {
                        access_token: session.$id,
                        user: { id: session.userId, email }
                    });
                } catch {
                    // No active session ? fire with null so AuthContext knows
                    if (cb) cb('INITIAL_SESSION', null);
                }
            })();
            return { data: { subscription: { unsubscribe: () => { } } } };
        }
    },
    from: (collection) => {
        const builder = new AppwriteQueryBuilder(collection);

        builder.insert = async (payload) => {
            try {
                const rows = Array.isArray(payload) ? payload : [payload];
                const inserted = [];

                for (const row of rows) {
                    const docId = row.id || ID.unique();
                    const cleanPayload = { ...row };
                    delete cleanPayload.id;

                    const appwritePayload = {
                        json_data: JSON.stringify(cleanPayload)
                    };

                    // Lift all known attributes to top-level for indexing
                    liftKnownAttributes(collection, cleanPayload, appwritePayload);

                    const doc = await databases.createDocument(DB_ID, collection, docId, appwritePayload);
                    inserted.push({ id: doc.$id, ...cleanPayload });
                }

                invalidateCache(collection);
                return {
                    data: inserted,
                    error: null,
                    select: () => ({
                        single: async () => ({ data: inserted[0] || null, error: null })
                    })
                };
            } catch (e) {
                return { error: { message: e.message } };
            }
        };

        return builder;
    }
};










