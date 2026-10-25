import { callGemini } from '@/lib/GeminiService';
import { parseBankStatementRowsFromUnknown, parseBankStatementWorkbook } from './bankStatement';
import { normalizeNarration } from './normalize';
import type { BankTransactionRow } from './types';

export interface AiImportedInvoiceItem {
    name: string;
    qty: number;
    rate: number;
    amount: number;
    gstRate: number;
    hsnCode: string;
    unit: string;
}

export interface AiImportedInvoice {
    partyName: string;
    invoiceNumber: string;
    date: string;
    gstin: string;
    items: AiImportedInvoiceItem[];
    taxableAmount: number;
    gstAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    grandTotal: number;
    rawTextPreview: string;
}

type RecordLike = Record<string, unknown>;

interface InvoiceTaxBreakup {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
}

const MONTH_LOOKUP: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const EXCEL_SERIAL_MAX = 2958465;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const EXCEL_MIME_TYPES = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
];
const PDF_MIME_TYPES = ['application/pdf', 'application/x-pdf'];
const STANDARD_GST_RATES = [3, 5, 12, 18, 28];

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isNonEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
}

function hasMeaningfulNumber(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value) > 0.0001;
}

function nearlyEqual(left: number, right: number, tolerance = 0.01): boolean {
    return Math.abs(left - right) <= tolerance;
}

function normalizeTotalGstRate(value: unknown): number {
    const rate = round2(toNumber(value, 0));
    if (rate <= 0) {
        return 0;
    }

    if (STANDARD_GST_RATES.some((standardRate) => nearlyEqual(rate, standardRate))) {
        return rate;
    }

    const doubledRate = round2(rate * 2);
    if (STANDARD_GST_RATES.some((standardRate) => nearlyEqual(doubledRate, standardRate))) {
        return doubledRate;
    }

    return rate;
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const cleaned = String(value ?? '')
        .replace(/[(),]/g, '')
        .replace(/\u20B9/g, '')
        .replace(/rs\.?/gi, '')
        .replace(/%/g, '')
        .trim();

    if (!cleaned) {
        return fallback;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const maybeBuffer = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(encoding: string): string } } }).Buffer;

    if (maybeBuffer) {
        return maybeBuffer.from(bytes).toString('base64');
    }

    if (typeof btoa !== 'function') {
        throw new Error('Base64 encoding is unavailable in this environment');
    }

    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function readString(record: RecordLike, keys: string[]): string {
    for (const key of keys) {
        const value = record[key];
        if (!isNonEmptyValue(value)) continue;
        const text = String(value).trim();
        if (text) return text;
    }

    return '';
}

function readNumber(record: RecordLike, keys: string[]): number {
    for (const key of keys) {
        const value = record[key];
        if (!isNonEmptyValue(value)) continue;
        return round2(toNumber(value, 0));
    }

    return 0;
}

function buildNormalizedDate(year: number, month: number, day: number): string {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return '';
    }

    if (year < 100) {
        year += 2000;
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year
        || candidate.getUTCMonth() !== month - 1
        || candidate.getUTCDate() !== day
    ) {
        return '';
    }

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeExcelSerialDate(value: number): string {
    if (!Number.isFinite(value)) {
        return '';
    }

    const wholeDays = Math.floor(value);
    if (wholeDays <= 0 || wholeDays > EXCEL_SERIAL_MAX) {
        return '';
    }

    const utcDate = new Date(EXCEL_EPOCH_UTC_MS + wholeDays * MS_PER_DAY);
    return buildNormalizedDate(
        utcDate.getUTCFullYear(),
        utcDate.getUTCMonth() + 1,
        utcDate.getUTCDate()
    );
}

function parseMonthNamedDate(raw: string): string {
    const normalized = String(raw || '')
        .replace(/,/g, ' ')
        .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let match = normalized.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{2,4})(?:\s+.*)?$/);
    if (match) {
        const month = MONTH_LOOKUP[match[2].toLowerCase()];
        return month ? buildNormalizedDate(Number(match[3]), month, Number(match[1])) : '';
    }

    match = normalized.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})\s+(\d{2,4})(?:\s+.*)?$/);
    if (match) {
        const month = MONTH_LOOKUP[match[1].toLowerCase()];
        return month ? buildNormalizedDate(Number(match[3]), month, Number(match[2])) : '';
    }

    match = normalized.match(/^(\d{4})\s+([a-zA-Z]{3,9})\s+(\d{1,2})(?:\s+.*)?$/);
    if (match) {
        const month = MONTH_LOOKUP[match[2].toLowerCase()];
        return month ? buildNormalizedDate(Number(match[1]), month, Number(match[3])) : '';
    }

    return '';
}

function normalizeDateInput(value: unknown): string {
    if (typeof value === 'number') {
        return normalizeExcelSerialDate(value);
    }

    const raw = String(value ?? '').trim();
    if (!raw) return '';

    if (/^\d+(?:\.\d+)?$/.test(raw)) {
        const numericValue = Number(raw);
        if (raw.length <= 7) {
            const excelDate = normalizeExcelSerialDate(numericValue);
            if (excelDate) return excelDate;
        }
    }

    const isoDateTime = raw.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[T\s].*)?$/);
    if (isoDateTime) {
        return buildNormalizedDate(Number(isoDateTime[1]), Number(isoDateTime[2]), Number(isoDateTime[3]));
    }

    const compact = raw.match(/^(\d{8})$/);
    if (compact) {
        const digits = compact[1];
        const leadingYear = Number(digits.slice(0, 4));
        if (leadingYear >= 1900 && leadingYear <= 2100) {
            return buildNormalizedDate(leadingYear, Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
        }

        return buildNormalizedDate(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
    }

    const dayFirst = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+.*)?$/);
    if (dayFirst) {
        return buildNormalizedDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
    }

    return parseMonthNamedDate(raw);
}

function getFileExtension(fileName: string): string {
    const segments = String(fileName || '').toLowerCase().split('.');
    return segments.length > 1 ? segments[segments.length - 1] : '';
}

function getFileMimeType(file: File): string {
    return String(file?.type || '').toLowerCase();
}

export function isExcelFile(file: File): boolean {
    const extension = getFileExtension(file?.name || '');
    const mimeType = getFileMimeType(file);
    return extension === 'xlsx' || extension === 'xls' || EXCEL_MIME_TYPES.includes(mimeType);
}

export function isPdfFile(file: File): boolean {
    const extension = getFileExtension(file?.name || '');
    const mimeType = getFileMimeType(file);
    return extension === 'pdf' || PDF_MIME_TYPES.includes(mimeType);
}

export function isImageFile(file: File): boolean {
    const mimeType = getFileMimeType(file);
    if (mimeType.startsWith('image/')) return true;

    const extension = getFileExtension(file?.name || '');
    return IMAGE_EXTENSIONS.includes(extension);
}

function canOptimizeImageInBrowser(file: File): boolean {
    return (
        isImageFile(file)
        && typeof window !== 'undefined'
        && typeof document !== 'undefined'
        && typeof createImageBitmap === 'function'
        && typeof File !== 'undefined'
        && file instanceof File
    );
}

async function optimizeImageForOcr(file: File, maxSide = 1800, quality = 0.85): Promise<File> {
    if (!canOptimizeImageInBrowser(file)) {
        return file;
    }

    try {
        const bitmap = await createImageBitmap(file);
        const largestSide = Math.max(bitmap.width, bitmap.height);
        const scale = largestSide > maxSide ? maxSide / largestSide : 1;

        if (scale >= 1 && file.size <= 1500000) {
            bitmap.close();
            return file;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));

        const context = canvas.getContext('2d');
        if (!context) {
            bitmap.close();
            return file;
        }

        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', quality);
        });

        if (!blob || blob.size >= file.size) {
            return file;
        }

        const optimizedName = file.name.replace(/\.[^.]+$/, '') || 'document';
        return new File([blob], `${optimizedName}.jpg`, { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

async function buildGeminiAttachment(file: File): Promise<{ mimeType: string; dataBase64: string }> {
    const effectiveFile = isImageFile(file) ? await optimizeImageForOcr(file) : file;
    const buffer = await effectiveFile.arrayBuffer();

    return {
        mimeType: effectiveFile.type || (isPdfFile(effectiveFile) ? 'application/pdf' : 'image/jpeg'),
        dataBase64: toBase64(buffer),
    };
}

function normalizeInvoiceTaxes(rawItem: RecordLike): InvoiceTaxBreakup {
    const cgst = readNumber(rawItem, ['cgst_amount', 'cgst']);
    const sgst = readNumber(rawItem, ['sgst_amount', 'sgst']);
    const igst = readNumber(rawItem, ['igst_amount', 'igst']);
    const explicitTotal = readNumber(rawItem, ['gst_amount', 'tax_amount', 'gst_total', 'tax_total']);
    const componentTotal = round2(cgst + sgst + igst);

    return {
        cgst,
        sgst,
        igst,
        total: hasMeaningfulNumber(explicitTotal) ? explicitTotal : componentTotal,
    };
}

function getNormalizedItemAmount(rawItem: RecordLike, qty: number, explicitRate: number, itemTaxTotal: number): number {
    const explicitTaxableAmount = readNumber(rawItem, [
        'taxable_amount',
        'taxableValue',
        'amount_excluding_tax',
        'assessable_value',
        'net_amount',
        'netAmount',
    ]);
    if (hasMeaningfulNumber(explicitTaxableAmount)) {
        return explicitTaxableAmount;
    }

    const computedTaxableAmount = explicitRate > 0 && qty > 0 ? round2(explicitRate * qty) : 0;
    if (hasMeaningfulNumber(computedTaxableAmount)) {
        return computedTaxableAmount;
    }

    const explicitGrossAmount = readNumber(rawItem, ['gross_amount', 'line_total_including_tax', 'amount_including_tax']);
    if (hasMeaningfulNumber(explicitGrossAmount)) {
        if (hasMeaningfulNumber(itemTaxTotal) && explicitGrossAmount > itemTaxTotal) {
            return round2(explicitGrossAmount - itemTaxTotal);
        }
        return explicitGrossAmount;
    }

    const genericAmount = readNumber(rawItem, ['amount', 'total', 'line_total', 'value']);
    if (hasMeaningfulNumber(genericAmount)) {
        return genericAmount;
    }

    return 0;
}

function normalizeInvoiceItem(rawItem: unknown): AiImportedInvoiceItem | null {
    if (!rawItem || typeof rawItem !== 'object') {
        return null;
    }

    const record = rawItem as RecordLike;
    const quantity = round2(toNumber(
        record.qty
        ?? record.quantity
        ?? record.units
        ?? record.billed_qty
        ?? record.actual_qty
        ?? record.count,
        0
    ));
    const qty = quantity > 0 ? quantity : 1;
    const explicitRate = round2(toNumber(
        record.rate
        ?? record.price
        ?? record.unit_price
        ?? record.unitRate
        ?? record.unit_rate
        ?? record.price_per_unit,
        0
    ));
    const taxBreakup = normalizeInvoiceTaxes(record);
    const amount = getNormalizedItemAmount(record, qty, explicitRate, taxBreakup.total);
    const rate = explicitRate > 0 ? explicitRate : (qty > 0 && amount > 0 ? round2(amount / qty) : 0);

    let gstRate = normalizeTotalGstRate(readNumber(record, ['gst_percent', 'gst_rate', 'tax_rate', 'tax_percent']));
    if (!hasMeaningfulNumber(gstRate) && amount > 0 && taxBreakup.total > 0) {
        gstRate = normalizeTotalGstRate(round2((taxBreakup.total / amount) * 100));
    }

    const item: AiImportedInvoiceItem = {
        name: readString(record, ['name', 'item_name', 'description', 'product_name', 'product', 'item', 'particular', 'particulars', 'material', 'service_name']),
        qty,
        rate,
        amount,
        gstRate,
        hsnCode: readString(record, ['hsn_code', 'hsn', 'sac', 'hsn_sac']),
        unit: readString(record, ['unit', 'uom', 'unit_name']) || 'Nos',
    };

    if (!item.name && !hasMeaningfulNumber(item.amount) && !hasMeaningfulNumber(taxBreakup.total)) {
        return null;
    }

    return item;
}

function normalizeInvoiceItems(rawItems: unknown[]): AiImportedInvoiceItem[] {
    return (rawItems || [])
        .map(normalizeInvoiceItem)
        .filter((item): item is AiImportedInvoiceItem => Boolean(item));
}

function pickInvoiceItemCandidates(raw: RecordLike): unknown[] {
    const candidateKeys = ['items', 'line_items', 'invoice_items', 'product_lines', 'products', 'particulars', 'rows', 'entries', 'table_rows'];

    for (const key of candidateKeys) {
        const value = raw[key];
        if (Array.isArray(value) && value.length > 0) {
            return value;
        }
    }

    return [];
}

async function extractInvoiceLineItemsFallback(
    attachment: { mimeType: string; dataBase64: string },
    summaryHint: { partyName?: string; invoiceNumber?: string; grandTotal?: number }
): Promise<AiImportedInvoiceItem[]> {
    try {
        const fallbackResult = await callGemini({
            expectJson: true,
            temperature: 0,
            fallbackModels: ['gemini-3-pro-preview'],
            systemPrompt: [
                'You are an expert invoice line-item extraction engine for Indian invoices.',
                'Focus only on billed line items visible in the invoice table.',
                'Return strict JSON only.',
                'Schema:',
                '{"items":[{"name":"","qty":0,"rate":0,"amount":0,"gst_percent":0,"hsn_code":"","unit":""}]}',
                'Rules:',
                '- Return one object per visible billed row.',
                '- Ignore headers, totals, subtotals, tax summary rows, freight summary rows, and payment terms.',
                '- Keep numeric fields as numbers only.',
                '- If qty or rate is unclear, still capture name and amount when visible.',
                '- Do not invent hidden rows.',
                '- Return JSON only with no markdown or commentary.'
            ].join(' '),
            userPrompt: [
                'Extract the invoice line items only from this document.',
                summaryHint.partyName ? `Party: ${summaryHint.partyName}` : '',
                summaryHint.invoiceNumber ? `Invoice number: ${summaryHint.invoiceNumber}` : '',
                summaryHint.grandTotal ? `Grand total seen earlier: ${summaryHint.grandTotal}` : '',
                'Return JSON only in the required schema.'
            ].filter(Boolean).join('\n'),
            attachments: [attachment],
        });

        const fallbackRaw = (fallbackResult.json && typeof fallbackResult.json === 'object' ? fallbackResult.json : {}) as RecordLike;
        return normalizeInvoiceItems(pickInvoiceItemCandidates(fallbackRaw));
    } catch {
        return [];
    }
}

function buildFallbackInvoiceItems(taxableAmount: number, gstAmount: number): AiImportedInvoiceItem[] {
    if (!hasMeaningfulNumber(taxableAmount)) {
        return [];
    }

    return [{
        name: 'Imported Item',
        qty: 1,
        rate: taxableAmount,
        amount: taxableAmount,
        gstRate: hasMeaningfulNumber(gstAmount) ? round2((gstAmount / taxableAmount) * 100) : 0,
        hsnCode: '',
        unit: 'Nos',
    }];
}

function sumInvoiceItemAmounts(items: AiImportedInvoiceItem[]): number {
    return round2(items.reduce((sum, item) => sum + round2(item.amount), 0));
}

function sanitizeInvoiceSummary(raw: RecordLike, items: AiImportedInvoiceItem[]) {
    const parsedTaxableAmount = readNumber(raw, ['taxable_amount', 'taxableValue', 'subtotal', 'assessable_value']);
    const parsedCgstAmount = readNumber(raw, ['cgst_total', 'cgst_amount', 'cgst']);
    const parsedSgstAmount = readNumber(raw, ['sgst_total', 'sgst_amount', 'sgst']);
    const parsedIgstAmount = readNumber(raw, ['igst_total', 'igst_amount', 'igst']);
    const parsedGstAmount = readNumber(raw, ['gst_total', 'gst_amount', 'tax_total']);
    const parsedGrandTotal = readNumber(raw, ['grand_total', 'total_amount', 'invoice_total', 'gross_total']);

    const derivedTaxableAmount = sumInvoiceItemAmounts(items);
    const taxableAmount = hasMeaningfulNumber(parsedTaxableAmount)
        ? parsedTaxableAmount
        : derivedTaxableAmount;

    const breakupGstAmount = round2(parsedCgstAmount + parsedSgstAmount + parsedIgstAmount);
    const gstAmount = hasMeaningfulNumber(parsedGstAmount)
        ? parsedGstAmount
        : breakupGstAmount;

    const grandTotal = hasMeaningfulNumber(parsedGrandTotal)
        ? parsedGrandTotal
        : round2(taxableAmount + gstAmount);

    return {
        taxableAmount,
        cgstAmount: parsedCgstAmount,
        sgstAmount: parsedSgstAmount,
        igstAmount: parsedIgstAmount,
        gstAmount,
        grandTotal,
    };
}

export async function extractInvoiceDocument(file: File): Promise<AiImportedInvoice> {
    if (!isPdfFile(file) && !isImageFile(file)) {
        throw new Error('Upload a PDF or image invoice');
    }

    const attachment = await buildGeminiAttachment(file);
    const result = await callGemini({
        expectJson: true,
        temperature: 0,
        fallbackModels: ['gemini-3-pro-preview'],
        systemPrompt: [
            'You are an expert invoice OCR and data extraction engine for Indian businesses.',
            'Read the attached invoice or purchase bill and return strict JSON only.',
            'Schema:',
            '{"party_name":"","invoice_number":"","date":"YYYY-MM-DD","gstin":"","items":[{"name":"","qty":0,"rate":0,"amount":0,"gst_percent":0,"hsn_code":"","unit":""}],"taxable_amount":0,"cgst_total":0,"sgst_total":0,"igst_total":0,"gst_total":0,"grand_total":0}.',
            'Rules:',
            '- taxable_amount must exclude GST.',
            '- If an item tax total is present, capture it via gst_percent or the tax breakup.',
            '- gst_total should equal cgst_total + sgst_total + igst_total when breakup is visible.',
            '- grand_total should include taxable_amount + gst_total.',
            '- If line items are visible, items array must include one object per billed row.',
            '- Do not merge multiple visible invoice rows into one summary item.',
            '- Amounts must be numeric, not strings with currency symbols.',
            '- date must be YYYY-MM-DD when possible.',
            '- Do not invent missing values when the document is unclear.',
            '- Return JSON only with no markdown or commentary.'
        ].join(' '),
        userPrompt: [
            'Extract invoice details from this document and return JSON only.',
            'Ensure taxable_amount excludes GST, gst_total reflects visible tax breakup, grand_total includes taxable_amount plus gst_total, and items includes all visible billed rows.'
        ].join(' '),
        attachments: [attachment],
    });

    const raw = (result.json && typeof result.json === 'object' ? result.json : {}) as RecordLike;
    const primaryItems = normalizeInvoiceItems(pickInvoiceItemCandidates(raw));
    const normalizedItems = primaryItems.length > 0
        ? primaryItems
        : await extractInvoiceLineItemsFallback(attachment, {
            partyName: readString(raw, ['party_name', 'partyName', 'vendor_name', 'supplier_name', 'customer_name']),
            invoiceNumber: readString(raw, ['invoice_number', 'invoiceNumber', 'bill_no', 'bill_number']),
            grandTotal: readNumber(raw, ['grand_total', 'total_amount', 'invoice_total', 'gross_total']),
        });
    const summary = sanitizeInvoiceSummary(raw, normalizedItems);
    const items = normalizedItems.length > 0
        ? normalizedItems
        : buildFallbackInvoiceItems(summary.taxableAmount, summary.gstAmount);

    return {
        partyName: readString(raw, ['party_name', 'partyName', 'vendor_name', 'supplier_name', 'customer_name']),
        invoiceNumber: readString(raw, ['invoice_number', 'invoiceNumber', 'bill_no', 'bill_number']),
        date: normalizeDateInput(raw.date ?? raw.invoice_date ?? raw.bill_date),
        gstin: readString(raw, ['gstin', 'party_gstin']).toUpperCase(),
        items,
        taxableAmount: summary.taxableAmount,
        gstAmount: summary.gstAmount,
        cgstAmount: summary.cgstAmount,
        sgstAmount: summary.sgstAmount,
        igstAmount: summary.igstAmount,
        grandTotal: summary.grandTotal,
        rawTextPreview: result.text || '',
    };
}

function normalizeFingerprintNarration(row: Pick<BankTransactionRow, 'narration' | 'normalizedNarration'>): string {
    const baseNarration = String(row.normalizedNarration || row.narration || '').trim();
    return normalizeNarration(baseNarration);
}

function roundFingerprintAmount(value: number): string {
    return round2(Math.abs(Number(value) || 0)).toFixed(2);
}

function buildRowFingerprint(row: Pick<BankTransactionRow, 'id' | 'date' | 'narration' | 'normalizedNarration' | 'debit' | 'credit'>): string {
    const normalizedDate = normalizeDateInput(row.date) || String(row.date || '').trim();
    const narrationKey = normalizeFingerprintNarration(row);
    const debitKey = roundFingerprintAmount(row.debit);
    const creditKey = roundFingerprintAmount(row.credit);

    if (!narrationKey) {
        return `${row.id || 'row'}|${normalizedDate}|D:${debitKey}|C:${creditKey}`;
    }

    return `${normalizedDate}|${narrationKey}|D:${debitKey}|C:${creditKey}`;
}

export function dedupeBankTransactions(rows: BankTransactionRow[]): BankTransactionRow[] {
    const seen = new Set<string>();
    const deduped: BankTransactionRow[] = [];

    rows.forEach((row) => {
        const fingerprint = buildRowFingerprint(row);
        if (seen.has(fingerprint)) return;

        seen.add(fingerprint);
        deduped.push({
            ...row,
            normalizedNarration: normalizeFingerprintNarration(row),
            debit: round2(Math.abs(Number(row.debit) || 0)),
            credit: round2(Math.abs(Number(row.credit) || 0)),
            id: `row-${deduped.length + 1}`,
        });
    });

    return deduped;
}

export async function extractBankStatementTransactions(file: File): Promise<BankTransactionRow[]> {
    if (isExcelFile(file)) {
        return parseBankStatementWorkbook(await file.arrayBuffer());
    }

    if (!isPdfFile(file) && !isImageFile(file)) {
        throw new Error('Upload bank statement as Excel, PDF, or image');
    }

    const attachment = await buildGeminiAttachment(file);
    const response = await callGemini({
        expectJson: true,
        temperature: 0,
        fallbackModels: ['gemini-3-pro-preview'],
        systemPrompt: [
            'You extract bank transactions from bank statement documents.',
            'Return valid JSON only.',
            'Required output schema: {"transactions":[{"date":"YYYY-MM-DD","narration":"string","debit":number,"credit":number}]}',
            'If amount is debit, set credit as 0. If amount is credit, set debit as 0.',
            'Exclude opening balance, closing balance, totals, headers, footers, summaries, and non-transaction rows.',
            'Do not mistake running balance or balance columns as debit or credit amounts.',
            'Return one object per actual transaction row only.',
            'Do not include markdown, explanation, or extra keys.'
        ].join(' '),
        userPrompt: [
            'Read the attached bank statement and extract only real transaction rows.',
            'Ignore opening balance, closing balance, total rows, headers, footers, and balance columns.',
            'Return JSON strictly in the required schema and use 0 for missing debit or credit values.'
        ].join(' '),
        attachments: [attachment],
    });

    const parsedRows = parseBankStatementRowsFromUnknown(response.json ?? response.text);
    if (parsedRows.length === 0) {
        throw new Error('No usable rows found in this statement');
    }

    return parsedRows;
}

