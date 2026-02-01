import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import html2pdf from 'html2pdf.js';

export default function InvoicePDFPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const printRef = useRef();

    const [invoice, setInvoice] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [template, setTemplate] = useState('modern'); // modern, classic, minimal

    useEffect(() => {
        if (id && selectedCompany?.id) {
            loadInvoice();
        }
    }, [id, selectedCompany]);

    const loadInvoice = async () => {
        setLoading(true);
        try {
            // Get sales invoice
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .select('*')
                .eq('voucher_id', id)
                .single();

            console.log('📄 PDF - Sale loaded:', sale, saleError);
            setInvoice(sale);

            if (sale) {
                // Get line items using sale_id (NOT voucher_id!)
                const { data: saleItems, error: itemsError } = await supabase
                    .from('sales_items')
                    .select('*')
                    .eq('sale_id', sale.id);

                console.log('📄 PDF - Items loaded:', saleItems, itemsError);

                // Get stock items to enrich HSN and unit data
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, base_unit')
                    .eq('company_id', sale.company_id);

                // Create lookup map
                const stockLookup = {};
                stockItems?.forEach(item => {
                    stockLookup[item.name] = item;
                });

                // Enrich items with HSN and unit from stock master
                const enrichedItems = (saleItems || []).map(item => ({
                    ...item,
                    hsn_code: item.hsn_code || stockLookup[item.stock_item_name]?.hsn_code || '-',
                    unit: item.unit || stockLookup[item.stock_item_name]?.base_unit || ''
                }));

                console.log('📄 PDF - Enriched items:', enrichedItems);
                setItems(enrichedItems);
            }
        } catch (error) {
            console.error('Error loading invoice:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const numberToWords = (num) => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        if (num === 0) return 'Zero Rupees Only';

        const crore = Math.floor(num / 10000000);
        const lakh = Math.floor((num % 10000000) / 100000);
        const thousand = Math.floor((num % 100000) / 1000);
        const hundred = Math.floor((num % 1000) / 100);
        const remainder = Math.floor(num % 100);
        const paise = Math.round((num % 1) * 100);

        let words = '';
        if (crore > 0) words += `${convertLessThanHundred(crore)} Crore `;
        if (lakh > 0) words += `${convertLessThanHundred(lakh)} Lakh `;
        if (thousand > 0) words += `${convertLessThanHundred(thousand)} Thousand `;
        if (hundred > 0) words += `${ones[hundred]} Hundred `;
        if (remainder > 0) words += convertLessThanHundred(remainder);

        words += ' Rupees';
        if (paise > 0) words += ` and ${convertLessThanHundred(paise)} Paise`;
        words += ' Only';

        return words.trim();

        function convertLessThanHundred(n) {
            if (n < 20) return ones[n];
            return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        }
    };

    const handlePrint = () => {
        const element = printRef.current;
        const opt = {
            margin: [10, 10, 10, 10], // top, left, bottom, right
            filename: `Invoice_${invoice?.invoice_number || 'Draft'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Add a temporary loading indicator or toast if needed
        console.log('Generating PDF...');

        html2pdf().set(opt).from(element).save().then(() => {
            console.log('PDF Generated successfully');
        }).catch(err => {
            console.error('PDF generation failed:', err);
        });
    };

    const handleWhatsAppShare = () => {
        const message = `*TAX INVOICE*
━━━━━━━━━━━━━━━━━━━

📋 *Invoice #${invoice?.invoice_number}*
📅 Date: ${formatDate(invoice?.invoice_date)}

🏢 *From:*
${selectedCompany?.name}
GSTIN: ${selectedCompany?.gstin || 'N/A'}

👤 *To:*
${invoice?.party_ledger_name}
GSTIN: ${invoice?.party_gstin || 'N/A'}

━━━━━━━━━━━━━━━━━━━
💰 *Amount Details:*

Taxable: ${formatCurrency(invoice?.taxable_amount)}
CGST: ${formatCurrency(invoice?.cgst_amount)}
SGST: ${formatCurrency(invoice?.sgst_amount)}
IGST: ${formatCurrency(invoice?.igst_amount)}
━━━━━━━━━━━━━━━━━━━
*TOTAL: ${formatCurrency(invoice?.net_amount)}*
━━━━━━━━━━━━━━━━━━━

Thank you for your business! 🙏
Generated via TallySync`;

        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!invoice) {
        return <div className="p-8 text-center text-gray-500">Invoice not found</div>;
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
                    ← Back
                </button>
                <div className="flex gap-3">
                    <select
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="px-4 py-2 border rounded-lg bg-white"
                    >
                        <option value="modern">Modern Template</option>
                        <option value="classic">Classic Template</option>
                        <option value="minimal">Minimal Template</option>
                    </select>
                    <button
                        onClick={handlePrint}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                    >
                        🖨️ Print / Download PDF
                    </button>
                    <button
                        onClick={handleWhatsAppShare}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                        📱 WhatsApp
                    </button>
                </div>
            </div>

            {/* Invoice Preview */}
            <div ref={printRef} className="bg-white shadow-2xl rounded-lg overflow-hidden border">
                <div className="invoice-container">
                    {/* Header */}
                    <div className="header bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6 text-center">
                        <h1 className="text-2xl font-bold">{selectedCompany?.name}</h1>
                        <p className="text-sm opacity-90 mt-1">{selectedCompany?.address || 'Address Line 1, City, State - PIN'}</p>
                        <p className="text-sm opacity-80">GSTIN: {selectedCompany?.gstin || 'XXXXXXXXXXXXXXXXX'} | Phone: {selectedCompany?.phone || 'XXXXXXXXXX'}</p>
                    </div>

                    {/* Tax Invoice Title */}
                    <div className="tax-invoice bg-amber-100 py-2 text-center font-bold text-lg border-b-2 border-amber-400">
                        TAX INVOICE
                    </div>

                    {/* Invoice Details & Party Info */}
                    <div className="info-section grid grid-cols-2 border-b">
                        <div className="info-box p-4 border-r">
                            <h3 className="text-xs text-gray-500 uppercase font-semibold mb-2">Invoice Details</h3>
                            <p className="flex justify-between"><span>Invoice No:</span> <span className="font-semibold">{invoice.invoice_number}</span></p>
                            <p className="flex justify-between"><span>Date:</span> <span className="font-semibold">{formatDate(invoice.invoice_date)}</span></p>
                            <p className="flex justify-between"><span>Place of Supply:</span> <span className="font-semibold">{invoice.place_of_supply || 'Same State'}</span></p>
                        </div>
                        <div className="info-box p-4">
                            <h3 className="text-xs text-gray-500 uppercase font-semibold mb-2">Bill To</h3>
                            <p className="font-semibold text-lg">{invoice.party_ledger_name}</p>
                            <p className="text-sm text-gray-600">{invoice.party_address || 'Party Address'}</p>
                            <p className="text-sm">GSTIN: <span className="font-semibold">{invoice.party_gstin || 'Unregistered'}</span></p>
                        </div>
                    </div>

                    {/* Items Table */}
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="px-3 py-2 text-left border">#</th>
                                <th className="px-3 py-2 text-left border">Description</th>
                                <th className="px-3 py-2 text-center border">HSN</th>
                                <th className="px-3 py-2 text-center border">Qty</th>
                                <th className="px-3 py-2 text-right border">Rate</th>
                                <th className="px-3 py-2 text-right border">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white text-gray-800">
                            {items.length > 0 ? items.map((item, idx) => (
                                <tr key={idx} className="bg-white">
                                    <td className="px-3 py-2 border text-gray-800">{idx + 1}</td>
                                    <td className="px-3 py-2 border font-medium text-gray-900">{item.stock_item_name || 'N/A'}</td>
                                    <td className="px-3 py-2 border text-center text-gray-700">{item.hsn_code || '-'}</td>
                                    <td className="px-3 py-2 border text-center text-gray-800">{item.quantity || 0} {item.unit || ''}</td>
                                    <td className="px-3 py-2 border text-right text-gray-800">{formatCurrency(item.rate)}</td>
                                    <td className="px-3 py-2 border text-right text-gray-900 font-semibold">{formatCurrency(item.amount)}</td>
                                </tr>
                            )) : (
                                <tr className="bg-white">
                                    <td className="px-3 py-2 border text-gray-800">1</td>
                                    <td className="px-3 py-2 border font-medium text-gray-900">As per details</td>
                                    <td className="px-3 py-2 border text-center text-gray-700">-</td>
                                    <td className="px-3 py-2 border text-center text-gray-800">1</td>
                                    <td className="px-3 py-2 border text-right text-gray-800">{formatCurrency(invoice?.taxable_amount)}</td>
                                    <td className="px-3 py-2 border text-right text-gray-900 font-semibold">{formatCurrency(invoice?.taxable_amount)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div className="grid grid-cols-2">
                        <div className="p-4 bg-amber-50 border-r">
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Amount in Words</p>
                            <p className="font-medium text-gray-800">{numberToWords(invoice.net_amount)}</p>
                        </div>
                        <div className="text-sm">
                            <div className="flex justify-between px-4 py-2 border-b">
                                <span>Taxable Amount</span>
                                <span className="font-semibold">{formatCurrency(invoice.taxable_amount)}</span>
                            </div>
                            {invoice.cgst_amount > 0 && (
                                <div className="flex justify-between px-4 py-2 border-b">
                                    <span>CGST</span>
                                    <span>{formatCurrency(invoice.cgst_amount)}</span>
                                </div>
                            )}
                            {invoice.sgst_amount > 0 && (
                                <div className="flex justify-between px-4 py-2 border-b">
                                    <span>SGST</span>
                                    <span>{formatCurrency(invoice.sgst_amount)}</span>
                                </div>
                            )}
                            {invoice.igst_amount > 0 && (
                                <div className="flex justify-between px-4 py-2 border-b">
                                    <span>IGST</span>
                                    <span>{formatCurrency(invoice.igst_amount)}</span>
                                </div>
                            )}
                            {invoice.round_off && (
                                <div className="flex justify-between px-4 py-2 border-b">
                                    <span>Round Off</span>
                                    <span>{formatCurrency(invoice.round_off)}</span>
                                </div>
                            )}
                            <div className="flex justify-between px-4 py-3 bg-slate-800 text-white font-bold">
                                <span>GRAND TOTAL</span>
                                <span className="text-lg">{formatCurrency(invoice.net_amount)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="grid grid-cols-2 p-4 border-t">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Bank Details</p>
                            <div className="text-sm bg-gray-50 p-3 rounded">
                                <p><span className="text-gray-500">Bank:</span> {selectedCompany?.bank_name || 'Bank Name'}</p>
                                <p><span className="text-gray-500">A/C No:</span> {selectedCompany?.bank_account || 'XXXXXXXXXXXX'}</p>
                                <p><span className="text-gray-500">IFSC:</span> {selectedCompany?.bank_ifsc || 'XXXXXX'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">For {selectedCompany?.name}</p>
                            <div className="h-16"></div>
                            <p className="border-t border-gray-300 pt-2 inline-block px-8">Authorized Signatory</p>
                        </div>
                    </div>

                    {/* Terms */}
                    <div className="p-4 bg-gray-50 text-xs text-gray-500 border-t">
                        <p className="font-semibold mb-1">Terms & Conditions:</p>
                        <p>1. Goods once sold will not be taken back. 2. Interest @ 18% p.a. will be charged if payment is not made within due date.</p>
                        <p className="mt-2 text-center text-gray-400">This is a computer generated invoice</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
