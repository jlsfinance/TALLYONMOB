import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase, salesApi } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, FileText, Printer, Share2, MessageCircle, Download, User, Calendar, Hash } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassUI';
import { format } from 'date-fns';

export default function InvoiceDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) loadInvoice();
    }, [id]);

    const loadInvoice = async () => {
        try {
            const { data: salesData, error } = await supabase
                .from('sales')
                .select('*')
                .eq('voucher_id', id)
                .single();

            if (salesData) {
                const { data: itemsData } = await supabase.from('sales_items').select('*').eq('sale_id', salesData.id);
                const { data: stockItems } = await supabase.from('stock_items').select('name, hsn_code, base_unit').eq('company_id', salesData.company_id);

                const stockLookup: any = {};
                stockItems?.forEach((item: any) => { stockLookup[item.name] = item; });

                let enrichedItems = [];
                if (itemsData && itemsData.length > 0) {
                    enrichedItems = itemsData.map((item: any) => ({
                        ...item,
                        hsn_code: item.hsn_code || stockLookup[item.stock_item_name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name]?.base_unit || ''
                    }));
                } else {
                    const { data: voucherData } = await supabase.from('vouchers').select('inventory_entries').eq('voucher_id', salesData.voucher_id).single();
                    if (voucherData?.inventory_entries) {
                        enrichedItems = voucherData.inventory_entries.map((item: any) => ({
                            ...item,
                            stock_item_name: item.stock_item_name || item.name || 'Unknown',
                            hsn_code: item.hsn_code || stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                            unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                        }));
                    }
                }
                salesData.sales_items = enrichedItems;
                setInvoice(salesData);
            } else {
                const { data } = await salesApi.getById(id!);
                setInvoice(data);
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
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-500">Loading invoice...</p>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="text-center py-20 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Invoice not found</p>
                <button onClick={() => navigate('/sales')} className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                    ← Back to Sales
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 print:p-8 print:bg-white">
            {/* Action Bar */}
            <div className="flex items-center justify-between gap-4 print:hidden">
                <button onClick={() => navigate('/sales')} className="flex items-center gap-2 text-gray-400 hover:text-white">
                    <ArrowLeft size={20} />
                    Back to Sales
                </button>
                <div className="flex gap-2">
                    <Link to={`/invoice/${invoice.voucher_id || id}`} className="px-4 py-2 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-[#1C1C1F] flex items-center gap-2">
                        <Download size={16} /> PDF
                    </Link>
                    <button onClick={handlePrint} className="px-4 py-2 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-[#1C1C1F] flex items-center gap-2">
                        <Printer size={16} /> Print
                    </button>
                    <button onClick={handleShare} className="px-4 py-2 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-[#1C1C1F] flex items-center gap-2">
                        <Share2 size={16} /> Share
                    </button>
                    <button onClick={handleWhatsApp} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-2">
                        <MessageCircle size={16} /> WhatsApp
                    </button>
                </div>
            </div>

            {/* Invoice Card */}
            <GlassCard className="p-0 overflow-hidden print:shadow-none print:border">
                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 print:bg-gray-50">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-white print:text-gray-900">TAX INVOICE</h1>
                            <p className="text-gray-400 print:text-gray-600">{selectedCompany?.name || 'Company Name'}</p>
                            {selectedCompany?.address && (
                                <p className="text-sm text-gray-500 mt-1 max-w-md">{selectedCompany.address}</p>
                            )}
                            {selectedCompany?.gstin && (
                                <p className="text-sm text-gray-500 mt-1">GSTIN: {selectedCompany.gstin}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase font-bold">Invoice No.</p>
                            <p className="text-2xl font-bold text-emerald-400 print:text-emerald-600">{invoice.invoice_number}</p>
                            <p className="text-sm text-gray-400 mt-2 flex items-center justify-end gap-1">
                                <Calendar size={14} />
                                {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Party & Amount */}
                <div className="p-6 grid md:grid-cols-2 gap-6 border-b border-white/5">
                    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/5 print:border-gray-200 print:bg-gray-50">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-1"><User size={12} /> Bill To</p>
                        <p className="font-semibold text-white text-lg print:text-gray-900">{invoice.party_ledger_name}</p>
                        {invoice.party_gstin && <p className="text-sm text-gray-400 mt-1">GSTIN: {invoice.party_gstin}</p>}
                        {invoice.place_of_supply && <p className="text-sm text-gray-500 mt-1">Place of Supply: {invoice.place_of_supply}</p>}
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-right print:bg-emerald-50 print:border-emerald-200">
                        <p className="text-xs text-emerald-400 uppercase font-bold mb-2">Invoice Amount</p>
                        <p className="text-4xl font-bold text-emerald-400 print:text-emerald-600">{formatCurrency(invoice.net_amount)}</p>
                    </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider print:bg-gray-100 print:text-gray-600">
                            <tr>
                                <th className="px-6 py-4 w-10">#</th>
                                <th className="px-6 py-4">Item</th>
                                <th className="px-6 py-4 text-center">HSN</th>
                                <th className="px-6 py-4 text-center">Qty</th>
                                <th className="px-6 py-4 text-right">Rate</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 print:divide-gray-200">
                            {(invoice.sales_items && invoice.sales_items.length > 0) ? (
                                invoice.sales_items.map((item: any, idx: number) => (
                                    <tr key={item.id || idx} className="hover:bg-white/[0.02] print:hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500">{idx + 1}</td>
                                        <td className="px-6 py-4 font-medium text-white print:text-gray-900">{item.stock_item_name || item.name || 'Unknown'}</td>
                                        <td className="px-6 py-4 text-center text-gray-400 font-mono">{item.hsn_code || '-'}</td>
                                        <td className="px-6 py-4 text-center"><span className="font-semibold text-white print:text-gray-900">{item.quantity}</span><span className="text-xs text-gray-500 ml-1">{item.unit}</span></td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300 print:text-gray-700">{formatCurrency(item.rate)}</td>
                                        <td className="px-6 py-4 text-right font-semibold text-white print:text-gray-900">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No items found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Summary */}
                <div className="p-6 border-t border-white/5">
                    <div className="ml-auto max-w-xs space-y-2">
                        <div className="flex justify-between text-gray-400"><span>Gross Amount</span><span className="font-mono text-white print:text-gray-900">{formatCurrency(invoice.gross_amount)}</span></div>
                        {invoice.discount_amount > 0 && (
                            <div className="flex justify-between text-red-400"><span>Discount</span><span className="font-mono">-{formatCurrency(invoice.discount_amount)}</span></div>
                        )}
                        <div className="border-t border-white/5 pt-2 mt-2">
                            <div className="flex justify-between text-gray-400"><span>Taxable Value</span><span className="font-mono text-white print:text-gray-900">{formatCurrency(invoice.taxable_amount)}</span></div>
                            {invoice.cgst_amount > 0 && <div className="flex justify-between text-gray-500"><span>CGST</span><span className="font-mono">{formatCurrency(invoice.cgst_amount)}</span></div>}
                            {invoice.sgst_amount > 0 && <div className="flex justify-between text-gray-500"><span>SGST</span><span className="font-mono">{formatCurrency(invoice.sgst_amount)}</span></div>}
                            {invoice.igst_amount > 0 && <div className="flex justify-between text-gray-500"><span>IGST</span><span className="font-mono">{formatCurrency(invoice.igst_amount)}</span></div>}
                        </div>
                        {invoice.round_off !== 0 && (
                            <div className="flex justify-between text-gray-500 border-t border-white/5 pt-2"><span>Round Off</span><span className="font-mono">{invoice.round_off > 0 ? '+' : ''}{formatCurrency(invoice.round_off)}</span></div>
                        )}
                        <div className="flex justify-between font-bold text-lg border-t border-white/5 pt-3 mt-2 text-emerald-400 print:text-emerald-600">
                            <span>Net Amount</span>
                            <span className="font-mono">{formatCurrency(invoice.net_amount)}</span>
                        </div>
                    </div>
                </div>

                {/* Narration */}
                {invoice.narration && (
                    <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 print:bg-gray-50">
                        <span className="text-xs text-gray-500 uppercase font-bold mr-2">Remarks:</span>
                        <span className="text-gray-400 print:text-gray-600">{invoice.narration}</span>
                    </div>
                )}
            </GlassCard>

            <p className="text-center text-xs text-gray-600 print:hidden">LiveKeeping • {selectedCompany?.name}</p>
        </div>
    );
}
