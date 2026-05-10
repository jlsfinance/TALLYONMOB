import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { salesApi } from '../lib/supabase';
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
        const { data } = await salesApi.getById(id);
        setInvoice(data);
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
        <div className="space-y-4 sm:space-y-6">
            {/* Back Button */}
            <Link to="/sales" className="inline-flex items-center text-blue-600 hover:text-blue-800 active:text-blue-900 py-1 print:hidden">
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Sales
            </Link>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 print:hidden">
                <button onClick={handlePrint} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 active:bg-blue-800 text-sm">
                    🖨️ Print
                </button>
                <button onClick={handleShare} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100 text-sm">
                    📤 Share
                </button>
                <button onClick={handleWhatsApp} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 active:bg-green-700 text-sm">
                    💬 WhatsApp
                </button>
            </div>

            {/* Invoice */}
            <div ref={printRef} className="bg-white rounded-xl shadow-lg p-4 sm:p-8 print:shadow-none print:rounded-none">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start border-b pb-4 sm:pb-6 mb-4 sm:mb-6 gap-3">
                    <div>
                        <h1 className="text-xl sm:text-3xl font-bold text-gray-800">TAX INVOICE</h1>
                        <p className="text-gray-500 mt-1 text-sm sm:text-base">{selectedCompany?.name}</p>
                        {selectedCompany?.address && (
                            <p className="text-sm text-gray-500">{selectedCompany.address}</p>
                        )}
                    </div>
                    <div className="sm:text-right">
                        <p className="text-sm text-gray-500">Invoice No.</p>
                        <p className="text-xl sm:text-2xl font-bold text-blue-600">{invoice.invoice_number || '-'}</p>
                        <p className="text-sm text-gray-500 mt-1 sm:mt-2">Date: {formatDate(invoice.invoice_date)}</p>
                    </div>
                </div>

                {/* Party Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                        <p className="text-sm text-gray-500 mb-1 sm:mb-2">Bill To:</p>
                        <p className="text-base sm:text-lg font-semibold text-gray-800">{invoice.party_ledger_name}</p>
                        {invoice.party_gstin && (
                            <p className="text-sm text-gray-600 mt-1">GSTIN: {invoice.party_gstin}</p>
                        )}
                        {invoice.place_of_supply && (
                            <p className="text-sm text-gray-600">Place of Supply: {invoice.place_of_supply}</p>
                        )}
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 sm:p-4">
                        <p className="text-sm text-blue-600 mb-1 sm:mb-2">Invoice Amount</p>
                        <p className="text-2xl sm:text-3xl font-bold text-blue-700">{formatCurrency(invoice.net_amount)}</p>
                    </div>
                </div>

                {/* Items Table */}
                {invoice.sales_items && invoice.sales_items.length > 0 && (
                    <div className="mb-6 sm:mb-8">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">Items</h3>
                        {/* Mobile card view */}
                        <div className="sm:hidden space-y-2">
                            {invoice.sales_items.map((item, idx) => (
                                <div key={item.id || idx} className="bg-gray-50 rounded-lg p-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-800 text-sm">{idx + 1}. {item.stock_item_name}</p>
                                            {item.hsn_code && <p className="text-xs text-gray-500">HSN: {item.hsn_code}</p>}
                                        </div>
                                        <p className="font-semibold text-sm ml-2">{formatCurrency(item.amount)}</p>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{item.quantity} {item.unit} × {formatCurrency(item.rate)}</p>
                                </div>
                            ))}
                        </div>
                        {/* Desktop table */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">HSN</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {invoice.sales_items.map((item, idx) => (
                                        <tr key={item.id || idx}>
                                            <td className="px-4 py-3 text-sm">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-800">{item.stock_item_name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-600">{item.hsn_code || '-'}</td>
                                            <td className="px-4 py-3 text-right text-sm">
                                                {item.quantity} {item.unit}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm">{formatCurrency(item.rate)}</td>
                                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Summary */}
                <div className="flex justify-end">
                    <div className="w-full md:w-80">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Gross Amount</span>
                                <span className="font-medium">{formatCurrency(invoice.gross_amount)}</span>
                            </div>
                            {invoice.discount_amount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Discount</span>
                                    <span className="font-medium text-red-600">-{formatCurrency(invoice.discount_amount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Taxable Amount</span>
                                <span className="font-medium">{formatCurrency(invoice.taxable_amount)}</span>
                            </div>
                            {invoice.cgst_amount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">CGST</span>
                                    <span className="font-medium">{formatCurrency(invoice.cgst_amount)}</span>
                                </div>
                            )}
                            {invoice.sgst_amount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">SGST</span>
                                    <span className="font-medium">{formatCurrency(invoice.sgst_amount)}</span>
                                </div>
                            )}
                            {invoice.igst_amount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">IGST</span>
                                    <span className="font-medium">{formatCurrency(invoice.igst_amount)}</span>
                                </div>
                            )}
                            {invoice.round_off !== 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Round Off</span>
                                    <span className="font-medium">{formatCurrency(invoice.round_off)}</span>
                                </div>
                            )}
                            <div className="border-t pt-2 mt-2">
                                <div className="flex justify-between text-lg">
                                    <span className="font-semibold text-gray-800">Net Amount</span>
                                    <span className="font-bold text-blue-600">{formatCurrency(invoice.net_amount)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Narration */}
                {invoice.narration && (
                    <div className="mt-8 pt-6 border-t">
                        <p className="text-sm text-gray-500 mb-1">Remarks:</p>
                        <p className="text-gray-700">{invoice.narration}</p>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-8 pt-6 border-t text-center text-sm text-gray-500">
                    <p>Thank you for your business!</p>
                    <p className="mt-1">Generated by LiveKeeping</p>
                </div>
            </div>
        </div>
    );
}
