import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, FileText, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ExtractedData {
    gstin?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    totalTax?: number;
    totalAmount?: number;
    supplierName?: string;
    items?: Array<{
        name: string;
        hsn?: string;
        quantity?: number;
        rate?: number;
        amount?: number;
    }>;
}

interface ReceiptScannerProps {
    onExtract?: (data: ExtractedData) => void;
    onClose?: () => void;
}

export default function ReceiptScanner({ onExtract, onClose }: ReceiptScannerProps) {
    const [image, setImage] = useState<string | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [result, setResult] = useState<ExtractedData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            toast.error('Please select an image or PDF file');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => setImage(reader.result as string);
        reader.readAsDataURL(file);
    }, []);

    const extractData = useCallback(async () => {
        if (!image) return;
        setExtracting(true);
        setError(null);
        setResult(null);

        try {
            // Use the existing invoice extraction API
            const response = await fetch('/api/invoice/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image }),
            });

            if (!response.ok) {
                throw new Error('Extraction failed');
            }

            const data = await response.json();
            setResult(data);
            toast.success('Data extracted successfully!');
        } catch (err: any) {
            setError(err.message || 'Failed to extract data');
            toast.error('Extraction failed');
        } finally {
            setExtracting(false);
        }
    }, [image]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Camera size={20} className="text-[var(--primary)]" />
                    <h3 className="text-lg font-bold text-[var(--on-surface)]">Receipt Scanner</h3>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--surface-variant)]">
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Upload Area */}
            {!image ? (
                <div
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--border)] rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all"
                >
                    <Upload size={36} className="text-[var(--text-muted)] mb-3" />
                    <p className="text-sm font-bold text-[var(--on-surface)]">Upload Invoice / Receipt</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">JPG, PNG, or PDF</p>
                </div>
            ) : (
                <div className="relative">
                    <img src={image} alt="Receipt" className="w-full max-h-80 object-contain rounded-xl border border-[var(--border)]" />
                    <button
                        onClick={() => { setImage(null); setResult(null); setError(null); }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Extract Button */}
            {image && !result && (
                <button
                    onClick={extractData}
                    disabled={extracting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                    {extracting ? (
                        <><Loader2 size={16} className="animate-spin" /> Extracting Data...</>
                    ) : (
                        <><FileText size={16} /> Extract Data from Image</>
                    )}
                </button>
            )}

            {/* Error */}
            {error && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 flex items-center gap-2">
                    <AlertCircle size={16} className="text-rose-500" />
                    <p className="text-sm text-rose-500">{error}</p>
                </div>
            )}

            {/* Results */}
            {result && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-500">
                        <CheckCircle2 size={16} />
                        <p className="text-sm font-bold">Data Extracted</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {result.gstin && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">GSTIN</p>
                                <p className="text-xs font-bold">{result.gstin}</p>
                            </div>
                        )}
                        {result.invoiceNumber && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">Invoice #</p>
                                <p className="text-xs font-bold">{result.invoiceNumber}</p>
                            </div>
                        )}
                        {result.invoiceDate && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">Date</p>
                                <p className="text-xs font-bold">{result.invoiceDate}</p>
                            </div>
                        )}
                        {result.supplierName && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">Supplier</p>
                                <p className="text-xs font-bold">{result.supplierName}</p>
                            </div>
                        )}
                        {result.taxableAmount != null && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">Taxable</p>
                                <p className="text-xs font-bold">₹{result.taxableAmount.toLocaleString('en-IN')}</p>
                            </div>
                        )}
                        {result.totalAmount != null && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">Total</p>
                                <p className="text-xs font-bold">₹{result.totalAmount.toLocaleString('en-IN')}</p>
                            </div>
                        )}
                        {result.cgst != null && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">CGST</p>
                                <p className="text-xs font-bold">₹{result.cgst.toLocaleString('en-IN')}</p>
                            </div>
                        )}
                        {result.sgst != null && (
                            <div className="p-2 rounded-lg bg-[var(--surface-variant)]">
                                <p className="text-[10px] text-[var(--text-muted)]">SGST</p>
                                <p className="text-xs font-bold">₹{result.sgst.toLocaleString('en-IN')}</p>
                            </div>
                        )}
                    </div>

                    {onExtract && (
                        <button
                            onClick={() => onExtract(result)}
                            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600"
                        >
                            Use This Data
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
