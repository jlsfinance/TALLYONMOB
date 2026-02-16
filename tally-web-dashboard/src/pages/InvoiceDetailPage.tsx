import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Printer, Share2, MessageCircle, Edit, MapPin, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

export default function InvoiceDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [upiId, setUpiId] = useState('');
    const [isEditingUpi, setIsEditingUpi] = useState(false);

    useEffect(() => {
        if (id) loadInvoice();
    }, [id]);

    useEffect(() => {
        if (selectedCompany?.id) {
            const savedUpi = localStorage.getItem(`upi_${selectedCompany.id}`);
            if (savedUpi) setUpiId(savedUpi);
        }
    }, [selectedCompany]);

    const saveUpiId = () => {
        if (selectedCompany?.id) {
            localStorage.setItem(`upi_${selectedCompany.id}`, upiId);
            setIsEditingUpi(false);
            toast.success('UPI ID Saved');
        }
    };

    const loadInvoice = async () => {
        try {
            // First try to find by id or voucher_id in vouchers table
            let { data: voucherData } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', id)
                .single();

            if (!voucherData && id) {
                // Try by voucher_id field
                const { data: fallback } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('voucher_id', id)
                    .single();
                voucherData = fallback;
            }

            if (voucherData) {
                // Map voucher fields to invoice format
                const salesData: any = {
                    ...voucherData,
                    invoice_number: voucherData.voucher_number,
                    invoice_date: voucherData.voucher_date,
                    party_ledger_name: voucherData.party_name,
                    party_gstin: voucherData.party_gst_number || '', // Use mapped GST
                    net_amount: Math.abs(Number(voucherData.grand_total) || Number(voucherData.total_amount) || 0),
                    gross_amount: Math.abs(Number(voucherData.grand_total) || Number(voucherData.total_amount) || 0),
                    taxable_amount: Math.abs(Number(voucherData.taxable_value) || Number(voucherData.total_amount) || 0),
                    place_of_supply: voucherData.place_of_supply || '',
                    cgst_amount: Number(voucherData.cgst_amount) || 0,
                    sgst_amount: Number(voucherData.sgst_amount) || 0,
                    igst_amount: Number(voucherData.igst_amount) || 0,
                    round_off: Number(voucherData.round_off) || 0,
                    narration: voucherData.narration || '',
                    voucher_id: voucherData.voucher_id || voucherData.id
                };

                // Fetch voucher_stock_entries
                const { data: stockEntries } = await supabase
                    .from('voucher_stock_entries')
                    .select('*')
                    .eq('voucher_id', voucherData.id);

                // Get stock items lookup
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, unit, gst_rate')
                    .eq('company_id', voucherData.company_id);

                const stockLookup: any = {};
                stockItems?.forEach((item: any) => { stockLookup[item.name] = item; });

                // Map entries to items format
                const finalItems = (stockEntries || []).map((item: any, idx: number) => ({
                    ...item,
                    stock_item_name: item.item_name || item.stock_item_name || 'Unknown',
                    hsn_code: item.hsn_code || stockLookup[item.item_name]?.hsn_code || '-',
                    unit: item.unit || stockLookup[item.item_name]?.unit || '',
                    quantity: item.quantity || item.billed_qty || 0,
                    rate: item.rate || item.unit_price || 0,
                    amount: item.amount || (item.quantity * item.rate) || 0,
                    discount_percent: item.discount_percent || 0,
                    tax_rate: item.gst_rate || stockLookup[item.item_name]?.gst_rate || item.tax_rate || 0
                }));

                salesData.sales_items = finalItems;
                setInvoice(salesData);
            } else {
                setInvoice(null);
            }
        } catch (err) {
            console.error('Error loading invoice:', err);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount || 0);

    const handlePrint = () => window.print();

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `*Invoice: ${invoice.invoice_number}*\nParty: ${invoice.party_ledger_name}\nAmount: ${formatCurrency(invoice.net_amount)}\nDate: ${format(new Date(invoice.invoice_date), 'dd MMM yyyy')}\n\nThank you for your business!`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const handleShare = async () => {
        const text = `Invoice: ${invoice.invoice_number}\nParty: ${invoice.party_ledger_name}\nAmount: ${formatCurrency(invoice.net_amount)}`;
        if (navigator.share) {
            try {
                await navigator.share({ title: `Invoice ${invoice.invoice_number}`, text });
            } catch (err) { }
        } else {
            navigator.clipboard.writeText(text);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
                <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-xs uppercase font-bold tracking-widest text-gray-500">Generating Invoice...</p>
            </div>
        );
    }

    if (!invoice) return null;

    // QR Code Generation
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(selectedCompany.name)}&am=${invoice.net_amount}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 font-sans text-gray-900 md:py-12 px-4 print:p-0 print:bg-white box-border">
            {/* Header Actions (No Print) */}
            <div className="w-full max-w-[210mm] flex justify-between items-center mb-6 print:hidden">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
                    <ArrowLeft size={18} /> Back
                </button>
                <div className="flex gap-3">
                    <button onClick={() => navigate(`/edit-invoice/${id}`)} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-amber-600 transition-colors flex items-center gap-2">
                        <Edit size={14} /> Edit
                    </button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-black transition-colors flex items-center gap-2">
                        <Printer size={14} /> Print / Save PDF
                    </button>
                    <button onClick={handleWhatsApp} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-emerald-600 transition-colors flex items-center gap-2">
                        <MessageCircle size={14} /> WhatsApp
                    </button>
                </div>
            </div>

            {/* A4 Invoice Paper */}
            <div className="bg-white w-full max-w-[210mm] min-h-[297mm] shadow-2xl print:shadow-none print:w-full print:max-w-none print:min-h-0 relative flex flex-col">

                {/* 1. Header Area */}
                <div className="p-8 md:p-12 border-b-2 border-gray-100 flex justify-between items-start">
                    <div className="space-y-4">
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">{selectedCompany?.name || 'Company Name'}</h1>
                            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mt-2">
                                {selectedCompany?.address && <span className="flex items-center gap-1"><MapPin size={12} /> {selectedCompany.address}</span>}
                            </div>
                            <div className="flex flex-wrap gap-4 mt-1 text-xs font-bold text-gray-600 uppercase tracking-wide">
                                {selectedCompany?.gstin && <span>GSTIN: {selectedCompany.gstin}</span>}
                                {selectedCompany?.phone_number && <span>Ph: {selectedCompany.phone_number}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-black text-gray-400 uppercase tracking-[0.2em] mb-4">TAX INVOICE</h2>
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Invoice No</p>
                            <p className="text-lg font-black text-gray-900">#{invoice.invoice_number}</p>
                        </div>
                        <div className="space-y-1 mt-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date</p>
                            <p className="text-base font-bold text-gray-900">{format(new Date(invoice.invoice_date), 'dd MMM yyyy')}</p>
                        </div>
                    </div>
                </div>

                {/* 2. Bill To Section */}
                <div className="p-8 md:p-12 bg-gray-50 border-b border-gray-100 flex flex-col md:flex-row gap-12">
                    <div className="flex-1 space-y-3">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-2">Bill To</p>
                        <h3 className="text-xl font-black text-gray-900">{invoice.party_ledger_name}</h3>
                        <div className="text-xs font-medium text-gray-600 space-y-1">
                            {invoice.party_gstin && (
                                <p className="font-bold flex items-center gap-2"><Hash size={12} /> GSTIN: {invoice.party_gstin}</p>
                            )}
                            {/* Placeholder for address if available in future */}
                            <p className="flex items-center gap-2 opacity-50"><MapPin size={12} /> Billing Address</p>
                        </div>
                    </div>
                    <div className="flex-1 space-y-3">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-2">Shipping / Supply</p>
                        <p className="text-sm font-bold text-gray-900">Place of Supply: {invoice.place_of_supply || 'N/A'}</p>
                        <p className="text-xs font-medium text-gray-500">Shipping Address Same as Billing</p>
                    </div>
                </div>

                {/* 3. Items Table */}
                <div className="p-8 md:p-12 flex-1">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 print:bg-gray-100">
                            <tr>
                                <th className="py-3 px-4 text-left font-black text-gray-900 uppercase tracking-wider text-xs w-12 rounded-l-lg">#</th>
                                <th className="py-3 text-left font-black text-gray-900 uppercase tracking-wider text-xs">Description</th>
                                <th className="py-3 text-center font-black text-gray-900 uppercase tracking-wider text-xs">HSN</th>
                                <th className="py-3 text-center font-black text-gray-900 uppercase tracking-wider text-xs">Qty</th>
                                <th className="py-3 text-right font-black text-gray-900 uppercase tracking-wider text-xs">Rate</th>
                                <th className="py-3 text-center font-black text-gray-900 uppercase tracking-wider text-xs">GST %</th>
                                <th className="py-3 px-4 text-right font-black text-gray-900 uppercase tracking-wider text-xs rounded-r-lg">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoice.sales_items?.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="py-4 px-4 text-gray-500 font-medium">{idx + 1}</td>
                                    <td className="py-4">
                                        <p className="font-bold text-gray-900">{item.stock_item_name}</p>
                                        {Number(item.discount_percent) > 0 && (
                                            <p className="text-[10px] text-emerald-600 font-bold mt-1">Includes Discount: {item.discount_percent}%</p>
                                        )}
                                    </td>
                                    <td className="py-4 text-center text-gray-500 text-xs font-mono">{item.hsn_code}</td>
                                    <td className="py-4 text-center font-bold text-gray-700">{item.quantity} {item.unit}</td>
                                    <td className="py-4 text-right font-medium text-gray-600">{formatCurrency(item.rate)}</td>
                                    <td className="py-4 text-center text-xs font-bold text-gray-500">{item.tax_rate}%</td>
                                    <td className="py-4 px-4 text-right font-black text-gray-900">{formatCurrency(item.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 4. Footer & Totals */}
                <div className="bg-gray-50 p-8 md:p-12 border-t border-gray-200 break-inside-avoid">
                    <div className="flex flex-col md:flex-row gap-12">
                        {/* Left: Bank & Notes */}
                        <div className="flex-1 space-y-8">
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Bank Details</h4>
                                <div className="bg-white border border-gray-200 p-4 rounded-xl space-y-1 shadow-sm">
                                    <p className="text-sm font-bold text-gray-900 uppercase">{selectedCompany.bank_name || 'Bank Not Added'}</p>
                                    <div className="text-xs font-medium text-gray-500 grid grid-cols-2 gap-2 mt-2">
                                        <span>A/C No: {selectedCompany.account_number || '-'}</span>
                                        <span>IFSC: {selectedCompany.ifsc_code || '-'}</span>
                                        <span className="col-span-2">Branch: {selectedCompany.branch_name || '-'}</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Terms & Notes</h4>
                                <p className="text-xs text-gray-500 italic leading-relaxed">
                                    {invoice.narration || "Thank you for doing business with us."}
                                </p>
                            </div>
                        </div>

                        {/* MIDDLE: QR CODE */}
                        <div className="w-32 flex flex-col items-center justify-end pb-2">
                            {upiId && !isEditingUpi ? (
                                <div className="text-center group relative">
                                    <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm inline-block">
                                        <img src={qrCodeUrl} alt="UPI QR" className="w-24 h-24 mix-blend-multiply" />
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-500 mt-2 uppercase tracking-wide">Scan to Pay</p>

                                    {/* Edit Button (Hidden in Print) */}
                                    <button
                                        onClick={() => setIsEditingUpi(true)}
                                        className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                                        title="Change UPI ID"
                                    >
                                        <Edit size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col justify-end items-center print:hidden">
                                    {isEditingUpi ? (
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-lg w-48">
                                            <p className="text-[10px] font-bold uppercase mb-2">Company UPI ID</p>
                                            <input
                                                type="text"
                                                placeholder="e.g. name@upi"
                                                value={upiId}
                                                onChange={(e) => setUpiId(e.target.value)}
                                                className="w-full text-xs p-2 border rounded-lg mb-2"
                                            />
                                            <button onClick={saveUpiId} className="w-full bg-emerald-500 text-white text-xs font-bold py-1.5 rounded-lg active:scale-95 transition-transform">
                                                {upiId ? 'Update & Apply to All' : 'Save for All Invoices'}
                                            </button>
                                            <button onClick={() => setIsEditingUpi(false)} className="w-full mt-1 text-[10px] font-bold text-gray-400 hover:text-gray-600">Cancel</button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setIsEditingUpi(true)}
                                            className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-colors"
                                        >
                                            + Add Payment QR
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right: Totals (W-64 to accommodate QR) */}
                        <div className="w-full md:w-64 space-y-3">
                            <div className="flex justify-between text-sm font-bold text-gray-500">
                                <span>Sub Total</span>
                                <span>{formatCurrency(invoice.net_amount - (invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount))}</span>
                            </div>

                            {(invoice.cgst_amount > 0 || invoice.sgst_amount > 0) ? (
                                <>
                                    <div className="flex justify-between text-xs font-medium text-gray-500">
                                        <span>CGST</span>
                                        <span>{formatCurrency(invoice.cgst_amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-medium text-gray-500">
                                        <span>SGST</span>
                                        <span>{formatCurrency(invoice.sgst_amount)}</span>
                                    </div>
                                </>
                            ) : invoice.igst_amount > 0 && (
                                <div className="flex justify-between text-xs font-medium text-gray-500">
                                    <span>IGST</span>
                                    <span>{formatCurrency(invoice.igst_amount)}</span>
                                </div>
                            )}

                            <div className="border-t-2 border-gray-900 pt-4 mt-2 flex justify-between items-end">
                                <div className="text-left">
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Payable</p>
                                    <p className="text-[10px] text-gray-400 font-medium">Incl. of all taxes</p>
                                </div>
                                <p className="text-3xl font-black text-gray-900 leading-none">{formatCurrency(invoice.net_amount)}</p>
                            </div>

                            {/* Sign Area */}
                            <div className="pt-12 mt-8 border-t border-gray-200 text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Authorized Signatory</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <p className="mt-8 text-xs font-medium text-gray-400 print:hidden">Generated via BillBook Web</p>
        </div>
    );
}
