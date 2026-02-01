import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, salesApi } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function InvoiceDetailPage() {
    const { id } = useParams();
    const { selectedCompany } = useAuth();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef();

    useEffect(() => {
        if (id) {
            loadInvoice();
        }
    }, [id]);

    const loadInvoice = async () => {
        try {
            // The ID from URL is in format: COMPANYNAME*SALES*VOUCHERNUMBER_DATE
            // We need to find the sale by matching this pattern

            // First try: Search by voucher_id (the URL id IS the voucher_id)
            const { data: salesData, error } = await supabase
                .from('sales')
                .select('*')
                .eq('voucher_id', id)
                .single();

            if (salesData) {
                // Fetch sales_items separately  
                const { data: itemsData } = await supabase
                    .from('sales_items')
                    .select('*')
                    .eq('sale_id', salesData.id);

                let enrichedItems = [];

                // Get stock items to enrich HSN and unit data
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, base_unit')
                    .eq('company_id', salesData.company_id);

                // Create lookup map
                const stockLookup = {};
                stockItems?.forEach(item => {
                    stockLookup[item.name] = item;
                });

                if (itemsData && itemsData.length > 0) {
                    // Enrich items with HSN and unit from stock master
                    enrichedItems = itemsData.map(item => ({
                        ...item,
                        hsn_code: item.hsn_code || stockLookup[item.stock_item_name]?.hsn_code || '-',
                        unit: item.unit || stockLookup[item.stock_item_name]?.base_unit || ''
                    }));
                } else {
                    // FALLBACK: If itemsData is empty, try fetching from vouchers table
                    console.log('⚠️ Sales items missing, checking vouchers table...');
                    const { data: voucherData } = await supabase
                        .from('vouchers')
                        .select('inventory_entries')
                        .eq('voucher_id', salesData.voucher_id)
                        .single();

                    if (voucherData?.inventory_entries && voucherData.inventory_entries.length > 0) {
                        console.log('📦 Using voucher.inventory_entries as fallback:', voucherData.inventory_entries);
                        enrichedItems = voucherData.inventory_entries.map(item => ({
                            ...item,
                            stock_item_name: item.stock_item_name || item.name || 'Unknown Item',
                            hsn_code: item.hsn_code || stockLookup[item.stock_item_name || item.name]?.hsn_code || '-',
                            unit: item.unit || stockLookup[item.stock_item_name || item.name]?.base_unit || ''
                        }));
                    }
                }

                salesData.sales_items = enrichedItems;
                setInvoice(salesData);
            } else {
                // Fallback: try the old way (by id)
                const { data } = await salesApi.getById(id);
                setInvoice(data);
            }
        } catch (err) {
            console.error('Error loading invoice:', err);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        const text = `Invoice: ${invoice.invoice_number}\nParty: ${invoice.party_ledger_name}\nAmount: ${formatCurrency(invoice.net_amount)}\nDate: ${formatDate(invoice.invoice_date)}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Invoice ${invoice.invoice_number}`,
                    text: text
                });
            } catch (err) {
                console.log('Share cancelled');
            }
        } else {
            navigator.clipboard.writeText(text);
            alert('Invoice details copied to clipboard!');
        }
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `*Invoice: ${invoice.invoice_number}*\n` +
            `Party: ${invoice.party_ledger_name}\n` +
            `Amount: ${formatCurrency(invoice.net_amount)}\n` +
            `Date: ${formatDate(invoice.invoice_date)}\n\n` +
            `Thank you for your business!`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    if (loading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="h-8 bg-gray-200 rounded w-48"></div>
                <div className="bg-white rounded-xl p-6 shadow">
                    <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return <div className="p-8 text-center text-gray-500">Invoice not found</div>;
    }

    return (
        <div className="space-y-6 min-h-screen bg-slate-900 p-4 md:p-8">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <Link to="/sales" className="inline-flex items-center text-slate-300 hover:text-white transition-colors">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Sales
                </Link>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <Link
                        to={`/invoice/${invoice.voucher_id || id}`}
                        className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-500 transition-colors inline-flex"
                    >
                        📄 <span className="hidden sm:inline">PDF</span>
                    </Link>
                    <button
                        onClick={handlePrint}
                        className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-500 transition-colors inline-flex"
                    >
                        🖨️ <span className="hidden sm:inline">Print</span>
                    </button>
                    <button
                        onClick={handleShare}
                        className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg shadow hover:bg-slate-600 transition-colors inline-flex"
                    >
                        📤 <span className="hidden sm:inline">Share</span>
                    </button>
                    <button
                        onClick={handleWhatsApp}
                        className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-500 transition-colors inline-flex"
                    >
                        💬 <span className="hidden sm:inline">WhatsApp</span>
                    </button>
                </div>
            </div>

            {/* Invoice Container */}
            <div ref={printRef} className="bg-white rounded-xl shadow-2xl overflow-hidden max-w-4xl mx-auto print:shadow-none print:rounded-none">

                {/* Invoice Header */}
                <div className="bg-slate-50 border-b border-slate-200 p-6 md:p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">TAX INVOICE</h1>
                            <p className="text-slate-500 mt-1">{selectedCompany?.name || 'Company Name'}</p>
                            {selectedCompany?.address && (
                                <p className="text-sm text-slate-400 mt-0.5 max-w-md">{selectedCompany.address}</p>
                            )}
                        </div>
                        <div className="text-left md:text-right">
                            <p className="text-sm text-slate-500 uppercase font-medium tracking-wider">Invoice No.</p>
                            <p className="text-xl md:text-2xl font-bold text-indigo-600">{invoice.invoice_number || '-'}</p>
                            <div className="mt-2 flex items-center md:justify-end gap-2 text-sm text-slate-600">
                                <span>Date:</span>
                                <span className="font-medium">{formatDate(invoice.invoice_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Party Section */}
                <div className="p-6 md:p-8 grid md:grid-cols-2 gap-6 md:gap-12">
                    {/* Bill To */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bill To</h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <p className="text-lg font-semibold text-slate-800 break-words">{invoice.party_ledger_name}</p>
                            {invoice.party_gstin && (
                                <p className="text-sm text-slate-600 mt-1 font-mono">GSTIN: {invoice.party_gstin}</p>
                            )}
                            {invoice.place_of_supply && (
                                <p className="text-sm text-slate-500 mt-1">Place of Supply: {invoice.place_of_supply}</p>
                            )}
                        </div>
                    </div>

                    {/* Amount Highlight */}
                    <div className="flex flex-col justify-end">
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-right">
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Invoice Amount</p>
                            <p className="text-3xl md:text-4xl font-bold text-indigo-600">{formatCurrency(invoice.net_amount)}</p>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="border-t border-slate-100">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px]">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">#</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Details</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">HSN</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Qty</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Rate</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(invoice.sales_items && invoice.sales_items.length > 0) ? (
                                    invoice.sales_items.map((item, idx) => (
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
                                            <td className="px-6 py-4 text-right text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-slate-400 italic bg-slate-50">
                                            No items found in this invoice.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer / Summary */}
                <div className="bg-slate-50 border-t border-slate-200 p-6 md:p-8">
                    <div className="flex flex-col md:flex-row justify-end">
                        <div className="w-full md:w-80 space-y-3">
                            {/* Summary Rows */}
                            <div className="flex justify-between text-sm text-slate-500">
                                <span>Gross Amount</span>
                                <span className="font-medium text-slate-700">{formatCurrency(invoice.gross_amount)}</span>
                            </div>

                            {invoice.discount_amount > 0 && (
                                <div className="flex justify-between text-sm text-red-500">
                                    <span>Discount</span>
                                    <span>- {formatCurrency(invoice.discount_amount)}</span>
                                </div>
                            )}

                            {/* Tax Rows */}
                            <div className="space-y-1 pt-2 border-t border-slate-200">
                                <div className="flex justify-between text-sm text-slate-500">
                                    <span>Taxable Value</span>
                                    <span className="font-medium text-slate-700">{formatCurrency(invoice.taxable_amount)}</span>
                                </div>
                                {invoice.cgst_amount > 0 && (
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>CGST</span>
                                        <span>{formatCurrency(invoice.cgst_amount)}</span>
                                    </div>
                                )}
                                {invoice.sgst_amount > 0 && (
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>SGST</span>
                                        <span>{formatCurrency(invoice.sgst_amount)}</span>
                                    </div>
                                )}
                                {invoice.igst_amount > 0 && (
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>IGST</span>
                                        <span>{formatCurrency(invoice.igst_amount)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Round Off */}
                            {invoice.round_off !== 0 && (
                                <div className="flex justify-between text-sm text-slate-500 pt-2 border-t border-slate-200">
                                    <span>Round Off</span>
                                    <span>{invoice.round_off > 0 ? '+' : ''}{formatCurrency(invoice.round_off)}</span>
                                </div>
                            )}

                            {/* Grand Total */}
                            <div className="flex justify-between items-center pt-4 border-t border-slate-300">
                                <span className="font-bold text-slate-800">Net Amount</span>
                                <span className="text-2xl font-bold text-indigo-600">{formatCurrency(invoice.net_amount)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Narration Footer */}
                {invoice.narration && (
                    <div className="bg-slate-100 p-4 text-xs text-slate-500 border-t border-slate-200">
                        <span className="font-bold uppercase mr-2">Remarks:</span>
                        {invoice.narration}
                    </div>
                )}
            </div>

            <div className="text-center text-slate-500 text-sm pb-8 print:hidden">
                LiveKeeping &bull; {selectedCompany?.name}
            </div>
        </div>
    );
}
