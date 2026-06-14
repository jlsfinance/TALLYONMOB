import type { MappingStatus, NameMappingRecord, NameMappingType } from './types';

const NAME_MAPPINGS_KEY = 'smart_name_mappings_v1';

const BANK_STOP_WORDS = new Set([
    'UPI', 'NEFT', 'RTGS', 'IMPS', 'BANK', 'PAYMENT', 'TRANSFER', 'TRF', 'REF', 'UTR', 'CHQ', 'CHEQUE',
    'DEBIT', 'CREDIT', 'DR', 'CR', 'TXN', 'TRANSACTION', 'MOBILE', 'INTERNET', 'SALARY', 'INCOME',
    'EXPENSE', 'ACH', 'ECS', 'PVT', 'LTD', 'PRIVATE', 'LIMITED'
]);

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch (_) {
        return fallback;
    }
}

function writeJson<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
}

function tokenize(value: string) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean);
}

export function normalizeNameMappingSource(value: string) {
    return tokenize(value).join(' ').trim();
}

export function deriveBankMappingSource(value: string) {
    const tokens = tokenize(value);
    const useful = tokens.filter((token) => {
        if (token.length < 3) return false;
        if (/^\d+$/.test(token)) return false;
        return !BANK_STOP_WORDS.has(token);
    });

    const selected = (useful.length > 0 ? useful : tokens.filter((token) => !/^\d+$/.test(token))).slice(0, 6);
    return selected.join(' ').trim();
}

export function getCanonicalMappingSource(value: string, mappingType: NameMappingType) {
    if (mappingType === 'bank_party') {
        const derived = deriveBankMappingSource(value);
        return derived || normalizeNameMappingSource(value);
    }

    return normalizeNameMappingSource(value);
}

export function getLocalNameMappings(
    userId: string,
    clientId: string,
    mappingType?: NameMappingType
): NameMappingRecord[] {
    const records = readJson<NameMappingRecord[]>(NAME_MAPPINGS_KEY, []);
    return records
        .filter((item) => item.userId === userId && item.clientId === clientId)
        .filter((item) => !mappingType || item.mappingType === mappingType)
        .sort((left, right) => String(right.lastUsedAt || right.updatedAt || '').localeCompare(String(left.lastUsedAt || left.updatedAt || '')));
}

export function upsertLocalNameMapping(record: NameMappingRecord) {
    const records = readJson<NameMappingRecord[]>(NAME_MAPPINGS_KEY, []);
    const sourceKey = getCanonicalMappingSource(record.sourceText || record.normalizedSource, record.mappingType);
    const now = new Date().toISOString();
    const nextRecord: NameMappingRecord = {
        ...record,
        normalizedSource: sourceKey,
        createdAt: record.createdAt || now,
        updatedAt: now,
        lastUsedAt: record.lastUsedAt || now,
        status: (record.status || 'approved') as MappingStatus,
    };

    const next = [
        nextRecord,
        ...records.filter((item) => !(
            item.userId === record.userId
            && item.clientId === record.clientId
            && item.mappingType === record.mappingType
            && item.normalizedSource === sourceKey
        ))
    ];

    writeJson(NAME_MAPPINGS_KEY, next.slice(0, 10000));
    return nextRecord;
}

export function deleteLocalNameMapping(
    userId: string,
    clientId: string,
    mappingType: NameMappingType,
    normalizedSource: string
) {
    const records = readJson<NameMappingRecord[]>(NAME_MAPPINGS_KEY, []);
    const sourceKey = getCanonicalMappingSource(normalizedSource, mappingType);
    const next = records.filter((item) => !(
        item.userId === userId
        && item.clientId === clientId
        && item.mappingType === mappingType
        && item.normalizedSource === sourceKey
    ));

    writeJson(NAME_MAPPINGS_KEY, next);
}

export function touchLocalNameMapping(
    userId: string,
    clientId: string,
    mappingType: NameMappingType,
    normalizedSource: string
) {
    const records = readJson<NameMappingRecord[]>(NAME_MAPPINGS_KEY, []);
    const sourceKey = getCanonicalMappingSource(normalizedSource, mappingType);
    const now = new Date().toISOString();
    const next = records.map((item) => {
        if (
            item.userId === userId
            && item.clientId === clientId
            && item.mappingType === mappingType
            && item.normalizedSource === sourceKey
        ) {
            return { ...item, lastUsedAt: now, updatedAt: now };
        }

        return item;
    });

    writeJson(NAME_MAPPINGS_KEY, next);
}
