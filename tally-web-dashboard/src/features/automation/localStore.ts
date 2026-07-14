import type { LedgerMappingRecord, InvoiceDraft } from './types';

const LEDGER_KEY = 'automation_local_ledger_mappings_v1';
const INVOICE_KEY = 'automation_local_invoices_v1';
const LEDGER_MASTER_KEY = 'automation_local_ledgers_v1';

type LocalLedgerRecord = LedgerMappingRecord;

export type LocalInvoiceRecord = InvoiceDraft & {
    userId: string;
    clientId: string;
    createdAt: string;
    $id?: string;
};

export type LocalLedgerMasterRecord = {
    userId: string;
    clientId: string;
    ledgers: string[];
    updatedAt: string;
};

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

export function getLocalLedgerMappings(userId: string, clientId: string): LocalLedgerRecord[] {
    const records = readJson<LocalLedgerRecord[]>(LEDGER_KEY, []);
    return records.filter((item) => item.userId === userId && item.clientId === clientId);
}

export function saveLocalLedgerMapping(record: LocalLedgerRecord) {
    const records = readJson<LocalLedgerRecord[]>(LEDGER_KEY, []);
    const exists = records.some(
        (item) =>
            item.userId === record.userId
            && item.clientId === record.clientId
            && item.normalizedKeyword === record.normalizedKeyword
            && item.ledgerName === record.ledgerName
    );

    if (exists) return;

    records.unshift(record);
    writeJson(LEDGER_KEY, records.slice(0, 5000));
}

export function mergeLedgerMappings(
    primary: LocalLedgerRecord[],
    secondary: LocalLedgerRecord[]
): LocalLedgerRecord[] {
    const result: LocalLedgerRecord[] = [];
    const seen = new Set<string>();

    [...primary, ...secondary].forEach((item) => {
        const key = `${item.userId}|${item.clientId}|${item.normalizedKeyword}|${item.ledgerName}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push(item);
    });

    return result;
}

export function getLocalInvoices(userId: string, clientId: string): LocalInvoiceRecord[] {
    const records = readJson<LocalInvoiceRecord[]>(INVOICE_KEY, []);
    return records.filter((item) => item.userId === userId && item.clientId === clientId);
}

export function saveLocalInvoice(record: LocalInvoiceRecord) {
    const records = readJson<LocalInvoiceRecord[]>(INVOICE_KEY, []);
    const duplicate = records.some(
        (item) =>
            item.userId === record.userId
            && item.clientId === record.clientId
            && item.invoiceNumber === record.invoiceNumber
            && item.date === record.date
    );

    if (!duplicate) {
        records.unshift(record);
        writeJson(INVOICE_KEY, records.slice(0, 10000));
    }
}

export function mergeInvoices(primary: LocalInvoiceRecord[], secondary: LocalInvoiceRecord[]) {
    const merged: LocalInvoiceRecord[] = [];
    const seen = new Set<string>();

    [...primary, ...secondary].forEach((item) => {
        const key = `${item.userId}|${item.clientId}|${item.invoiceNumber}|${item.date}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(item);
    });

    return merged;
}

export function getLocalLedgers(userId: string, clientId: string): string[] {
    const records = readJson<LocalLedgerMasterRecord[]>(LEDGER_MASTER_KEY, []);
    const found = records.find((item) => item.userId === userId && item.clientId === clientId);
    return found?.ledgers || [];
}

export function saveLocalLedgers(userId: string, clientId: string, ledgers: string[]) {
    const records = readJson<LocalLedgerMasterRecord[]>(LEDGER_MASTER_KEY, []);
    const sanitized = Array.from(
        new Set((ledgers || []).map((item) => String(item || '').trim()).filter(Boolean))
    );

    if (sanitized.length === 0) return;

    const next: LocalLedgerMasterRecord[] = [
        {
            userId,
            clientId,
            ledgers: sanitized,
            updatedAt: new Date().toISOString()
        },
        ...records.filter((item) => !(item.userId === userId && item.clientId === clientId))
    ];

    writeJson(LEDGER_MASTER_KEY, next.slice(0, 200));
}
