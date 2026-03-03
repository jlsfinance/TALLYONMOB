import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import AutomationModeSelector from '@/components/automation/AutomationModeSelector';
import type { InvoiceDraft } from '@/features/automation/types';
import { FREE_PLAN_LIMITS } from '@/features/automation/constants';
import { extractInvoiceFromPdfLocal } from '@/features/automation/invoiceLocalExtract';
import { getAutomationMode, isCloudAllowed, setAutomationMode as persistAutomationMode, type AutomationMode } from '@/features/automation/mode';
import { getLocalInvoices, mergeInvoices, saveLocalInvoice, type LocalInvoiceRecord } from '@/features/automation/localStore';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';

const EMPTY_INVOICE: InvoiceDraft = {
    gstin: '',
    invoiceNumber: '',
    date: '',
    taxableValue: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    hsn: '',
    invoiceType: 'B2C'
};

import { callGemini } from '@/lib/GeminiService';

function toBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        const slice = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
}

function toNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isPdfFile(file: File) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImageFile(file: File) {
    return file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function isWeakExtraction(draft: InvoiceDraft) {
    return !draft.gstin && !draft.invoiceNumber && !draft.date && !draft.hsn && Number(draft.taxableValue || 0) === 0;
}

function normalizeInvoiceRecord(raw: any, userId: string, clientId: string): LocalInvoiceRecord {
    const gstin = String(raw?.gstin || '').trim().toUpperCase();

    return {
        $id: raw?.$id,
        userId,
        clientId,
        gstin,
        invoiceNumber: String(raw?.invoiceNumber || raw?.invoice_number || '').trim(),
        date: String(raw?.date || raw?.invoiceDate || raw?.invoice_date || '').trim(),
        taxableValue: toNumber(raw?.taxableValue ?? raw?.taxable_value, 0),
        cgst: toNumber(raw?.cgst, 0),
        sgst: toNumber(raw?.sgst, 0),
        igst: toNumber(raw?.igst, 0),
        hsn: String(raw?.hsn || raw?.hsnCode || raw?.hsn_code || '').trim(),
        invoiceType: gstin ? 'B2B' : 'B2C',
        createdAt: String(raw?.createdAt || raw?.$createdAt || new Date().toISOString())
    };
}

async function extractInvoiceUsingCloud(file: File, geminiApiKey?: string): Promise<{ extracted: InvoiceDraft; rawTextPreview: string }> {
    const fileBuffer = await file.arrayBuffer();
    const base64File = toBase64(fileBuffer);
    const mimeType = file.type || (isPdfFile(file) ? 'application/pdf' : 'image/jpeg');

    const result = await callGemini({
        expectJson: true,
        temperature: 0,
        apiKey: geminiApiKey,
        systemPrompt: [
            'You are an expert invoice data extractor for Indian businesses.',
            'Extract structured data from the uploaded invoice document.',
            'Required JSON schema:',
            '{"gstin":"string","invoiceNumber":"string","date":"YYYY-MM-DD","taxableValue":number,"cgst":number,"sgst":number,"igst":number,"hsn":"string"}',
            'Rules:',
            '- If GSTIN is visible, extract it. Otherwise leave empty string.',
            '- taxableValue = total amount before GST',
            '- cgst, sgst, igst = GST amounts (not percentages)',
            '- hsn = HSN/SAC code if visible',
            '- date must be YYYY-MM-DD format',
            '- Return valid JSON only. No markdown.'
        ].join(' '),
        userPrompt: 'Extract invoice data from this document. Return JSON only.',
        attachments: [{ mimeType, dataBase64: base64File }]
    });

    const data = result.json as any;
    if (!data) {
        throw new Error('Could not extract invoice data. Try a clearer image.');
    }

    return {
        extracted: {
            ...EMPTY_INVOICE,
            gstin: String(data.gstin || '').trim().toUpperCase(),
            invoiceNumber: String(data.invoiceNumber || data.invoice_number || ''),
            date: String(data.date || ''),
            taxableValue: toNumber(data.taxableValue ?? data.taxable_value, 0),
            cgst: toNumber(data.cgst, 0),
            sgst: toNumber(data.sgst, 0),
            igst: toNumber(data.igst, 0),
            hsn: String(data.hsn || ''),
            invoiceType: data.gstin ? 'B2B' : 'B2C'
        },
        rawTextPreview: result.text || ''
    };
}
export default function InvoiceImportPage() {
    const { clientId: clientIdFromParams } = useParams();
    const { selectedCompany, user, companies } = useAuth() as any;
    const navigate = useNavigate();

    const clientId = clientIdFromParams || selectedCompany?.id || '';
    const isClientLimitExceeded = (companies?.length || 0) > FREE_PLAN_LIMITS.maxClients;

    const [mode, setMode] = useState<AutomationMode>(() => {
        if (typeof window === 'undefined') return 'hybrid';
        return getAutomationMode();
    });
    const [draft, setDraft] = useState<InvoiceDraft>(EMPTY_INVOICE);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedInvoices, setSavedInvoices] = useState<LocalInvoiceRecord[]>([]);
    const [rawTextPreview, setRawTextPreview] = useState('');

    const cloudAllowed = isCloudAllowed(mode);
    const hasGeminiApiKey = Boolean(getUserGeminiApiKey(user?.id));

    useEffect(() => {
        if (!user?.id || !clientId) return;
        void loadSavedInvoices(mode);
    }, [user?.id, clientId, mode]);

    const onModeChange = (nextMode: AutomationMode) => {
        setMode(nextMode);
        persistAutomationMode(nextMode);
    };

    const loadSavedInvoices = async (_activeMode: AutomationMode) => {
        if (!user?.id || !clientId) return;
        const localItems = getLocalInvoices(user.id, clientId);
        setSavedInvoices(localItems);
    };


    const onUploadInvoice = async (event: ChangeEvent<HTMLInputElement>) => {
        if (isClientLimitExceeded) {
            toast.error(`Free plan supports only ${FREE_PLAN_LIMITS.maxClients} clients`);
            return;
        }

        const file = event.target.files?.[0];
        if (!file) return;

        if (!isPdfFile(file) && !isImageFile(file)) {
            toast.error('Please upload a PDF or image file');
            event.target.value = '';
            return;
        }

        const geminiApiKey = getUserGeminiApiKey(user?.id);

        setLoading(true);
        try {
            let payload: { extracted: InvoiceDraft; rawTextPreview: string };
            let source: 'local' | 'cloud' = 'local';

            if (isPdfFile(file)) {
                try {
                    payload = await extractInvoiceFromPdfLocal(file);

                    // Scanned PDFs often return weak/empty local extraction. Fallback to cloud.
                    if (isWeakExtraction(payload.extracted)) {
                        throw new Error('Local extraction is incomplete');
                    }
                } catch (localError) {
                    if (!cloudAllowed) {
                        throw localError;
                    }

                    payload = await extractInvoiceUsingCloud(file, geminiApiKey);
                    source = 'cloud';
                }
            } else {
                if (!cloudAllowed) {
                    throw new Error('Image extraction needs cloud mode. Switch to Hybrid/Cloud fallback mode.');
                }

                payload = await extractInvoiceUsingCloud(file, geminiApiKey);
                source = 'cloud';
            }

            setDraft({
                ...EMPTY_INVOICE,
                ...payload.extracted,
                invoiceType: payload.extracted?.gstin ? 'B2B' : 'B2C'
            });
            setRawTextPreview(payload.rawTextPreview || '');

            toast.success(`Invoice extracted using ${source} mode. Review and save.`);
        } catch (error: any) {
            toast.error(error?.message || 'Invoice extraction failed');
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };

    const updateField = (field: keyof InvoiceDraft, value: string) => {
        setDraft((prev) => {
            const next: InvoiceDraft = {
                ...prev,
                [field]:
                    field === 'taxableValue' || field === 'cgst' || field === 'sgst' || field === 'igst'
                        ? Number(value || 0)
                        : value
            } as InvoiceDraft;

            next.invoiceType = next.gstin ? 'B2B' : 'B2C';
            return next;
        });
    };

    const saveInvoice = async () => {
        if (isClientLimitExceeded) {
            toast.error(`Free plan supports only ${FREE_PLAN_LIMITS.maxClients} clients`);
            return;
        }

        if (!user?.id || !clientId) {
            toast.error('Missing user or client context');
            return;
        }

        if (!draft.invoiceNumber) {
            toast.error('Invoice number is required');
            return;
        }

        setSaving(true);
        try {
            const localRecord = normalizeInvoiceRecord(
                {
                    ...draft,
                    invoiceType: draft.gstin ? 'B2B' : 'B2C',
                    createdAt: new Date().toISOString()
                },
                user.id,
                clientId
            );

            saveLocalInvoice(localRecord);
            toast.success('Invoice saved locally');

            setDraft(EMPTY_INVOICE);
            setRawTextPreview('');
            await loadSavedInvoices(mode);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save invoice');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-base font-bold text-[var(--on-surface)]">Invoice Structuring</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Client: {selectedCompany?.name || clientId}</p>
                </div>
            </HeaderPortal>

            {isClientLimitExceeded && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    Client limit exceeded for free plan. Upgrade to process more than {FREE_PLAN_LIMITS.maxClients} clients.
                </div>
            )}

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--on-surface)]">Structured Invoice Import</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <AutomationModeSelector mode={mode} onChange={onModeChange} />
                        <button
                            type="button"
                            onClick={() => navigate('/settings')}
                            className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--on-surface)] hover:bg-[var(--surface-hover)]"
                        >
                            Set API Key
                        </button>
                    </div>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                    PDF local extraction + cloud fallback. Images use cloud extraction.
                </p>
                {cloudAllowed && !hasGeminiApiKey && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <span>Gemini API key missing. Cloud extraction ke liye key set karo.</span>
                        <button
                            type="button"
                            onClick={() => navigate('/settings')}
                            className="px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
                        >
                            Open Settings
                        </button>
                    </div>
                )}
                <label className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium cursor-pointer hover:opacity-90">
                    Upload Invoice PDF / Image
                    <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={onUploadInvoice}
                        disabled={isClientLimitExceeded}
                    />
                </label>
                {loading && (
                    <p className="text-xs text-[var(--text-muted)]">
                        {cloudAllowed ? 'Extracting fields (local first, cloud fallback)...' : 'Extracting fields locally...'}
                    </p>
                )}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
                <h2 className="text-sm font-semibold text-[var(--on-surface)]">Editable Preview</h2>

                <div className="grid md:grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        GSTIN
                        <input
                            value={draft.gstin}
                            onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        Invoice Number
                        <input
                            value={draft.invoiceNumber}
                            onChange={(e) => updateField('invoiceNumber', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        Date
                        <input
                            value={draft.date}
                            onChange={(e) => updateField('date', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        HSN
                        <input
                            value={draft.hsn}
                            onChange={(e) => updateField('hsn', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        Taxable Value
                        <input
                            type="number"
                            value={draft.taxableValue}
                            onChange={(e) => updateField('taxableValue', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        CGST
                        <input
                            type="number"
                            value={draft.cgst}
                            onChange={(e) => updateField('cgst', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        SGST
                        <input
                            type="number"
                            value={draft.sgst}
                            onChange={(e) => updateField('sgst', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>

                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                        IGST
                        <input
                            type="number"
                            value={draft.igst}
                            onChange={(e) => updateField('igst', e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)]"
                        />
                    </label>
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-muted)]">Auto Classification: {draft.invoiceType}</p>
                    <button
                        onClick={saveInvoice}
                        disabled={saving || isClientLimitExceeded}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Invoice'}
                    </button>
                </div>

                {rawTextPreview && (
                    <details className="border border-[var(--border)] rounded-lg p-3">
                        <summary className="cursor-pointer text-xs font-medium text-[var(--on-surface)]">Extracted text preview</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--text-muted)]">{rawTextPreview}</pre>
                    </details>
                )}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                    <h2 className="text-sm font-semibold text-[var(--on-surface)]">Saved Invoices ({savedInvoices.length})</h2>
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-container)] text-[var(--text-muted)]">
                            <tr>
                                <th className="text-left px-3 py-2">Invoice</th>
                                <th className="text-left px-3 py-2">Date</th>
                                <th className="text-left px-3 py-2">Type</th>
                                <th className="text-right px-3 py-2">Taxable</th>
                                <th className="text-left px-3 py-2">GSTIN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {savedInvoices.map((item, index) => (
                                <tr
                                    key={`${item.$id || 'local'}-${item.invoiceNumber}-${item.date}-${index}`}
                                    className="border-t border-[var(--border)]"
                                >
                                    <td className="px-3 py-2">{item.invoiceNumber}</td>
                                    <td className="px-3 py-2">{item.date}</td>
                                    <td className="px-3 py-2">{item.invoiceType}</td>
                                    <td className="px-3 py-2 text-right">{Number(item.taxableValue || 0).toLocaleString('en-IN')}</td>
                                    <td className="px-3 py-2">{item.gstin || '-'}</td>
                                </tr>
                            ))}
                            {savedInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-muted)]">
                                        No invoices saved yet.
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






