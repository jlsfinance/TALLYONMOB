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

function recalcItem(item: ExtractedItem): ExtractedItem {
    const amount = item.qty * item.rate;
    const discountedAmount = amount - (amount * item.discount_percent / 100);
    const gstAmount = discountedAmount * item.gst_percent / 100;
    const halfGst = gstAmount / 2;
    return {
        ...item,
        amount: discountedAmount,
        cgst: Math.round(halfGst * 100) / 100,
        sgst: Math.round(halfGst * 100) / 100,
        igst: 0
    };
}

function recalcTotals(items: ExtractedItem[]): Pick<ExtractedData, 'total' | 'cgst_total' | 'sgst_total' | 'igst_total' | 'gst_total' | 'grand_total'> {
    const total = items.reduce((s, i) => s + i.amount, 0);
    const cgst_total = items.reduce((s, i) => s + i.cgst, 0);
    const sgst_total = items.reduce((s, i) => s + i.sgst, 0);
    const igst_total = items.reduce((s, i) => s + i.igst, 0);
    const gst_total = cgst_total + sgst_total + igst_total;
    return { total, cgst_total, sgst_total, igst_total, gst_total, grand_total: total + gst_total };
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
            const buffer = await file.arrayBuffer();
            const base64 = fileToBase64(buffer);
            const mimeType = file.type || 'image/jpeg';

            const result = await callGemini({
                expectJson: true,
                temperature: 0,
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
                attachments: [{ mimeType, dataBase64: base64 }]
            });

            const data = result.json as any;
            if (!data || !data.items) {
                throw new Error('Could not extract invoice data from this image');
            }

            const items: ExtractedItem[] = (data.items || []).map((item: any) => ({
                name: String(item.name || ''),
                qty: Number(item.qty || item.quantity || 0),
                rate: Number(item.rate || item.price || 0),
                amount: Number(item.amount || item.total || 0),
                gst_percent: Number(item.gst_percent || item.gst || item.gst_rate || 0),
                cgst: Number(item.cgst || 0),
                sgst: Number(item.sgst || 0),
                igst: Number(item.igst || 0),
                hsn_code: String(item.hsn_code || item.hsn || ''),
                discount_percent: Number(item.discount_percent || item.discount || 0),
                unit: String(item.unit || 'Nos')
            }));

            const totals = recalcTotals(items);
            const extracted: ExtractedData = {
                party_name: String(data.party_name || data.partyName || data.seller_name || ''),
                invoice_number: String(data.invoice_number || data.invoiceNumber || ''),
                date: String(data.date || new Date().toISOString().split('T')[0]),
                gstin: String(data.gstin || data.GSTIN || ''),
                items,
                ...totals
            };

            setExtractedData(extracted);
            setStep('review');
            toast.success('ðŸ“„ Invoice data extracted by AI!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to extract invoice data');
            setStep('capture');
        }

        e.target.value = '';
    };

    const updateField = (field: keyof ExtractedData, value: any) => {
        if (!extractedData) return;
        setExtractedData({ ...extractedData, [field]: value });
    };

    const updateItem = (index: number, field: string, value: any) => {
        if (!extractedData) return;
        const items = [...extractedData.items];
        items[index] = { ...items[index], [field]: value };

        // Recalculate if quantity, rate, discount, or GST changes
        if (['qty', 'rate', 'discount_percent', 'gst_percent'].includes(field)) {
            items[index] = recalcItem(items[index]);
        }

        const totals = recalcTotals(items);
        setExtractedData({ ...extractedData, items, ...totals });
    };

    const addItem = () => {
        if (!extractedData) return;
        const newItem: ExtractedItem = {
            name: '', qty: 1, rate: 0, amount: 0, gst_percent: 18,
            cgst: 0, sgst: 0, igst: 0, hsn_code: '', discount_percent: 0, unit: 'Nos'
        };
        setExtractedData({ ...extractedData, items: [...extractedData.items, newItem] });
    };

    const removeItem = (index: number) => {
        if (!extractedData || extractedData.items.length <= 1) return;
        const items = extractedData.items.filter((_, i) => i !== index);
        const totals = recalcTotals(items);
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

            // 1. Create voucher in vouchers collection
            const voucherDoc = {
                id: voucherId,
                company_id: selectedCompany.id,
                voucher_id: voucherId,
                voucher_type: 'Purchase',
                voucher_number: extractedData.invoice_number,
                voucher_date: extractedData.date || now.split('T')[0],
                vch_date: extractedData.date || now.split('T')[0],
                party_ledger_name: extractedData.party_name,
                amount: extractedData.grand_total,
                narration: `Scanned invoice ${extractedData.invoice_number} from ${extractedData.party_name}`,
                is_deleted: false,
                status: 'scanned',
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
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date || now.split('T')[0],
                    vch_date: extractedData.date || now.split('T')[0],
                    voucher_number: extractedData.invoice_number,
                    party_ledger_name: extractedData.party_name,
                    is_deleted: false,
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
                    name: extractedData.party_name,
                    amount: extractedData.grand_total,
                    is_debit: false,
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date || now.split('T')[0],
                    vch_date: extractedData.date || now.split('T')[0],
                    voucher_number: extractedData.invoice_number,
                    party_ledger_name: extractedData.party_name,
                    is_deleted: false,
                    owner_id: user?.id || ''
                },
                {
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    name: 'Purchase Account',
                    amount: extractedData.total,
                    is_debit: true,
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date || now.split('T')[0],
                    vch_date: extractedData.date || now.split('T')[0],
                    voucher_number: extractedData.invoice_number,
                    party_ledger_name: extractedData.party_name,
                    is_deleted: false,
                    owner_id: user?.id || ''
                }
            ];

            if (extractedData.cgst_total > 0) {
                ledgerEntries.push({
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    name: 'Input CGST',
                    amount: extractedData.cgst_total,
                    is_debit: true,
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date || now.split('T')[0],
                    vch_date: extractedData.date || now.split('T')[0],
                    voucher_number: extractedData.invoice_number,
                    party_ledger_name: extractedData.party_name,
                    is_deleted: false,
                    owner_id: user?.id || ''
                });
            }

            if (extractedData.sgst_total > 0) {
                ledgerEntries.push({
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    name: 'Input SGST',
                    amount: extractedData.sgst_total,
                    is_debit: true,
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date || now.split('T')[0],
                    vch_date: extractedData.date || now.split('T')[0],
                    voucher_number: extractedData.invoice_number,
                    party_ledger_name: extractedData.party_name,
                    is_deleted: false,
                    owner_id: user?.id || ''
                });
            }

            if (extractedData.igst_total > 0) {
                ledgerEntries.push({
                    id: crypto.randomUUID(),
                    company_id: selectedCompany.id,
                    voucher_id: voucherId,
                    name: 'Input IGST',
                    amount: extractedData.igst_total,
                    is_debit: true,
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date || now.split('T')[0],
                    vch_date: extractedData.date || now.split('T')[0],
                    voucher_number: extractedData.invoice_number,
                    party_ledger_name: extractedData.party_name,
                    is_deleted: false,
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
                    voucher_date: extractedData.date || now.split('T')[0],
                    party_name: extractedData.party_name,
                    total_amount: extractedData.total,
                    cgst_amount: extractedData.cgst_total,
                    sgst_amount: extractedData.sgst_total,
                    igst_amount: extractedData.igst_total,
                    grand_total: extractedData.grand_total,
                    purchase_ledger: 'Purchase Account',
                    narration: `Scanned invoice ${extractedData.invoice_number} from ${extractedData.party_name}`,
                    items: extractedData.items.map(item => ({
                        stock_item_name: item.name,
                        qty: item.qty,
                        rate: item.rate,
                        amount: item.amount,
                        unit: item.unit || 'Nos'
                    }))
                },
                created_by: user?.id || ''
            };

            const { error: pendingError } = await (supabase as any)
                .from('pending_transactions')
                .insert([pendingTransaction]);

            if (pendingError) throw new Error(pendingError.message || 'Failed to queue transaction for Tally sync');

            setStep('saved');
            toast.success('âœ… Invoice saved to vouchers!');
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


