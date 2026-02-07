import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import html2pdf from 'html2pdf.js';
import '../styles/Material3.css';

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
            // Get voucher data instead of sales
            let { data: voucherData, error: voucherError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', id)
                .single();

            if (!voucherData) {
                // Try by voucher_id field
                const { data: fallback } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('voucher_id', id)
                    .single();
                voucherData = fallback;
            }

            console.log('📄 PDF - Voucher loaded:', voucherData, voucherError);

            if (voucherData) {
                // Map voucher to invoice format
                const sale = {
                    ...voucherData,
                    invoice_number: voucherData.voucher_number,
                    invoice_date: voucherData.voucher_date,
                    party_ledger_name: voucherData.party_name,
                    party_gstin: voucherData.party_gstin || '',
                    party_address: voucherData.party_address || '',
                    place_of_supply: voucherData.place_of_supply || 'Same State',
                    net_amount: Math.abs(Number(voucherData.grand_total) || Number(voucherData.total_amount) || 0),
                    taxable_amount: Math.abs(Number(voucherData.taxable_value) || Number(voucherData.total_amount) || 0),
                    cgst_amount: Number(voucherData.cgst_amount) || 0,
                    sgst_amount: Number(voucherData.sgst_amount) || 0,
                    igst_amount: Number(voucherData.igst_amount) || 0,
                    round_off: Number(voucherData.round_off) || 0
                };
                setInvoice(sale);

                // Get stock entries for line items
                const { data: stockEntries, error: itemsError } = await supabase
                    .from('voucher_stock_entries')
                    .select('*')
                    .eq('voucher_id', voucherData.id);

                console.log('📄 PDF - Stock entries loaded:', stockEntries, itemsError);

                // Get stock items to enrich HSN and unit data
                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, unit')
                    .eq('company_id', voucherData.company_id);

                // Create lookup map
                const stockLookup = {};
                stockItems?.forEach(item => {
                    stockLookup[item.name] = item;
                });

                // Enrich items with HSN and unit from stock master
                const enrichedItems = (stockEntries || []).map(item => ({
                    ...item,
                    stock_item_name: item.item_name || item.stock_item_name || 'Unknown',
                    hsn_code: item.hsn_code || stockLookup[item.item_name]?.hsn_code || '-',
                    unit: item.unit || stockLookup[item.item_name]?.unit || '',
                    quantity: item.quantity || item.billed_qty || 0,
                    rate: item.rate || item.unit_price || 0,
                    amount: item.amount || ((item.quantity || 0) * (item.rate || 0)) || 0
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
        return <div className="page-m3 flex justify-center items-center"><p>Please select a company first</p></div>;
    }

    if (loading) {
        return (
            <div className="page-m3">
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return <div className="page-m3 flex justify-center items-center"><p>Invoice not found</p></div>;
    }

    return (
        <div className="page-m3">
            {/* Controls */}
            <div className="page-m3__action-bar" style={{ marginBottom: '24px' }}>
                <button
                    onClick={() => navigate(-1)}
                    className="page-m3__back-link"
                >
                    <span>←</span> Back
                </button>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="page-m3__select"
                        style={{ width: 'auto' }}
                    >
                        <option value="modern">Modern Template</option>
                        <option value="classic">Classic Template</option>
                        <option value="minimal">Minimal Template</option>
                    </select>
                    <button
                        onClick={handlePrint}
                        className="page-m3__button page-m3__button--primary"
                    >
                        🖨️ Download PDF
                    </button>
                    <button
                        onClick={handleWhatsAppShare}
                        className="page-m3__button page-m3__button--secondary"
                    >
                        📱 WhatsApp
                    </button>
                </div>
            </div>

            {/* Invoice Preview */}
            <div ref={printRef} className="bg-white shadow-2xl rounded-lg overflow-hidden border">
                {template === 'modern' && <ModernTemplate invoice={invoice} items={items} selectedCompany={selectedCompany} formatCurrency={formatCurrency} formatDate={formatDate} numberToWords={numberToWords} />}
                {template === 'classic' && <ClassicTemplate invoice={invoice} items={items} selectedCompany={selectedCompany} formatCurrency={formatCurrency} formatDate={formatDate} numberToWords={numberToWords} />}
                {template === 'minimal' && <MinimalTemplate invoice={invoice} items={items} selectedCompany={selectedCompany} formatCurrency={formatCurrency} formatDate={formatDate} numberToWords={numberToWords} />}
            </div>
        </div>
    );
}

const ModernTemplate = ({ invoice, items, selectedCompany, formatCurrency, formatDate, numberToWords }) => (
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
);

const ClassicTemplate = ({ invoice, items, selectedCompany, formatCurrency, formatDate, numberToWords }) => (
    <div className="p-8 font-serif text-black bg-white min-h-[1000px]">
        <div className="border-2 border-black p-4 h-full">
            <div className="text-center border-b-2 border-black pb-4 mb-4">
                <h1 className="text-3xl font-black uppercase tracking-widest">{selectedCompany?.name}</h1>
                <p className="text-sm">{selectedCompany?.address || 'Your Business Address Line'}</p>
                <p className="text-sm font-bold">GSTIN: {selectedCompany?.gstin || 'GST NUMBER'}</p>
            </div>

            <div className="text-center font-bold text-xl border-b-2 border-black py-2 mb-4">
                TAX INVOICE
            </div>

            <div className="grid grid-cols-2 gap-0 border-b-2 border-black mb-4 min-h-[150px]">
                <div className="border-r-2 border-black p-2">
                    <p className="text-xs font-bold uppercase underline mb-2">Invoice Details</p>
                    <table className="w-full text-sm">
                        <tr><td className="w-1/2">Invoice No:</td><td className="font-bold">{invoice.invoice_number}</td></tr>
                        <tr><td>Date:</td><td className="font-bold">{formatDate(invoice.invoice_date)}</td></tr>
                        <tr><td>Place:</td><td>{invoice.place_of_supply || 'Local'}</td></tr>
                    </table>
                </div>
                <div className="p-2">
                    <p className="text-xs font-bold uppercase underline mb-2">Billing Information</p>
                    <p className="font-bold text-lg leading-tight">{invoice.party_ledger_name}</p>
                    <p className="text-sm">{invoice.party_address || 'Customer Address'}</p>
                    <p className="text-sm font-bold mt-2">GSTIN: {invoice.party_gstin || 'URD'}</p>
                </div>
            </div>

            <table className="w-full border-collapse mb-4 min-h-[400px]">
                <thead>
                    <tr className="border-b-2 border-black">
                        <th className="border-r-2 border-black px-2 py-1 text-left w-12">Sr.</th>
                        <th className="border-r-2 border-black px-2 py-1 text-left">Description of Goods</th>
                        <th className="border-r-2 border-black px-2 py-1 text-center w-24">HSN</th>
                        <th className="border-r-2 border-black px-2 py-1 text-center w-20">Qty</th>
                        <th className="border-r-2 border-black px-2 py-1 text-right w-32">Rate</th>
                        <th className="px-2 py-1 text-right w-32">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {(items.length > 0 ? items : [{ stock_item_name: 'As per details', amount: invoice.taxable_amount, quantity: 1, rate: invoice.taxable_amount }]).map((item, i) => (
                        <tr key={i} className="align-top">
                            <td className="border-r-2 border-black px-2 py-1 text-center h-8">{i + 1}</td>
                            <td className="border-r-2 border-black px-2 py-1 font-bold">{item.stock_item_name}</td>
                            <td className="border-r-2 border-black px-2 py-1 text-center">{item.hsn_code || '-'}</td>
                            <td className="border-r-2 border-black px-2 py-1 text-center">{item.quantity}</td>
                            <td className="border-r-2 border-black px-2 py-1 text-right">{formatCurrency(item.rate)}</td>
                            <td className="px-2 py-1 text-right font-bold">{formatCurrency(item.amount)}</td>
                        </tr>
                    ))}
                    {/* Filler rows */}
                    {[...Array(Math.max(0, 10 - items.length))].map((_, i) => (
                        <tr key={`f-${i}`} className="h-8">
                            <td className="border-r-2 border-black"></td><td className="border-r-2 border-black"></td><td className="border-r-2 border-black"></td><td className="border-r-2 border-black"></td><td className="border-r-2 border-black"></td><td></td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-black font-bold">
                        <td colSpan={5} className="border-r-2 border-black px-2 py-1 text-right uppercase">Total Before Tax</td>
                        <td className="px-2 py-1 text-right">{formatCurrency(invoice.taxable_amount)}</td>
                    </tr>
                    {invoice.cgst_amount > 0 && (
                        <tr>
                            <td colSpan={5} className="border-r-2 border-black px-2 py-1 text-right">CGST</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(invoice.cgst_amount)}</td>
                        </tr>
                    )}
                    {invoice.sgst_amount > 0 && (
                        <tr>
                            <td colSpan={5} className="border-r-2 border-black px-2 py-1 text-right">SGST</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(invoice.sgst_amount)}</td>
                        </tr>
                    )}
                    {invoice.igst_amount > 0 && (
                        <tr>
                            <td colSpan={5} className="border-r-2 border-black px-2 py-1 text-right">IGST</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(invoice.igst_amount)}</td>
                        </tr>
                    )}
                    <tr className="border-t-2 border-black font-black text-lg bg-gray-100">
                        <td colSpan={5} className="border-r-2 border-black px-2 py-2 text-right uppercase">Total Value (Incl. Tax)</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(invoice.net_amount)}</td>
                    </tr>
                </tfoot>
            </table>

            <div className="grid grid-cols-2 gap-4 border-t-2 border-black pt-4">
                <div className="text-sm">
                    <p className="font-bold underline mb-1">Company Bank Details:</p>
                    <p>Bank: {selectedCompany?.bank_name}</p>
                    <p>A/c: {selectedCompany?.bank_account}</p>
                    <p>IFSC: {selectedCompany?.bank_ifsc}</p>
                    <div className="mt-4">
                        <p className="font-bold underline mb-1">Amount in Words:</p>
                        <p className="italic">{numberToWords(invoice.net_amount)}</p>
                    </div>
                </div>
                <div className="text-right flex flex-col justify-between">
                    <div>
                        <p className="text-xs italic">For {selectedCompany?.name}</p>
                        <div className="h-16"></div>
                        <p className="font-bold border-t border-black inline-block px-10">Authorized Signatory</p>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-4">Subject to your city Jurisdiction</p>
                </div>
            </div>
        </div>
    </div>
);

const MinimalTemplate = ({ invoice, items, selectedCompany, formatCurrency, formatDate }) => (
    <div className="p-4 bg-white text-gray-900 border-2 max-w-[500px] mx-auto my-8">
        <div className="text-center mb-6 border-b pb-4">
            <h2 className="text-xl font-bold uppercase">{selectedCompany?.name}</h2>
            <p className="text-xs text-gray-600">{selectedCompany?.address}</p>
            <p className="text-xs font-semibold">GSTIN: {selectedCompany?.gstin}</p>
        </div>

        <div className="flex justify-between text-sm mb-4">
            <div>
                <p className="text-gray-500">Invoice No.</p>
                <p className="font-bold">{invoice.invoice_number}</p>
            </div>
            <div className="text-right">
                <p className="text-gray-500">Date</p>
                <p className="font-bold">{formatDate(invoice.invoice_date)}</p>
            </div>
        </div>

        <div className="mb-6">
            <p className="text-xs text-gray-500 uppercase border-b mb-2 pb-1">Billed To</p>
            <p className="font-bold">{invoice.party_ledger_name}</p>
            <p className="text-xs text-gray-600">GSTIN: {invoice.party_gstin || 'URD'}</p>
        </div>

        <div className="space-y-3 mb-6">
            {items.map((item, i) => (
                <div key={i} className="flex justify-between items-start text-sm border-b border-gray-100 pb-2">
                    <div className="flex-1">
                        <p className="font-medium">{item.stock_item_name}</p>
                        <p className="text-xs text-gray-500">{item.quantity} x {formatCurrency(item.rate)}</p>
                    </div>
                    <p className="font-bold">{formatCurrency(item.amount)}</p>
                </div>
            ))}
        </div>

        <div className="space-y-1 text-sm border-t pt-2">
            <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatCurrency(invoice.taxable_amount)}</span>
            </div>
            {(invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount) > 0 && (
                <div className="flex justify-between">
                    <span className="text-gray-600">Total Tax</span>
                    <span>{formatCurrency(invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount)}</span>
                </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t mt-2">
                <span>TOTAL</span>
                <span className="text-blue-600">{formatCurrency(invoice.net_amount)}</span>
            </div>
        </div>

        <div className="mt-10 text-center text-[10px] text-gray-400">
            <p>Thank you for choosing {selectedCompany.name}!</p>
            <p>Generated by BillBook AI</p>
        </div>
    </div>
);
