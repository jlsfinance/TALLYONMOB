import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import AutomationModeSelector from '@/components/automation/AutomationModeSelector';
import { FREE_PLAN_LIMITS } from '@/features/automation/constants';
import { generateGstr1JsonLocal } from '@/features/automation/gstLocal';
import { getAutomationMode, isCloudAllowed, setAutomationMode as persistAutomationMode, type AutomationMode } from '@/features/automation/mode';
import { getLocalInvoices, mergeInvoices, saveLocalInvoice, type LocalInvoiceRecord } from '@/features/automation/localStore';

function toNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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
        invoiceType: String(raw?.invoiceType || raw?.invoice_type || (gstin ? 'B2B' : 'B2C')).toUpperCase(),
        createdAt: String(raw?.createdAt || raw?.$createdAt || new Date().toISOString())
    };
}

async function fetchImportedInvoicesFromCloud(userId: string, clientId: string) {
    const { data, error } = await supabase
        .from('imported_invoices')
        .select('id, gstin, invoice_number, invoice_date, taxable_value, cgst, sgst, igst, hsn_code, invoice_type, created_at')
        .eq('company_id', clientId)
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(10000);

    if (error) throw error;

    return (data || []).map((item: any) => ({
        $id: item?.id,
        gstin: item?.gstin,
        invoiceNumber: item?.invoice_number,
        date: item?.invoice_date,
        taxableValue: item?.taxable_value,
        cgst: item?.cgst,
        sgst: item?.sgst,
        igst: item?.igst,
        hsn: item?.hsn_code,
        invoiceType: item?.invoice_type,
        createdAt: item?.created_at
    }));
}

async function saveGstAutomationRunToCloud({
    userId,
    clientId,
    sourceMode,
    invoices,
    result
}: {
    userId: string;
    clientId: string;
    sourceMode: 'local' | 'cloud';
    invoices: LocalInvoiceRecord[];
    result: any;
}) {
    const validation = result?.validation || {};

    const { error } = await supabase
        .from('gst_automation_runs')
        .insert([{
            company_id: clientId,
            owner_id: userId,
            created_by: userId,
            source_mode: sourceMode,
            invoice_count: invoices.length,
            result_json: result,
            validation_errors: validation?.errors || [],
            validation_warnings: validation?.warnings || [],
            created_at: new Date().toISOString()
        }]);

    if (error) throw error;
}

export default function GstAutomationPage() {
    const { clientId: clientIdFromParams } = useParams();
    const { selectedCompany, user, companies } = useAuth() as any;

    const clientId = clientIdFromParams || selectedCompany?.id || '';
    const isClientLimitExceeded = (companies?.length || 0) > FREE_PLAN_LIMITS.maxClients;

    const [mode, setMode] = useState<AutomationMode>(() => {
        if (typeof window === 'undefined') return 'hybrid';
        return getAutomationMode();
    });
    const [invoices, setInvoices] = useState<LocalInvoiceRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [resultSource, setResultSource] = useState<'local' | 'cloud' | null>(null);

    const cloudAllowed = isCloudAllowed(mode);

    useEffect(() => {
        if (!user?.id || !clientId) return;
        void loadInvoices(mode);
    }, [user?.id, clientId, mode]);

    const onModeChange = (nextMode: AutomationMode) => {
        setMode(nextMode);
        persistAutomationMode(nextMode);
    };

    const loadInvoices = async (activeMode: AutomationMode) => {
        if (!user?.id || !clientId) return;

        const localItems = getLocalInvoices(user.id, clientId);
        setInvoices(localItems);

        setLoading(true);
        try {
            if (!isCloudAllowed(activeMode)) {
                return;
            }

            const cloudItems = await fetchImportedInvoicesFromCloud(user.id, clientId);
            const normalizedCloud = cloudItems.map((item: any) => normalizeInvoiceRecord(item, user.id, clientId));
            normalizedCloud.forEach((item: LocalInvoiceRecord) => saveLocalInvoice(item));
            setInvoices(mergeInvoices(localItems, normalizedCloud));
        } catch (error: any) {
            const message = String(error?.message || '').toLowerCase();
            if (localItems.length === 0) {
                if (message.includes('imported_invoices') || message.includes('404')) {
                    toast.error('imported_invoices table missing. Run INSFORGE_OPTIONAL_TABLES_ADDITIVE.sql');
                } else if (message.includes('401') || message.includes('permission') || message.includes('policy')) {
                    toast.error('No permission to load cloud invoices. Re-login and run RLS SQL patch.');
                } else {
                    toast.error(error?.message || 'Failed to load invoices');
                }
            } else {
                toast('Cloud sync unavailable. Using local invoices.');
            }
        } finally {
            setLoading(false);
        }
    };

    const generateGstr1Json = async () => {
        if (isClientLimitExceeded) {
            toast.error(`Free plan supports only ${FREE_PLAN_LIMITS.maxClients} clients`);
            return;
        }

        if (!clientId) return;
        if (invoices.length === 0) {
            toast.error('No invoices available for GST generation');
            return;
        }

        setGenerating(true);
        try {
            const payload = generateGstr1JsonLocal(clientId, invoices);
            const source: 'local' | 'cloud' = 'local';

            setResult(payload);
            setResultSource(source);

            if (cloudAllowed && user?.id) {
                try {
                    const sourceMode: 'local' | 'cloud' = mode === 'local' ? 'local' : 'cloud';
                    await saveGstAutomationRunToCloud({
                        userId: user.id,
                        clientId,
                        sourceMode,
                        invoices,
                        result: payload
                    });
                } catch (saveError: any) {
                    const message = String(saveError?.message || '').toLowerCase();
                    if (message.includes('gst_automation_runs') || message.includes('404')) {
                        toast.error('gst_automation_runs table missing. Run INSFORGE_OPTIONAL_TABLES_ADDITIVE.sql');
                    } else if (message.includes('401') || message.includes('permission') || message.includes('policy')) {
                        toast.error('No permission to save GST run in cloud. Re-login and run RLS SQL patch.');
                    } else {
                        toast.error(saveError?.message || 'Generated JSON, but failed to save GST run in cloud');
                    }
                }
            }

            if (payload.validation?.isValid) {
                toast.success(`GSTR-1 JSON generated from ${source} mode`);
            } else {
                toast.error(`Generated from ${source} mode with validation errors. Review before use.`);
            }
        } catch (error: any) {
            toast.error(error?.message || 'GST generation failed');
        } finally {
            setGenerating(false);
        }
    };

    const downloadJson = () => {
        if (!result) return;
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `gstr1_${clientId}_${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const taxTotals = useMemo(() => result?.tax_totals || null, [result]);

    return (
        <div className="space-y-6">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-base font-bold text-[var(--on-surface)]">GST Automation (GSTR-1 JSON)</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Client: {selectedCompany?.name || clientId}</p>
                </div>
            </HeaderPortal>

            {isClientLimitExceeded && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    Client limit exceeded for free plan. Upgrade to process more than {FREE_PLAN_LIMITS.maxClients} clients.
                </div>
            )}

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--on-surface)]">GST Generation Controls</p>
                    <AutomationModeSelector mode={mode} onChange={onModeChange} />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => loadInvoices(mode)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--on-surface)] disabled:opacity-50"
                    >
                        {loading ? 'Refreshing...' : 'Refresh Invoices'}
                    </button>

                    <button
                        onClick={generateGstr1Json}
                        disabled={generating || invoices.length === 0 || isClientLimitExceeded}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-50"
                    >
                        {generating ? 'Generating...' : 'Generate GSTR-1 JSON'}
                    </button>

                    <button
                        onClick={downloadJson}
                        disabled={!result}
                        className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--on-surface)] disabled:opacity-50"
                    >
                        Download JSON
                    </button>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                    Direct GST filing is not available in free plan. This module generates JSON only.
                </p>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-xs text-[var(--text-muted)]">Invoices Loaded</p>
                    <p className="text-xl font-bold text-[var(--on-surface)] mt-1">{invoices.length}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-xs text-[var(--text-muted)]">B2B</p>
                    <p className="text-xl font-bold text-[var(--on-surface)] mt-1">{result?.summary?.b2bCount || 0}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-xs text-[var(--text-muted)]">B2C</p>
                    <p className="text-xl font-bold text-[var(--on-surface)] mt-1">{result?.summary?.b2cCount || 0}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <p className="text-xs text-[var(--text-muted)]">HSN Lines</p>
                    <p className="text-xl font-bold text-[var(--on-surface)] mt-1">{result?.summary?.hsnCount || 0}</p>
                </div>
            </div>

            {resultSource && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs text-[var(--text-muted)]">
                    Latest JSON generated from: <span className="font-semibold text-[var(--on-surface)]">{resultSource}</span>
                </div>
            )}

            {taxTotals && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-[var(--on-surface)] mb-3">Tax Totals</h2>
                    <div className="grid md:grid-cols-5 gap-3 text-sm">
                        <div>
                            <p className="text-xs text-[var(--text-muted)]">Taxable Value</p>
                            <p className="font-semibold text-[var(--on-surface)]">{Number(taxTotals.taxableValue || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-muted)]">CGST</p>
                            <p className="font-semibold text-[var(--on-surface)]">{Number(taxTotals.cgst || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-muted)]">SGST</p>
                            <p className="font-semibold text-[var(--on-surface)]">{Number(taxTotals.sgst || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-muted)]">IGST</p>
                            <p className="font-semibold text-[var(--on-surface)]">{Number(taxTotals.igst || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-muted)]">Total Tax</p>
                            <p className="font-semibold text-[var(--on-surface)]">{Number(taxTotals.totalTax || 0).toLocaleString('en-IN')}</p>
                        </div>
                    </div>
                </div>
            )}

            {result?.validation && (
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-2">Validation Errors</h3>
                        {result.validation.errors?.length > 0 ? (
                            <ul className="text-xs text-red-600 space-y-1">
                                {result.validation.errors.map((err: string, idx: number) => (
                                    <li key={idx}>- {err}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-green-600">No errors found.</p>
                        )}
                    </div>

                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-2">Validation Warnings</h3>
                        {result.validation.warnings?.length > 0 ? (
                            <ul className="text-xs text-amber-600 space-y-1">
                                {result.validation.warnings.map((warn: string, idx: number) => (
                                    <li key={idx}>- {warn}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-green-600">No warnings found.</p>
                        )}
                    </div>
                </div>
            )}

            {result && (
                <details className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--on-surface)]">View Generated JSON</summary>
                    <pre className="mt-3 text-[11px] text-[var(--text-muted)] whitespace-pre-wrap">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    );
}



