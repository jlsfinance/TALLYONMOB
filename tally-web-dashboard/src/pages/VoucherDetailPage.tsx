import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Printer, MessageCircle, Share2, Download, Calendar, User, Building2, FileText } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassUI';
import { format } from 'date-fns';

const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const hundred = Math.floor((num % 1000) / 100);
    const remainder = Math.floor(num % 100);

    let words = '';
    if (crore > 0) words += (crore < 20 ? ones[crore] : tens[Math.floor(crore / 10)] + ' ' + ones[crore % 10]) + ' Crore ';
    if (lakh > 0) words += (lakh < 20 ? ones[lakh] : tens[Math.floor(lakh / 10)] + ' ' + ones[lakh % 10]) + ' Lakh ';
    if (thousand > 0) words += (thousand < 20 ? ones[thousand] : tens[Math.floor(thousand / 10)] + ' ' + ones[thousand % 10]) + ' Thousand ';
    if (hundred > 0) words += ones[hundred] + ' Hundred ';
    if (remainder > 0) {
        if (words !== '') words += 'and ';
        if (remainder < 20) words += ones[remainder];
        else words += tens[Math.floor(remainder / 10)] + ' ' + ones[remainder % 10];
    }
    return words.trim() + ' Rupees Only';
};

export default function VoucherDetailPage() {
    const { voucherId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [voucher, setVoucher] = useState<any>(null);
    const [saleData, setSaleData] = useState<any>(null);
    const [purchaseData, setPurchaseData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (voucherId && selectedCompany) loadVoucherDetails();
    }, [voucherId, selectedCompany]);

    const loadVoucherDetails = async () => {
        setLoading(true);
        try {
            const { data: vData } = await supabase
                .from('vouchers')
                .select('*')
                .eq('voucher_id', decodeURIComponent(voucherId!))
                .single();

            if (!vData) throw new Error('Voucher not found');
            setVoucher(vData);

            if (vData.voucher_type === 'Sales') {
                let { data: sData } = await supabase.from('sales').select('*').eq('voucher_id', vData.voucher_id).single();

                if (!sData) {
                    sData = { id: 'synthetic', net_amount: vData.total_amount, gross_amount: vData.total_amount, party_name: vData.party_name, voucher_number: vData.voucher_number, voucher_date: vData.voucher_date };
                }

                let itemsData = [];
                if (sData.id !== 'synthetic') {
                    const { data: iData } = await supabase.from('sales_items').select('*').eq('sale_id', sData.id);
                    itemsData = iData || [];
                }

                let currentItems = itemsData.length > 0 ? itemsData : (vData.inventory_entries || []);
                const { data: stockItems } = await supabase.from('stock_items').select('name, hsn_code, base_unit').eq('company_id', vData.company_id);
                const stockLookup: any = {}; stockItems?.forEach((item: any) => stockLookup[item.name] = item);

                sData.sales_items = currentItems.map((item: any) => ({
                    ...item,
                    hsn_code: item.hsn_code && item.hsn_code !== 'Stock Item' ? item.hsn_code : stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                    unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                }));

                if ((!sData.round_off || sData.round_off === 0) && vData.ledger_entries) {
                    const roundLedger = vData.ledger_entries.find((e: any) => e.ledger_name.toLowerCase().includes('round') && (e.ledger_name.toLowerCase().includes('off') || e.ledger_name.toLowerCase().includes('ing')));
                    if (roundLedger) sData.round_off = roundLedger.is_debit ? -roundLedger.amount : roundLedger.amount;
                }

                if (sData.id === 'synthetic' && vData.ledger_entries) {
                    sData.cgst_amount = vData.ledger_entries.filter((e: any) => e.ledger_name.toLowerCase().includes('cgst')).reduce((s: number, e: any) => s + e.amount, 0);
                    sData.sgst_amount = vData.ledger_entries.filter((e: any) => e.ledger_name.toLowerCase().includes('sgst')).reduce((s: number, e: any) => s + e.amount, 0);
                    sData.igst_amount = vData.ledger_entries.filter((e: any) => e.ledger_name.toLowerCase().includes('igst')).reduce((s: number, e: any) => s + e.amount, 0);
                    sData.taxable_amount = sData.net_amount - sData.cgst_amount - sData.sgst_amount - sData.igst_amount - (sData.round_off || 0);
                }

                setSaleData(sData);
            }

            if (vData.voucher_type === 'Purchase') {
                const { data: pData } = await supabase.from('purchases').select('*').eq('voucher_id', vData.voucher_id).single();
                if (pData) {
                    const { data: itemsData } = await supabase.from('purchase_items').select('*').eq('purchase_id', pData.id);
                    let currentItems = itemsData || [];
                    if (currentItems.length === 0 && vData.inventory_entries) currentItems = vData.inventory_entries;
                    pData.purchase_items = currentItems;

                    const { data: stockItems } = await supabase.from('stock_items').select('name, hsn_code, base_unit').eq('company_id', pData.company_id);
                    const stockLookup: any = {}; stockItems?.forEach((item: any) => stockLookup[item.name] = item);
                    pData.purchase_items = pData.purchase_items.map((item: any) => ({
                        ...item,
                        hsn_code: item.hsn_code || stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                    }));
                    setPurchaseData(pData);
                }
            }

        } catch (error) {
            console.error('Error loading voucher:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount) || 0);

    const handlePrint = () => window.print();

    const handleWhatsApp = () => {
        const text = encodeURIComponent(`*${voucher.voucher_type}: ${voucher.voucher_number}*\nParty: ${voucher.party_name}\nAmount: ₹${formatCurrency(voucher.total_amount)}\nDate: ${format(new Date(voucher.voucher_date), 'dd MMM yyyy')}\n\nThank you for your business!`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-500">Loading voucher...</p>
            </div>
        );
    }

    if (!voucher) {
        return (
            <div className="text-center py-20 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Voucher not found</p>
                <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                    ← Go Back
                </button>
            </div>
        );
    }

    const detailData = saleData || purchaseData;
    let items = saleData?.sales_items || purchaseData?.purchase_items || [];
    if (items.length === 0 || (items.length > 0 && !items[0].quantity && !items[0].rate)) {
        const invEntries = voucher?.inventory_entries || [];
        if (invEntries.length > 0) items = invEntries;
    }

    const isSalesOrPurchase = voucher.voucher_type === 'Sales' || voucher.voucher_type === 'Purchase';
    const voucherTitle = voucher.voucher_type === 'Sales' ? 'TAX INVOICE' : voucher.voucher_type === 'Purchase' ? 'PURCHASE VOUCHER' : voucher.voucher_type.toUpperCase();
    const accentColor = voucher.voucher_type === 'Sales' ? 'emerald' : voucher.voucher_type === 'Purchase' ? 'orange' : 'blue';

    return (
        <div className="space-y-6 print:p-8 print:bg-white">
            {/* Action Bar */}
            <div className="flex items-center justify-between gap-4 print:hidden">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white">
                    <ArrowLeft size={20} /> Back
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

            {/* Voucher Card */}
            <GlassCard className="p-0 overflow-hidden print:shadow-none print:border">
                {/* Header */}
                <div className={`p-6 border-b border-white/5 bg-gradient-to-r from-${accentColor}-500/10 to-blue-500/10 print:bg-gray-50`}>
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-white print:text-gray-900">{voucherTitle}</h1>
                            <p className="text-gray-400 print:text-gray-600">{selectedCompany?.name}</p>
                            {selectedCompany?.address && <p className="text-sm text-gray-500 mt-1 max-w-md">{selectedCompany.address}</p>}
                            {selectedCompany?.gstin && <p className="text-sm text-gray-500 font-mono">GSTIN: {selectedCompany.gstin}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase font-bold">Voucher No.</p>
                            <p className={`text-2xl font-bold text-${accentColor}-400 print:text-${accentColor}-600`}>{voucher.voucher_number}</p>
                            <p className="text-sm text-gray-400 mt-2 flex items-center justify-end gap-1">
                                <Calendar size={14} /> {format(new Date(voucher.voucher_date), 'dd MMM yyyy')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Party & Amount */}
                <div className="p-6 grid md:grid-cols-2 gap-6 border-b border-white/5">
                    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/5 print:border-gray-200 print:bg-gray-50">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-1">
                            <User size={12} /> {voucher.voucher_type === 'Sales' ? 'Buyer' : voucher.voucher_type === 'Purchase' ? 'Seller' : 'Party'}
                        </p>
                        <p className="font-semibold text-white text-lg print:text-gray-900">{voucher.party_name || 'Cash'}</p>
                        {detailData?.party_gstin && <p className="text-sm text-gray-400 font-mono mt-1">GSTIN: {detailData.party_gstin}</p>}
                        {detailData?.place_of_supply && <p className="text-sm text-gray-500 mt-1">Place: {detailData.place_of_supply}</p>}
                    </div>
                    <div className={`bg-${accentColor}-500/10 border border-${accentColor}-500/20 rounded-xl p-4 text-right print:bg-${accentColor}-50`}>
                        <p className={`text-xs text-${accentColor}-400 uppercase font-bold mb-2`}>Total Amount</p>
                        <p className={`text-4xl font-bold text-${accentColor}-400 print:text-${accentColor}-600`}>{formatCurrency(detailData?.net_amount || voucher.total_amount)}</p>
                        <p className="text-xs text-gray-500 mt-2 italic">{numberToWords(Math.round(detailData?.net_amount || voucher.total_amount))}</p>
                    </div>
                </div>

                {/* Items Table */}
                {isSalesOrPurchase && items.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider print:bg-gray-100">
                                <tr>
                                    <th className="px-6 py-4 w-10">#</th>
                                    <th className="px-6 py-4">Item</th>
                                    <th className="px-6 py-4 text-center">HSN</th>
                                    <th className="px-6 py-4 text-center">Qty</th>
                                    <th className="px-6 py-4 text-right">Rate</th>
                                    <th className="px-6 py-4 text-right">Disc</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 print:divide-gray-200">
                                {items.map((item: any, idx: number) => (
                                    <tr key={item.id || idx} className="hover:bg-white/[0.02]">
                                        <td className="px-6 py-4 text-gray-500">{idx + 1}</td>
                                        <td className="px-6 py-4 font-medium text-white print:text-gray-900">{item.stock_item_name || item.name || 'Unknown'}</td>
                                        <td className="px-6 py-4 text-center text-gray-400 font-mono">{item.hsn_code || '-'}</td>
                                        <td className="px-6 py-4 text-center"><span className="font-semibold text-white print:text-gray-900">{item.quantity}</span><span className="text-xs text-gray-500 ml-1">{item.unit}</span></td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-300">{formatCurrency(item.rate)}</td>
                                        <td className="px-6 py-4 text-right text-gray-500">{item.discount_percent ? `${item.discount_percent}%` : '-'}</td>
                                        <td className="px-6 py-4 text-right font-semibold text-white print:text-gray-900">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Ledger Entries (for non-sales/purchase) */}
                {!isSalesOrPurchase && voucher.ledger_entries && voucher.ledger_entries.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/[0.02] text-left text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Ledger</th>
                                    <th className="px-6 py-4 text-right">Debit</th>
                                    <th className="px-6 py-4 text-right">Credit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {voucher.ledger_entries.map((entry: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-white/[0.02]">
                                        <td className="px-6 py-4 font-medium text-white">{entry.ledger_name}</td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-400">{entry.is_debit ? formatCurrency(entry.amount) : '-'}</td>
                                        <td className="px-6 py-4 text-right font-mono text-red-400">{!entry.is_debit ? formatCurrency(entry.amount) : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Summary */}
                {detailData && (
                    <div className="p-6 border-t border-white/5">
                        <div className="ml-auto max-w-xs space-y-2">
                            <div className="flex justify-between text-gray-400"><span>Gross Amount</span><span className="font-mono text-white">{formatCurrency(detailData.gross_amount)}</span></div>
                            {detailData.discount_amount > 0 && <div className="flex justify-between text-red-400"><span>Discount</span><span className="font-mono">-{formatCurrency(detailData.discount_amount)}</span></div>}
                            <div className="border-t border-white/5 pt-2 mt-2">
                                <div className="flex justify-between text-gray-400"><span>Taxable Value</span><span className="font-mono text-white">{formatCurrency(detailData.taxable_amount)}</span></div>
                                {detailData.cgst_amount > 0 && <div className="flex justify-between text-gray-500"><span>CGST</span><span className="font-mono">{formatCurrency(detailData.cgst_amount)}</span></div>}
                                {detailData.sgst_amount > 0 && <div className="flex justify-between text-gray-500"><span>SGST</span><span className="font-mono">{formatCurrency(detailData.sgst_amount)}</span></div>}
                                {detailData.igst_amount > 0 && <div className="flex justify-between text-gray-500"><span>IGST</span><span className="font-mono">{formatCurrency(detailData.igst_amount)}</span></div>}
                            </div>
                            {detailData.round_off !== 0 && <div className="flex justify-between text-gray-500 border-t border-white/5 pt-2"><span>Round Off</span><span className="font-mono">{detailData.round_off > 0 ? '+' : ''}{formatCurrency(detailData.round_off)}</span></div>}
                            <div className={`flex justify-between font-bold text-lg border-t border-white/5 pt-3 mt-2 text-${accentColor}-400`}>
                                <span>Net Amount</span>
                                <span className="font-mono">{formatCurrency(detailData.net_amount)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Narration */}
                {voucher.narration && (
                    <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5">
                        <span className="text-xs text-gray-500 uppercase font-bold mr-2">Narration:</span>
                        <span className="text-gray-400">{voucher.narration}</span>
                    </div>
                )}
            </GlassCard>
        </div>
    );
}
