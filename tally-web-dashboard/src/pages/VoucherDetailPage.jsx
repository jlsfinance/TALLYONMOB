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
                let { data: sData, error: sErr } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('voucher_id', vData.voucher_id)
                    .single();

                // Synthetic fallback if sales record is missing
                if (!sData) {
                    console.log('⚠️ Sales record missing, creating synthetic record');
                    sData = {
                        id: 'synthetic',
                        net_amount: vData.total_amount,
                        gross_amount: vData.total_amount,
                        party_name: vData.party_name,
                        voucher_number: vData.voucher_number,
                        voucher_date: vData.voucher_date
                    };
                }

                // Fetch items (only if NOT synthetic)
                let itemsData = [];
                if (sData.id !== 'synthetic') {
                    const { data: iData } = await supabase
                        .from('sales_items')
                        .select('*')
                        .eq('sale_id', sData.id);
                    itemsData = iData || [];
                }

                // Fallback to inventory_entries from vouchers table
                let currentItems = itemsData.length > 0 ? itemsData : (vData.inventory_entries || []);

                // Get stock items to enrich HSN and unit data
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, base_unit')
                    .eq('company_id', vData.company_id);

                const stockLookup = {};
                stockItems?.forEach(item => stockLookup[item.name] = item);

                // Enrich items
                sData.sales_items = currentItems.map(item => {
                    let disc = item.discount_percent;
                    if ((!disc || disc === 0) && item.rate > 0 && item.quantity > 0) {
                        const idealAmount = item.rate * item.quantity;
                        if (idealAmount > item.amount + 1) { // Tolerance
                            disc = (Math.round(((idealAmount - item.amount) / idealAmount) * 100 * 100) / 100);
                        }
                    }

                    return {
                        ...item,
                        discount_percent: disc,
                        hsn_code: item.hsn_code && item.hsn_code !== 'Stock Item' && item.hsn_code !== 'Stock Group'
                            ? item.hsn_code
                            : stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                    };
                });

                // Extract Round Off from ledgers if missing
                if ((!sData.round_off || sData.round_off === 0) && vData.ledger_entries) {
                    const roundLedger = vData.ledger_entries.find(e =>
                        e.ledger_name.toLowerCase().includes('round') &&
                        (e.ledger_name.toLowerCase().includes('off') || e.ledger_name.toLowerCase().includes('ing'))
                    );
                    if (roundLedger) {
                        sData.round_off = roundLedger.is_debit ? -roundLedger.amount : roundLedger.amount;
                    }
                }

                // Extract Taxes if synthetic
                if (sData.id === 'synthetic' && vData.ledger_entries) {
                    sData.cgst_amount = vData.ledger_entries.filter(e => e.ledger_name.toLowerCase().includes('cgst')).reduce((s, e) => s + e.amount, 0);
                    sData.sgst_amount = vData.ledger_entries.filter(e => e.ledger_name.toLowerCase().includes('sgst')).reduce((s, e) => s + e.amount, 0);
                    sData.igst_amount = vData.ledger_entries.filter(e => e.ledger_name.toLowerCase().includes('igst')).reduce((s, e) => s + e.amount, 0);
                    sData.taxable_amount = sData.net_amount - sData.cgst_amount - sData.sgst_amount - sData.igst_amount - (sData.round_off || 0);
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


                    // Fallback to inventory_entries if table items are missing
                    let currentItems = itemsData || [];
                    if (currentItems.length === 0 && vData.inventory_entries) {
                        console.log('📦 Using voucher.inventory_entries as fallback for Purchase');
                        currentItems = vData.inventory_entries;
                    }

                    pData.purchase_items = currentItems;

                    // Get stock items to enrich HSN and unit data
                    const { data: stockItems } = await supabase
                        .from('stock_items')
                        .select('name, hsn_code, base_unit')
                        .eq('company_id', pData.company_id);

                    // Create lookup map
                    const stockLookup = {};
                    stockItems?.forEach(item => {
                        stockLookup[item.name] = item;
                    });

                    // Enrich terms with HSN and unit from stock master
                    if (pData.purchase_items.length > 0) {
                        pData.purchase_items = pData.purchase_items.map(item => {
                            // Calculate implied discount if missing (Rate * Qty > Amount)
                            let disc = item.discount_percent;
                            if ((!disc || disc === 0) && item.rate > 0 && item.quantity > 0) {
                                const idealAmount = item.rate * item.quantity;
                                if (idealAmount > item.amount) {
                                    const diff = idealAmount - item.amount;
                                    if (diff > 1) { // Tolerance
                                        disc = (diff / idealAmount) * 100;
                                        disc = Math.round(disc * 100) / 100;
                                    }
                                }
                            }

                            return {
                                ...item,
                                discount_percent: disc,
                                hsn_code: item.hsn_code && item.hsn_code !== 'Stock Item' && item.hsn_code !== 'Stock Group'
                                    ? item.hsn_code
                                    : stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                                unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                            };
                        });
                    }
                    // Extract Round Off from ledgers if missing
                    if ((!pData.round_off || pData.round_off === 0) && vData.ledger_entries) {
                        const rL = vData.ledger_entries.find(e => e.ledger_name.toLowerCase().includes('round') && (e.ledger_name.toLowerCase().includes('off') || e.ledger_name.toLowerCase().includes('ing')));
                        if (rL) pData.round_off = rL.is_debit ? rL.amount : -rL.amount;
                    }
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

        <div className="space-y-6 min-h-screen bg-slate-900 p-4 md:p-8">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <button
                    onClick={() => {
                        if (window.history.state && window.history.state.idx > 0) {
                            navigate(-1);
                        } else {
                            navigate('/vouchers');
                        }
                    }}
                    className="inline-flex items-center text-slate-300 hover:text-white transition-colors"
                >
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button
                        onClick={handlePrint}
                        className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-500 transition-colors inline-flex"
                    >
                        🖨️ <span className="hidden sm:inline">Print</span>
                    </button>
                    <button
                        onClick={handleWhatsApp}
                        className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-500 transition-colors inline-flex"
                    >
                        💬 <span className="hidden sm:inline">WhatsApp</span>
                    </button>
                </div>
            </div>

            {/* Voucher Card */}
            <div ref={printRef} className="bg-white rounded-xl shadow-2xl overflow-hidden max-w-4xl mx-auto print:shadow-none print:rounded-none">

                {/* Header Section */}
                <div className="bg-slate-50 border-b border-slate-200 p-6 md:p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">{voucherTitle}</h1>
                            <p className="text-slate-500 mt-1">{selectedCompany?.name}</p>
                            {selectedCompany?.address && (
                                <p className="text-sm text-slate-400 mt-0.5 max-w-md">{selectedCompany.address}</p>
                            )}
                            {selectedCompany?.gstin && (
                                <p className="text-sm text-slate-500 font-mono mt-1">GSTIN: {selectedCompany.gstin}</p>
                            )}
                        </div>
                        <div className="text-left md:text-right">
                            <p className="text-sm text-slate-500 uppercase font-medium tracking-wider">Voucher No.</p>
                            <p className="text-xl md:text-2xl font-bold text-indigo-600">{voucher.voucher_number}</p>
                            <div className="mt-2 flex items-center md:justify-end gap-2 text-sm text-slate-600">
                                <span>Date:</span>
                                <span className="font-medium">{formatDate(voucher.voucher_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Party / Details Section */}
                <div className="p-6 md:p-8 grid md:grid-cols-2 gap-6 md:gap-12 border-b border-slate-100">
                    {/* Party Details */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                            {voucher.voucher_type === 'Sales' ? 'Buyer' :
                                voucher.voucher_type === 'Purchase' ? 'Seller' : 'Party Details'}
                        </h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <p className="text-lg font-semibold text-slate-800 break-words">{voucher.party_name || 'Cash'}</p>
                            {detailData?.party_gstin && (
                                <p className="text-sm text-slate-600 mt-1 font-mono">GSTIN: {detailData.party_gstin}</p>
                            )}
                            {detailData?.place_of_supply && (
                                <p className="text-sm text-slate-500 mt-1">Place of Supply: {detailData.place_of_supply}</p>
                            )}
                        </div>
                    </div>

                    {/* Amount Summary */}
                    <div className="flex flex-col justify-end">
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-right">
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Total Amount</p>
                            <p className="text-3xl md:text-4xl font-bold text-indigo-600">
                                {formatCurrency(detailData?.net_amount || voucher.total_amount)}
                            </p>
                            <p className="text-xs text-indigo-400 mt-1 italic">
                                {numberToWords(Math.round(detailData?.net_amount || voucher.total_amount))}
                            </p>
                        </div>
                    </div>
                </div>

                {/* === ITEMS TABLE (for Sales/Purchase) === */}
                {isSalesOrPurchase && (
                    <div className="border-t border-slate-100">
                        {items.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[600px]">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">#</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Format</th>
                                            <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">HSN</th>
                                            <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Qty</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Rate</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Disc</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {items.map((item, idx) => (
                                            <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-sm text-slate-400">{idx + 1}</td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-medium text-slate-900">{item.stock_item_name || item.name || 'Unknown Item'}</p>
                                                </td>
                                                <td className="px-6 py-4 text-center text-sm text-slate-500 font-mono">{item.hsn_code || '-'}</td>
                                                <td className="px-6 py-4 text-center text-sm text-slate-700">
                                                    <span className="font-semibold">{item.quantity}</span>
                                                    <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-sm text-slate-700 font-mono">{formatCurrency(item.rate)}</td>
                                                <td className="px-6 py-4 text-right text-sm text-slate-500">{item.discount_percent ? `${item.discount_percent}%` : '-'}</td>
                                                <td className="px-6 py-4 text-right text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-8 text-center text-slate-500 italic bg-slate-50">
                                No inventory details found.
                            </div>
                        )}
                    </div>
                )}

                {/* === LEDGER ENTRIES (for Receipt/Payment/Journal) === */}
                {!isSalesOrPurchase && voucher.ledger_entries && voucher.ledger_entries.length > 0 && (
                    <div className="border-t border-slate-100">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[500px]">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Particulars</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Debit</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Credit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {voucher.ledger_entries.map((entry, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-slate-800">{entry.ledger_name}</td>
                                            <td className="px-6 py-4 text-right text-sm font-mono text-slate-700">
                                                {entry.is_debit ? formatCurrency(entry.amount) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-mono text-slate-700">
                                                {!entry.is_debit ? formatCurrency(entry.amount) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t border-slate-200">
                                    <tr>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Total</td>
                                        <td className="px-6 py-4 text-right font-bold text-slate-900">
                                            {formatCurrency(voucher.ledger_entries.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0))}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-slate-900">
                                            {formatCurrency(voucher.ledger_entries.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {/* === SUMMARY & FOOTER === */}
                <div className="bg-slate-50 border-t border-slate-200 p-6 md:p-8">
                    {/* Tax Breakdown for Sales/Purchase */}
                    {isSalesOrPurchase && detailData && (
                        <div className="flex flex-col md:flex-row justify-end mb-8">
                            <div className="w-full md:w-80 space-y-3">
                                <div className="flex justify-between text-sm text-slate-500">
                                    <span>Gross Amount</span>
                                    <span className="font-medium text-slate-700">{formatCurrency(detailData.gross_amount)}</span>
                                </div>
                                {detailData.discount_amount > 0 && (
                                    <div className="flex justify-between text-sm text-red-500">
                                        <span>Discount</span>
                                        <span>- {formatCurrency(detailData.discount_amount)}</span>
                                    </div>
                                )}

                                <div className="space-y-1 pt-2 border-t border-slate-200">
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>Taxable Value</span>
                                        <span className="font-medium text-slate-700">{formatCurrency(detailData.taxable_amount)}</span>
                                    </div>
                                    {detailData.cgst_amount > 0 && (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>CGST</span>
                                            <span>{formatCurrency(detailData.cgst_amount)}</span>
                                        </div>
                                    )}
                                    {detailData.sgst_amount > 0 && (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>SGST</span>
                                            <span>{formatCurrency(detailData.sgst_amount)}</span>
                                        </div>
                                    )}
                                    {detailData.igst_amount > 0 && (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>IGST</span>
                                            <span>{formatCurrency(detailData.igst_amount)}</span>
                                        </div>
                                    )}
                                </div>

                                {detailData.round_off !== 0 && (
                                    <div className="flex justify-between text-sm text-slate-500 pt-2 border-t border-slate-200">
                                        <span>Round Off</span>
                                        <span>{detailData.round_off > 0 ? '+' : ''}{formatCurrency(detailData.round_off)}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-4 border-t border-slate-300">
                                    <span className="font-bold text-slate-800">Net Amount</span>
                                    <span className="text-2xl font-bold text-indigo-600">{formatCurrency(detailData.net_amount)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Narration */}
                    {voucher.narration && (
                        <div className="bg-slate-100 p-4 text-xs text-slate-500 rounded-lg border border-slate-200">
                            <span className="font-bold uppercase mr-2 text-slate-700">Narration:</span>
                            {voucher.narration}
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <div className="bg-white border-t border-slate-100 p-6 text-center text-xs text-slate-400">
                    <p>This is a computer generated document. No signature required.</p>
                </div>
            </div>

            <style>{`
                 @media print {
                     @page { margin: 10mm; }
                     body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                 }
             `}</style>
        </div>
    );
}
