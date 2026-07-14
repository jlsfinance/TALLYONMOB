import { useState, useEffect, useRef, useMemo, type ChangeEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import {
    Sparkles, Send, Mic, MicOff, FileText, Plus, Calendar,
    User, IndianRupee, Package, X, Zap, Bot, RefreshCw, Upload
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import SmartMappingDialog, { type SmartMappingDraft } from '@/components/mappings/SmartMappingDialog';
import { resolveMappedName } from '@/features/nameMappings/resolver';
import { getCanonicalMappingSource, getLocalNameMappings, upsertLocalNameMapping } from '@/features/nameMappings/store';
import type { MappingTargetOption, NameMappingRecord, NameMappingType } from '@/features/nameMappings/types';
import type { BankPreviewRow, LedgerMappingRecord } from '@/features/automation/types';
import { deriveMappingKeyword, manualLedgerSuggestion, suggestLedgerHybrid } from '@/features/automation/ledgerMatcher';
import { dedupeBankTransactions, extractBankStatementTransactions, extractInvoiceDocument, type AiImportedInvoice } from '@/features/automation/documentIntake';

type VoucherType = 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | 'Journal';
type EntrySource = 'text' | 'invoice' | 'bank';
type BankSuggestionStage = BankPreviewRow['suggestion']['stage'] | 'prefix';
type BankReviewRow = Omit<BankPreviewRow, 'suggestion'> & {
    suggestion: {
        ledgerName: string;
        confidence: number;
        reason: string;
        stage: BankSuggestionStage;
    };
    draftLedgerName: string;
};

interface EntryForm {
    voucherType: VoucherType;
    partyName: string;
    amount: string;
    date: string;
    narration: string;
    items: {
        name: string;
        qty: string;
        rate: string;
        amount: string;
        hsnCode: string;
        gstRate: string;
        unit: string;
    }[];
}

interface PendingMappingMemory {
    mappingType: NameMappingType;
    sourceText: string;
    mappedDisplayName: string;
    mappedEntityType: 'ledger' | 'stock_item';
    mappedEntityId?: string;
    confidence: number;
    reason: string;
}

interface SubmitMappingContext {
    formSnapshot: EntryForm;
    autoMappings: PendingMappingMemory[];
}

type MappingDialogMode = 'review' | 'submit';

const VOUCHER_TYPES: { key: VoucherType; label: string; icon: any; color: string }[] = [
    { key: 'Sales', label: 'Sales Invoice', icon: FileText, color: 'emerald' },
    { key: 'Purchase', label: 'Purchase', icon: Package, color: 'orange' },
    { key: 'Receipt', label: 'Receipt', icon: IndianRupee, color: 'blue' },
    { key: 'Payment', label: 'Payment', icon: IndianRupee, color: 'red' },
    { key: 'Journal', label: 'Journal', icon: FileText, color: 'purple' },
];

const AI_TEMPLATES = [
    { label: 'Sales Entry', prompt: 'Sold to [Party] for Rs [Amount]', type: 'Sales' as VoucherType },
    { label: 'Purchase Entry', prompt: 'Purchased from [Supplier] for Rs [Amount]', type: 'Purchase' as VoucherType },
    { label: 'Receipt', prompt: 'Received Rs [Amount] from [Party]', type: 'Receipt' as VoucherType },
    { label: 'Payment', prompt: 'Paid Rs [Amount] to [Party]', type: 'Payment' as VoucherType },
];

const ENTRY_SOURCE_OPTIONS: { key: EntrySource; label: string; hint: string; icon: any }[] = [
    { key: 'text', label: 'Text / Voice', hint: 'Type or bolo', icon: Bot },
    { key: 'invoice', label: 'Invoice Photo', hint: 'Bill / PDF import', icon: FileText },
    { key: 'bank', label: 'Bank Statement', hint: 'Statement to vouchers', icon: IndianRupee },
];

const MAX_BANK_MATCH_CALLS = 40;
const BANK_UPLOAD_ACCEPT = '.xlsx,.xls,application/pdf,image/png,image/jpeg,image/jpg,image/webp';

const createEmptyItem = () => ({
    name: '',
    qty: '1',
    rate: '',
    amount: '',
    hsnCode: '',
    gstRate: '',
    unit: 'Nos'
});

const toNumberSafe = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseStateCodeFromGstin = (gstin: unknown) => {
    const text = String(gstin || '').trim().toUpperCase();
    const match = text.match(/^(\d{2})/);
    return match ? match[1] : '';
};

const normalizeStateKey = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const inferInterStateSupply = (company: any, party: any) => {
    const companyStateCode = parseStateCodeFromGstin(company?.gstin);
    const partyStateCode = parseStateCodeFromGstin(party?.gstin);

    if (companyStateCode && partyStateCode) {
        return companyStateCode !== partyStateCode;
    }

    const companyState = normalizeStateKey(company?.state);
    const partyState = normalizeStateKey(party?.state);

    if (companyState && partyState) {
        return companyState !== partyState;
    }

    return false;
};

export default function AIEntryPage() {
    const { selectedCompany, user } = useAuth() as any;
    const [aiInput, setAiInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [ledgerSuggestions, setLedgerSuggestions] = useState<string[]>([]);
    const [stockSuggestions, setStockSuggestions] = useState<string[]>([]);
    const [stockMetaByName, setStockMetaByName] = useState<Record<string, any>>({});
    const [stockMetaByHsn, setStockMetaByHsn] = useState<Record<string, any>>({});
    const [ledgerMasterByName, setLedgerMasterByName] = useState<Record<string, { id?: string; name: string }>>({});
    const [stockMasterByName, setStockMasterByName] = useState<Record<string, { id?: string; name: string }>>({});
    const [smartMappings, setSmartMappings] = useState<NameMappingRecord[]>([]);
    const [mappingDrafts, setMappingDrafts] = useState<SmartMappingDraft[]>([]);
    const [pendingSubmitContext, setPendingSubmitContext] = useState<SubmitMappingContext | null>(null);
    const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
    const [isApplyingMappings, setIsApplyingMappings] = useState(false);
    const [mappingDialogMode, setMappingDialogMode] = useState<MappingDialogMode>('submit');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [focusedItemIndex, setFocusedItemIndex] = useState<number | null>(null);
    const [recentEntries, setRecentEntries] = useState<any[]>([]);
    const [form, setForm] = useState<EntryForm>({
        voucherType: 'Sales',
        partyName: '',
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        narration: '',
        items: [createEmptyItem()],
    });
    const [entrySource, setEntrySource] = useState<EntrySource>('text');
    const [importedInvoice, setImportedInvoice] = useState<AiImportedInvoice | null>(null);
    const [documentLabel, setDocumentLabel] = useState('');
    const [bankRows, setBankRows] = useState<BankReviewRow[]>([]);
    const [activeBankRowId, setActiveBankRowId] = useState<string | null>(null);
    const [isImportingDocument, setIsImportingDocument] = useState(false);
    const [isMatchingBankRows, setIsMatchingBankRows] = useState(false);
    const [isQueueingBankRows, setIsQueueingBankRows] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadMasterSuggestions();
            loadRecentEntries();
        }
    }, [selectedCompany]);

    useEffect(() => {
        if (selectedCompany?.id && user?.id) {
            loadSmartMappings();
            return;
        }

        setSmartMappings([]);
    }, [selectedCompany?.id, user?.id]);

    const toUniqueNames = (values: any[]): string[] => {
        const byLower = new Map<string, string>();
        for (const raw of values || []) {
            const name = String(raw || '').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (!byLower.has(key)) byLower.set(key, name);
        }
        return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b));
    };
    const round2 = (value: number) => {
        if (!Number.isFinite(value)) return 0;
        return Math.round((value + Number.EPSILON) * 100) / 100;
    };

    const isNonBusinessLedger = (name: string) => {
        const lower = String(name || '').trim().toLowerCase();
        if (!lower) return true;
        return (
            lower.includes('cgst')
            || lower.includes('sgst')
            || lower.includes('igst')
            || lower.includes('gst')
            || lower.includes('tax')
            || lower.includes('cess')
            || lower.includes('round')
            || lower.includes('discount')
            || lower.includes('cash')
            || lower.includes('bank')
            || lower.includes('debtor')
            || lower.includes('creditor')
            || lower.includes('sundry')
        );
    };

    const pickBusinessLedgerFromPool = (type: VoucherType, pool: string[], partyName: string): string | null => {
        const normalizedParty = String(partyName || '').trim().toLowerCase();
        const keywords = type === 'Sales' ? ['sales', 'sale'] : ['purchase', 'purchases', 'buy'];

        const filtered = pool
            .map(name => String(name || '').trim())
            .filter(Boolean)
            .filter(name => !normalizedParty || name.toLowerCase() !== normalizedParty)
            .filter(name => !isNonBusinessLedger(name));

        const keywordMatch = filtered.find(name => keywords.some(k => name.toLowerCase().includes(k)));
        if (keywordMatch) return keywordMatch;

        return filtered[0] || null;
    };

    const resolveBusinessLedger = (type: VoucherType, partyName: string): string | null => {
        const fromMaster = pickBusinessLedgerFromPool(type, ledgerSuggestions, partyName);
        if (fromMaster) return fromMaster;

        const fromRecent = toUniqueNames(
            recentEntries.flatMap((entry: any) => {
                const data = entry?.voucher_data || {};
                const typeText = String(data?.voucher_type_name || entry?.transaction_type || '').toLowerCase();
                if (typeText !== type.toLowerCase()) return [];

                const direct = type === 'Sales'
                    ? (data?.sales_ledger_name || data?.sales_ledger || data?.salesLedgerName)
                    : (data?.purchase_ledger_name || data?.purchase_ledger || data?.purchaseLedgerName);

                const ledgerEntries = Array.isArray(data?.ledger_entries) ? data.ledger_entries : [];
                const entryNames = ledgerEntries
                    .map((row: any) => row?.ledger_name || row?.ledgerName || row?.name)
                    .filter(Boolean);

                return [direct, ...entryNames];
            })
        );

        return pickBusinessLedgerFromPool(type, fromRecent, partyName);
    };

    const queryErrorText = (error: any) =>
        `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

    const isMissingColumnError = (error: any, table: string, column: string) => {
        const text = queryErrorText(error);
        return (
            String(error?.code || '') === '42703'
            || text.includes(`column ${table}.${column}`)
            || text.includes(`'${column}' column`)
        );
    };

    const isMissingRelationError = (error: any, relation: string) => {
        const text = queryErrorText(error);
        return (
            String(error?.code || '') === '42P01'
            || String(error?.status || '') === '404'
            || text.includes(`relation "${relation}" does not exist`)
            || text.includes(relation)
        );
    };

    const resolveRows = async (query: any, optionalRelation?: string) => {
        const { data, error } = await query;
        if (error) {
            if (optionalRelation && isMissingRelationError(error, optionalRelation)) {
                return [];
            }
            throw error;
        }
        return data || [];
    };

    const fetchAllRows = async (
        buildQuery: (fromIndex: number, toIndex: number) => any,
        options: { pageSize?: number; optionalRelation?: string; maxRows?: number } = {}
    ) => {
        const { pageSize = 1000, optionalRelation, maxRows = Number.POSITIVE_INFINITY } = options;
        const rows: any[] = [];

        for (let fromIndex = 0; ; fromIndex += pageSize) {
            const remaining = Number.isFinite(maxRows) ? Math.max(maxRows - rows.length, 0) : pageSize;
            if (remaining <= 0) break;

            const batchSize = Number.isFinite(maxRows) ? Math.min(pageSize, remaining) : pageSize;
            const batch = await resolveRows(buildQuery(fromIndex, fromIndex + batchSize - 1), optionalRelation);
            rows.push(...batch);
            if (batch.length < batchSize) break;
        }

        return rows;
    };

    const fetchRowsBestEffort = async (
        label: string,
        buildQuery: (fromIndex: number, toIndex: number) => any,
        options: { pageSize?: number; optionalRelation?: string; maxRows?: number } = {}
    ) => {
        try {
            return await fetchAllRows(buildQuery, options);
        } catch (error) {
            console.warn(`Failed to load ${label} for AI entry`, error);
            return [];
        }
    };

    const normalizeEffectiveGstRate = (value: unknown) => {
        const rate = round2(toNumberSafe(value));
        if (rate <= 0) return 0;

        const standardRates = [3, 5, 12, 18, 28];
        if (standardRates.includes(rate)) return rate;

        const doubledRate = round2(rate * 2);
        if (standardRates.includes(doubledRate)) return doubledRate;

        return rate;
    };

    const formatGstRateInput = (value: unknown) => {
        const rate = normalizeEffectiveGstRate(value);
        return rate > 0 ? String(rate) : '';
    };

    const normalizeHistoricalGstRate = (value: unknown) => normalizeEffectiveGstRate(value);

    const mergeStockMetaRow = (
        metaMap: Record<string, any>,
        hsnAccumulator: Record<string, { rates: number[]; unit: string; hsn_code: string }>,
        row: any,
        useMasterRate = false
    ) => {
        const nameKey = getStockRowDisplayName(row).toLowerCase();
        const hsnCode = String(row?.hsn_code || row?.hsn || row?.HsnCode || '').trim();
        const hsnKey = hsnCode.toLowerCase();
        const gstRateSource = row?.gst_rate ?? row?.tax_rate ?? row?.gstRate ?? row?.taxRate ?? row?.tax_percent ?? row?.gst_percent ?? 0;
        const gstRate = useMasterRate ? round2(toNumberSafe(gstRateSource)) : normalizeHistoricalGstRate(gstRateSource);
        const unit = String(row?.unit || row?.base_unit || row?.Unit || '').trim();
        const rate = round2(toNumberSafe(row?.rate ?? row?.unit_price ?? row?.Rate));

        if (nameKey) {
            const existing = metaMap[nameKey] || { hsn_code: '', gst_rate: 0, unit: 'Nos', rate: 0 };
            const existingUnit = String(existing.unit || '').trim();
            const existingHsn = String(existing.hsn_code || '').trim();
            const existingRate = round2(toNumberSafe(existing.rate));
            const existingGstRate = round2(toNumberSafe(existing.gst_rate));

            metaMap[nameKey] = {
                hsn_code: existingHsn || hsnCode,
                gst_rate: existingGstRate > 0 ? existingGstRate : gstRate,
                unit: (existingUnit && existingUnit !== 'Nos') ? existingUnit : (unit || existingUnit || 'Nos'),
                rate: existingRate > 0 ? existingRate : rate,
            };
        }

        if (hsnKey) {
            const entry = hsnAccumulator[hsnKey] || {
                rates: [],
                unit: unit || 'Nos',
                hsn_code: hsnCode,
            };

            if (gstRate > 0 && !entry.rates.includes(gstRate)) {
                entry.rates.push(gstRate);
            }

            if ((!entry.unit || entry.unit === 'Nos') && unit) {
                entry.unit = unit;
            }

            if (!entry.hsn_code) {
                entry.hsn_code = hsnCode;
            }

            hsnAccumulator[hsnKey] = entry;
        }
    };

    const selectLedgerMaybeSingle = async (
        buildQuery: (fields: string) => any
    ) => {
        const fieldAttempts = ['*', 'id, gstin, state', 'id, gstin', 'id'];
        let lastResult: any = null;

        for (const fields of fieldAttempts) {
            const result = await buildQuery(fields);
            lastResult = result;

            if (!result?.error) {
                if (result?.data && typeof result.data === 'object' && !Array.isArray(result.data) && !('state' in result.data)) {
                    result.data = { ...result.data, state: '' };
                }
                return result;
            }

            const isFieldMismatch = isMissingColumnError(result.error, 'ledgers', 'state')
                || isMissingColumnError(result.error, 'ledgers', 'gstin');

            if (!isFieldMismatch) {
                return result;
            }
        }

        return lastResult;
    };

    const getStockRowDisplayName = (row: any) => String(row?.name || row?.stock_item_name || row?.item_name || row?.itemName || '').trim();

    const fetchStockItemRows = async (companyId: string) => {
        try {
            return await fetchAllRows((fromIndex, toIndex) =>
                (supabase as any)
                    .from('stock_items')
                    .select('*')
                    .eq('company_id', companyId)
                    .order('id', { ascending: true })
                    .range(fromIndex, toIndex),
                { optionalRelation: 'stock_items', pageSize: 500, maxRows: 2000 }
            );
        } catch (error) {
            if (isMissingRelationError(error, 'stock_items')) {
                return [];
            }
            console.warn('Failed stock_items query for AI entry', error);
            return [];
        }
    };

    const fetchVoucherStockEntryRows = async (companyId: string) => {
        try {
            return await fetchAllRows((fromIndex, toIndex) =>
                (supabase as any)
                    .from('voucher_stock_entries')
                    .select('*')
                    .eq('company_id', companyId)
                    .order('id', { ascending: true })
                    .range(fromIndex, toIndex),
                { optionalRelation: 'voucher_stock_entries', pageSize: 500, maxRows: 2500 }
            );
        } catch (error) {
            if (isMissingRelationError(error, 'voucher_stock_entries')) {
                return [];
            }
            console.warn('Failed voucher_stock_entries query for AI entry', error);
            return [];
        }
    };

    const extractPendingItemRows = (rows: any[]) => {
        const extracted: any[] = [];

        for (const row of rows || []) {
            const voucherData = row?.voucher_data;
            const items = Array.isArray(voucherData?.items) ? voucherData.items : [];

            for (const item of items) {
                const name = String(item?.name || item?.stock_item_name || item?.item_name || '').trim();
                if (!name) continue;

                extracted.push({
                    id: row?.id ? `${row.id}:${name}` : name,
                    name,
                    stock_item_name: name,
                    item_name: name,
                    hsn_code: item?.hsn_code ?? item?.hsn ?? item?.hsnCode ?? '',
                    gst_rate: item?.gst_rate ?? item?.tax_rate ?? item?.gst_percent ?? item?.gstRate ?? 0,
                    tax_rate: item?.tax_rate ?? item?.gst_rate ?? item?.gst_percent ?? item?.gstRate ?? 0,
                    unit: item?.unit ?? item?.base_unit ?? '',
                    rate: item?.rate ?? item?.unit_price ?? 0,
                    amount: item?.amount ?? 0,
                });
            }
        }

        return extracted;
    };

    const resolveStockMeta = (name: unknown, hsnCode?: unknown) => {
        const nameKey = String(name || '').trim().toLowerCase();
        const hsnKey = String(hsnCode || '').trim().toLowerCase();

        const exactMeta = nameKey ? stockMetaByName[nameKey] : null;
        if (exactMeta) {
            return exactMeta;
        }

        if (nameKey) {
            const prefixMatches = stockSuggestions.filter(candidate =>
                candidate.toLowerCase().startsWith(nameKey)
            );

            if (prefixMatches.length === 1) {
                const matchedMeta = stockMetaByName[prefixMatches[0].toLowerCase()];
                if (matchedMeta) {
                    return matchedMeta;
                }
            }
        }

        if (hsnKey) {
            return stockMetaByHsn[hsnKey] || {};
        }

        return {};
    };

    const loadMasterSuggestions = async () => {
        const companyId = selectedCompany?.id;
        if (!companyId) return;

        try {
            const ledgerRows = await fetchRowsBestEffort('ledger masters', (fromIndex, toIndex) =>
                (supabase as any)
                    .from('ledgers')
                    .select('id, name')
                    .eq('company_id', companyId)
                    .order('id', { ascending: true })
                    .range(fromIndex, toIndex),
                { pageSize: 500, maxRows: 2500 }
            );

            const voucherPartyRows = await fetchRowsBestEffort('voucher parties', (fromIndex, toIndex) =>
                (supabase as any)
                    .from('vouchers')
                    .select('id, party_name')
                    .eq('company_id', companyId)
                    .not('party_name', 'is', null)
                    .order('id', { ascending: true })
                    .range(fromIndex, toIndex),
                { pageSize: 500, maxRows: 2000 }
            );

            const stockItemRows = await fetchStockItemRows(companyId);
            const stockEntryRows = await fetchVoucherStockEntryRows(companyId);
            const pendingVoucherRows = await fetchRowsBestEffort('pending transaction item history', (fromIndex, toIndex) =>
                (supabase as any)
                    .from('pending_transactions')
                    .select('id, voucher_data')
                    .eq('company_id', companyId)
                    .not('voucher_data', 'is', null)
                    .order('created_at', { ascending: false })
                    .range(fromIndex, toIndex),
                { optionalRelation: 'pending_transactions', pageSize: 200, maxRows: 600 }
            );
            const pendingItemRows = extractPendingItemRows(pendingVoucherRows);

            const ledgerNames = toUniqueNames([
                ...ledgerRows.map((row: any) => row?.name),
                ...voucherPartyRows.map((row: any) => row?.party_name),
            ]);

            const stockNames = toUniqueNames([
                ...stockItemRows.map((row: any) => getStockRowDisplayName(row)),
                ...stockEntryRows.map((row: any) => getStockRowDisplayName(row)),
                ...pendingItemRows.map((row: any) => getStockRowDisplayName(row)),
            ]);

            const metaMap: Record<string, any> = {};
            const hsnAccumulator: Record<string, { rates: number[]; unit: string; hsn_code: string }> = {};

            stockItemRows.forEach((row: any) => mergeStockMetaRow(metaMap, hsnAccumulator, row, true));
            stockEntryRows.forEach((row: any) => mergeStockMetaRow(metaMap, hsnAccumulator, row, false));
            pendingItemRows.forEach((row: any) => mergeStockMetaRow(metaMap, hsnAccumulator, row, false));

            const hsnMetaMap = Object.fromEntries(
                Object.entries(hsnAccumulator).map(([key, entry]) => {
                    const uniqueRates = Array.from(new Set(entry.rates.filter(rate => rate > 0)));
                    return [key, {
                        hsn_code: entry.hsn_code,
                        gst_rate: uniqueRates.length === 1 ? uniqueRates[0] : 0,
                        unit: entry.unit || 'Nos',
                        ambiguous: uniqueRates.length > 1,
                    }];
                })
            );

            const stockMasterEntries = [...stockItemRows, ...stockEntryRows, ...pendingItemRows]
                .map((row: any) => {
                    const name = getStockRowDisplayName(row);
                    return name ? [name.toLowerCase(), { id: row?.id, name }] : null;
                })
                .filter(Boolean) as any[];

            setLedgerSuggestions(ledgerNames);
            setStockSuggestions(stockNames);
            setStockMetaByName(metaMap);
            setStockMetaByHsn(hsnMetaMap);
            setLedgerMasterByName(Object.fromEntries(ledgerRows.map((row: any) => [String(row?.name || '').trim().toLowerCase(), { id: row?.id, name: String(row?.name || '').trim() }]).filter((entry: any) => entry[0])));
            setStockMasterByName(Object.fromEntries(stockMasterEntries));
        } catch (error) {
            console.error('Failed to load AI entry master suggestions', error);
            setLedgerSuggestions([]);
            setStockSuggestions([]);
            setStockMetaByName({});
            setStockMetaByHsn({});
            setLedgerMasterByName({});
            setStockMasterByName({});
        }
    };

    const loadRecentEntries = async () => {
        const companyId = selectedCompany?.id;
        if (!companyId) return;

        const { data, error } = await (supabase as any)
            .from('pending_transactions')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            setRecentEntries([]);
            return;
        }

        setRecentEntries(data || []);
    };


    const pad2 = (value: number) => String(value).padStart(2, '0');

    const resolveDateFromText = (text: string, fallbackDate: string): string => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const isoLike = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
        if (isoLike) {
            return `${isoLike[1]}-${pad2(Number(isoLike[2]))}-${pad2(Number(isoLike[3]))}`;
        }

        const dmyLike = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])(?:[-/.](\d{2,4}))?\b/);
        if (dmyLike) {
            const day = Number(dmyLike[1]);
            const month = Number(dmyLike[2]);
            const yearRaw = dmyLike[3];
            let year = currentYear;

            if (yearRaw) {
                year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
            }

            return `${year}-${pad2(month)}-${pad2(day)}`;
        }

        const dayWithWord = text.match(/\b(0?[1-9]|[12]\d|3[01])\s*(?:st|nd|rd|th)?\s*(?:tarikh|tareekh|date)\b/i);
        if (dayWithWord) {
            return `${currentYear}-${pad2(currentMonth)}-${pad2(Number(dayWithWord[1]))}`;
        }

        return fallbackDate;
    };

    const formatEntryDate = (value: unknown): string => {
        if (!value) return '';

        const raw = String(value).trim();
        const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymd) {
            const local = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
            return format(local, 'dd MMM yy');
        }

        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return '';
        return format(dt, 'dd MMM yy, hh:mm a');
    };

    const getRecentEntryDateLabel = (entry: any): string => {
        const data = entry?.voucher_data || {};
        const voucherDate = data?.voucher_date || data?.date || data?.invoice_date;
        return formatEntryDate(voucherDate || entry?.created_at);
    };
    // AI Parser: Extract entry data from natural language
    const parseAiInput = (text: string, currentDate: string) => {
        const cleanText = text.trim();

        // Detect voucher type
        let type: VoucherType = 'Receipt';
        if (/\b(sold|sale|invoice|billed)\b/i.test(cleanText)) type = 'Sales';
        else if (/\b(bought|purchased|purchase)\b/i.test(cleanText)) type = 'Purchase';
        else if (/\b(received|receipt|collected|jama)\b/i.test(cleanText)) type = 'Receipt';
        else if (/\b(paid|payment|given|diya|kharch)\b/i.test(cleanText)) type = 'Payment';
        else if (/\b(journal|transfer|adjust)\b/i.test(cleanText)) type = 'Journal';

        // Extract amount
        const amountMatch = cleanText.match(/(?:rs\.?|inr|rupees?)\s*([0-9,]+(?:\.\d{1,2})?)/i)
            || cleanText.match(/([0-9,]+(?:\.\d{1,2})?)\s*(?:rs\.?|rupees?)/i)
            || cleanText.match(/\b(\d{2,}(?:,\d{3})*(?:\.\d{1,2})?)\b/);
        const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : '';

        // Extract party name - remove common words
        let party = cleanText
            .replace(/(?:rs\.?|inr|rupees?\s*)[0-9,]+(?:\.\d{1,2})?/gi, '')
            .replace(/[0-9,]+(?:\.\d{1,2})?\s*(?:rs\.?|rupees?)/gi, '')
            .replace(/\b(sold|sale|invoice|billed|bought|purchased|purchase|received|receipt|collected|paid|payment|given|from|to|for|of|the|a|an|with|on|in|at|by|jama|diya|kharch)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Try to find best matching ledger
        const matchedLedger = ledgerSuggestions.find(l =>
            l.toLowerCase().includes(party.toLowerCase()) || party.toLowerCase().includes(l.toLowerCase())
        );

        return {
            voucherType: type,
            partyName: matchedLedger || party,
            amount,
            date: resolveDateFromText(cleanText, currentDate),
            narration: cleanText,
            items: [{ ...createEmptyItem(), rate: amount, amount }],
        };
    };

    const handleAiParse = () => {
        if (!aiInput.trim()) return;
        setIsProcessing(true);
        const currentDate = form.date;
        setTimeout(() => {
            const parsed = parseAiInput(aiInput, currentDate);
            setForm(parsed);
            setIsProcessing(false);
            toast.success(`Detected: ${parsed.voucherType} of Rs ${parsed.amount}`);
        }, 500);
    };

    // Voice Input
    const toggleVoice = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            toast.error('Speech recognition not supported in this browser');
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0].transcript)
                .join('');
            setAiInput(transcript);
        };

        recognition.onend = () => {
            setIsListening(false);
            if (aiInput.trim()) handleAiParse();
        };

        recognition.onerror = () => {
            setIsListening(false);
            toast.error('Voice recognition error');
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const loadSmartMappings = () => {
        if (!selectedCompany?.id || !user?.id) {
            setSmartMappings([]);
            return;
        }

        setSmartMappings(getLocalNameMappings(user.id, selectedCompany.id));
    };

    const addPartyMasterLocal = (name: string) => {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        setLedgerSuggestions((prev) => toUniqueNames([...prev, trimmed]));
        setLedgerMasterByName((prev) => prev[key] ? prev : { ...prev, [key]: { name: trimmed } });
    };

    const addItemMasterLocal = (name: string, item?: EntryForm['items'][number]) => {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;

        const key = trimmed.toLowerCase();
        const meta = {
            hsn_code: String(item?.hsnCode || '').trim(),
            gst_rate: round2(toNumberSafe(item?.gstRate)),
            unit: String(item?.unit || 'Nos').trim() || 'Nos',
            rate: round2(toNumberSafe(item?.rate)),
        };

        setStockSuggestions((prev) => toUniqueNames([...prev, trimmed]));
        setStockMasterByName((prev) => prev[key] ? prev : { ...prev, [key]: { name: trimmed } });
        setStockMetaByName((prev) => ({
            ...prev,
            [key]: {
                ...(prev[key] || {}),
                ...meta,
            }
        }));

        const hsnKey = meta.hsn_code.toLowerCase();
        if (hsnKey) {
            setStockMetaByHsn((prev) => ({
                ...prev,
                [hsnKey]: {
                    ...(prev[hsnKey] || {}),
                    hsn_code: meta.hsn_code,
                    gst_rate: meta.gst_rate,
                    unit: meta.unit,
                    ambiguous: false,
                }
            }));
        }
    };

    const rememberMapping = (memory: PendingMappingMemory, status: NameMappingRecord['status'] = 'approved') => {
        if (!selectedCompany?.id || !user?.id) return null;

        const saved = upsertLocalNameMapping({
            userId: user.id,
            clientId: selectedCompany.id,
            mappingType: memory.mappingType,
            sourceText: memory.sourceText,
            normalizedSource: getCanonicalMappingSource(memory.sourceText, memory.mappingType),
            mappedEntityType: memory.mappedEntityType,
            mappedEntityId: memory.mappedEntityId,
            mappedDisplayName: memory.mappedDisplayName,
            confidence: memory.confidence,
            status,
            reason: memory.reason,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
        });

        setSmartMappings((prev) => [
            saved,
            ...prev.filter((item) => !(
                item.userId === saved.userId
                && item.clientId === saved.clientId
                && item.mappingType === saved.mappingType
                && item.normalizedSource === saved.normalizedSource
            ))
        ]);

        if (memory.mappingType === 'item') {
            addItemMasterLocal(memory.mappedDisplayName);
        } else {
            addPartyMasterLocal(memory.mappedDisplayName);
        }

        return saved;
    };

    const insertWithVariants = async (table: string, variants: Record<string, any>[]) => {
        let lastError: any = null;

        for (const variant of variants) {
            const payload = Object.fromEntries(
                Object.entries(variant).filter(([, value]) => value !== undefined && value !== null && value !== '')
            );

            if (Object.keys(payload).length === 0) continue;

            const { error } = await (supabase as any)
                .from(table)
                .insert([payload]);

            if (!error) {
                return;
            }

            lastError = error;
            const text = queryErrorText(error);
            if (
                String(error?.code || '') === '42703'
                || text.includes('column')
                || text.includes('schema cache')
            ) {
                continue;
            }
        }

        if (lastError) {
            throw lastError;
        }
    };

    const createPartyMaster = async (name: string) => {
        const trimmed = String(name || '').trim();
        if (!trimmed || !selectedCompany?.id) return false;

        if (ledgerSuggestions.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
            addPartyMasterLocal(trimmed);
            return true;
        }

        try {
            await insertWithVariants('ledgers', [
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, parent: 'Sundry Debtors', parent_group: 'Sundry Debtors', status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, parent: 'Sundry Debtors', status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, status: 'active' },
                { company_id: selectedCompany.id, name: trimmed, parent: 'Sundry Debtors', status: 'active' },
                { company_id: selectedCompany.id, name: trimmed, status: 'active' },
                { company_id: selectedCompany.id, name: trimmed },
            ]);

            addPartyMasterLocal(trimmed);
            toast.success(`Party created: ${trimmed}`);
            return true;
        } catch (error) {
            console.warn('Failed to create party master in cloud, keeping local mapping only', error);
            addPartyMasterLocal(trimmed);
            toast('Party name saved locally. Tally sync ke liye Tally master bhi ensure karo.');
            return false;
        }
    };

    const createItemMaster = async (name: string, item?: EntryForm['items'][number]) => {
        const trimmed = String(name || '').trim();
        if (!trimmed || !selectedCompany?.id) return false;

        if (stockSuggestions.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
            addItemMasterLocal(trimmed, item);
            return true;
        }

        const hsnCode = String(item?.hsnCode || '').trim();
        const gstRate = normalizeEffectiveGstRate(item?.gstRate);
        const unit = String(item?.unit || 'Nos').trim() || 'Nos';
        const rate = round2(toNumberSafe(item?.rate));

        try {
            await insertWithVariants('stock_items', [
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, stock_item_name: trimmed, unit, rate, hsn_code: hsnCode, gst_rate: gstRate, status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, stock_item_name: trimmed, unit, rate, hsn_code: hsnCode, gst_rate: gstRate, status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, unit, rate, hsn_code: hsnCode, gst_rate: gstRate, status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, stock_item_name: trimmed, unit, rate, status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, unit, rate, status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, stock_item_name: trimmed, unit, status: 'active' },
                { company_id: selectedCompany.id, owner_id: user?.id, name: trimmed, unit, status: 'active' },
                { company_id: selectedCompany.id, stock_item_name: trimmed, unit, rate, status: 'active' },
                { company_id: selectedCompany.id, name: trimmed, unit, rate, status: 'active' },
                { company_id: selectedCompany.id, stock_item_name: trimmed, unit, status: 'active' },
                { company_id: selectedCompany.id, name: trimmed, unit, status: 'active' },
                { company_id: selectedCompany.id, stock_item_name: trimmed },
                { company_id: selectedCompany.id, name: trimmed },
            ]);

            addItemMasterLocal(trimmed, item);
            toast.success(`Item created: ${trimmed}`);
            return true;
        } catch (error) {
            console.warn('Failed to create stock master in cloud, keeping local mapping only', error);
            addItemMasterLocal(trimmed, item);
            toast('Item name saved locally. Tally sync ke liye Tally stock master bhi ensure karo.');
            return false;
        }
    };

    const partyTargetOptions = useMemo<MappingTargetOption[]>(() => (
        ledgerSuggestions.map((name) => ({
            name,
            entityType: 'ledger',
            id: ledgerMasterByName[name.toLowerCase()]?.id,
        }))
    ), [ledgerSuggestions, ledgerMasterByName]);

    const itemTargetOptions = useMemo<MappingTargetOption[]>(() => (
        stockSuggestions.map((name) => ({
            name,
            entityType: 'stock_item',
            id: stockMasterByName[name.toLowerCase()]?.id,
        }))
    ), [stockSuggestions, stockMasterByName]);

    const bankMappingRecords = useMemo<LedgerMappingRecord[]>(() => (
        smartMappings
            .filter((item) => item.mappingType === 'bank_party')
            .map((item) => ({
                userId: item.userId,
                clientId: item.clientId,
                normalizedKeyword: item.normalizedSource,
                ledgerName: item.mappedDisplayName,
                createdAt: item.updatedAt || item.createdAt,
            }))
    ), [smartMappings]);

    const buildImportedLineItem = (item: AiImportedInvoice['items'][number]): EntryForm['items'][number] => ({
        name: String(item.name || '').trim(),
        qty: String(item.qty || 1),
        rate: item.rate > 0 ? String(item.rate) : (item.amount > 0 ? String(item.amount) : ''),
        amount: item.amount > 0 ? String(item.amount) : '',
        hsnCode: String(item.hsnCode || '').trim(),
        gstRate: formatGstRateInput(item.gstRate),
        unit: String(item.unit || 'Nos').trim() || 'Nos',
    });

    const getMeaningfulLineItems = (items: EntryForm['items']) => items.filter((item) => (
        String(item.name || '').trim()
        || toNumberSafe(item.amount) > 0
        || toNumberSafe(item.rate) > 0
        || toNumberSafe(item.gstRate) > 0
        || String(item.hsnCode || '').trim()
    ));

    const buildImportedFormSnapshot = (prevForm: EntryForm, fileName: string, extracted: AiImportedInvoice): EntryForm => {
        const importedItems = extracted.items.map((item) => buildImportedLineItem(item));
        const nextVoucherType = prevForm.voucherType === 'Purchase' ? 'Purchase' : 'Sales';
        const computedTotal = round2(
            extracted.grandTotal
            || extracted.taxableAmount + extracted.gstAmount
            || importedItems.reduce((sum, item) => sum + toNumberSafe(item.amount), 0)
        );
        const preservedItems = getMeaningfulLineItems(prevForm.items).length > 0
            ? prevForm.items.map((item) => ({ ...item }))
            : [createEmptyItem()];

        return {
            ...prevForm,
            voucherType: nextVoucherType,
            partyName: extracted.partyName || prevForm.partyName,
            amount: computedTotal > 0 ? String(computedTotal) : prevForm.amount,
            date: extracted.date || prevForm.date,
            narration: extracted.invoiceNumber
                ? `Imported ${fileName} | Invoice ${extracted.invoiceNumber}`
                : `Imported from ${fileName}`,
            items: importedItems.length > 0 ? importedItems : preservedItems,
        };
    };

    const buildMappingDraft = (
        id: string,
        mappingType: NameMappingType,
        sourceText: string,
        matches: any[],
        options: { itemIndexes?: number[]; isParty?: boolean } = {}
    ): SmartMappingDraft => {
        const uniqueMatches = Array.from(
            new Map(
                (matches || [])
                    .filter(Boolean)
                    .map((match) => [String(match.displayName || '').toLowerCase(), match])
            ).values()
        ) as SmartMappingDraft['matches'];

        return {
            id,
            mappingType,
            sourceText,
            normalizedSource: getCanonicalMappingSource(sourceText, mappingType),
            itemIndexes: options.itemIndexes,
            isParty: options.isParty,
            matches: uniqueMatches,
            selectedMode: uniqueMatches.length > 0 ? 'map' : 'create',
            selectedName: uniqueMatches[0]?.displayName || '',
            selectedEntityId: uniqueMatches[0]?.entityId,
            createName: sourceText,
        };
    };

    const collectSubmitContext = (inputForm: EntryForm) => {
        const nextForm: EntryForm = {
            ...inputForm,
            partyName: String(inputForm.partyName || '').trim(),
            items: inputForm.items.map((item) => ({ ...item })),
        };

        const autoMappings: PendingMappingMemory[] = [];
        const reviewMap = new Map<string, SmartMappingDraft>();

        const rememberAutoMatch = (memory: PendingMappingMemory) => {
            const key = `${memory.mappingType}|${getCanonicalMappingSource(memory.sourceText, memory.mappingType)}|${memory.mappedDisplayName.toLowerCase()}`;
            if (autoMappings.some((item) => `${item.mappingType}|${getCanonicalMappingSource(item.sourceText, item.mappingType)}|${item.mappedDisplayName.toLowerCase()}` === key)) {
                return;
            }
            autoMappings.push(memory);
        };

        if (nextForm.partyName) {
            const partyResolution = resolveMappedName({
                sourceText: nextForm.partyName,
                mappingType: 'party',
                candidates: partyTargetOptions,
                mappings: smartMappings.filter((item) => item.mappingType === 'party'),
            });

            if (partyResolution.status === 'mapped' && partyResolution.bestMatch) {
                const mappedName = partyResolution.bestMatch.displayName;
                if (mappedName && getCanonicalMappingSource(mappedName, 'party') !== getCanonicalMappingSource(nextForm.partyName, 'party')) {
                    if (!['exact', 'saved_mapping'].includes(partyResolution.bestMatch.stage)) {
                        rememberAutoMatch({
                            mappingType: 'party',
                            sourceText: nextForm.partyName,
                            mappedDisplayName: mappedName,
                            mappedEntityType: 'ledger',
                            mappedEntityId: partyResolution.bestMatch.entityId,
                            confidence: partyResolution.bestMatch.confidence,
                            reason: partyResolution.bestMatch.reason,
                        });
                    }
                    nextForm.partyName = mappedName;
                }
            } else {
                reviewMap.set(
                    `party:${partyResolution.normalizedSource || getCanonicalMappingSource(nextForm.partyName, 'party')}`,
                    buildMappingDraft(
                        `party:${partyResolution.normalizedSource || getCanonicalMappingSource(nextForm.partyName, 'party')}`,
                        'party',
                        nextForm.partyName,
                        [partyResolution.bestMatch, ...partyResolution.candidates],
                        { isParty: true }
                    )
                );
            }
        }

        nextForm.items = nextForm.items.map((item, idx) => {
            const sourceName = String(item.name || '').trim();
            if (!sourceName) return { ...item };

            const itemResolution = resolveMappedName({
                sourceText: sourceName,
                mappingType: 'item',
                candidates: itemTargetOptions,
                mappings: smartMappings.filter((entry) => entry.mappingType === 'item'),
            });

            if (itemResolution.status === 'mapped' && itemResolution.bestMatch) {
                const mappedName = itemResolution.bestMatch.displayName;
                if (mappedName && getCanonicalMappingSource(mappedName, 'item') !== getCanonicalMappingSource(sourceName, 'item')) {
                    if (!['exact', 'saved_mapping'].includes(itemResolution.bestMatch.stage)) {
                        rememberAutoMatch({
                            mappingType: 'item',
                            sourceText: sourceName,
                            mappedDisplayName: mappedName,
                            mappedEntityType: 'stock_item',
                            mappedEntityId: itemResolution.bestMatch.entityId,
                            confidence: itemResolution.bestMatch.confidence,
                            reason: itemResolution.bestMatch.reason,
                        });
                    }
                    return { ...item, name: mappedName };
                }
                return { ...item };
            }

            const reviewKey = `item:${itemResolution.normalizedSource || getCanonicalMappingSource(sourceName, 'item')}`;
            const existingDraft = reviewMap.get(reviewKey);
            if (existingDraft) {
                existingDraft.itemIndexes = Array.from(new Set([...(existingDraft.itemIndexes || []), idx]));
            } else {
                reviewMap.set(
                    reviewKey,
                    buildMappingDraft(reviewKey, 'item', sourceName, [itemResolution.bestMatch, ...itemResolution.candidates], { itemIndexes: [idx] })
                );
            }

            return { ...item };
        });

        return {
            context: {
                formSnapshot: nextForm,
                autoMappings,
            },
            reviewDrafts: Array.from(reviewMap.values()),
        };
    };

    const openMappingDialogForForm = (sourceForm: EntryForm, mode: MappingDialogMode) => {
        const { context, reviewDrafts } = collectSubmitContext(sourceForm);

        if (reviewDrafts.length === 0) {
            if (mode === 'review') {
                setForm(context.formSnapshot);
                toast.success(context.autoMappings.length > 0
                    ? 'Known masters matched. Review voucher and queue it to Tally.'
                    : 'No manual mapping needed. Review voucher and queue it to Tally.');
            }

            return { context, opened: false };
        }

        setPendingSubmitContext(context);
        setMappingDrafts(reviewDrafts);
        setMappingDialogMode(mode);
        setIsMappingDialogOpen(true);
        return { context, opened: true };
    };

    const submitVoucherForm = async (submitForm: EntryForm, mappingsToRemember: PendingMappingMemory[] = []) => {
        if (!submitForm.partyName || !submitForm.amount) {
            toast.error('Party name and amount are required');
            return;
        }

        setIsProcessing(true);
        try {
            mappingsToRemember.forEach((memory) => rememberMapping(memory));

            const partyName = String(submitForm.partyName || '').trim();
            const enteredAmount = round2(parseFloat(submitForm.amount) || 0);

            const voucherData: any = {
                voucher_type_name: submitForm.voucherType,
                party_name: partyName,
                party_ledger_name: partyName,
                voucher_date: submitForm.date,
                narration: submitForm.narration,
                total_amount: enteredAmount,
                grand_total: enteredAmount,
            };

            if (submitForm.voucherType === 'Sales' || submitForm.voucherType === 'Purchase') {
                const businessLedger = resolveBusinessLedger(submitForm.voucherType, partyName);
                if (!businessLedger) {
                    throw new Error(`${submitForm.voucherType} ledger not found in synced masters. Please sync ledgers from Tally first.`);
                }

                const { data: partyLedger, error: partyLedgerError } = await selectLedgerMaybeSingle(
                    (fields) => (supabase as any)
                        .from('ledgers')
                        .select(fields)
                        .eq('company_id', selectedCompany.id)
                        .ilike('name', partyName)
                        .maybeSingle()
                );

                if (partyLedgerError) {
                    console.error('Failed to fetch party ledger for AI entry', partyLedgerError);
                }

                const partyGstin = String(partyLedger?.gstin || '').trim();
                const partyState = String(partyLedger?.state || '').trim();
                const isInterState = inferInterStateSupply(selectedCompany, partyLedger);

                const normalizedItems = submitForm.items.filter(i => i.name).map(i => {
                    const meta = resolveStockMeta(i.name, i.hsnCode);
                    const qty = toNumberSafe(i.qty) || 1;
                    const rate = toNumberSafe(i.rate) || Number(meta.rate || 0);
                    const amount = round2(toNumberSafe(i.amount) || (qty * rate) || 0);
                    const enteredTaxRate = normalizeEffectiveGstRate(i.gstRate);
                    const taxRate = enteredTaxRate > 0 ? enteredTaxRate : normalizeEffectiveGstRate(meta.gst_rate || 0);
                    const hsnCode = String(i.hsnCode || meta.hsn_code || '').trim();
                    const unit = String(i.unit || meta.unit || 'Nos').trim() || 'Nos';
                    const lineTaxAmount = round2((amount * taxRate) / 100);
                    const itemIgstAmount = isInterState ? lineTaxAmount : 0;
                    const itemCgstAmount = isInterState ? 0 : round2(lineTaxAmount / 2);
                    const itemSgstAmount = isInterState ? 0 : round2(lineTaxAmount - itemCgstAmount);

                    return {
                        stock_item_name: i.name,
                        name: i.name,
                        quantity: qty,
                        qty,
                        rate,
                        amount,
                        unit,
                        hsn_code: hsnCode || null,
                        tax_rate: taxRate,
                        gst_rate: taxRate,
                        gst_percent: taxRate,
                        cgst_amount: itemCgstAmount,
                        sgst_amount: itemSgstAmount,
                        igst_amount: itemIgstAmount,
                        taxability: taxRate > 0 ? 'Taxable' : undefined,
                    };
                });

                if (normalizedItems.length === 0) {
                    throw new Error(`${submitForm.voucherType} entry requires at least one line item.`);
                }

                const taxableAmount = round2(normalizedItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
                const totalGst = round2(normalizedItems.reduce((sum, item) => {
                    const lineAmount = Number(item.amount) || 0;
                    const lineTaxRate = Number(item.tax_rate) || 0;
                    return sum + ((lineAmount * lineTaxRate) / 100);
                }, 0));

                const igstAmount = isInterState ? totalGst : 0;
                const cgstAmount = isInterState ? 0 : round2(totalGst / 2);
                const sgstAmount = isInterState ? 0 : round2(totalGst - cgstAmount);
                const computedGross = round2(taxableAmount + totalGst);

                let grandTotal = enteredAmount;
                if (grandTotal <= 0) {
                    grandTotal = computedGross > 0 ? computedGross : taxableAmount;
                }

                if (totalGst > 0 && Math.abs(grandTotal - taxableAmount) <= 0.01) {
                    grandTotal = computedGross;
                }

                const roundedGrandTotal = grandTotal > 0 ? round2(Math.round(grandTotal)) : grandTotal;
                const roundOff = grandTotal > 0 ? round2(roundedGrandTotal - grandTotal) : 0;
                grandTotal = roundedGrandTotal;

                voucherData.items = normalizedItems;
                voucherData.taxable_amount = taxableAmount;
                voucherData.gst_amount = totalGst;
                voucherData.cgst_amount = cgstAmount;
                voucherData.sgst_amount = sgstAmount;
                voucherData.igst_amount = igstAmount;
                voucherData.cess_amount = 0;
                voucherData.round_off = roundOff;
                voucherData.round_off_ledger = 'Round Off';
                voucherData.is_inter_state = isInterState;
                voucherData.is_interstate = isInterState;
                if (partyLedger?.id) voucherData.party_ledger_id = partyLedger.id;
                if (partyGstin) voucherData.party_gstin = partyGstin;
                if (partyState) {
                    voucherData.party_state = partyState;
                    voucherData.place_of_supply = partyState;
                }
                voucherData.allow_accounting_fallback = false;
                voucherData.total_amount = taxableAmount;
                voucherData.grand_total = grandTotal;
                voucherData.amount = grandTotal;

                if (submitForm.voucherType === 'Sales') {
                    voucherData.sales_ledger_name = businessLedger;
                    voucherData.sales_ledger = businessLedger;
                } else {
                    voucherData.purchase_ledger_name = businessLedger;
                    voucherData.purchase_ledger = businessLedger;
                }
            }

            if (submitForm.voucherType === 'Receipt' || submitForm.voucherType === 'Payment') {
                voucherData.cash_bank_ledger = 'Cash';
                voucherData.amount = enteredAmount;
            }
            const { error } = await (supabase as any)
                .from('pending_transactions')
                .insert([{
                    company_id: selectedCompany.id,
                    transaction_type: submitForm.voucherType,
                    voucher_data: voucherData,
                    status: 'pending',
                    created_by: user?.id,
                    owner_id: user?.id,
                }]);

            if (error) {
                const isMissingPendingTable = Number((error as any)?.status) === 404
                    || String((error as any)?.message || '').toLowerCase().includes('pending_transactions');
                if (isMissingPendingTable) {
                    throw new Error('pending_transactions table is missing in backend');
                }
                throw error;
            }

            toast.success(`${submitForm.voucherType} entry created! Will be synced to Tally.`);
            setForm({
                voucherType: 'Sales',
                partyName: '',
                amount: '',
                date: format(new Date(), 'yyyy-MM-dd'),
                narration: '',
                items: [createEmptyItem()],
            });
            setAiInput('');
            setPendingSubmitContext(null);
            setMappingDrafts([]);
            setIsMappingDialogOpen(false);
            loadRecentEntries();
        } catch (error: any) {
            const message = String(error?.message || 'Unknown error');
            if (message.toLowerCase().includes('pending_transactions')) {
                toast.error('Pending queue table missing hai. Backend migration run karo.');
            } else {
                toast.error('Failed to create entry: ' + message);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSubmit = async () => {
        const { context, opened } = openMappingDialogForForm(form, 'submit');
        if (opened) {
            return;
        }

        await submitVoucherForm(context.formSnapshot, context.autoMappings);
    };

    const handleOpenMappingReview = () => {
        openMappingDialogForForm(form, 'review');
    };

    const handleMappingDraftChange = (id: string, patch: Partial<SmartMappingDraft>) => {
        setMappingDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
    };

    const handleApplyMappings = async () => {
        if (!pendingSubmitContext) {
            setIsMappingDialogOpen(false);
            return;
        }

        setIsApplyingMappings(true);
        try {
            const nextForm: EntryForm = {
                ...pendingSubmitContext.formSnapshot,
                items: pendingSubmitContext.formSnapshot.items.map((item) => ({ ...item })),
            };
            const mappingsToRemember = [...pendingSubmitContext.autoMappings];

            for (const draft of mappingDrafts) {
                if (draft.selectedMode === 'map') {
                    const mappedName = String(draft.selectedName || '').trim();
                    if (!mappedName) {
                        throw new Error(`Select mapping for ${draft.sourceText}`);
                    }

                    if (draft.isParty) {
                        nextForm.partyName = mappedName;
                    } else {
                        (draft.itemIndexes || []).forEach((index) => {
                            if (nextForm.items[index]) {
                                nextForm.items[index] = { ...nextForm.items[index], name: mappedName };
                            }
                        });
                    }

                    mappingsToRemember.push({
                        mappingType: draft.mappingType,
                        sourceText: draft.sourceText,
                        mappedDisplayName: mappedName,
                        mappedEntityType: draft.mappingType === 'item' ? 'stock_item' : 'ledger',
                        mappedEntityId: draft.mappingType === 'item'
                            ? stockMasterByName[mappedName.toLowerCase()]?.id
                            : ledgerMasterByName[mappedName.toLowerCase()]?.id,
                        confidence: 100,
                        reason: 'User confirmed smart mapping',
                    });
                } else {
                    const createdName = String(draft.createName || '').trim();
                    if (!createdName) {
                        throw new Error(`Enter new name for ${draft.sourceText}`);
                    }

                    if (draft.isParty) {
                        await createPartyMaster(createdName);
                        nextForm.partyName = createdName;
                    } else {
                        const itemIndex = draft.itemIndexes?.[0] ?? -1;
                        await createItemMaster(createdName, itemIndex >= 0 ? nextForm.items[itemIndex] : undefined);
                        (draft.itemIndexes || []).forEach((index) => {
                            if (nextForm.items[index]) {
                                nextForm.items[index] = { ...nextForm.items[index], name: createdName };
                            }
                        });
                    }

                    mappingsToRemember.push({
                        mappingType: draft.mappingType,
                        sourceText: draft.sourceText,
                        mappedDisplayName: createdName,
                        mappedEntityType: draft.mappingType === 'item' ? 'stock_item' : 'ledger',
                        mappedEntityId: draft.mappingType === 'item'
                            ? stockMasterByName[createdName.toLowerCase()]?.id
                            : ledgerMasterByName[createdName.toLowerCase()]?.id,
                        confidence: 100,
                        reason: 'Created from smart mapping review',
                    });
                }
            }

            if (mappingDialogMode === 'review') {
                mappingsToRemember.forEach((memory) => rememberMapping(memory));
                setForm(nextForm);
                setImportedInvoice((prev) => prev ? { ...prev, partyName: nextForm.partyName || prev.partyName } : prev);
                setPendingSubmitContext(null);
                setMappingDrafts([]);
                setIsMappingDialogOpen(false);
                toast.success('Mapping updated. Review voucher and queue it to Tally.');
                return;
            }

            await submitVoucherForm(nextForm, mappingsToRemember);
        } catch (error: any) {
            toast.error(String(error?.message || 'Failed to apply mappings'));
        } finally {
            setIsApplyingMappings(false);
        }
    };

    const importInvoiceFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setEntrySource('invoice');
        setIsImportingDocument(true);
        try {
            const extracted = await extractInvoiceDocument(file);
            const nextForm = buildImportedFormSnapshot(form, file.name, extracted);
            const importedLineItems = getMeaningfulLineItems(nextForm.items);

            setForm(nextForm);
            setAiInput(extracted.invoiceNumber
                ? `Imported invoice ${extracted.invoiceNumber} ${extracted.partyName ? `for ${extracted.partyName}` : ''}`.trim()
                : `Imported from ${file.name}`);
            setDocumentLabel(file.name);
            setImportedInvoice(extracted);
            setBankRows([]);
            toast.success(importedLineItems.length > 0
                ? 'Invoice imported. Review items and mapping, then queue it to Tally.'
                : 'Invoice summary imported. Line items ko review ya add karke mapping kholo.');
        } catch (error: any) {
            toast.error(String(error?.message || 'Failed to import invoice document'));
        } finally {
            setIsImportingDocument(false);
            event.target.value = '';
        }
    };

    const runBankMatching = async (rows: any[]) => {
        setIsMatchingBankRows(true);
        try {
            if (ledgerSuggestions.length === 0) {
                setBankRows(rows.map((row: any) => ({
                    ...row,
                    suggestion: {
                        ledgerName: '',
                        confidence: 0,
                        reason: 'Sync ledger masters from Tally first',
                        stage: 'unmatched' as BankSuggestionStage,
                    },
                    draftLedgerName: '',
                })));
                return;
            }

            let geminiCalls = 0;
            const nextRows: BankReviewRow[] = [];

            for (const row of rows) {
                const allowGemini = geminiCalls < MAX_BANK_MATCH_CALLS;
                const suggestion = await suggestLedgerHybrid({
                    row,
                    ledgers: ledgerSuggestions,
                    mappings: bankMappingRecords,
                    enableGemini: allowGemini,
                });

                if (suggestion.stage === 'gemini') {
                    geminiCalls += 1;
                }

                nextRows.push({
                    ...row,
                    suggestion: {
                        ledgerName: suggestion.ledgerName,
                        confidence: suggestion.confidence,
                        reason: suggestion.reason,
                        stage: suggestion.stage as BankSuggestionStage,
                    },
                    draftLedgerName: suggestion.ledgerName || '',
                });
            }

            setBankRows(nextRows);
            if (geminiCalls >= MAX_BANK_MATCH_CALLS) {
                toast('Bank matching AI budget reached. Remaining rows need manual review.');
            }
        } finally {
            setIsMatchingBankRows(false);
        }
    };

    const importBankStatementFiles = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        setEntrySource('bank');
        setIsImportingDocument(true);
        try {
            const parsedRows: any[] = [];
            const failedFiles: string[] = [];

            for (const file of files) {
                try {
                    const rows = await extractBankStatementTransactions(file);
                    parsedRows.push(...rows);
                } catch {
                    failedFiles.push(file.name);
                }
            }

            if (parsedRows.length === 0) {
                throw new Error('No usable bank transactions found in uploaded files');
            }

            const dedupedRows = dedupeBankTransactions(parsedRows);
            setImportedInvoice(null);
            setDocumentLabel(files.length === 1 ? files[0].name : `${files.length} bank files`);
            await runBankMatching(dedupedRows);
            if (failedFiles.length > 0) {
                toast(`${failedFiles.length} file skipped. Use Excel, PDF, JPG, PNG, or WebP.`);
            }
            toast.success(`${dedupedRows.length} bank transactions loaded for review`);
        } catch (error: any) {
            toast.error(String(error?.message || 'Failed to import bank statement'));
        } finally {
            setIsImportingDocument(false);
            event.target.value = '';
        }
    };

    const updateBankRowDraft = (rowId: string, ledgerName: string) => {
        setBankRows((prev) => prev.map((row) => row.id === rowId ? { ...row, draftLedgerName: ledgerName } : row));
    };

    const rememberBankMapping = (sourceText: string, ledgerName: string, reason: string, confidence = 100) => {
        rememberMapping({
            mappingType: 'bank_party',
            sourceText,
            mappedDisplayName: ledgerName,
            mappedEntityType: 'ledger',
            mappedEntityId: ledgerMasterByName[ledgerName.toLowerCase()]?.id,
            confidence,
            reason,
        });
    };

    const applyLedgerToBankRows = async (rowId: string) => {
        const targetRow = bankRows.find((row) => row.id === rowId);
        if (!targetRow) return;

        const ledgerName = String(targetRow.draftLedgerName || '').trim();
        if (!ledgerName) {
            toast.error('Enter or choose a ledger name first');
            return;
        }

        setActiveBankRowId(rowId);
        try {
            if (!ledgerSuggestions.some((item) => item.toLowerCase() === ledgerName.toLowerCase())) {
                await createPartyMaster(ledgerName);
            }

            const targetKeyword = getCanonicalMappingSource(targetRow.normalizedNarration || targetRow.narration, 'bank_party');
            const nextRows = bankRows.map((row) => {
                const rowKeyword = getCanonicalMappingSource(row.normalizedNarration || row.narration, 'bank_party');
                const shouldApply = row.id === rowId
                    || (targetKeyword && rowKeyword && (rowKeyword === targetKeyword || rowKeyword.includes(targetKeyword) || targetKeyword.includes(rowKeyword)));

                if (!shouldApply) return row;

                return {
                    ...row,
                    suggestion: {
                        ...manualLedgerSuggestion(ledgerName),
                        stage: 'manual' as BankSuggestionStage,
                    },
                    draftLedgerName: ledgerName,
                };
            });

            setBankRows(nextRows);
            rememberBankMapping(targetRow.narration, ledgerName, 'Manual bank statement mapping');
            const impactedRows = nextRows.filter((row) => row.draftLedgerName === ledgerName).length;
            toast.success(`Ledger mapped for ${impactedRows} bank row${impactedRows === 1 ? '' : 's'}`);
        } catch (error: any) {
            toast.error(String(error?.message || 'Failed to save bank mapping'));
        } finally {
            setActiveBankRowId(null);
        }
    };

    const rememberHighConfidenceBankRows = (rowsToRemember: BankReviewRow[]) => {
        rowsToRemember.forEach((row) => {
            const ledgerName = String(row.draftLedgerName || row.suggestion.ledgerName || '').trim();
            if (!ledgerName) return;
            if (row.suggestion.stage === 'saved_mapping' || row.suggestion.stage === 'manual') return;
            if (Number(row.suggestion.confidence || 0) < 94) return;

            const sourceText = deriveMappingKeyword(row.normalizedNarration || row.narration) || row.narration;
            rememberBankMapping(sourceText, ledgerName, `Auto-learned from ${row.suggestion.stage} match`, row.suggestion.confidence);
        });
    };

    const queueBankRowsToTally = async () => {
        if (!selectedCompany?.id || !user?.id) {
            toast.error('Client or user context missing');
            return;
        }

        const usableRows = bankRows.filter((row) => String(row.draftLedgerName || '').trim() && (row.debit > 0 || row.credit > 0));
        if (usableRows.length === 0) {
            toast.error('No mapped bank rows available to queue');
            return;
        }

        setIsQueueingBankRows(true);
        try {
            rememberHighConfidenceBankRows(usableRows);
            const today = new Date().toISOString().slice(0, 10);
            const pendingRows = usableRows.map((row) => {
                const isPayment = row.debit > 0;
                const amount = Number(isPayment ? row.debit : row.credit) || 0;
                const voucherType = isPayment ? 'Payment' : 'Receipt';
                const voucherDate = row.date || today;
                const ledgerName = String(row.draftLedgerName || row.suggestion.ledgerName || '').trim();

                return {
                    company_id: selectedCompany.id,
                    owner_id: user.id,
                    created_by: user.id,
                    status: 'pending',
                    transaction_type: voucherType,
                    voucher_data: {
                        source: 'ai_entry_bank',
                        voucher_type: voucherType,
                        voucher_type_name: voucherType,
                        voucher_date: voucherDate,
                        date: voucherDate,
                        party_ledger_name: ledgerName,
                        party_name: ledgerName,
                        amount,
                        total_amount: amount,
                        narration: row.narration,
                        bank_transaction: {
                            narration: row.narration,
                            debit: row.debit || 0,
                            credit: row.credit || 0,
                        },
                        ledger_entries: [{
                            ledger_name: ledgerName,
                            amount,
                            is_debit: isPayment,
                        }],
                    },
                };
            });

            const { error } = await (supabase as any)
                .from('pending_transactions')
                .insert(pendingRows);

            if (error) {
                const message = String(error?.message || '').toLowerCase();
                if (message.includes('pending_transactions') || message.includes('404')) {
                    throw new Error('pending_transactions table missing. Run backend optional tables SQL.');
                }
                throw error;
            }

            toast.success(`${pendingRows.length} bank vouchers queued for Tally push`);
            setBankRows([]);
            setDocumentLabel('');
            loadRecentEntries();
        } catch (error: any) {
            toast.error(String(error?.message || 'Failed to queue bank vouchers'));
        } finally {
            setIsQueueingBankRows(false);
        }
    };

    const filteredSuggestions = useMemo(() => {
        const needle = String(form.partyName || '').trim().toLowerCase();
        if (!needle) return ledgerSuggestions.slice(0, 8);
        return ledgerSuggestions.filter(l =>
            l.toLowerCase().includes(needle)
        ).slice(0, 8);
    }, [form.partyName, ledgerSuggestions]);

    const getFilteredStockSuggestions = (value: string) => {
        const needle = String(value || '').trim().toLowerCase();
        if (!needle) return stockSuggestions.slice(0, 8);
        return stockSuggestions
            .filter(name => name.toLowerCase().includes(needle))
            .slice(0, 8);
    };

    const updateLineItem = (idx: number, field: string, value: string) => {
        const newItems = [...form.items];
        const currentItem = { ...newItems[idx], [field]: value };

        if (field === 'gstRate') {
            currentItem.gstRate = formatGstRateInput(value);
        }

        if (field === 'name') {
            const meta = resolveStockMeta(value, currentItem.hsnCode);
            if (!String(currentItem.rate || '').trim() && Number(meta.rate || 0) > 0) {
                currentItem.rate = String(meta.rate);
            }
            if (!String(currentItem.hsnCode || '').trim() && String(meta.hsn_code || '').trim()) {
                currentItem.hsnCode = String(meta.hsn_code).trim();
            }
            if (!String(currentItem.gstRate || '').trim() && Number(meta.gst_rate || 0) > 0) {
                currentItem.gstRate = formatGstRateInput(meta.gst_rate);
            }
            if (['', 'Nos'].includes(String(currentItem.unit || '').trim()) && String(meta.unit || '').trim()) {
                currentItem.unit = String(meta.unit).trim();
            }

            const hsnKey = String(currentItem.hsnCode || '').trim().toLowerCase();
            const hsnMeta = hsnKey ? (stockMetaByHsn[hsnKey] || {}) : {};

            if (!String(currentItem.gstRate || '').trim() && Number(hsnMeta.gst_rate || 0) > 0) {
                currentItem.gstRate = formatGstRateInput(hsnMeta.gst_rate);
            }

            if (['', 'Nos'].includes(String(currentItem.unit || '').trim()) && String(hsnMeta.unit || '').trim()) {
                currentItem.unit = String(hsnMeta.unit).trim();
            }
        }

        if (field === 'hsnCode') {
            const hsnKey = String(value || '').trim().toLowerCase();
            const meta = stockMetaByHsn[hsnKey] || {};

            if (!String(currentItem.gstRate || '').trim() && Number(meta.gst_rate || 0) > 0) {
                currentItem.gstRate = formatGstRateInput(meta.gst_rate);
            }

            if (['', 'Nos'].includes(String(currentItem.unit || '').trim()) && String(meta.unit || '').trim()) {
                currentItem.unit = String(meta.unit).trim();
            }
        }

        if (field === 'qty' || field === 'rate' || field === 'name') {
            const qty = toNumberSafe(currentItem.qty);
            const rate = toNumberSafe(currentItem.rate);
            currentItem.amount = round2(qty * rate).toString();
        }

        newItems[idx] = currentItem;
        const total = round2(newItems.reduce((sum, row) => sum + toNumberSafe(row.amount), 0));

        setForm(prev => ({
            ...prev,
            items: newItems,
            amount: total > 0 ? total.toString() : prev.amount,
        }));
    };

    const removeLineItem = (idx: number) => {
        setForm(prev => {
            const remaining = prev.items.filter((_, i) => i !== idx);
            const items = remaining.length > 0 ? remaining : [createEmptyItem()];
            const total = round2(items.reduce((sum, row) => sum + toNumberSafe(row.amount), 0));
            return {
                ...prev,
                items,
                amount: total > 0 ? total.toString() : '',
            };
        });
    };

    const lineItemTotals = useMemo(() => {
        if (!(form.voucherType === 'Sales' || form.voucherType === 'Purchase')) {
            return { taxable: 0, gst: 0, gross: 0 };
        }

        const taxable = round2(form.items.reduce((sum, item) => sum + toNumberSafe(item.amount), 0));
        const gst = round2(form.items.reduce((sum, item) => {
            const amount = toNumberSafe(item.amount);
            const rate = normalizeEffectiveGstRate(item.gstRate);
            return sum + ((amount * rate) / 100);
        }, 0));

        return {
            taxable,
            gst,
            gross: round2(taxable + gst),
        };
    }, [form.items, form.voucherType]);

    const mappedBankRowCount = useMemo(() => bankRows.filter((row) => String(row.draftLedgerName || '').trim()).length, [bankRows]);
    const unresolvedBankRowCount = useMemo(() => bankRows.filter((row) => !String(row.draftLedgerName || '').trim()).length, [bankRows]);
    const bankReviewTotal = useMemo(() => round2(bankRows.reduce((sum, row) => sum + Math.max(Number(row.debit || 0), Number(row.credit || 0)), 0)), [bankRows]);

    const bankStageBadgeClass = (stage: BankSuggestionStage, hasLedger: boolean) => {
        if (!hasLedger || stage === 'unmatched') return 'bg-red-500/10 text-red-500';
        if (stage === 'manual') return 'bg-blue-500/10 text-blue-500';
        if (stage === 'saved_mapping' || stage === 'exact') return 'bg-emerald-500/10 text-emerald-500';
        if (stage === 'gemini') return 'bg-violet-500/10 text-violet-500';
        return 'bg-amber-500/10 text-amber-500';
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-24">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] text-white">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-[var(--on-surface)] tracking-tighter">AI Auto Entry</h1>
                        <p className="text-xs text-[var(--text-muted)]">Type or speak naturally - Auto-creates Tally vouchers</p>
                    </div>
                </div>
            </div>

            {/* AI Input */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Bot size={16} className="text-[var(--primary)]" />
                    <span className="text-xs font-bold text-[var(--on-surface)] uppercase tracking-wider">Smart Input</span>
                </div>

                <div className="grid sm:grid-cols-3 gap-2 mb-4">
                    {ENTRY_SOURCE_OPTIONS.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => setEntrySource(option.key)}
                            className={`rounded-2xl border px-4 py-3 text-left transition-all ${entrySource === option.key
                                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--on-surface)]'
                                : 'border-[var(--border)] bg-[var(--surface-variant)]/50 text-[var(--on-surface-variant)]'
                                }`}
                        >
                            <div className="flex items-center gap-2 text-sm font-bold">
                                <option.icon size={15} />
                                {option.label}
                            </div>
                            <p className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">{option.hint}</p>
                        </button>
                    ))}
                </div>

                {entrySource === 'text' && (
                    <>
                        <div className="flex gap-3">
                            <div className="flex-1 relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder='Try: "Sold to Rathi Traders for Rs 25,000" or "Received Rs 50000 from Agarwal Ji"'
                                    value={aiInput}
                                    onChange={e => setAiInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAiParse()}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-4 px-5 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-glow)] transition-all placeholder:text-[var(--text-muted)]"
                                />
                            </div>
                            <button
                                onClick={toggleVoice}
                                className={`p-4 rounded-xl transition-all ${isListening
                                    ? 'bg-red-500 text-white animate-pulse shadow-lg'
                                    : 'bg-[var(--surface-variant)] text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-active)]'
                                    }`}
                            >
                                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                            </button>
                            <button
                                onClick={handleAiParse}
                                disabled={isProcessing || !aiInput.trim()}
                                className="px-6 py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-40"
                            >
                                {isProcessing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap size={16} />}
                                Parse
                            </button>
                        </div>

                        <div className="flex gap-2 mt-4 flex-wrap">
                            {AI_TEMPLATES.map((t, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setEntrySource('text');
                                        setAiInput(t.prompt);
                                        setForm(f => ({ ...f, voucherType: t.type }));
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[var(--surface-active)] text-[var(--on-surface-variant)] border border-[var(--border)] hover:border-[var(--primary)] transition-all"
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {entrySource === 'invoice' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-variant)]/40 p-4">
                            <p className="text-sm font-semibold text-[var(--on-surface)]">Invoice ya purchase bill ka photo/PDF upload karo.</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">AI party, items, GST, HSN aur total nikaal ke isi form me bhar dega. Fir mismatch mapping yahin se review karke Tally queue hoga.</p>
                        </div>

                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--primary)]/50 bg-[var(--primary)]/5 px-4 py-5 text-sm font-bold text-[var(--on-surface)] hover:border-[var(--primary)]">
                            <Upload size={16} />
                            {isImportingDocument ? 'Importing invoice...' : 'Upload Invoice / PDF'}
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                capture="environment"
                                className="hidden"
                                onChange={importInvoiceFile}
                            />
                        </label>

                        {documentLabel && importedInvoice && (() => {
                            const importedLineItems = getMeaningfulLineItems(form.items);

                            return (
                                <div className="space-y-3">
                                    <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-active)]/30 p-4 sm:grid-cols-4">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">File</p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--on-surface)]">{documentLabel}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Party</p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--on-surface)]">{form.partyName || importedInvoice.partyName || 'Review required'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Invoice No.</p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--on-surface)]">{importedInvoice.invoiceNumber || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Total</p>
                                            <p className="mt-1 text-sm font-black text-emerald-500">Rs {(importedInvoice.grandTotal || importedInvoice.taxableAmount + importedInvoice.gstAmount || 0).toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-active)]/20 p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <p className="text-sm font-semibold text-[var(--on-surface)]">
                                                    {importedLineItems.length > 0
                                                        ? `${importedLineItems.length} imported line item${importedLineItems.length === 1 ? '' : 's'} ready for review`
                                                        : 'Invoice summary aa gaya, lekin line items review/add karne hain'}
                                                </p>
                                                <p className="mt-1 text-xs text-[var(--text-muted)]">
                                                    Mapping review kholo to party ya item mismatch ko existing master se map kar sakte ho, ya naya master create kar sakte ho.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleOpenMappingReview}
                                                className="rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-4 py-2 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary)]/15"
                                            >
                                                Open Mapping Review
                                            </button>
                                        </div>

                                        {importedLineItems.length > 0 ? (
                                            <div className="mt-4 space-y-2">
                                                {importedLineItems.slice(0, 5).map((item, idx) => (
                                                    <div key={`${item.name || 'item'}-${idx}`} className="grid gap-2 rounded-xl border border-[var(--border)]/60 bg-[var(--surface-variant)]/40 px-3 py-3 text-xs sm:grid-cols-[minmax(0,1.8fr)_auto_auto_auto] sm:items-center">
                                                        <div>
                                                            <p className="font-semibold text-[var(--on-surface)]">{item.name || 'Review item name'}</p>
                                                            <p className="mt-1 text-[11px] text-[var(--text-muted)]">HSN {item.hsnCode || '-'} � GST {item.gstRate || '0'}% � Unit {item.unit || 'Nos'}</p>
                                                        </div>
                                                        <div className="font-medium text-[var(--on-surface-variant)]">Qty {item.qty || '1'}</div>
                                                        <div className="font-medium text-[var(--on-surface-variant)]">Rate Rs {toNumberSafe(item.rate).toLocaleString('en-IN')}</div>
                                                        <div className="font-black text-emerald-500">Rs {toNumberSafe(item.amount).toLocaleString('en-IN')}</div>
                                                    </div>
                                                ))}
                                                {importedLineItems.length > 5 && (
                                                    <p className="text-[11px] text-[var(--text-muted)]">+{importedLineItems.length - 5} more line items niche voucher details me loaded hain.</p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                                                AI ne party/total nikaal liya, but line items detect nahi hue. Clear invoice upload karo ya niche line items manually add karo; uske baad mapping review aur queue dono yahin se hoga.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {entrySource === 'bank' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-variant)]/40 p-4">
                            <p className="text-sm font-semibold text-[var(--on-surface)]">Bank statement upload, ledger mapping, aur queue - sab isi screen par.</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Excel/PDF/image statement upload karo. Har row ko ledger se map karo, new ledger banao, aur phir bulk me Tally push ke liye queue karo.</p>
                        </div>

                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--primary)]/50 bg-[var(--primary)]/5 px-4 py-5 text-sm font-bold text-[var(--on-surface)] hover:border-[var(--primary)]">
                            <Upload size={16} />
                            {(isImportingDocument || isMatchingBankRows) ? 'Reading statement...' : 'Upload Statement Files'}
                            <input
                                type="file"
                                multiple
                                accept={BANK_UPLOAD_ACCEPT}
                                className="hidden"
                                onChange={importBankStatementFiles}
                            />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-active)]/30 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Rows Loaded</p>
                                <p className="mt-2 text-2xl font-black text-[var(--on-surface)]">{bankRows.length}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-active)]/30 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Mapped</p>
                                <p className="mt-2 text-2xl font-black text-emerald-500">{mappedBankRowCount}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-active)]/30 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Need Review</p>
                                <p className="mt-2 text-2xl font-black text-amber-500">{unresolvedBankRowCount}</p>
                            </div>
                        </div>

                        {documentLabel && (
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-active)]/20 px-4 py-3 text-xs text-[var(--text-muted)]">
                                <span>Latest upload: {documentLabel}</span>
                                <span>Total value Rs {bankReviewTotal.toLocaleString('en-IN')}</span>
                            </div>
                        )}
                    </div>
                )}
            </GlassCard>

            {/* Entry Form */}
            {entrySource !== 'bank' && (
                <GlassCard className="p-6">
                    <h2 className="text-sm font-black text-[var(--on-surface)] mb-5 uppercase tracking-wider flex items-center gap-2">
                        <FileText size={16} className="text-[var(--primary)]" /> Voucher Details
                    </h2>

                    {/* Voucher Type Selector */}
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                        {VOUCHER_TYPES.map(vt => (
                            <button
                                key={vt.key}
                                onClick={() => setForm(f => ({ ...f, voucherType: vt.key }))}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${form.voucherType === vt.key
                                    ? `bg-${vt.color}-600 text-white shadow-lg`
                                    : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                    }`}
                                style={form.voucherType === vt.key ? {
                                    background: vt.color === 'emerald' ? '#059669' : vt.color === 'orange' ? '#ea580c' : vt.color === 'blue' ? '#2563eb' : vt.color === 'red' ? '#dc2626' : '#9333ea'
                                } : {}}
                            >
                                <vt.icon size={14} />
                                {vt.label}
                            </button>
                        ))}
                    </div>

                    {/* Form Fields */}
                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                        <div className="relative">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Party / Ledger Name</label>
                            <div className="relative">
                                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={form.partyName}
                                    onChange={e => { setForm(f => ({ ...f, partyName: e.target.value })); setShowSuggestions(true); }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    placeholder="Enter party name"
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                                <AnimatePresence>
                                    {showSuggestions && filteredSuggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                                        >
                                            {filteredSuggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onMouseDown={() => { setForm(f => ({ ...f, partyName: s })); setShowSuggestions(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-xs text-[var(--on-surface)] hover:bg-[var(--surface-variant)] transition-colors border-b border-[var(--border)]/20 last:border-0"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Amount (Rs)</label>
                            <div className="relative">
                                <IndianRupee size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="number"
                                    value={form.amount}
                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    placeholder="0.00"
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] font-mono"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Date</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Narration</label>
                            <input
                                type="text"
                                value={form.narration}
                                onChange={e => setForm(f => ({ ...f, narration: e.target.value }))}
                                placeholder="Optional description"
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                            />
                        </div>
                    </div>

                    {/* Line Items (for Sales/Purchase) */}
                    {(form.voucherType === 'Sales' || form.voucherType === 'Purchase') && (
                        <div className="mb-6">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Line Items</label>
                            <div className="space-y-3">
                                {form.items.map((item, idx) => {
                                    const lineAmount = toNumberSafe(item.amount);
                                    const lineTaxRate = normalizeEffectiveGstRate(item.gstRate);
                                    const lineTaxAmount = round2((lineAmount * lineTaxRate) / 100);

                                    return (
                                        <div key={idx} className="rounded-xl border border-[var(--border)]/50 bg-[var(--surface-variant)]/40 p-3">
                                            <div className="grid grid-cols-12 gap-2 items-center">
                                                <div className="col-span-5 relative">
                                                    <input
                                                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                                        placeholder="Item name"
                                                        value={item.name}
                                                        onFocus={() => setFocusedItemIndex(idx)}
                                                        onBlur={() => setTimeout(() => setFocusedItemIndex(current => current === idx ? null : current), 120)}
                                                        onChange={e => updateLineItem(idx, 'name', e.target.value)}
                                                    />
                                                    <AnimatePresence>
                                                        {focusedItemIndex === idx && getFilteredStockSuggestions(item.name).length > 0 && (
                                                            <motion.div
                                                                initial={{ opacity: 0, y: -5 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -5 }}
                                                                className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-40 max-h-40 overflow-y-auto"
                                                            >
                                                                {getFilteredStockSuggestions(item.name).map((name, sIdx) => (
                                                                    <button
                                                                        key={sIdx}
                                                                        type="button"
                                                                        onMouseDown={() => {
                                                                            updateLineItem(idx, 'name', name);
                                                                            setFocusedItemIndex(null);
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 text-xs text-[var(--on-surface)] hover:bg-[var(--surface-variant)] border-b border-[var(--border)]/20 last:border-0"
                                                                    >
                                                                        {name}
                                                                    </button>
                                                                ))}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                                <input
                                                    className="col-span-2 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-center"
                                                    placeholder="Qty"
                                                    type="number"
                                                    value={item.qty}
                                                    onChange={e => updateLineItem(idx, 'qty', e.target.value)}
                                                />
                                                <input
                                                    className="col-span-2 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-right font-mono"
                                                    placeholder="Rate"
                                                    type="number"
                                                    value={item.rate}
                                                    onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                                                />
                                                <span className="col-span-2 text-xs font-bold text-[var(--on-surface)] text-right font-mono">
                                                    Rs {lineAmount.toLocaleString('en-IN')}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeLineItem(idx)}
                                                    className="col-span-1 flex justify-center text-[var(--text-muted)] hover:text-red-500"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-12 gap-2 items-center mt-2">
                                                <input
                                                    className="col-span-4 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] font-mono"
                                                    placeholder="HSN / SAC"
                                                    value={item.hsnCode}
                                                    onChange={e => updateLineItem(idx, 'hsnCode', e.target.value)}
                                                />
                                                <div className="col-span-3 relative">
                                                    <input
                                                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 pl-3 pr-7 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-right font-mono"
                                                        placeholder="GST %"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.gstRate}
                                                        onChange={e => updateLineItem(idx, 'gstRate', e.target.value)}
                                                    />
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">%</span>
                                                </div>
                                                <input
                                                    className="col-span-2 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                                    placeholder="Unit"
                                                    value={item.unit}
                                                    onChange={e => updateLineItem(idx, 'unit', e.target.value)}
                                                />
                                                <div className="col-span-3 text-right">
                                                    <div className="text-[11px] font-semibold text-[var(--on-surface-variant)]">
                                                        GST Rs {lineTaxAmount.toLocaleString('en-IN')}
                                                    </div>
                                                    {lineTaxRate <= 0 && (
                                                        <div className="text-[10px] font-semibold text-amber-500">
                                                            GST % blank
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                <div className="rounded-xl border border-[var(--border)]/40 bg-[var(--surface-active)]/30 p-3">
                                    <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
                                        <div className="flex items-center justify-between sm:block">
                                            <p className="text-[var(--text-muted)] uppercase tracking-wide">Taxable</p>
                                            <p className="font-bold text-[var(--on-surface)]">Rs {lineItemTotals.taxable.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="flex items-center justify-between sm:block">
                                            <p className="text-[var(--text-muted)] uppercase tracking-wide">GST</p>
                                            <p className="font-bold text-amber-500">Rs {lineItemTotals.gst.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="flex items-center justify-between sm:block">
                                            <p className="text-[var(--text-muted)] uppercase tracking-wide">Total</p>
                                            <p className="font-black text-emerald-500">Rs {lineItemTotals.gross.toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, items: [...f.items, createEmptyItem()] }))}
                                    className="flex items-center gap-1 text-xs text-[var(--primary)] font-bold hover:underline mt-2"
                                >
                                    <Plus size={14} /> Add Line Item
                                </button>
                            </div>
                        </div>
                    )}
                    {/* Preview & Submit */}
                    {form.partyName && form.amount && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gradient-to-r from-[var(--surface-variant)] to-[var(--surface-active)] rounded-xl p-4 mb-4 border border-[var(--border)]"
                        >
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Preview</p>
                            <p className="text-sm text-[var(--on-surface)]">
                                <span className="font-bold text-[var(--primary)]">{form.voucherType}</span> | {' '}
                                <span className="font-semibold">{form.partyName}</span> | {' '}
                                <span className="font-black text-emerald-500">
                                    Rs {(form.voucherType === 'Sales' || form.voucherType === 'Purchase'
                                        ? lineItemTotals.gross
                                        : parseFloat(form.amount || '0')
                                    ).toLocaleString('en-IN')}
                                </span>{' '}
                                <span className="text-[var(--text-muted)]">{form.date}</span>
                            </p>
                            {(form.voucherType === 'Sales' || form.voucherType === 'Purchase') && (
                                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                                    Taxable Rs {lineItemTotals.taxable.toLocaleString('en-IN')} | GST Rs {lineItemTotals.gst.toLocaleString('en-IN')} | Total Rs {lineItemTotals.gross.toLocaleString('en-IN')}
                                </p>
                            )}
                        </motion.div>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={isProcessing || !form.partyName || !form.amount}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-40 shadow-xl"
                    >
                        {isProcessing ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Send size={16} />
                                Queue Entry for Tally Push
                            </>
                        )}
                    </button>
                </GlassCard>
            )}

            {entrySource === 'bank' && (
                <GlassCard className="p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-sm font-black text-[var(--on-surface)] uppercase tracking-wider flex items-center gap-2">
                                <IndianRupee size={16} className="text-[var(--primary)]" /> Bank Statement Review
                            </h2>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Mapped {mappedBankRowCount}/{bankRows.length} rows. Review bachi hui narrations, naya ledger banao, phir bulk queue karo.</p>
                        </div>
                        <button
                            type="button"
                            onClick={queueBankRowsToTally}
                            disabled={isQueueingBankRows || bankRows.length === 0 || mappedBankRowCount === 0}
                            className="rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
                        >
                            {isQueueingBankRows ? 'Queueing...' : `Queue ${mappedBankRowCount} Row${mappedBankRowCount === 1 ? '' : 's'} to Tally`}
                        </button>
                    </div>

                    {ledgerSuggestions.length === 0 && (
                        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-500">
                            Ledger masters sync nahi mile. Pehle Tally se ledgers sync karo, tab smart mapping aur queueing sahi chalegi.
                        </div>
                    )}

                    {bankRows.length === 0 ? (
                        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-variant)]/30 px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                            Bank statement upload karo. Yahin par ledger mapping aur queue dono mil jayega.
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {bankRows.map((row) => {
                                const amount = Number(row.debit > 0 ? row.debit : row.credit) || 0;
                                const voucherType = row.debit > 0 ? 'Payment' : 'Receipt';
                                const hasMappedLedger = Boolean(String(row.draftLedgerName || '').trim());
                                const ledgerExists = ledgerSuggestions.some((item) => item.toLowerCase() === String(row.draftLedgerName || '').trim().toLowerCase());

                                return (
                                    <div key={row.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-variant)]/30 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                                    <span>{voucherType}</span>
                                                    <span>{row.date || 'No date'}</span>
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-[var(--on-surface)]">{row.narration}</p>
                                                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{row.suggestion.reason} - {row.suggestion.confidence}% confidence</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-base font-black text-[var(--on-surface)]">Rs {amount.toLocaleString('en-IN')}</p>
                                                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${bankStageBadgeClass(row.suggestion.stage, hasMappedLedger)}`}>
                                                    {hasMappedLedger ? row.suggestion.stage : 'review'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                                            <div>
                                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ledger Mapping</label>
                                                <input
                                                    list={`bank-ledgers-${row.id}`}
                                                    value={row.draftLedgerName}
                                                    onChange={(event) => updateBankRowDraft(row.id, event.target.value)}
                                                    placeholder="Choose or type ledger name"
                                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                                />
                                                <datalist id={`bank-ledgers-${row.id}`}>
                                                    {ledgerSuggestions.map((name) => (
                                                        <option key={`${row.id}-${name}`} value={name} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => applyLedgerToBankRows(row.id)}
                                                disabled={activeBankRowId === row.id || !String(row.draftLedgerName || '').trim()}
                                                className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--on-surface)] disabled:opacity-40"
                                            >
                                                {activeBankRowId === row.id ? 'Saving...' : ledgerExists ? 'Save Mapping' : 'Create & Map'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </GlassCard>
            )}

            <SmartMappingDialog
                isOpen={isMappingDialogOpen}
                drafts={mappingDrafts}
                partyOptions={ledgerSuggestions}
                itemOptions={stockSuggestions}
                onChangeDraft={handleMappingDraftChange}
                onClose={() => {
                    if (isApplyingMappings) return;
                    setIsMappingDialogOpen(false);
                }}
                onConfirm={handleApplyMappings}
                confirming={isApplyingMappings || isProcessing}
            />

            {/* Recent Entries */}
            {recentEntries.length > 0 && (
                <GlassCard className="p-6">
                    <h2 className="text-sm font-black text-[var(--on-surface)] mb-4 uppercase tracking-wider flex items-center gap-2">
                        <RefreshCw size={16} className="text-[var(--text-muted)]" /> Recent Pending Entries
                    </h2>
                    <div className="space-y-2">
                        {recentEntries.map((entry, idx) => {
                            const data = entry.voucher_data || {};
                            return (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)]/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${entry.status === 'synced' ? 'bg-emerald-500' : entry.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
                                            }`} />
                                        <div>
                                            <p className="text-xs font-bold text-[var(--on-surface)]">
                                                {entry.transaction_type} | {data.party_name || 'N/A'}
                                            </p>
                                            <p className="text-[10px] text-[var(--text-muted)]">
                                                {getRecentEntryDateLabel(entry)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-[var(--on-surface)]">
                                            Rs {(data.grand_total || data.total_amount || 0).toLocaleString('en-IN')}
                                        </p>
                                        <span className={`text-[8px] font-bold uppercase tracking-widest ${entry.status === 'synced' ? 'text-emerald-500' : entry.status === 'failed' ? 'text-red-500' : 'text-yellow-500'
                                            }`}>
                                            {entry.status}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </GlassCard>
            )}
        </div>
    );
}

































