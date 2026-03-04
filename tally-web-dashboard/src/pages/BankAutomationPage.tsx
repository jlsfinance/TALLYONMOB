import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { callGemini } from '@/lib/GeminiService';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import AutomationModeSelector from '@/components/automation/AutomationModeSelector';
import { FREE_PLAN_LIMITS } from '@/features/automation/constants';
import { parseBankStatementRowsFromUnknown, parseBankStatementWorkbook } from '@/features/automation/bankStatement';
import { deriveMappingKeyword, manualLedgerSuggestion, suggestLedgerHybrid } from '@/features/automation/ledgerMatcher';
import { generateTallyXml as generateTallyXmlLocal } from '@/features/automation/tallyXml';
import { getAutomationMode, isCloudAllowed, setAutomationMode as persistAutomationMode, type AutomationMode } from '@/features/automation/mode';
import {
    getLocalLedgerMappings,
    mergeLedgerMappings,
    saveLocalLedgerMapping,
    getLocalLedgers,
    saveLocalLedgers
} from '@/features/automation/localStore';
import type { BankPreviewRow, BankTransactionRow, LedgerMappingRecord } from '@/features/automation/types';

const MAX_GEMINI_MATCH_CALLS = 120;
const SUPPORTED_UPLOAD_ACCEPT = '.xlsx,.xls,application/pdf,image/png,image/jpeg,image/jpg,image/webp';

function getFileExtension(fileName: string): string {
    const segments = fileName.toLowerCase().split('.');
    return segments.length > 1 ? segments[segments.length - 1] : '';
}

function isExcelFile(file: File): boolean {
    const extension = getFileExtension(file.name);
    return extension === 'xlsx' || extension === 'xls';
}

function isPdfFile(file: File): boolean {
    return getFileExtension(file.name) === 'pdf' || file.type === 'application/pdf';
}

function isImageFile(file: File): boolean {
    if (file.type.startsWith('image/')) return true;
    const extension = getFileExtension(file.name);
    return ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
}

function fileToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

async function extractRowsFromDocumentWithGemini(file: File): Promise<BankTransactionRow[]> {
    const buffer = await file.arrayBuffer();
    const base64 = fileToBase64(buffer);

    const response = await callGemini({
        expectJson: true,
        temperature: 0,
        systemPrompt: [
            'You extract bank transactions from bank statement documents.',
            'Return valid JSON only.',
            'Required output schema: {"transactions":[{"date":"YYYY-MM-DD","narration":"string","debit":number,"credit":number}]}.',
            'If amount is debit, set credit as 0. If amount is credit, set debit as 0.',
            'Do not include markdown, explanation, or extra keys.'
        ].join(' '),
        userPrompt: [
            'Read the attached bank statement and extract all transaction rows.',
            'Return JSON strictly in the required schema.',
            'Use 0 for missing debit/credit values.'
        ].join(' '),
        attachments: [
            {
                mimeType: file.type || (isPdfFile(file) ? 'application/pdf' : 'image/jpeg'),
                dataBase64: base64
            }
        ]
    });

    const parsedRows = parseBankStatementRowsFromUnknown(response.json ?? response.text);
    if (parsedRows.length === 0) {
        throw new Error('No usable rows found in this file');
    }

    return parsedRows;
}

// Ledger mappings are saved locally first and synced to cloud when available

async function fetchCloudLedgers(clientId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('ledgers')
        .select('name')
        .eq('company_id', clientId)
        .order('name')
        .limit(5000);

    if (error) throw error;

    return (data || [])
        .map((item: any) => String(item.name || '').trim())
        .filter(Boolean);
}

async function fetchCloudLedgerMappings(clientId: string, userId: string): Promise<LedgerMappingRecord[]> {
    const { data, error } = await supabase
        .from('bank_ledger_mappings')
        .select('normalized_keyword, ledger_name, created_at')
        .eq('company_id', clientId)
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(5000);

    if (error) throw error;

    return (data || [])
        .map((item: any) => {
            const normalizedKeyword = String(item?.normalized_keyword || '').trim();
            const ledgerName = String(item?.ledger_name || '').trim();
            if (!normalizedKeyword || !ledgerName) return null;

            return {
                userId,
                clientId,
                normalizedKeyword,
                ledgerName,
                createdAt: String(item?.created_at || new Date().toISOString())
            } as LedgerMappingRecord;
        })
        .filter(Boolean) as LedgerMappingRecord[];
}

async function persistCloudLedgerMapping(record: LedgerMappingRecord): Promise<void> {
    const normalizedKeyword = String(record.normalizedKeyword || '').trim();
    const ledgerName = String(record.ledgerName || '').trim();
    if (!normalizedKeyword || !ledgerName) return;

    const { data: existingRows, error: fetchError } = await supabase
        .from('bank_ledger_mappings')
        .select('id, ledger_name')
        .eq('company_id', record.clientId)
        .eq('created_by', record.userId)
        .eq('normalized_keyword', normalizedKeyword)
        .limit(1);

    if (fetchError) throw fetchError;

    const existing = (existingRows || [])[0] as any;
    const now = new Date().toISOString();

    if (existing?.id) {
        if (String(existing.ledger_name || '').trim() === ledgerName) {
            return;
        }

        const { error: updateError } = await supabase
            .from('bank_ledger_mappings')
            .update({
                ledger_name: ledgerName,
                source: 'manual',
                confidence: 100,
                owner_id: record.userId,
                updated_at: now
            })
            .eq('id', existing.id);

        if (updateError) throw updateError;
        return;
    }

    const { error: insertError } = await supabase
        .from('bank_ledger_mappings')
        .insert([{
            company_id: record.clientId,
            owner_id: record.userId,
            created_by: record.userId,
            normalized_keyword: normalizedKeyword,
            ledger_name: ledgerName,
            source: 'manual',
            confidence: 100,
            created_at: now,
            updated_at: now
        }]);

    if (insertError) throw insertError;
}

function confidenceBadgeClass(score: number) {
    if (score >= 90) return 'bg-green-100 text-green-700';
    if (score >= 70) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
}

function buildRowFingerprint(row: Pick<BankTransactionRow, 'date' | 'normalizedNarration' | 'debit' | 'credit'>): string {
    const side = row.debit > 0 ? `D:${row.debit.toFixed(2)}` : `C:${row.credit.toFixed(2)}`;
    return `${row.date}|${row.normalizedNarration}|${side}`;
}

function dedupeRows(rows: BankTransactionRow[]): BankTransactionRow[] {
    const seen = new Set<string>();
    const deduped: BankTransactionRow[] = [];

    rows.forEach((row) => {
        const fingerprint = buildRowFingerprint(row);
        if (seen.has(fingerprint)) return;
        seen.add(fingerprint);
        deduped.push({
            ...row,
            id: `row-${deduped.length + 1}`
        });
    });

    return deduped;
}

export default function BankAutomationPage() {
    const { clientId: clientIdFromParams } = useParams();
    const { selectedCompany, user, companies } = useAuth() as any;

    const clientId = clientIdFromParams || selectedCompany?.id || '';

    const [mode, setMode] = useState<AutomationMode>(() => {
        if (typeof window === 'undefined') return 'hybrid';
        return getAutomationMode();
    });
    const [ledgers, setLedgers] = useState<string[]>([]);
    const [mappings, setMappings] = useState<LedgerMappingRecord[]>([]);
    const [rows, setRows] = useState<BankPreviewRow[]>([]);
    const [loadingMasters, setLoadingMasters] = useState(false);
    const [matching, setMatching] = useState(false);
    const [queueing, setQueueing] = useState(false);

    const isClientLimitExceeded = (companies?.length || 0) > FREE_PLAN_LIMITS.maxClients;
    const cloudAllowed = isCloudAllowed(mode);

    const unmatchedCount = useMemo(
        () => rows.filter((row) => row.suggestion.stage === 'unmatched').length,
        [rows]
    );

    useEffect(() => {
        if (!clientId || !user?.id) return;
        void loadMasters(mode);
    }, [clientId, user?.id, mode]);

    const onModeChange = (nextMode: AutomationMode) => {
        setMode(nextMode);
        persistAutomationMode(nextMode);
    };

    const loadMasters = async (activeMode: AutomationMode) => {
        if (!clientId || !user?.id) return;

        const localLedgers = getLocalLedgers(user.id, clientId);
        const localMappings = getLocalLedgerMappings(user.id, clientId);

        setLoadingMasters(true);
        setLedgers(localLedgers);
        setMappings(localMappings);

        if (!isCloudAllowed(activeMode)) {
            setLoadingMasters(false);
            return;
        }

        try {
            const [cloudLedgers, cloudMappings] = await Promise.all([
                fetchCloudLedgers(clientId),
                fetchCloudLedgerMappings(clientId, user.id)
            ]);

            const mergedLedgers = Array.from(new Set([...localLedgers, ...cloudLedgers]));
            const mergedMappings = mergeLedgerMappings(cloudMappings, localMappings);

            setLedgers(mergedLedgers);
            setMappings(mergedMappings);

            if (mergedLedgers.length > 0) {
                saveLocalLedgers(user.id, clientId, mergedLedgers);
            }

            if (cloudMappings.length > 0) {
                cloudMappings.forEach((mapping) => saveLocalLedgerMapping(mapping));
            }
        } catch (error: any) {
            if (localLedgers.length === 0) {
                toast.error('No ledgers found. Sync data from Tally first.');
            }
        } finally {
            setLoadingMasters(false);
        }
    };

    const runHybridMatching = async (transactions: BankTransactionRow[]) => {
        if (ledgers.length === 0) {
            toast.error('No ledgers found for this client');
            return;
        }

        setMatching(true);
        const nextRows: BankPreviewRow[] = [];
        let geminiCalls = 0;

        for (const row of transactions) {
            const allowGemini = cloudAllowed && geminiCalls < MAX_GEMINI_MATCH_CALLS;
            const suggestion = await suggestLedgerHybrid({
                row,
                ledgers,
                mappings,
                enableGemini: allowGemini
            });

            if (suggestion.stage === 'gemini') {
                geminiCalls += 1;
            }

            nextRows.push({ ...row, suggestion });
        }

        setRows(nextRows);
        setMatching(false);

        if (cloudAllowed && geminiCalls >= MAX_GEMINI_MATCH_CALLS) {
            toast('Gemini match budget reached for this upload. Remaining rows are fuzzy/manual.');
        }
    };
    const onUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
        if (isClientLimitExceeded) {
            toast.error(`Free plan supports only ${FREE_PLAN_LIMITS.maxClients} clients`);
            return;
        }

        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        try {
            const allRows: BankTransactionRow[] = [];
            const failedFiles: string[] = [];

            for (const file of files) {
                if (!isExcelFile(file) && !isPdfFile(file) && !isImageFile(file)) {
                    failedFiles.push(file.name);
                    continue;
                }

                try {
                    const parsedRows = isExcelFile(file)
                        ? parseBankStatementWorkbook(await file.arrayBuffer())
                        : await extractRowsFromDocumentWithGemini(file);
                    allRows.push(...parsedRows);
                } catch (_) {
                    failedFiles.push(file.name);
                }
            }

            if (allRows.length === 0) {
                toast.error('No usable rows found in this statement');
                return;
            }

            const dedupedRows = dedupeRows(allRows);
            await runHybridMatching(dedupedRows);

            if (failedFiles.length > 0) {
                toast(`${failedFiles.length} file skipped. Supported: .xlsx, .xls, .pdf, .png, .jpg, .jpeg, .webp`);
            }

            const fileLabel = files.length === 1 ? files[0].name : `${files.length} files`;
            toast.success(`Loaded ${dedupedRows.length} transactions from ${fileLabel}`);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to parse uploaded file');
        } finally {
            event.target.value = '';
        }
    };

    const onManualLedgerChange = async (rowId: string, ledgerName: string) => {
        const targetRow = rows.find((row) => row.id === rowId);
        if (!targetRow || !user?.id || !clientId || !ledgerName) return;
        if (isClientLimitExceeded) return;

        const targetKeyword = deriveMappingKeyword(targetRow.normalizedNarration || targetRow.narration) || targetRow.normalizedNarration;

        const updatedRows = rows.map((row) => {
            const rowKeyword = deriveMappingKeyword(row.normalizedNarration || row.narration) || row.normalizedNarration;
            const applyToRow = row.id === rowId
                || (targetKeyword && rowKeyword && (rowKeyword === targetKeyword || rowKeyword.includes(targetKeyword) || targetKeyword.includes(rowKeyword)));

            if (!applyToRow) return row;

            return {
                ...row,
                suggestion: manualLedgerSuggestion(ledgerName)
            };
        });
        setRows(updatedRows);

        const localMapping: LedgerMappingRecord = {
            userId: user.id,
            clientId,
            normalizedKeyword: targetKeyword || targetRow.normalizedNarration,
            ledgerName,
            createdAt: new Date().toISOString()
        };

        saveLocalLedgerMapping(localMapping);
        setMappings((prev) => mergeLedgerMappings([localMapping], prev));

        if (cloudAllowed) {
            try {
                await persistCloudLedgerMapping(localMapping);
            } catch (error: any) {
                const message = String(error?.message || '').toLowerCase();
                if (message.includes('bank_ledger_mappings') || message.includes('404') || message.includes('401')) {
                    toast('Cloud mapping table missing/unauthorized. Local memory is still saved.');
                }
            }
        }

        const impactedRows = updatedRows.filter((row) => row.suggestion.ledgerName === ledgerName).length;
        toast.success(`Ledger mapping saved (applied to ${impactedRows} rows)`);
    };

    const generateTallyXml = async () => {
        if (isClientLimitExceeded) {
            toast.error(`Free plan supports only ${FREE_PLAN_LIMITS.maxClients} clients`);
            return;
        }

        const usableRows = rows.filter((row) => row.suggestion.ledgerName);
        if (usableRows.length === 0) {
            toast.error('No mapped rows available for XML export');
            return;
        }

        const ledgerSet = new Set(usableRows.map((row) => row.suggestion.ledgerName));

        const payload = {
            ledgers: Array.from(ledgerSet).map((name) => ({ name })),
            vouchers: usableRows.map((row) => ({
                date: row.date,
                voucherType: row.debit > 0 ? 'Payment' : 'Receipt',
                narration: row.narration,
                entries: [
                    {
                        ledgerName: row.suggestion.ledgerName,
                        amount: row.debit > 0 ? row.debit : row.credit,
                        isDebit: row.debit > 0
                    }
                ]
            }))
        };

        try {
            const xml = generateTallyXmlLocal(payload);
            if (!xml) throw new Error('XML generation returned empty payload');

            const blob = new Blob([xml], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `tally_${clientId}_bank_vouchers.xml`;
            anchor.click();
            URL.revokeObjectURL(url);

            toast.success('Tally XML generated successfully');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to generate XML');
        }
    };

    const queueMappedRowsToTally = async () => {
        if (!clientId || !user?.id) {
            toast.error('Missing client/user context');
            return;
        }

        const usableRows = rows.filter((row) => row.suggestion.ledgerName && (row.debit > 0 || row.credit > 0));
        if (usableRows.length === 0) {
            toast.error('No mapped rows available to queue');
            return;
        }

        setQueueing(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            const pendingRows = usableRows.map((row) => {
                const isPayment = row.debit > 0;
                const amount = Number(isPayment ? row.debit : row.credit) || 0;
                const voucherType = isPayment ? 'Payment' : 'Receipt';
                const voucherDate = row.date || today;

                return {
                    company_id: clientId,
                    owner_id: user.id,
                    created_by: user.id,
                    status: 'pending',
                    transaction_type: voucherType,
                    voucher_data: {
                        source: 'bank_automation',
                        voucher_type: voucherType,
                        voucher_type_name: voucherType,
                        voucher_date: voucherDate,
                        date: voucherDate,
                        party_ledger_name: row.suggestion.ledgerName,
                        party_name: row.suggestion.ledgerName,
                        amount,
                        total_amount: amount,
                        narration: row.narration,
                        bank_transaction: {
                            narration: row.narration,
                            debit: row.debit || 0,
                            credit: row.credit || 0
                        },
                        ledger_entries: [
                            {
                                ledger_name: row.suggestion.ledgerName,
                                amount,
                                is_debit: isPayment
                            }
                        ]
                    }
                };
            });

            const { error } = await (supabase as any)
                .from('pending_transactions')
                .insert(pendingRows);

            if (error) {
                const message = String(error?.message || '').toLowerCase();
                if (message.includes('pending_transactions') || message.includes('404')) {
                    throw new Error('pending_transactions table missing. Run INSFORGE_OPTIONAL_TABLES_ADDITIVE.sql');
                }
                if (message.includes('401') || message.includes('permission') || message.includes('policy')) {
                    throw new Error('No permission to queue bank entries. Re-login and re-run optional SQL with RLS policies.');
                }
                throw error;
            }

            toast.success(`${pendingRows.length} bank entries queued for Tally push`);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to queue bank entries');
        } finally {
            setQueueing(false);
        }
    };

    return (
        <div className="space-y-6">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-base font-bold text-[var(--on-surface)]">Bank Statement Automation</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Client: {selectedCompany?.name || clientId}</p>
                </div>
            </HeaderPortal>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--on-surface)]">Free Plan Limits</p>
                    <AutomationModeSelector mode={mode} onChange={onModeChange} />
                </div>
                <div className="text-xs text-[var(--text-muted)] grid md:grid-cols-2 gap-2">
                    <p>Max {FREE_PLAN_LIMITS.maxClients} clients per user</p>
                    <p>Upload full statement supported (larger files may take longer)</p>
                    <p>No WhatsApp automation</p>
                    <p>No direct GST filing</p>
                    <p>No real-time Tally sync</p>
                    <p>PDF/Image extraction uses AI parser</p>
                </div>
            </div>

            {isClientLimitExceeded && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    Client limit exceeded for free plan. Upgrade to process more than {FREE_PLAN_LIMITS.maxClients} clients.
                </div>
            )}

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                <label className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium cursor-pointer hover:opacity-90">
                    Upload Bank Statement Files
                    <input type="file" multiple accept={SUPPORTED_UPLOAD_ACCEPT} className="hidden" onChange={onUploadFile} />
                </label>

                <button
                    onClick={generateTallyXml}
                    disabled={rows.length === 0}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--on-surface)] disabled:opacity-50"
                >
                    Generate Tally XML
                </button>

                <button
                    onClick={queueMappedRowsToTally}
                    disabled={queueing || rows.length === 0 || isClientLimitExceeded}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-50"
                >
                    {queueing ? 'Queueing...' : 'Queue to Tally Sync'}
                </button>

                <div className="text-xs text-[var(--text-muted)]">
                    {loadingMasters
                        ? 'Loading ledgers and mappings...'
                        : matching
                            ? cloudAllowed
                                ? 'Running local matching with cloud fallback...'
                                : 'Running local matching...'
                            : `${rows.length} rows parsed, ${unmatchedCount} need manual review`}
                </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                    <h2 className="text-sm font-semibold text-[var(--on-surface)]">Preview</h2>
                </div>

                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-container)] text-[var(--text-muted)]">
                            <tr>
                                <th className="text-left px-3 py-2">Date</th>
                                <th className="text-left px-3 py-2">Narration</th>
                                <th className="text-right px-3 py-2">Debit</th>
                                <th className="text-right px-3 py-2">Credit</th>
                                <th className="text-left px-3 py-2">Suggested Ledger</th>
                                <th className="text-left px-3 py-2">Confidence</th>
                                <th className="text-left px-3 py-2">Edit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-t border-[var(--border)] align-top">
                                    <td className="px-3 py-2 whitespace-nowrap">{row.date || '-'}</td>
                                    <td className="px-3 py-2 min-w-[280px]">{row.narration}</td>
                                    <td className="px-3 py-2 text-right">{row.debit ? row.debit.toLocaleString('en-IN') : '-'}</td>
                                    <td className="px-3 py-2 text-right">{row.credit ? row.credit.toLocaleString('en-IN') : '-'}</td>
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-[var(--on-surface)]">{row.suggestion.ledgerName || 'Manual required'}</div>
                                        <div className="text-xs text-[var(--text-muted)]">{row.suggestion.reason}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`text-xs px-2 py-1 rounded-full ${confidenceBadgeClass(row.suggestion.confidence)}`}>
                                            {row.suggestion.confidence}%
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <select
                                            value={row.suggestion.ledgerName}
                                            onChange={(event) => onManualLedgerChange(row.id, event.target.value)}
                                            className="w-[220px] px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)]"
                                        >
                                            <option value="">Select ledger</option>
                                            {ledgers.map((ledger) => (
                                                <option key={`${row.id}-${ledger}`} value={ledger}>
                                                    {ledger}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">
                                        Upload an Excel, PDF, or image statement to start automation.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}











