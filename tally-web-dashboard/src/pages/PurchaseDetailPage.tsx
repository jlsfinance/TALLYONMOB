import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Printer, MessageCircle, Calendar, User, FileText } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassUI';
import { format } from 'date-fns';

export default function PurchaseDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [purchase, setPurchase] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) loadPurchase();
    }, [id]);

    const loadPurchase = async () => {
        try {
            const { data: purchaseData } = await supabase
                .from('purchases')
                .select('*')
                .eq('voucher_id', id)
                .single();

            if (purchaseData) {
                const { data: itemsData } = await supabase.from('purchase_items').select('*').eq('purchase_id', purchaseData.id);
                const { data: stockItems } = await supabase.from('stock_items').select('name, hsn_code, base_unit').eq('company_id', purchaseData.company_id);

                const stockLookup: any = {};
                stockItems?.forEach((item: any) => { stockLookup[item.name] = item; });

                purchaseData.purchase_items = (itemsData || []).map((item: any) => ({
                    ...item,
                    hsn_code: item.hsn_code || stockLookup[item.stock_item_name]?.hsn_code || '-',
                    unit: item.unit || stockLookup[item.stock_item_name]?.base_unit || ''
                }));

                setPurchase(purchaseData);
            }
        } catch (err) {
            console.error('Error loading purchase:', err);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount || 0);

    const handlePrint = () => window.print();

    const handleWhatsApp = () => {
        const text = encodeURIComponent(`*Purchase: ${purchase.invoice_number}*\nVendor: ${purchase.party_ledger_name}\nAmount: ${formatCurrency(purchase.net_amount)}\nDate: ${format(new Date(purchase.invoice_date), 'dd MMM yyyy')}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-500">Loading purchase...</p>
            </div>
        );
    }

    if (!purchase) {
        return (
            <div className="text-center py-20 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Purchase not found</p>
                <button onClick={() => navigate('/purchases')} className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                    ← Back to Purchases
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 print:p-8 print:bg-white">
            {/* Action Bar */}
            <div className="flex items-center justify-between gap-4 print:hidden">
                <button onClick={() => navigate('/purchases')} className="flex items-center gap-2 text-gray-400 hover:text-white">
                    <ArrowLeft size={20} /> Back to Purchases
                </button>
                <div className="flex gap-2">
                    <button onClick={handlePrint} className="px-4 py-2 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white flex items-center gap-2">
                        <Printer size={16} /> Print
                    </button>
                    <button onClick={handleWhatsApp} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-2">
                        <MessageCircle size={16} /> WhatsApp
                    </button>
                </div>
            </div>

            {/* Purchase Card */}
            <GlassCard className="p-0 overflow-hidden print:shadow-none print:border">
                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-gradient-to-r from-orange-500/10 to-purple-500/10 print:bg-gray-50">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-white print:text-gray-900">PURCHASE VOUCHER</h1>
                            <p className="text-gray-400 print:text-gray-600">{selectedCompany?.name}</p>
                            {selectedCompany?.gstin && <p className="text-sm text-gray-500 font-mono mt-1">GSTIN: {selectedCompany.gstin}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase font-bold">Invoice No.</p>
                            <p className="text-2xl font-bold text-orange-400 print:text-orange-600">{purchase.invoice_number}</p>
                            <p className="text-sm text-gray-400 mt-2 flex items-center justify-end gap-1">
                                <Calendar size={14} /> {format(new Date(purchase.invoice_date), 'dd MMM yyyy')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Vendor & Amount */}
                <div className="p-6 grid md:grid-cols-2 gap-6 border-b border-white/5">
                    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/5 print:border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-1"><User size={12} /> Vendor</p>
                        <p className="font-semibold text-white text-lg print:text-gray-900">{purchase.party_ledger_name}</p>
                        {purchase.party_gstin && <p className="text-sm text-gray-400 font-mono mt-1">GSTIN: {purchase.party_gstin}</p>}
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-right print:bg-orange-50">
                        <p className="text-xs text-orange-400 uppercase font-bold mb-2">Purchase Amount</p>
                        <p className="text-4xl font-bold text-orange-400 print:text-orange-600">{formatCurrency(purchase.net_amount)}</p>
                    </div>
                </div>

                {/* Items Table */}
                {purchase.purchase_items && purchase.purchase_items.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider print:bg-gray-100">
                                <tr>
                                    <th className="px-6 py-4 w-10">#</th>
                                    <th className="px-6 py-4">Item</th>
                                    <th className="px-6 py-4 text-center">HSN CODE</th>
                                    <th className="px-6 py-4 text-center">Qty</th>
                                    <th className="px-6 py-4 text-right">Rate</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 print:divide-gray-200">
                                {purchase.purchase_items.map((item: any, idx: number) => (
                                    <tr key={item.id || idx} className="hover:bg-white/[0.02]">
                                        <td className="px-6 py-4 text-gray-500">{idx + 1}</td>
                                        <td className="px-6 py-4 font-medium text-white print:text-gray-900">{item.stock_item_name || item.name}</td>
                                        <td className="px-6 py-4 text-center text-gray-400 font-mono">{item.hsn_code}</td>
                                        <td className="px-6 py-4 text-center"><span className="font-semibold text-white print:text-gray-900">{item.quantity}</span><span className="text-xs text-gray-500 ml-1">{item.unit}</span></td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(item.rate)}</td>
                                        <td className="px-6 py-4 text-right font-semibold text-white print:text-gray-900">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Summary */}
                <div className="p-6 border-t border-white/5">
                    <div className="ml-auto max-w-xs space-y-2">
                        <div className="flex justify-between text-gray-400"><span>Gross Amount</span><span className="font-mono text-white">{formatCurrency(purchase.gross_amount)}</span></div>
                        {purchase.discount_amount > 0 && <div className="flex justify-between text-red-400"><span>Discount</span><span className="font-mono">-{formatCurrency(purchase.discount_amount)}</span></div>}
                        <div className="border-t border-white/5 pt-2 mt-2">
                            <div className="flex justify-between text-gray-400"><span>Taxable Value</span><span className="font-mono text-white">{formatCurrency(purchase.taxable_amount)}</span></div>
                            {purchase.cgst_amount > 0 && <div className="flex justify-between text-gray-500"><span>CGST</span><span className="font-mono">{formatCurrency(purchase.cgst_amount)}</span></div>}
                            {purchase.sgst_amount > 0 && <div className="flex justify-between text-gray-500"><span>SGST</span><span className="font-mono">{formatCurrency(purchase.sgst_amount)}</span></div>}
                            {purchase.igst_amount > 0 && <div className="flex justify-between text-gray-500"><span>IGST</span><span className="font-mono">{formatCurrency(purchase.igst_amount)}</span></div>}
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t border-white/5 pt-3 mt-2 text-orange-400">
                            <span>Net Amount</span>
                            <span className="font-mono">{formatCurrency(purchase.net_amount)}</span>
                        </div>
                    </div>
                </div>

                {/* Narration */}
                {purchase.narration && (
                    <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5">
                        <span className="text-xs text-gray-500 uppercase font-bold mr-2">Remarks:</span>
                        <span className="text-gray-400">{purchase.narration}</span>
                    </div>
                )}
            </GlassCard>
        </div>
    );
}
