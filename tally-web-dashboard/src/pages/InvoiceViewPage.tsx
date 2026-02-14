import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Share2, Download, Printer, Phone, Mail, MapPin, Building2, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import html2pdf from 'html2pdf.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

interface InvoiceItem {
    id: string;
    stock_item_name: string;
    alias?: string;
    quantity: number;
    rate: number;
    amount: number;
    unit: string;
    hsn_code?: string;
    discount_percent?: number;
    tax_rate?: number;
}

interface InvoiceData {
    id: string;
    voucher_number: string;
    voucher_type: string;
    voucher_date: string;
    party_name: string;
    total_amount: number;
    grand_total: number;
    narration?: string;
    company: {
        name: string;
        address?: string;
        phone?: string;
        email?: string;
        gstin?: string;
    };
    party?: {
        name: string;
        address?: string;
        phone?: string;
        email?: string;
        gstin?: string;
    };
    items: InvoiceItem[];
}

export default function InvoiceViewPage() {
    const { id } = useParams<{ id: string }>();
    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchInvoice = async () => {
            if (!id) return;
            try {
                const res = await fetch(`${API_URL}/portal/invoice/${id}`);
                const json = await res.json();
                if (json.success) {
                    setInvoice(json.data);
                } else {
                    setError(json.error || 'Failed to load invoice');
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load invoice');
            } finally {
                setLoading(false);
            }
        };
        fetchInvoice();
    }, [id]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

    const handleShareWhatsApp = () => {
        if (!invoice) return;

        // Construct the message with Item Aliases as requested
        let text = `*INVOICE: ${invoice.voucher_number}*\n`;
        text += `Date: ${new Date(invoice.voucher_date).toLocaleDateString('en-IN')}\n`;
        text += `To: ${invoice.party_name}\n`;
        text += `From: ${invoice.company?.name}\n\n`;
        text += `*Items:*\n`;

        invoice.items.forEach((item, index) => {
            const aliasPart = item.alias ? ` (${item.alias})` : '';
            text += `${index + 1}. ${item.stock_item_name}${aliasPart}\n`;
            text += `   ${item.quantity} ${item.unit} x ${item.rate} = ${formatCurrency(item.amount)}\n`;
        });

        text += `\n*Grand Total: ${formatCurrency(invoice.grand_total)}*\n\n`;
        text += `View Full Invoice: ${window.location.href}`;

        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleDownloadPDF = () => {
        const element = document.getElementById('invoice-content');
        if (element) {
            html2pdf().from(element).save(`Invoice_${invoice?.voucher_number}.pdf`);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (error || !invoice) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;

    const isPurchase = ['Purchase', 'Debit Note'].includes(invoice?.voucher_type || '');

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                {/* Actions Header */}
                <div className="flex justify-between items-center mb-6 no-print">
                    <h1 className="text-2xl font-bold text-gray-800">Invoice View</h1>
                    <div className="flex gap-3">
                        <button
                            onClick={handleShareWhatsApp}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium shadow-sm"
                        >
                            <Share2 size={18} /> Share on WhatsApp
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                        >
                            <Download size={18} /> Download PDF
                        </button>
                    </div>
                </div>

                {/* Invoice Content */}
                <div id="invoice-content" className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 p-8">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8 border-b pb-8">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold mb-1 tracking-wider">
                                {isPurchase ? 'Bill To (Buyer)' : 'Bill From (Seller)'}
                            </p>
                            <h2 className="text-3xl font-bold text-gray-900 mb-2">{invoice.company?.name}</h2>
                            <div className="text-sm text-gray-600 space-y-1">
                                {invoice.company?.address && <p className="flex items-center gap-2"><MapPin size={14} /> {invoice.company.address}</p>}
                                {invoice.company?.phone && <p className="flex items-center gap-2"><Phone size={14} /> {invoice.company.phone}</p>}
                                {invoice.company?.email && <p className="flex items-center gap-2"><Mail size={14} /> {invoice.company.email}</p>}
                                {invoice.company?.gstin && <p className="font-semibold mt-2">GSTIN: {invoice.company.gstin}</p>}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="bg-gray-50 px-6 py-4 rounded-lg">
                                <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">Invoice Amount</p>
                                <p className="text-3xl font-bold text-blue-600">{formatCurrency(invoice.grand_total)}</p>
                            </div>
                            <div className="mt-4 text-sm">
                                <p><span className="text-black font-bold">Invoice No:</span> <span className="font-bold text-black">{invoice.voucher_number}</span></p>
                                <p><span className="text-black font-bold">Date:</span> <span className="font-bold text-black">{new Date(invoice.voucher_date).toLocaleDateString('en-IN')}</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Bill To */}
                    <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                            {isPurchase ? 'Bill From (Supplier)' : 'Bill To (Buyer)'}
                        </h3>
                        <p className="text-xl font-bold text-gray-900">{invoice.party?.name || invoice.party_name}</p>
                        {invoice.party?.address && <p className="text-gray-600 mt-1 text-sm whitespace-pre-line">{invoice.party.address}</p>}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                            {invoice.party?.gstin && <p className="font-semibold text-gray-800">GSTIN: {invoice.party.gstin}</p>}
                            {invoice.party?.phone && <p className="flex items-center gap-1"><Phone size={14} /> {invoice.party.phone}</p>}
                            {invoice.party?.email && <p className="flex items-center gap-1"><Mail size={14} /> {invoice.party.email}</p>}
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-x-auto mb-8">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-100 text-sm uppercase text-black font-bold tracking-wide">
                                    <th className="py-3 px-4 w-12">#</th>
                                    <th className="py-3 px-4">Item Description</th>
                                    <th className="py-3 px-4 text-center">HSN</th>
                                    <th className="py-3 px-4 text-right">Qty</th>
                                    <th className="py-3 px-4 text-right">Rate</th>
                                    <th className="py-3 px-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.items.map((item, index) => (
                                    <tr key={item.id || index} className="border-b border-gray-50 hover:bg-gray-50/50">
                                        <td className="py-4 px-4 text-gray-500">{index + 1}</td>
                                        <td className="py-4 px-4">
                                            <p className="font-semibold text-gray-900">{item.stock_item_name}</p>
                                            {/* ALIAS INTEGRATION HERE */}
                                            {item.alias && (
                                                <p className="text-sm text-blue-600 mt-0.5">({item.alias})</p>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-center text-gray-500 text-sm">{item.hsn_code || '-'}</td>
                                        <td className="py-4 px-4 text-right font-bold text-black">
                                            {item.quantity} <span className="text-black text-xs">{item.unit}</span>
                                        </td>
                                        <td className="py-4 px-4 text-right font-bold text-black">{formatCurrency(item.rate)}</td>
                                        <td className="py-4 px-4 text-right font-bold text-black">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={5} className="py-4 px-4 text-right font-bold text-gray-600">Total</td>
                                    <td className="py-4 px-4 text-right font-bold text-xl text-gray-900">{formatCurrency(invoice.total_amount)}</td>
                                </tr>
                                {/* Additional logic for tax/discount if needed, showing grand total now */}
                            </tfoot>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end border-t border-gray-100 pt-6">
                        <div className="w-64">
                            <div className="flex justify-between py-2 text-gray-600">
                                <span>Sub Total</span>
                                <span>{formatCurrency(invoice.total_amount)}</span>
                            </div>
                            {/* Tax omitted for brevity, logic can be added if tax breakdown available */}
                            <div className="flex justify-between py-3 border-t border-gray-200 mt-2 text-lg font-bold text-gray-900">
                                <span>Grand Total</span>
                                <span>{formatCurrency(invoice.grand_total)}</span>
                            </div>
                        </div>
                    </div>

                    {invoice.narration && (
                        <div className="mt-8 pt-6 border-t border-gray-100 text-sm text-gray-500">
                            <span className="font-semibold">Note:</span> {invoice.narration}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
