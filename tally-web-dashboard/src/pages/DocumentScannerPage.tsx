import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { callGemini } from '@/lib/GeminiService';
import { getUserGeminiApiKey } from '@/lib/userGeminiKey';
import toast from 'react-hot-toast';
import { Camera, ScanLine, Check, Loader2, Image, Sparkles, ArrowLeft, Save, AlertTriangle, FileText, Receipt, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ScannedData {
    type: 'invoice' | 'receipt' | 'expense';
    vendor: string;
    date: string;
    amount: number;
    gst: number;
    items: { name: string; qty: number; rate: number; amount: number }[];
    payment_method: string;
    reference: string;
    confidence: number;
}

export default function DocumentScannerPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const fileRef = useRef<HTMLInputElement>(null);
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<ScannedData | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const handleFile = async (file: File) => {
        if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
        setPreview(URL.createObjectURL(file));
        setScanning(true);
        try {
            const apiKey = await getUserGeminiApiKey(selectedCompany?.id);
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            const base64 = btoa(binary);

            const prompt = `Analyze this document image and extract structured data. Return JSON with: type (invoice/receipt/expense), vendor, date (YYYY-MM-DD), amount, gst, items (array with name/qty/rate/amount), payment_method, reference, confidence (0-100). Be precise with numbers.`;

            const response = await callGemini(prompt, [{ inlineData: { mimeType: file.type, data: base64 } }], apiKey);
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                setResult({ ...data, confidence: data.confidence || 85 });
                toast.success('Document scanned!');
            } else {
                toast.error('Could not parse document');
            }
        } catch (e: any) { toast.error('Scan failed: ' + e.message); }
        setScanning(false);
    };

    const saveToVoucher = async () => {
        if (!result) return;
        try {
            const { error } = await supabase.from('vouchers').insert({
                company_id: selectedCompany.id, voucher_type: result.type === 'invoice' ? 'Purchase' : 'Payment',
                party_name: result.vendor, voucher_date: result.date, grand_total: result.amount,
                narration: `Scanned ${result.type} - Ref: ${result.reference}`, is_deleted: false, sync_status: 'pending',
            });
            if (error) throw error;
            toast.success('Saved as voucher!');
            navigate('/vouchers');
        } catch (e: any) { toast.error(e.message); }
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto pb-24">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-[var(--surface-variant)]"><ArrowLeft size={18} /></button>
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)]">Document Scanner</h1>
                    <p className="text-xs text-[var(--text-muted)]">Scan receipts, invoices, expenses with AI</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {[
                    { type: 'invoice', icon: <FileText size={20} />, label: 'Invoice', color: 'blue' },
                    { type: 'receipt', icon: <Receipt size={20} />, label: 'Receipt', color: 'emerald' },
                    { type: 'expense', icon: <Package size={20} />, label: 'Expense', color: 'amber' },
                ].map(t => (
                    <button key={t.type} onClick={() => fileRef.current?.click()} className={`p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)] transition-all flex flex-col items-center gap-3`}>
                        <div className={`w-14 h-14 rounded-xl bg-${t.color}-500/10 flex items-center justify-center text-${t.color}-500`}>{t.icon}</div>
                        <span className="text-xs font-bold">{t.label}</span>
                    </button>
                ))}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
            </div>

            {preview && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                    <img src={preview} alt="Scanned" className="w-full max-h-64 object-contain bg-black/5" />
                </div>
            )}

            {scanning && (
                <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
                    <span className="text-sm font-bold text-[var(--text-muted)]">Analyzing document...</span>
                </div>
            )}

            {result && !scanning && (
                <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <Sparkles size={14} className="text-amber-500" /> Extracted Data
                        </h3>
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${result.confidence >= 80 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {result.confidence}% confidence
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><span className="text-[var(--text-muted)]">Type:</span> <span className="font-bold capitalize">{result.type}</span></div>
                        <div><span className="text-[var(--text-muted)]">Vendor:</span> <span className="font-bold">{result.vendor}</span></div>
                        <div><span className="text-[var(--text-muted)]">Date:</span> <span className="font-bold">{result.date}</span></div>
                        <div><span className="text-[var(--text-muted)]">Amount:</span> <span className="font-black text-lg">₹{result.amount?.toLocaleString('en-IN')}</span></div>
                        <div><span className="text-[var(--text-muted)]">GST:</span> <span className="font-bold">₹{result.gst?.toLocaleString('en-IN') || '0'}</span></div>
                        <div><span className="text-[var(--text-muted)]">Payment:</span> <span className="font-bold">{result.payment_method || 'N/A'}</span></div>
                    </div>

                    {result.items?.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Items</p>
                            {result.items.map((item, i) => (
                                <div key={i} className="flex justify-between text-xs p-2 rounded-lg bg-[var(--surface-variant)]">
                                    <span>{item.name} x {item.qty}</span>
                                    <span className="font-bold">₹{item.amount?.toLocaleString('en-IN')}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button onClick={saveToVoucher} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--primary)] text-white text-xs font-bold">
                            <Save size={14} /> Save as Voucher
                        </button>
                        <button onClick={() => { setResult(null); setPreview(null); }} className="px-4 py-3 rounded-xl bg-[var(--surface-variant)] text-xs font-bold border border-[var(--border)]">Reset</button>
                    </div>
                </div>
            )}
        </div>
    );
}
