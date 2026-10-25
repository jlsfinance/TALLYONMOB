import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { callGemini } from '@/lib/GeminiService';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';
import { useNavigate } from 'react-router-dom';
import {
    Camera, ScanLine, Check, Loader2,
    Image, Sparkles, ArrowLeft, Save, AlertTriangle, Plus, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ExtractedItem {
    name: string;
    qty: number;
    rate: number;
    amount: number;
    gst_percent: number;
    cgst: number;
    sgst: number;
    igst: number;
    hsn_code: string;
    discount_percent: number;
    unit: string;
}

interface ExtractedData {
    party_name: string;
    invoice_number: string;
    date: string;
    items: ExtractedItem[];
    total: number;
    cgst_total: number;
    sgst_total: number;
    igst_total: number;
    gst_total: number;
    grand_total: number;
    gstin?: string;
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

async function optimizeImageForOcr(file: File, maxSide = 1800, quality = 0.85): Promise<File> {
    if (!file.type.startsWith('image/')) {
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

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            return file;
        }

        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', quality);
        });

        if (!blob || blob.size >= file.size) {
            return file;
        }

        const optimizedName = file.name.replace(/\.[^.]+$/, '') || 'invoice-scan';
        return new File([blob], `${optimizedName}.jpg`, { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

async function prepareGeminiAttachment(file: File): Promise<{ mimeType: string; dataBase64: string }> {
    const optimizedFile = await optimizeImageForOcr(file);
    const buffer = await optimizedFile.arrayBuffer();
    return {
        mimeType: optimizedFile.type || file.type || 'image/jpeg',
        dataBase64: fileToBase64(buffer)
    };
}

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const cleaned = String(value ?? '')
        .replace(/,/g, '')
        .replace(/\u20B9/g, '')
        .replace(/rs\.?/gi, '')
        .replace(/%/g, '')
        .trim();

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGstin(value: unknown): string {
    return String(value || '').trim().toUpperCase();
}

function getStateCodeFromGstin(gstin?: string): string {
    const normalized = normalizeGstin(gstin);
    return /^[0-9]{2}/.test(normalized) ? normalized.slice(0, 2) : '';
}

function isInterStateSupply(companyGstin?: string, partyGstin?: string): boolean {
    const companyState = getStateCodeFromGstin(companyGstin);
    const partyState = getStateCodeFromGstin(partyGstin);
    return Boolean(companyState && partyState && companyState !== partyState);
}

function recalcItem(item: ExtractedItem, isInterState = false): ExtractedItem {
    const grossAmount = item.qty * item.rate;
    const discountedAmount = round2(grossAmount - ((grossAmount * item.discount_percent) / 100));
    const gstAmount = round2((discountedAmount * item.gst_percent) / 100);

    if (isInterState) {
        return {
            ...item,
            amount: discountedAmount,
            cgst: 0,
            sgst: 0,
            igst: gstAmount
        };
    }

    const halfGst = round2(gstAmount / 2);
    return {
        ...item,
        amount: discountedAmount,
        cgst: halfGst,
        sgst: round2(gstAmount - halfGst),
        igst: 0
    };
}

function recalcTotals(items: ExtractedItem[]): Pick<ExtractedData, 'total' | 'cgst_total' | 'sgst_total' | 'igst_total' | 'gst_total' | 'grand_total'> {
    const total = round2(items.reduce((sum, item) => sum + item.amount, 0));
    const cgst_total = round2(items.reduce((sum, item) => sum + item.cgst, 0));
    const sgst_total = round2(items.reduce((sum, item) => sum + item.sgst, 0));
    const igst_total = round2(items.reduce((sum, item) => sum + item.igst, 0));
    const gst_total = round2(cgst_total + sgst_total + igst_total);
    return { total, cgst_total, sgst_total, igst_total, gst_total, grand_total: round2(total + gst_total) };
}

function extractRawTotals(raw: any) {
    return {
        total: round2(toNumber(raw?.total ?? raw?.taxable_amount ?? raw?.taxableValue ?? raw?.taxable_value, 0)),
        cgst_total: round2(toNumber(raw?.cgst_total ?? raw?.cgst_amount ?? raw?.cgst, 0)),
        sgst_total: round2(toNumber(raw?.sgst_total ?? raw?.sgst_amount ?? raw?.sgst, 0)),
        igst_total: round2(toNumber(raw?.igst_total ?? raw?.igst_amount ?? raw?.igst, 0)),
        gst_total: round2(toNumber(raw?.gst_total ?? raw?.gst_amount ?? raw?.total_gst, 0)),
        grand_total: round2(toNumber(raw?.grand_total ?? raw?.total_amount ?? raw?.invoice_total ?? raw?.net_amount, 0))
    };
}

function mergeTotals(
    itemTotals: Pick<ExtractedData, 'total' | 'cgst_total' | 'sgst_total' | 'igst_total' | 'gst_total' | 'grand_total'>,
    rawTotals: ReturnType<typeof extractRawTotals>
): Pick<ExtractedData, 'total' | 'cgst_total' | 'sgst_total' | 'igst_total' | 'gst_total' | 'grand_total'> {
    let total = itemTotals.total > 0 ? itemTotals.total : rawTotals.total;
    const cgst_total = itemTotals.cgst_total > 0 ? itemTotals.cgst_total : rawTotals.cgst_total;
    const sgst_total = itemTotals.sgst_total > 0 ? itemTotals.sgst_total : rawTotals.sgst_total;
    const igst_total = itemTotals.igst_total > 0 ? itemTotals.igst_total : rawTotals.igst_total;
    let gst_total = round2(cgst_total + sgst_total + igst_total);

    if (gst_total <= 0 && rawTotals.gst_total > 0) {
        gst_total = rawTotals.gst_total;
    }

    if (total <= 0 && rawTotals.grand_total > gst_total) {
        total = round2(rawTotals.grand_total - gst_total);
    }

    const grand_total = rawTotals.grand_total > 0 ? rawTotals.grand_total : round2(total + gst_total);
    return { total, cgst_total, sgst_total, igst_total, gst_total, grand_total };
}

function backfillItemTaxes(
    items: ExtractedItem[],
    totals: Pick<ExtractedData, 'cgst_total' | 'sgst_total' | 'igst_total' | 'gst_total'>
): ExtractedItem[] {
    if (items.length === 0 || totals.gst_total <= 0) {
        return items;
    }

    const hasExplicitTax = items.some((item) => item.gst_percent > 0 || item.cgst > 0 || item.sgst > 0 || item.igst > 0);
    if (hasExplicitTax) {
        return items;
    }

    const taxableBase = items.reduce((sum, item) => sum + item.amount, 0);
    if (taxableBase <= 0) {
        return items;
    }

    let remainingCgst = totals.cgst_total;
    let remainingSgst = totals.sgst_total;
    let remainingIgst = totals.igst_total;

    return items.map((item, index) => {
        const isLast = index === items.length - 1;
        const share = taxableBase > 0 ? item.amount / taxableBase : 0;
        const cgst = isLast ? round2(remainingCgst) : round2(totals.cgst_total * share);
        const sgst = isLast ? round2(remainingSgst) : round2(totals.sgst_total * share);
        const igst = isLast ? round2(remainingIgst) : round2(totals.igst_total * share);

        remainingCgst = round2(remainingCgst - cgst);
        remainingSgst = round2(remainingSgst - sgst);
        remainingIgst = round2(remainingIgst - igst);

        const itemTax = round2(cgst + sgst + igst);
        return {
            ...item,
            gst_percent: item.amount > 0 ? round2((itemTax / item.amount) * 100) : 0,
            cgst,
            sgst,
            igst
        };
    });
}

function normalizeExtractedItem(rawItem: any, isInterState: boolean): ExtractedItem {
    const qty = toNumber(rawItem?.qty ?? rawItem?.quantity, 0);
    const rate = toNumber(rawItem?.rate ?? rawItem?.price, 0);
    const discount_percent = toNumber(rawItem?.discount_percent ?? rawItem?.discount, 0);
    const computedAmount = round2((qty * rate) - (((qty * rate) * discount_percent) / 100));
    const amount = round2(toNumber(rawItem?.amount ?? rawItem?.total ?? rawItem?.taxable_amount ?? rawItem?.taxableValue, computedAmount) || computedAmount);

    let gst_percent = round2(toNumber(rawItem?.gst_percent ?? rawItem?.gst ?? rawItem?.gst_rate ?? rawItem?.tax_rate, 0));
    let cgst = round2(toNumber(rawItem?.cgst ?? rawItem?.cgst_amount, 0));
    let sgst = round2(toNumber(rawItem?.sgst ?? rawItem?.sgst_amount, 0));
    let igst = round2(toNumber(rawItem?.igst ?? rawItem?.igst_amount, 0));
    const totalTax = round2(cgst + sgst + igst);

    if (gst_percent <= 0 && amount > 0 && totalTax > 0) {
        gst_percent = round2((totalTax / amount) * 100);
    }

    const normalized: ExtractedItem = {
        name: String(rawItem?.name || rawItem?.item_name || rawItem?.description || ''),
        qty,
        rate,
        amount,
        gst_percent,
        cgst,
        sgst,
        igst,
        hsn_code: String(rawItem?.hsn_code || rawItem?.hsn || ''),
        discount_percent,
        unit: String(rawItem?.unit || rawItem?.uom || 'Nos')
    };

    if (totalTax > 0) {
        if (isInterState) {
            return {
                ...normalized,
                cgst: 0,
                sgst: 0,
                igst: totalTax,
                gst_percent: gst_percent > 0 ? gst_percent : (amount > 0 ? round2((totalTax / amount) * 100) : 0)
            };
        }

        if (igst > 0 && cgst <= 0 && sgst <= 0) {
            const half = round2(totalTax / 2);
            return {
                ...normalized,
                cgst: half,
                sgst: round2(totalTax - half),
                igst: 0,
                gst_percent: gst_percent > 0 ? gst_percent : (amount > 0 ? round2((totalTax / amount) * 100) : 0)
            };
        }

        return normalized;
    }

    return gst_percent > 0 ? recalcItem(normalized, isInterState) : normalized;
}
const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

export default function InvoiceScannerPage() {
    const { selectedCompany, user } = useAuth() as any;
    const navigate = useNavigate();
    const [step, setStep] = useState<'capture' | 'processing' | 'review' | 'saved'>('capture');
    const [imageUrl, setImageUrl] = useState<string>('');
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasApiKey = Boolean(getUserGeminiApiKey(user?.id));

    const handleCapture = async (source: 'camera' | 'gallery') => {
        if (!hasApiKey) {
            toast.error('Gemini API key set karo pehle. Settings me jao.');
            return;
        }
        if (source === 'camera') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                stream.getTracks().forEach(t => t.stop());
            } catch { /* Fall back to file input */ }
        }
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        setImageUrl(url);
        setStep('processing');

        try {
            const attachment = await prepareGeminiAttachment(file);

            const result = await callGemini({
                expectJson: true,
                temperature: 0,
                model: 'gemini-2.5-flash',
                fallbackModels: ['gemini-3-flash-preview'],
                maxRetries: 2,
                timeoutMs: 45000,
                systemPrompt: [
                    'You are an expert invoice OCR system for Indian businesses.',
                    'Extract all data from the invoice image and return structured JSON.',
                    'Required output schema:',
                    '{"party_name":"string","invoice_number":"string","date":"YYYY-MM-DD","gstin":"string or empty",',
                    '"items":[{"name":"string","qty":number,"rate":number,"amount":number,"gst_percent":number,',
                    '"cgst":number,"sgst":number,"igst":number,"hsn_code":"string","discount_percent":number,"unit":"string"}],',
                    '"total":number,"cgst_total":number,"sgst_total":number,"igst_total":number,"gst_total":number,"grand_total":number}',
                    'Rules:',
                    '- gst_percent = GST percentage (e.g. 18, 5, 12, 28)',
                    '- For intra-state: split GST equally into cgst and sgst. igst = 0',
                    '- For inter-state: igst = full GST amount. cgst and sgst = 0',
                    '- hsn_code = HSN/SAC code if visible, empty string otherwise',
                    '- discount_percent = discount percentage on item, 0 if none',
                    '- unit = unit of measurement (Nos, Pcs, Kg, etc.), default "Nos"',
                    '- amount = qty * rate after discount',
                    '- total = sum of all item amounts (before GST)',
                    '- gst_total = cgst_total + sgst_total + igst_total',
                    '- grand_total = total + gst_total',
                    '- If GSTIN is visible, extract it. Otherwise leave empty.',
                    '- Date must be in YYYY-MM-DD format.',
                    '- Return valid JSON only. No markdown, no explanation.'
                ].join(' '),
                userPrompt: 'Extract all invoice data from this image. Return JSON only.',
                attachments: [attachment]
            });

            const data = result.json as any;
            if (!data || !data.items) {
                throw new Error('Could not extract invoice data from this image');
            }

            const invoiceGstin = normalizeGstin(data.gstin || data.GSTIN || '');
            const isInterState = isInterStateSupply(selectedCompany?.gstin, invoiceGstin);

            let items: ExtractedItem[] = (data.items || [])
                .map((item: any) => normalizeExtractedItem(item, isInterState))
                .filter((item: ExtractedItem) => item.name || item.amount > 0);

            const rawTotals = extractRawTotals(data);
            let totals = mergeTotals(recalcTotals(items), rawTotals);
            items = backfillItemTaxes(items, totals);
            totals = mergeTotals(recalcTotals(items), rawTotals);

            const extracted: ExtractedData = {
                party_name: String(data.party_name || data.partyName || data.seller_name || ''),
                invoice_number: String(data.invoice_number || data.invoiceNumber || ''),
                date: String(data.date || new Date().toISOString().split('T')[0]),
                gstin: invoiceGstin,
                items,
                ...totals
            };

            setExtractedData(extracted);
            setStep('review');
            toast.success('Invoice data extracted by AI!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to extract invoice data');
            setStep('capture');
        }

        e.target.value = '';
    };

    const updateField = (field: keyof ExtractedData, value: any) => {
        if (!extractedData) return;

        if (field === 'gstin') {
            const nextGstin = normalizeGstin(value);
            const isInterState = isInterStateSupply(selectedCompany?.gstin, nextGstin);
            const items = extractedData.items.map((item) => item.gst_percent > 0 ? recalcItem({ ...item }, isInterState) : item);
            const totals = mergeTotals(recalcTotals(items), extractRawTotals(extractedData));
            setExtractedData({ ...extractedData, gstin: nextGstin, items, ...totals });
            return;
        }

        setExtractedData({ ...extractedData, [field]: value });
    };

    const updateItem = (index: number, field: string, value: any) => {
        if (!extractedData) return;
        const isInterState = isInterStateSupply(selectedCompany?.gstin, extractedData.gstin);
        const items = [...extractedData.items];
        items[index] = { ...items[index], [field]: value };

        if (['qty', 'rate', 'discount_percent', 'gst_percent'].includes(field)) {
            items[index] = recalcItem(items[index], isInterState);
        }

        const totals = mergeTotals(recalcTotals(items), extractRawTotals(extractedData));
        setExtractedData({ ...extractedData, items, ...totals });
    };

    const addItem = () => {
        if (!extractedData) return;
        const isInterState = isInterStateSupply(selectedCompany?.gstin, extractedData.gstin);
        const newItem: ExtractedItem = recalcItem({
            name: '', qty: 1, rate: 0, amount: 0, gst_percent: 18,
            cgst: 0, sgst: 0, igst: 0, hsn_code: '', discount_percent: 0, unit: 'Nos'
        }, isInterState);
        setExtractedData({ ...extractedData, items: [...extractedData.items, newItem] });
    };

    const removeItem = (index: number) => {
        if (!extractedData || extractedData.items.length <= 1) return;
        const items = extractedData.items.filter((_, i) => i !== index);
        const totals = mergeTotals(recalcTotals(items), extractRawTotals(extractedData));
        setExtractedData({ ...extractedData, items, ...totals });
    };
    const handleSave = async () => {
        if (!extractedData || !selectedCompany?.id) return;
        if (!extractedData.invoice_number) {
            toast.error('Invoice number is required');
            return;
        }
        if (!extractedData.party_name) {
            toast.error('Party name is required');
            return;
        }

        setSaving(true);
        try {
            const voucherId = crypto.randomUUID();
            const now = new Date().toISOString();
            const isInterState = isInterStateSupply(selectedCompany?.gstin, extractedData.gstin);

            // 1. Create voucher in vouchers collection
            const voucherDoc = {
                id: voucherId,
                company_id: selectedCompany.id,
                voucher_type: 'Purchase',
                voucher_number: extractedData.invoice_number,
                voucher_date: extractedData.date || now.split('T')[0],
                vch_date: extractedData.date || now.split('T')[0],
                party_ledger_name: extractedData.party_name,
                amount: extractedData.grand_total,
                narration: `Scanned invoice ${extractedData.invoice_number} from ${extractedData.party_name}`,
                is_deleted: false,
                owner_id: user?.id || ''
            };

            const { error: voucherError } = await (supabase as any)
                .from('vouchers')
                .insert(voucherDoc);

            if (voucherError) throw new Error(voucherError.message || 'Failed to save voucher');

            // 2. Create stock entries for each item
            for (const item of extractedData.items) {
                if (!item.name) continue;

                const stockEntry = {
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    stock_item_name: item.name,
                    quantity: item.qty,
                    rate: item.rate,
                    amount: item.amount,
                    unit: item.unit || 'Nos',
                    hsn_code: item.hsn_code || '',
                    discount_percent: item.discount_percent || 0,
                    tax_rate: item.gst_percent || 0,
                    is_inward: true,
                    owner_id: user?.id || ''
                };

                await (supabase as any)
                    .from('voucher_stock_entries')
                    .insert(stockEntry);
            }

            // 3. Create ledger entries (party + purchase + GST)
            const ledgerEntries = [
                {
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    ledger_name: extractedData.party_name,
                    amount: extractedData.grand_total,
                    is_debit: false,
                    owner_id: user?.id || ''
                },
                {
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    ledger_name: 'Purchase Account',
                    amount: extractedData.total,
                    is_debit: true,
                    owner_id: user?.id || ''
                }
            ];

            if (extractedData.cgst_total > 0) {
                ledgerEntries.push({
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    ledger_name: 'Input CGST',
                    amount: extractedData.cgst_total,
                    is_debit: true,
                    owner_id: user?.id || ''
                });
            }

            if (extractedData.sgst_total > 0) {
                ledgerEntries.push({
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    ledger_name: 'Input SGST',
                    amount: extractedData.sgst_total,
                    is_debit: true,
                    owner_id: user?.id || ''
                });
            }

            if (extractedData.igst_total > 0) {
                ledgerEntries.push({
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    ledger_name: 'Input IGST',
                    amount: extractedData.igst_total,
                    is_debit: true,
                    owner_id: user?.id || ''
                });
            }

            for (const entry of ledgerEntries) {
                await (supabase as any)
                    .from('voucher_ledger_entries')
                    .insert(entry);
            }

            // 4. Create pending_transaction for Tally Windows App to pull
            const pendingTransaction = {
                id: crypto.randomUUID(),
                company_id: selectedCompany.id,
                status: 'pending',
                transaction_type: 'Purchase',
                voucher_data: {
                    voucher_type: 'Purchase',
                    voucher_type_name: 'Purchase',
                    voucher_number: extractedData.invoice_number,
                    invoice_number: extractedData.invoice_number,
                    voucher_date: extractedData.date || now.split('T')[0],
                    party_name: extractedData.party_name,
                    party_ledger_name: extractedData.party_name,
                    party_gstin: extractedData.gstin || '',
                    taxable_amount: extractedData.total,
                    total_amount: extractedData.total,
                    gst_amount: extractedData.gst_total,
                    cgst_amount: extractedData.cgst_total,
                    sgst_amount: extractedData.sgst_total,
                    igst_amount: extractedData.igst_total,
                    grand_total: extractedData.grand_total,
                    is_inter_state: isInterState,
                    allow_accounting_fallback: false,
                    purchase_ledger_name: 'Purchase Account',
                    purchase_ledger: 'Purchase Account',
                    narration: `Scanned invoice ${extractedData.invoice_number} from ${extractedData.party_name}`,
                    items: extractedData.items.map(item => ({
                        stock_item_name: item.name,
                        name: item.name,
                        qty: item.qty,
                        quantity: item.qty,
                        rate: item.rate,
                        amount: item.amount,
                        unit: item.unit || 'Nos',
                        hsn_code: item.hsn_code || '',
                        tax_rate: item.gst_percent || 0,
                        gst_rate: item.gst_percent || 0,
                        gst_percent: item.gst_percent || 0,
                        discount_percent: item.discount_percent || 0,
                        cgst_amount: item.cgst || 0,
                        sgst_amount: item.sgst || 0,
                        igst_amount: item.igst || 0,
                        taxability: item.gst_percent > 0 ? 'Taxable' : undefined
                    }))
                },
                created_by: user?.id || ''
            };

            const { error: pendingError } = await (supabase as any)
                .from('pending_transactions')
                .insert([pendingTransaction]);

            if (pendingError) throw new Error(pendingError.message || 'Failed to queue transaction for Tally sync');

            setStep('saved');
            toast.success('Invoice saved to vouchers!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileSelect} className="hidden" />

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                    <ScanLine className="w-6 h-6 text-teal-400" />
                    Invoice Scanner (OCR)
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Scan invoices and auto-extract data with AI</p>
            </div>

            {/* API Key Warning */}
            {!hasApiKey && (
                <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <div className="flex-1">
                        <strong>Gemini API Key Required</strong>
                        <p className="text-xs mt-0.5">Scanner ke liye Google AI Studio se API key chahiye.</p>
                    </div>
                    <button
                        onClick={() => navigate('/settings')}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
                    >
                        Set API Key
                    </button>
                </div>
            )}

            {/* Step: Capture */}
            {step === 'capture' && (
                <div className="flex flex-col items-center py-12">
                    <div className="w-32 h-32 rounded-full bg-teal-500/10 flex items-center justify-center mb-6">
                        <Camera className="w-16 h-16 text-teal-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--on-surface)] mb-2">Scan Invoice</h3>
                    <p className="text-sm text-[var(--text-muted)] text-center mb-8 max-w-xs">
                        Take a photo or upload an image of an invoice. AI will extract party, items, amounts, GST, HSN and discount.
                    </p>

                    <div className="flex gap-3 w-full max-w-xs">
                        <button onClick={() => handleCapture('camera')}
                            className="flex-1 py-3 bg-teal-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-teal-600 transition-all disabled:opacity-50"
                            disabled={!hasApiKey}>
                            <Camera className="w-5 h-5" /> Camera
                        </button>
                        <button onClick={() => handleCapture('gallery')}
                            className="flex-1 py-3 bg-[var(--surface)] text-[var(--on-surface)] border border-[var(--border)] rounded-xl font-semibold flex items-center justify-center gap-2 hover:border-teal-500/30 transition-all disabled:opacity-50"
                            disabled={!hasApiKey}>
                            <Image className="w-5 h-5" /> Gallery
                        </button>
                    </div>
                </div>
            )}

            {/* Step: Processing */}
            {step === 'processing' && (
                <div className="flex flex-col items-center py-12">
                    {imageUrl && (
                        <img src={imageUrl} alt="Scanned invoice" className="w-48 h-auto rounded-xl border border-[var(--border)] mb-6 object-cover" />
                    )}
                    <div className="flex items-center gap-3 mb-4">
                        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                        <div>
                            <h3 className="font-semibold text-[var(--on-surface)]">Processing with Gemini AI...</h3>
                            <p className="text-xs text-[var(--text-muted)]">Extracting items, GST, HSN, discount data</p>
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center">
                        {['Analyzing image...', 'Detecting items...', 'Parsing GST...', 'Reading HSN...'].map((text, i) => (
                            <span key={i} className="text-xs px-2 py-1 bg-teal-500/10 text-teal-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                                {text}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Step: Review */}
            {step === 'review' && extractedData && (
                <>
                    <div className="flex items-center gap-2 mb-4">
                        <button onClick={() => setStep('capture')} className="p-2 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                            <ArrowLeft className="w-4 h-4 text-[var(--on-surface)]" />
                        </button>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-teal-400" />
                            <span className="text-sm font-medium text-teal-400">AI-Extracted ? Review & Edit</span>
                        </div>
                    </div>

                    {imageUrl && (
                        <img src={imageUrl} alt="invoice" className="w-full h-32 object-cover rounded-xl border border-[var(--border)] mb-4" />
                    )}

                    {/* Header Fields */}
                    <div className="space-y-3 mb-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Party Name</label>
                                <input type="text" value={extractedData.party_name} onChange={e => updateField('party_name', e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Invoice #</label>
                                <input type="text" value={extractedData.invoice_number} onChange={e => updateField('invoice_number', e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Date</label>
                                <input type="date" value={extractedData.date} onChange={e => updateField('date', e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">GSTIN</label>
                                <input type="text" value={extractedData.gstin || ''} onChange={e => updateField('gstin', e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                            </div>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-[var(--on-surface)]">Extracted Items ({extractedData.items.length})</h3>
                            <button onClick={addItem} className="text-xs px-2 py-1 bg-teal-500/10 text-teal-400 rounded-lg flex items-center gap-1 hover:bg-teal-500/20">
                                <Plus className="w-3 h-3" /> Add Item
                            </button>
                        </div>
                        {extractedData.items.map((item, i) => (
                            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="text" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)}
                                        placeholder="Item name"
                                        className="flex-1 px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    {extractedData.items.length > 1 && (
                                        <button onClick={() => removeItem(i)} className="p-1 text-red-400 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">Qty</label>
                                        <input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">Rate</label>
                                        <input type="number" value={item.rate} onChange={e => updateItem(i, 'rate', Number(e.target.value))}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">Disc%</label>
                                        <input type="number" value={item.discount_percent} onChange={e => updateItem(i, 'discount_percent', Number(e.target.value))}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">GST%</label>
                                        <input type="number" value={item.gst_percent} onChange={e => updateItem(i, 'gst_percent', Number(e.target.value))}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">HSN</label>
                                        <input type="text" value={item.hsn_code} onChange={e => updateItem(i, 'hsn_code', e.target.value)}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">Unit</label>
                                        <input type="text" value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-[var(--text-muted)]">
                                    <div>Amount: <span className="text-[var(--on-surface)] font-medium">{formatCurrency(item.amount)}</span></div>
                                    <div>CGST: <span className="text-[var(--on-surface)]">{formatCurrency(item.cgst)}</span></div>
                                    <div>SGST: <span className="text-[var(--on-surface)]">{formatCurrency(item.sgst)}</span></div>
                                    <div>IGST: <span className="text-[var(--on-surface)]">{formatCurrency(item.igst)}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Totals */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-[var(--text-muted)]">Subtotal</span>
                            <span className="text-[var(--on-surface)]">{formatCurrency(extractedData.total)}</span>
                        </div>
                        {extractedData.cgst_total > 0 && (
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-[var(--text-muted)]">CGST</span>
                                <span className="text-[var(--on-surface)]">{formatCurrency(extractedData.cgst_total)}</span>
                            </div>
                        )}
                        {extractedData.sgst_total > 0 && (
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-[var(--text-muted)]">SGST</span>
                                <span className="text-[var(--on-surface)]">{formatCurrency(extractedData.sgst_total)}</span>
                            </div>
                        )}
                        {extractedData.igst_total > 0 && (
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-[var(--text-muted)]">IGST</span>
                                <span className="text-[var(--on-surface)]">{formatCurrency(extractedData.igst_total)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-[var(--text-muted)]">Total GST</span>
                            <span className="text-[var(--on-surface)]">{formatCurrency(extractedData.gst_total)}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--border)]">
                            <span className="text-[var(--on-surface)]">Grand Total</span>
                            <span className="text-teal-400">{formatCurrency(extractedData.grand_total)}</span>
                        </div>
                    </div>

                    <button onClick={handleSave} disabled={saving}
                        className="w-full py-3 bg-teal-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-teal-600 disabled:opacity-50 transition-all">
                        {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Save className="w-5 h-5" /> Save as Purchase Voucher</>}
                    </button>
                </>
            )}

            {/* Step: Saved */}
            {step === 'saved' && (
                <div className="flex flex-col items-center py-16">
                    <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                        <Check className="w-10 h-10 text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-green-400">Invoice Saved!</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-2 text-center max-w-xs">
                        Invoice saved to vouchers with stock entries, ledger entries, and GST breakup.
                    </p>
                    <button onClick={() => { setStep('capture'); setExtractedData(null); setImageUrl(''); }}
                        className="mt-6 px-6 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--on-surface)] hover:border-teal-500/30 transition-all">
                        Scan Another Invoice
                    </button>
                </div>
            )}
        </div>
    );
}















