import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import html2pdf from 'html2pdf.js';

// Number to words converter for Indian currency
const numberToWords = (num) => {
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

    if (crore > 0) {
        words += (crore < 20 ? ones[crore] : tens[Math.floor(crore / 10)] + ' ' + ones[crore % 10]) + ' Crore ';
    }
    if (lakh > 0) {
        words += (lakh < 20 ? ones[lakh] : tens[Math.floor(lakh / 10)] + ' ' + ones[lakh % 10]) + ' Lakh ';
    }
    if (thousand > 0) {
        words += (thousand < 20 ? ones[thousand] : tens[Math.floor(thousand / 10)] + ' ' + ones[thousand % 10]) + ' Thousand ';
    }
    if (hundred > 0) {
        words += ones[hundred] + ' Hundred ';
    }
    if (remainder > 0) {
        if (words !== '') words += 'and ';
        if (remainder < 20) {
            words += ones[remainder];
        } else {
            words += tens[Math.floor(remainder / 10)] + ' ' + ones[remainder % 10];
        }
    }

    return words.trim() + ' Rupees Only';
};

export default function VoucherDetailPage() {
    const { voucherId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [voucher, setVoucher] = useState(null);
    const [saleData, setSaleData] = useState(null);
    const [purchaseData, setPurchaseData] = useState(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef();

    useEffect(() => {
        if (voucherId && selectedCompany) {
            loadVoucherDetails();
        }
    }, [voucherId, selectedCompany]);

    const loadVoucherDetails = async () => {
        setLoading(true);
        try {
            const { data: vData, error: vErr } = await supabase
                .from('vouchers')
                .select('*')
                .eq('voucher_id', decodeURIComponent(voucherId))
                .single();

            if (vErr) throw vErr;
            setVoucher(vData);

            if (vData.voucher_type === 'Sales') {
                // Fetch sales record first
                const { data: sData, error: sErr } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('voucher_id', vData.voucher_id)
                    .single();

                if (sData) {
                    // Fetch sales_items separately (FK join was failing with 400)
                    const { data: itemsData } = await supabase
                        .from('sales_items')
                        .select('*')
                        .eq('sale_id', sData.id);

                    // Get stock items to enrich HSN and unit data
                    const { data: stockItems } = await supabase
                        .from('stock_items')
                        .select('name, hsn_code, base_unit')
                        .eq('company_id', sData.company_id);

                    // Create lookup map
                    const stockLookup = {};
                    stockItems?.forEach(item => {
                        stockLookup[item.name] = item;
                    });

                    // Enrich items with HSN and unit from stock master
                    const enrichedItems = (itemsData || []).map(item => ({
                        ...item,
                        hsn_code: item.hsn_code && item.hsn_code !== 'Stock Item' && item.hsn_code !== 'Stock Group'
                            ? item.hsn_code
                            : stockLookup[item.stock_item_name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name]?.base_unit || ''
                    }));

                    // Attach items to sales data
                    sData.sales_items = enrichedItems;

                    // DEBUG: Log what's in sales_items
                    console.log('🔍 DEBUG - Sales Data:', sData);
                    console.log('🔍 DEBUG - Sales Items:', sData.sales_items);
                    if (sData.sales_items?.length > 0) {
                        console.log('🔍 DEBUG - First Item:', JSON.stringify(sData.sales_items[0], null, 2));
                    }
                }

                setSaleData(sData);
            }

            if (vData.voucher_type === 'Purchase') {
                // Fetch purchase record first
                const { data: pData } = await supabase
                    .from('purchases')
                    .select('*')
                    .eq('voucher_id', vData.voucher_id)
                    .single();

                if (pData) {
                    // Fetch purchase_items separately
                    const { data: itemsData } = await supabase
                        .from('purchase_items')
                        .select('*')
                        .eq('purchase_id', pData.id);

                    pData.purchase_items = itemsData || [];
                }

                setPurchaseData(pData);
            }

        } catch (error) {
            console.error('Error loading voucher:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Math.abs(amount) || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `*${voucher.voucher_type}: ${voucher.voucher_number}*\n` +
            `Party: ${voucher.party_name}\n` +
            `Amount: ₹${formatCurrency(voucher.total_amount)}\n` +
            `Date: ${formatDate(voucher.voucher_date)}\n\n` +
            `Thank you for your business!`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    if (loading) {
        return (
            <div className="animate-pulse space-y-6 p-4">
                <div className="h-8 bg-gray-200 rounded w-48"></div>
                <div className="bg-white rounded-xl p-6 shadow">
                    <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                </div>
            </div>
        );
    }

    if (!voucher) {
        return (
            <div className="text-center py-12">
                <span className="text-5xl">❌</span>
                <p className="mt-4 text-gray-600">Voucher not found</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 hover:underline">
                    ← Go Back
                </button>
            </div>
        );
    }

    const detailData = saleData || purchaseData;

    // Get items from sales_items/purchase_items tables, 
    // OR fallback to voucher's inventory_entries JSON (if items table is empty or has no qty)
    let items = saleData?.sales_items || purchaseData?.purchase_items || [];

    // If items exist but first item has no quantity, try voucher's inventory_entries
    if (items.length === 0 || (items.length > 0 && !items[0].quantity && !items[0].rate)) {
        const invEntries = voucher?.inventory_entries || [];
        if (invEntries.length > 0) {
            console.log('📦 Using voucher.inventory_entries as fallback:', invEntries);
            items = invEntries;
        }
    }

    const isSalesOrPurchase = voucher.voucher_type === 'Sales' || voucher.voucher_type === 'Purchase';
    const voucherTitle = voucher.voucher_type === 'Sales' ? 'TAX INVOICE' :
        voucher.voucher_type === 'Purchase' ? 'PURCHASE VOUCHER' :
            voucher.voucher_type.toUpperCase();

    return (
        <div className="space-y-4 pb-20 lg:pb-0">
            {/* Action Buttons - Hidden on Print */}
            <div className="flex gap-2 flex-wrap print:hidden">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition"
                >
                    ← Back
                </button>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl shadow hover:bg-indigo-700 transition"
                >
                    🖨️ Print / Download PDF
                </button>
                <button
                    onClick={handleWhatsApp}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl shadow hover:bg-green-600 transition"
                >
                    💬 WhatsApp
                </button>
            </div>

            {/* ===== TALLY-STYLE INVOICE ===== */}
            <div ref={printRef} className="bg-white text-gray-900 shadow-lg print:shadow-none" style={{ fontFamily: 'Arial, sans-serif' }}>

                {/* === HEADER SECTION === */}
                <div className="border-2 border-black">
                    {/* Company Header */}
                    <div className="text-center border-b-2 border-black py-3 px-4">
                        <h1 className="text-xl font-bold uppercase tracking-wide">{selectedCompany?.name}</h1>
                        {selectedCompany?.address && (
                            <p className="text-xs text-gray-600 mt-1">{selectedCompany.address}</p>
                        )}
                        {selectedCompany?.gstin && (
                            <p className="text-xs font-medium mt-1">GSTIN: {selectedCompany.gstin}</p>
                        )}
                    </div>

                    {/* Invoice Title */}
                    <div className="text-center border-b-2 border-black py-2 bg-gray-100">
                        <h2 className="text-lg font-bold">{voucherTitle}</h2>
                    </div>

                    {/* Invoice Details Row */}
                    <div className="grid grid-cols-2 border-b border-black text-sm">
                        <div className="border-r border-black p-3">
                            <div className="flex justify-between">
                                <span className="font-semibold">Voucher No.:</span>
                                <span>{voucher.voucher_number}</span>
                            </div>
                        </div>
                        <div className="p-3">
                            <div className="flex justify-between">
                                <span className="font-semibold">Date:</span>
                                <span>{formatDate(voucher.voucher_date)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Party Details */}
                    <div className="border-b border-black p-3 text-sm">
                        <div className="flex gap-2">
                            <span className="font-semibold min-w-[80px]">
                                {voucher.voucher_type === 'Sales' ? 'Buyer:' :
                                    voucher.voucher_type === 'Purchase' ? 'Seller:' : 'Party:'}
                            </span>
                            <div>
                                <p className="font-bold">{voucher.party_name || 'Cash'}</p>
                                {detailData?.party_gstin && (
                                    <p className="text-xs text-gray-600">GSTIN: {detailData.party_gstin}</p>
                                )}
                                {detailData?.place_of_supply && (
                                    <p className="text-xs text-gray-600">Place of Supply: {detailData.place_of_supply}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* === ITEMS TABLE (for Sales/Purchase) === */}
                    {isSalesOrPurchase && (
                        <div className="border-b border-black">
                            {/* DEBUG INFO - Remove after fixing */}
                            {items.length > 0 && (
                                <div className="bg-yellow-100 text-xs p-2 border-b border-yellow-300">
                                    <strong>🔧 DEBUG:</strong> Source: {saleData?.sales_items ? 'sales_items table' : voucher?.inventory_entries ? 'voucher.inventory_entries' : 'unknown'} |
                                    First item: qty={items[0]?.quantity}, rate={items[0]?.rate}, hsn={items[0]?.hsn_code}, amt={items[0]?.amount}
                                </div>
                            )}
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-100 border-b border-black">
                                        <th className="border-r border-black px-2 py-2 text-center w-10">S.No</th>
                                        <th className="border-r border-black px-2 py-2 text-left">Particulars</th>
                                        <th className="border-r border-black px-2 py-2 text-center w-16">HSN</th>
                                        <th className="border-r border-black px-2 py-2 text-center w-16">Unit</th>
                                        <th className="border-r border-black px-2 py-2 text-right w-16">Qty</th>
                                        <th className="border-r border-black px-2 py-2 text-right w-20">Rate</th>
                                        <th className="border-r border-black px-2 py-2 text-right w-16">Disc%</th>
                                        <th className="px-2 py-2 text-right w-24">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white text-gray-900">
                                    {items.length === 0 && (
                                        <tr className="border-b border-gray-300 bg-white">
                                            <td colSpan="8" className="px-4 py-8 text-center text-gray-500 italic">
                                                No inventory details found. Run a full sync to fetch items.
                                            </td>
                                        </tr>
                                    )}
                                    {items.map((item, idx) => (
                                        <tr key={item.id || idx} className="border-b border-gray-300 bg-white">
                                            <td className="border-r border-black px-2 py-2 text-center text-gray-800">{idx + 1}</td>
                                            <td className="border-r border-black px-2 py-2 font-medium text-gray-900">{item.stock_item_name || 'N/A'}</td>
                                            <td className="border-r border-black px-2 py-2 text-center text-xs text-gray-700">{item.hsn_code || '-'}</td>
                                            <td className="border-r border-black px-2 py-2 text-center text-gray-700">{item.unit || '-'}</td>
                                            <td className="border-r border-black px-2 py-2 text-right text-gray-800">{item.quantity || 0}</td>
                                            <td className="border-r border-black px-2 py-2 text-right text-gray-800">{formatCurrency(item.rate)}</td>
                                            <td className="border-r border-black px-2 py-2 text-right text-gray-700">{item.discount_percent ? `${item.discount_percent}%` : '-'}</td>
                                            <td className="px-2 py-2 text-right font-medium text-gray-900">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))}
                                    {/* Empty rows for Tally look */}
                                    {items.length < 5 && [...Array(5 - items.length)].map((_, i) => (
                                        <tr key={`empty-${i}`} className="border-b border-gray-200">
                                            <td className="border-r border-black px-2 py-2">&nbsp;</td>
                                            <td className="border-r border-black px-2 py-2"></td>
                                            <td className="border-r border-black px-2 py-2"></td>
                                            <td className="border-r border-black px-2 py-2"></td>
                                            <td className="border-r border-black px-2 py-2"></td>
                                            <td className="border-r border-black px-2 py-2"></td>
                                            <td className="border-r border-black px-2 py-2"></td>
                                            <td className="px-2 py-2"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* === LEDGER ENTRIES (for Receipt/Payment/Journal) === */}
                    {!isSalesOrPurchase && voucher.ledger_entries && voucher.ledger_entries.length > 0 && (
                        <div className="border-b border-black">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-100 border-b border-black">
                                        <th className="border-r border-black px-3 py-2 text-left">Particulars</th>
                                        <th className="border-r border-black px-3 py-2 text-right w-32">Debit (₹)</th>
                                        <th className="px-3 py-2 text-right w-32">Credit (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {voucher.ledger_entries.map((entry, idx) => (
                                        <tr key={idx} className="border-b border-gray-300">
                                            <td className="border-r border-black px-3 py-2 font-medium">{entry.ledger_name}</td>
                                            <td className="border-r border-black px-3 py-2 text-right">
                                                {entry.is_debit ? formatCurrency(entry.amount) : ''}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {!entry.is_debit ? formatCurrency(entry.amount) : ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-100 border-t border-black font-bold">
                                        <td className="border-r border-black px-3 py-2">Total</td>
                                        <td className="border-r border-black px-3 py-2 text-right">
                                            {formatCurrency(voucher.ledger_entries.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0))}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {formatCurrency(voucher.ledger_entries.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* === TAX BREAKDOWN (for Sales/Purchase) === */}
                    {isSalesOrPurchase && detailData && (
                        <div className="border-b border-black">
                            <div className="grid grid-cols-2">
                                {/* Left: Amount in Words */}
                                <div className="border-r border-black p-3">
                                    <p className="text-xs font-semibold text-gray-600">Amount in Words:</p>
                                    <p className="text-sm font-medium mt-1 italic">
                                        {numberToWords(Math.round(detailData.net_amount || voucher.total_amount))}
                                    </p>
                                </div>

                                {/* Right: Summary */}
                                <div className="p-3 text-sm">
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span>Gross Amount</span>
                                            <span className="font-medium">{formatCurrency(detailData.gross_amount)}</span>
                                        </div>
                                        {detailData.discount_amount > 0 && (
                                            <div className="flex justify-between text-red-600">
                                                <span>Less: Discount</span>
                                                <span>(-) {formatCurrency(detailData.discount_amount)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span>Taxable Value</span>
                                            <span className="font-medium">{formatCurrency(detailData.taxable_amount)}</span>
                                        </div>
                                        {detailData.cgst_amount > 0 && (
                                            <div className="flex justify-between text-gray-600">
                                                <span>Add: CGST</span>
                                                <span>{formatCurrency(detailData.cgst_amount)}</span>
                                            </div>
                                        )}
                                        {detailData.sgst_amount > 0 && (
                                            <div className="flex justify-between text-gray-600">
                                                <span>Add: SGST</span>
                                                <span>{formatCurrency(detailData.sgst_amount)}</span>
                                            </div>
                                        )}
                                        {detailData.igst_amount > 0 && (
                                            <div className="flex justify-between text-gray-600">
                                                <span>Add: IGST</span>
                                                <span>{formatCurrency(detailData.igst_amount)}</span>
                                            </div>
                                        )}
                                        {detailData.round_off !== 0 && (
                                            <div className="flex justify-between text-gray-600">
                                                <span>Round Off</span>
                                                <span>{detailData.round_off > 0 ? '+' : ''}{formatCurrency(detailData.round_off)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-black pt-2 mt-2 font-bold text-base">
                                            <span>Net Amount</span>
                                            <span>₹ {formatCurrency(detailData.net_amount)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === NARRATION === */}
                    {voucher.narration && (
                        <div className="border-b border-black p-3">
                            <p className="text-xs font-semibold text-gray-600">Narration:</p>
                            <p className="text-sm mt-1">{voucher.narration}</p>
                        </div>
                    )}

                    {/* === SIGNATURE SECTION === */}
                    <div className="grid grid-cols-2 text-sm">
                        <div className="border-r border-black p-4">
                            <p className="text-xs text-gray-500 mb-8">Receiver's Signature</p>
                            <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-500">
                                (with Seal)
                            </div>
                        </div>
                        <div className="p-4 text-right">
                            <p className="font-semibold mb-8">For {selectedCompany?.name}</p>
                            <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-500">
                                Authorised Signatory
                            </div>
                        </div>
                    </div>

                    {/* === FOOTER === */}
                    <div className="border-t border-black bg-gray-50 py-2 text-center text-xs text-gray-500">
                        <p>This is a computer generated document. No signature required.</p>
                    </div>
                </div>
            </div>

            {/* Print Styles */}
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
