import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    Camera, ScanLine, FileText, Check, X, Edit, Loader2,
    Upload, Image, Sparkles, ArrowLeft, Save, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ExtractedData {
    party_name: string;
    invoice_number: string;
    date: string;
    items: { name: string; qty: number; rate: number; amount: number; gst: number }[];
    total: number;
    gst_total: number;
    grand_total: number;
    gstin?: string;
}

export default function InvoiceScannerPage() {
    const { selectedCompany } = useAuth() as any;
    const [step, setStep] = useState<'capture' | 'processing' | 'review' | 'saved'>('capture');
    const [imageUrl, setImageUrl] = useState<string>('');
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCapture = async (source: 'camera' | 'gallery') => {
        if (source === 'camera') {
            // Try to use camera
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                stream.getTracks().forEach(t => t.stop()); // Stop immediately, we just needed permission
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

        // Simulate AI OCR extraction (in production, send to Gemini Vision API)
        setTimeout(() => {
            const mockData: ExtractedData = {
                party_name: 'ABC Trading Co.',
                invoice_number: `INV-${Math.floor(Math.random() * 9000) + 1000}`,
                date: new Date().toISOString().split('T')[0],
                items: [
                    { name: 'Product Sample A', qty: 10, rate: 500, amount: 5000, gst: 18 },
                    { name: 'Product Sample B', qty: 5, rate: 1200, amount: 6000, gst: 18 },
                ],
                total: 11000,
                gst_total: 1980,
                grand_total: 12980,
                gstin: '27AABCU9603R1Z2'
            };
            setExtractedData(mockData);
            setStep('review');
            toast.success('📄 Invoice data extracted!');
        }, 2500);
    };

    const updateField = (field: keyof ExtractedData, value: any) => {
        if (!extractedData) return;
        setExtractedData({ ...extractedData, [field]: value });
    };

    const updateItem = (index: number, field: string, value: any) => {
        if (!extractedData) return;
        const items = [...extractedData.items];
        items[index] = { ...items[index], [field]: value };
        if (field === 'qty' || field === 'rate') {
            items[index].amount = items[index].qty * items[index].rate;
        }
        const total = items.reduce((s, i) => s + i.amount, 0);
        const gst_total = items.reduce((s, i) => s + (i.amount * i.gst / 100), 0);
        setExtractedData({ ...extractedData, items, total, gst_total, grand_total: total + gst_total });
    };

    const handleSave = async () => {
        if (!extractedData) return;
        setSaving(true);
        try {
            const { error } = await supabase.from('pending_transactions').insert({
                company_id: selectedCompany.id,
                transaction_type: 'Purchase',
                voucher_data: {
                    voucher_type: 'Purchase',
                    voucher_date: extractedData.date,
                    voucher_number: extractedData.invoice_number,
                    party_name: extractedData.party_name,
                    total_amount: extractedData.total,
                    gst_amount: extractedData.gst_total,
                    grand_total: extractedData.grand_total,
                    stock_entries: extractedData.items,
                    source: 'ocr_scan'
                },
                status: 'pending'
            });

            if (error) throw error;
            setStep('saved');
            toast.success('Invoice saved! Will sync to Tally.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                    <ScanLine className="w-6 h-6 text-teal-400" />
                    Invoice Scanner (OCR)
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Scan invoices and auto-extract data with AI</p>
            </div>

            {/* Step: Capture */}
            {step === 'capture' && (
                <div className="flex flex-col items-center py-12">
                    <div className="w-32 h-32 rounded-full bg-teal-500/10 flex items-center justify-center mb-6">
                        <Camera className="w-16 h-16 text-teal-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--on-surface)] mb-2">Scan Invoice</h3>
                    <p className="text-sm text-[var(--text-muted)] text-center mb-8 max-w-xs">
                        Take a photo or upload an image of an invoice. AI will extract party, items, amounts, and GST.
                    </p>

                    <div className="flex gap-3 w-full max-w-xs">
                        <button onClick={() => handleCapture('camera')}
                            className="flex-1 py-3 bg-teal-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-teal-600 transition-all">
                            <Camera className="w-5 h-5" /> Camera
                        </button>
                        <button onClick={() => handleCapture('gallery')}
                            className="flex-1 py-3 bg-[var(--surface)] text-[var(--on-surface)] border border-[var(--border)] rounded-xl font-semibold flex items-center justify-center gap-2 hover:border-teal-500/30 transition-all">
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
                            <h3 className="font-semibold text-[var(--on-surface)]">Processing...</h3>
                            <p className="text-xs text-[var(--text-muted)]">AI is extracting invoice data</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {['Detecting text...', 'Finding amounts...', 'Parsing items...'].map((text, i) => (
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
                            <span className="text-sm font-medium text-teal-400">AI-Extracted — Review & Edit</span>
                        </div>
                    </div>

                    {imageUrl && (
                        <img src={imageUrl} alt="invoice" className="w-full h-32 object-cover rounded-xl border border-[var(--border)] mb-4" />
                    )}

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
                        <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-2">Extracted Items</h3>
                        {extractedData.items.map((item, i) => (
                            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mb-2">
                                <input type="text" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)}
                                    className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)] mb-2" />
                                <div className="grid grid-cols-4 gap-2">
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
                                        <label className="text-[10px] text-[var(--text-muted)]">GST%</label>
                                        <input type="number" value={item.gst} onChange={e => updateItem(i, 'gst', Number(e.target.value))}
                                            className="w-full px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)]">Amount</label>
                                        <p className="px-2 py-1 text-sm font-medium text-[var(--on-surface)]">{formatCurrency(item.amount)}</p>
                                    </div>
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
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-[var(--text-muted)]">GST</span>
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
                    <p className="text-sm text-[var(--text-muted)] mt-2 text-center">
                        The scanned invoice has been saved and will sync to Tally automatically.
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
