import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    Download, Printer, FileText, CheckCircle2, ShieldCheck,
    Building2, Phone, Mail, MapPin, Hash, Calendar, QrCode,
    CreditCard, ArrowLeft, ExternalLink, AlertCircle
} from 'lucide-react';
import { decodeInvoicePayload, formatINR, numberToWordsINR } from '@/lib/whatsappInvoice';
import { supabase } from '@/lib/insforge';

interface DisplayItem {
    name: string;
    quantity: number | string;
    unit: string;
    rate: number;
    amount: number;
    gstRate: number;
    hsnCode: string;
    discount?: number;
}

interface InvoiceModel {
    voucherId?: string;
    voucherNumber: string;
    voucherDate: string;
    voucherType: string;
    companyName: string;
    companyGstin?: string;
    companyPhone?: string;
    companyAddress?: string;
    companyState?: string;
    partyName: string;
    partyGstin?: string;
    partyPhone?: string;
    partyAddress?: string;
    items: DisplayItem[];
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    roundOff: number;
    grandTotal: number;
    narration?: string;
    bankName?: string;
    bankAccount?: string;
    bankIfsc?: string;
    upiId?: string;
}

export default function InvoiceViewPage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const [invoice, setInvoice] = useState<InvoiceModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [showUpiModal, setShowUpiModal] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function loadInvoiceData() {
            setLoading(true);
            const token = searchParams.get('d');

            // 1. Try decoding compact token from URL
            if (token) {
                const decoded = decodeInvoicePayload(token);
                if (decoded && isMounted) {
                    const mappedItems: DisplayItem[] = (decoded.items || []).map((raw: any[]) => ({
                        name: raw[0] || 'Item',
                        quantity: raw[1] || 1,
                        unit: raw[2] || '',
                        rate: Number(raw[3]) || 0,
                        amount: Number(raw[4]) || 0,
                        gstRate: Number(raw[5]) || 0,
                        hsnCode: raw[6] || '',
                        discount: Number(raw[7]) || 0
                    }));

                    setInvoice({
                        voucherId: decoded.vid || id || '',
                        voucherNumber: decoded.vno || id || 'N/A',
                        voucherDate: decoded.dt || '',
                        voucherType: decoded.vt || 'Sales',
                        companyName: decoded.c || 'Arun Enterprises',
                        companyGstin: decoded.cg || '',
                        companyPhone: decoded.cp || '',
                        companyAddress: decoded.ca || '',
                        companyState: decoded.cs || '',
                        partyName: decoded.p || 'Customer',
                        partyGstin: decoded.pg || '',
                        partyPhone: decoded.pp || '',
                        partyAddress: decoded.pa || '',
                        items: mappedItems,
                        taxableAmount: Number(decoded.tax) || 0,
                        cgstAmount: Number(decoded.cgst) || 0,
                        sgstAmount: Number(decoded.sgst) || 0,
                        igstAmount: Number(decoded.igst) || 0,
                        roundOff: Number(decoded.ro) || 0,
                        grandTotal: Number(decoded.tot) || 0,
                        narration: decoded.n || '',
                        bankName: decoded.bnk || '',
                        bankAccount: decoded.acc || '',
                        bankIfsc: decoded.ifsc || '',
                        upiId: decoded.upi || ''
                    });
                    setLoading(false);
                    return;
                }
            }

            // 2. Fallback: Query Supabase by ID if no token or token invalid
            if (id) {
                try {
                    const { data: vData } = await supabase
                        .from('vouchers')
                        .select('*')
                        .or(`id.eq.${id},voucher_number.eq.${id}`)
                        .maybeSingle();

                    if (vData && isMounted) {
                        const [stockRes, ledgerRes, companyRes] = await Promise.all([
                            supabase.from('voucher_stock_entries').select('*').eq('is_deleted', false).eq('voucher_id', vData.id),
                            supabase.from('voucher_ledger_entries').select('*').eq('is_deleted', false).eq('voucher_id', vData.id),
                            vData.company_id ? supabase.from('companies').select('*').eq('id', vData.company_id).maybeSingle() : Promise.resolve({ data: null })
                        ]);

                        const stockRows: any[] = stockRes.data || [];
                        const ledgerRows: any[] = ledgerRes.data || [];
                        const comp: any = companyRes.data || {};

                        let cgst = Number(vData.cgst_amount) || 0;
                        let sgst = Number(vData.sgst_amount) || 0;
                        let igst = Number(vData.igst_amount) || 0;
                        let roundOff = Number(vData.round_off) || 0;

                        ledgerRows.forEach((l: any) => {
                            const name = String(l.ledger_name || '').toLowerCase();
                            const amt = Math.abs(Number(l.amount) || 0);
                            if (name.includes('cgst') && !cgst) cgst = amt;
                            else if ((name.includes('sgst') || name.includes('utgst')) && !sgst) sgst = amt;
                            else if (name.includes('igst') && !igst) igst = amt;
                            else if (name.includes('round off')) roundOff = Number(l.amount) || 0;
                        });

                        const mappedItems: DisplayItem[] = stockRows.map((s: any) => ({
                            name: s.stock_item_name || s.item_name || 'Item',
                            quantity: s.quantity || s.actual_qty || s.billed_qty || 1,
                            unit: s.unit || '',
                            rate: Number(s.rate) || 0,
                            amount: Number(s.amount) || (Number(s.quantity || 1) * Number(s.rate || 0)),
                            gstRate: Number(s.gst_rate) || 0,
                            hsnCode: s.hsn_code || ''
                        }));

                        let taxable = Number(vData.taxable_value) || Number(vData.taxable_amount) || 0;
                        if (!taxable && mappedItems.length > 0) {
                            taxable = mappedItems.reduce((acc, it) => acc + it.amount, 0);
                        }

                        const total = Math.abs(Number(vData.grand_total) || Number(vData.total_amount) || (taxable + cgst + sgst + igst + roundOff));

                        setInvoice({
                            voucherId: vData.id,
                            voucherNumber: vData.voucher_number || id,
                            voucherDate: vData.voucher_date || '',
                            voucherType: vData.voucher_type || 'Sales',
                            companyName: comp.name || 'Arun Enterprises',
                            companyGstin: comp.gstin || '',
                            companyPhone: comp.phone || comp.phone_number || '',
                            companyAddress: comp.address || '',
                            companyState: comp.state || '',
                            partyName: vData.party_name || 'Customer',
                            partyGstin: vData.party_gstin || '',
                            partyPhone: vData.party_phone || '',
                            partyAddress: vData.party_address || '',
                            items: mappedItems,
                            taxableAmount: taxable,
                            cgstAmount: cgst,
                            sgstAmount: sgst,
                            igstAmount: igst,
                            roundOff,
                            grandTotal: total,
                            narration: vData.narration || '',
                            bankName: comp.bank_name || '',
                            bankAccount: comp.bank_account || comp.account_number || '',
                            bankIfsc: comp.bank_ifsc || comp.ifsc_code || '',
                            upiId: comp.upi_id || ''
                        });
                        setLoading(false);
                        return;
                    }
                } catch (err) {
                    console.error('Error fetching invoice by ID:', err);
                }
            }

            if (isMounted) setLoading(false);
        }

        loadInvoiceData();
        return () => { isMounted = false; };
    }, [id, searchParams]);

    // Generate and Download PDF using jsPDF
    const handleDownloadPDF = () => {
        if (!invoice) return;
        setDownloading(true);

        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            let y = 14;

            // Company Header
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(20, 30, 45);
            doc.text(invoice.companyName.toUpperCase(), 14, y);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 90, 105);
            y += 5;
            if (invoice.companyAddress) {
                doc.text(invoice.companyAddress, 14, y);
                y += 4;
            }
            const compGstLine = [
                invoice.companyGstin ? `GSTIN: ${invoice.companyGstin}` : '',
                invoice.companyPhone ? `Phone: ${invoice.companyPhone}` : ''
            ].filter(Boolean).join('  |  ');
            if (compGstLine) {
                doc.text(compGstLine, 14, y);
                y += 4;
            }

            // Document Title Badge (Right Side)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(16, 185, 129); // Emerald
            doc.text('TAX INVOICE', pageWidth - 14, 14, { align: 'right' });

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(`ORIGINAL FOR RECIPIENT`, pageWidth - 14, 19, { align: 'right' });

            // Divider Line
            y += 2;
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(14, y, pageWidth - 14, y);
            y += 6;

            // Invoice Meta & Billed To Section (2 Columns)
            const metaStartY = y;

            // Left Col: Billed To
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('BILLED TO (PARTY DETAILS)', 14, y);
            y += 4;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text(invoice.partyName, 14, y);
            y += 4;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            if (invoice.partyAddress) {
                doc.text(invoice.partyAddress, 14, y);
                y += 4;
            }
            if (invoice.partyGstin) {
                doc.text(`GSTIN: ${invoice.partyGstin}`, 14, y);
                y += 4;
            }
            if (invoice.partyPhone) {
                doc.text(`Contact: ${invoice.partyPhone}`, 14, y);
                y += 4;
            }

            // Right Col: Invoice Meta
            let rightY = metaStartY;
            const rightX = pageWidth - 65;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('INVOICE DETAILS', rightX, rightY);
            rightY += 4;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text(`Invoice No:`, rightX, rightY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`#${invoice.voucherNumber}`, pageWidth - 14, rightY, { align: 'right' });
            rightY += 4;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text(`Invoice Date:`, rightX, rightY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(invoice.voucherDate || 'Recent', pageWidth - 14, rightY, { align: 'right' });
            rightY += 4;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text(`Voucher Type:`, rightX, rightY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(invoice.voucherType, pageWidth - 14, rightY, { align: 'right' });
            rightY += 4;

            y = Math.max(y, rightY) + 4;

            // Items Table
            const tableColumns = [
                { header: '#', dataKey: 'sno' },
                { header: 'Item Description', dataKey: 'name' },
                { header: 'HSN/SAC', dataKey: 'hsn' },
                { header: 'Qty', dataKey: 'qty' },
                { header: 'Rate (₹)', dataKey: 'rate' },
                { header: 'GST %', dataKey: 'gst' },
                { header: 'Amount (₹)', dataKey: 'amt' }
            ];

            const tableRows = (invoice.items || []).map((item, idx) => ({
                sno: idx + 1,
                name: item.name,
                hsn: item.hsnCode || '-',
                qty: `${item.quantity} ${item.unit || ''}`.trim(),
                rate: formatINR(item.rate).replace('₹', ''),
                gst: item.gstRate ? `${item.gstRate}%` : '0%',
                amt: formatINR(item.amount).replace('₹', '')
            }));

            autoTable(doc, {
                startY: y,
                columns: tableColumns,
                body: tableRows,
                theme: 'striped',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontSize: 8,
                    fontStyle: 'bold'
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [51, 65, 85]
                },
                columnStyles: {
                    sno: { cellWidth: 8, halign: 'center' },
                    name: { cellWidth: 'auto' },
                    hsn: { cellWidth: 20, halign: 'center' },
                    qty: { cellWidth: 20, halign: 'center' },
                    rate: { cellWidth: 24, halign: 'right' },
                    gst: { cellWidth: 16, halign: 'center' },
                    amt: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
                },
                margin: { left: 14, right: 14 }
            });

            // Summary Totals
            const pageHeight = doc.internal.pageSize.getHeight();
            const finalY = (doc as any).lastAutoTable?.finalY || y + 50;
            let summaryY = finalY + 6;

            if (summaryY + 50 > pageHeight - 15) {
                doc.addPage();
                summaryY = 15;
            }

            const summaryX = pageWidth - 80;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);

            if (invoice.taxableAmount > 0) {
                doc.text('Taxable Amount:', summaryX, summaryY);
                doc.text(formatINR(invoice.taxableAmount), pageWidth - 14, summaryY, { align: 'right' });
                summaryY += 4.5;
            }
            if (invoice.cgstAmount > 0) {
                doc.text('CGST:', summaryX, summaryY);
                doc.text(formatINR(invoice.cgstAmount), pageWidth - 14, summaryY, { align: 'right' });
                summaryY += 4.5;
            }
            if (invoice.sgstAmount > 0) {
                doc.text('SGST:', summaryX, summaryY);
                doc.text(formatINR(invoice.sgstAmount), pageWidth - 14, summaryY, { align: 'right' });
                summaryY += 4.5;
            }
            if (invoice.igstAmount > 0) {
                doc.text('IGST:', summaryX, summaryY);
                doc.text(formatINR(invoice.igstAmount), pageWidth - 14, summaryY, { align: 'right' });
                summaryY += 4.5;
            }
            if (invoice.roundOff !== 0) {
                doc.text('Round Off:', summaryX, summaryY);
                doc.text(`${invoice.roundOff > 0 ? '+' : ''}${formatINR(invoice.roundOff)}`, pageWidth - 14, summaryY, { align: 'right' });
                summaryY += 4.5;
            }

            doc.setDrawColor(203, 213, 225);
            doc.line(summaryX, summaryY, pageWidth - 14, summaryY);
            summaryY += 4.5;

            // Grand Total
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.text('GRAND TOTAL:', summaryX, summaryY);
            doc.setTextColor(16, 185, 129); // Emerald
            doc.text(formatINR(invoice.grandTotal), pageWidth - 14, summaryY, { align: 'right' });
            summaryY += 8;

            // Amount in words
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(71, 85, 105);
            doc.text(`Amount in Words: ${numberToWordsINR(invoice.grandTotal)}`, 14, summaryY);
            summaryY += 6;

            // Bank Details / Payment Info Box
            if (invoice.bankName || invoice.bankAccount || invoice.upiId) {
                doc.setDrawColor(226, 232, 240);
                doc.setFillColor(248, 250, 252);
                doc.rect(14, summaryY, pageWidth - 28, 18, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(15, 23, 42);
                doc.text('Bank & Payment Details:', 18, summaryY + 5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(71, 85, 105);
                const bankLine = [
                    invoice.bankName ? `Bank: ${invoice.bankName}` : '',
                    invoice.bankAccount ? `A/C: ${invoice.bankAccount}` : '',
                    invoice.bankIfsc ? `IFSC: ${invoice.bankIfsc}` : '',
                    invoice.upiId ? `UPI: ${invoice.upiId}` : ''
                ].filter(Boolean).join('  |  ');
                doc.text(bankLine, 18, summaryY + 11);

                summaryY += 24;
            }

            // Footer
            const totalPageHeight = doc.internal.pageSize.getHeight();
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('This is a computer-generated invoice. Generated via TallyOnMobile.', 14, totalPageHeight - 8);
            doc.text(`Page 1 of 1`, pageWidth - 14, totalPageHeight - 8, { align: 'right' });

            // Trigger download
            const fileName = `Invoice_${invoice.voucherNumber || 'invoice'}.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error('PDF Generation Error:', err);
            alert('Failed to generate PDF. You can use the Print button as an alternative.');
        } finally {
            setDownloading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0B1118] text-white flex flex-col items-center justify-center p-4">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-bold text-slate-300">Loading invoice...</p>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="min-h-screen bg-[#0B1118] text-white flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                    <AlertCircle size={32} />
                </div>
                <h1 className="text-xl font-black mb-2">Invoice Not Found</h1>
                <p className="text-sm text-slate-400 max-w-sm mb-6">
                    The requested invoice link might be invalid or expired. Please contact the business for an updated invoice link.
                </p>
                <a
                    href="https://tallyonmobile.app"
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
                >
                    Go to Homepage
                </a>
            </div>
        );
    }

    const initials = (invoice.companyName || 'A').slice(0, 2).toUpperCase();

    return (
        <div className="min-h-screen bg-[#0B1118] text-slate-900 antialiased py-4 md:py-8 px-2 sm:px-4 print:bg-white print:p-0">
            {/* Top Bar / Actions (Hidden on Print) */}
            <div className="max-w-4xl mx-auto mb-4 print:hidden flex items-center justify-between gap-3 bg-[#121B24] border border-[#1E2B38] rounded-2xl p-3 text-white shadow-xl">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xs font-black truncate">{invoice.companyName}</h2>
                        <p className="text-[10px] text-slate-400 font-mono">Invoice #{invoice.voucherNumber}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {invoice.upiId && (
                        <button
                            onClick={() => setShowUpiModal(true)}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 text-xs font-bold active:scale-95 transition-all cursor-pointer"
                        >
                            <QrCode size={14} /> Pay via UPI
                        </button>
                    )}

                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A2634] border border-[#24364A] text-slate-200 hover:bg-[#24364A] text-xs font-bold active:scale-95 transition-all cursor-pointer"
                        title="Print Invoice"
                    >
                        <Printer size={14} /> <span className="hidden sm:inline">Print</span>
                    </button>

                    <button
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                        <Download size={14} /> {downloading ? 'Preparing...' : 'Download PDF'}
                    </button>
                </div>
            </div>

            {/* Printable & Visible Invoice Card */}
            <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none">
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-black text-[10px] tracking-wider uppercase">
                                Tax Invoice
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Original For Recipient</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                            {invoice.companyName}
                        </h1>
                        {invoice.companyAddress && (
                            <p className="text-xs text-slate-600 mt-1 max-w-md">{invoice.companyAddress}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600 font-mono">
                            {invoice.companyGstin && <span><strong>GSTIN:</strong> {invoice.companyGstin}</span>}
                            {invoice.companyPhone && <span><strong>Phone:</strong> {invoice.companyPhone}</span>}
                        </div>
                    </div>

                    <div className="text-left md:text-right space-y-1 shrink-0 bg-white md:bg-transparent p-4 md:p-0 rounded-2xl border md:border-none border-slate-200">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Invoice Number</p>
                        <p className="text-lg md:text-xl font-black text-slate-900 font-mono">#{invoice.voucherNumber}</p>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mt-2">Date</p>
                        <p className="text-xs font-bold text-slate-700">{invoice.voucherDate || 'Recent'}</p>
                        {invoice.companyState && (
                            <p className="text-[10px] text-slate-500 mt-1">Place of Supply: {invoice.companyState}</p>
                        )}
                    </div>
                </div>

                {/* Billed To & Ship To Banner */}
                <div className="p-6 md:p-8 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
                    <div>
                        <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Billed To (Customer Details)</p>
                        <h3 className="text-base font-black text-slate-900">{invoice.partyName}</h3>
                        {invoice.partyAddress && (
                            <p className="text-xs text-slate-600 mt-1">{invoice.partyAddress}</p>
                        )}
                        <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                            {invoice.partyGstin && (
                                <p className="font-mono"><strong>GSTIN:</strong> {invoice.partyGstin}</p>
                            )}
                            {invoice.partyPhone && (
                                <p><strong>Contact:</strong> {invoice.partyPhone}</p>
                            )}
                        </div>
                    </div>

                    <div className="md:border-l md:border-slate-100 md:pl-6 space-y-2">
                        <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Invoice Summary</p>
                        <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                            <span className="text-slate-500">Voucher Type</span>
                            <span className="font-bold text-slate-800">{invoice.voucherType}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                            <span className="text-slate-500">Payment Status</span>
                            <span className="font-bold text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 size={12} /> Billed
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1">
                            <span className="text-slate-500">Total Items</span>
                            <span className="font-bold text-slate-800">{invoice.items.length} item(s)</span>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                                <th className="py-3 px-4 w-12 text-center">#</th>
                                <th className="py-3 px-4">Item Description</th>
                                <th className="py-3 px-4 text-center">HSN/SAC</th>
                                <th className="py-3 px-4 text-center">Quantity</th>
                                <th className="py-3 px-4 text-right">Rate</th>
                                <th className="py-3 px-4 text-center">GST</th>
                                <th className="py-3 px-4 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {invoice.items.map((item, index) => (
                                <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                                    <td className="py-3.5 px-4 font-bold text-slate-900">
                                        {item.name}
                                        {item.discount ? (
                                            <span className="ml-2 text-[10px] text-emerald-600 font-bold">Disc: {item.discount}%</span>
                                        ) : null}
                                    </td>
                                    <td className="py-3.5 px-4 text-center text-slate-500 font-mono">{item.hsnCode || '-'}</td>
                                    <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                                        {item.quantity} {item.unit || ''}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono text-slate-700">{formatINR(item.rate)}</td>
                                    <td className="py-3.5 px-4 text-center text-slate-600 font-bold">
                                        {item.gstRate ? `${item.gstRate}%` : '0%'}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-black font-mono text-slate-900">
                                        {formatINR(item.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Calculations & Total Summary */}
                <div className="p-6 md:p-8 border-t border-slate-200 bg-slate-50/50 flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex-1 space-y-3">
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400">Amount in Words</p>
                            <p className="text-xs font-black text-slate-800 italic mt-0.5">
                                {numberToWordsINR(invoice.grandTotal)}
                            </p>
                        </div>

                        {/* Bank Details Box */}
                        {(invoice.bankName || invoice.bankAccount || invoice.upiId) && (
                            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1">
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Payment Details</p>
                                {invoice.bankName && <p><strong>Bank:</strong> {invoice.bankName}</p>}
                                {invoice.bankAccount && <p><strong>A/C No:</strong> {invoice.bankAccount}</p>}
                                {invoice.bankIfsc && <p><strong>IFSC:</strong> {invoice.bankIfsc}</p>}
                                {invoice.upiId && <p className="text-emerald-700 font-bold font-mono"><strong>UPI ID:</strong> {invoice.upiId}</p>}
                            </div>
                        )}

                        {invoice.narration && (
                            <p className="text-[11px] text-slate-500 italic">
                                Note: {invoice.narration}
                            </p>
                        )}
                    </div>

                    <div className="w-full md:w-72 space-y-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                        {invoice.taxableAmount > 0 && (
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>Taxable Amount</span>
                                <span className="font-mono font-bold text-slate-800">{formatINR(invoice.taxableAmount)}</span>
                            </div>
                        )}
                        {invoice.cgstAmount > 0 && (
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>CGST</span>
                                <span className="font-mono font-bold text-slate-800">{formatINR(invoice.cgstAmount)}</span>
                            </div>
                        )}
                        {invoice.sgstAmount > 0 && (
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>SGST</span>
                                <span className="font-mono font-bold text-slate-800">{formatINR(invoice.sgstAmount)}</span>
                            </div>
                        )}
                        {invoice.igstAmount > 0 && (
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>IGST</span>
                                <span className="font-mono font-bold text-slate-800">{formatINR(invoice.igstAmount)}</span>
                            </div>
                        )}
                        {invoice.roundOff !== 0 && (
                            <div className="flex justify-between text-xs text-slate-600">
                                <span>Round Off</span>
                                <span className="font-mono font-bold text-slate-800">
                                    {invoice.roundOff > 0 ? '+' : ''}{formatINR(invoice.roundOff)}
                                </span>
                            </div>
                        )}

                        <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-900">Total Amount</span>
                            <span className="text-lg md:text-xl font-black text-emerald-600 font-mono">
                                {formatINR(invoice.grandTotal)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer Signatory & Legal */}
                <div className="p-6 md:p-8 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 items-end bg-white">
                    <div className="text-[10px] text-slate-400 space-y-1">
                        <p className="font-bold uppercase tracking-wider text-slate-500">Terms & Conditions:</p>
                        <p>1. Goods once sold will not be taken back or exchanged.</p>
                        <p>2. Subject to state jurisdiction only.</p>
                        <p>3. This is a computer generated invoice and does not require physical signature.</p>
                    </div>

                    <div className="text-left md:text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">For {invoice.companyName}</p>
                        <div className="h-12" />
                        <p className="text-xs font-black text-slate-800 border-t border-slate-200 pt-1 inline-block min-w-[140px] text-center">
                            Authorized Signatory
                        </p>
                    </div>
                </div>
            </div>

            {/* Bottom floating button on mobile (hidden on print) */}
            <div className="md:hidden fixed bottom-4 left-4 right-4 z-40 print:hidden flex items-center gap-2">
                <button
                    onClick={handleDownloadPDF}
                    disabled={downloading}
                    className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition-all cursor-pointer"
                >
                    <Download size={18} /> {downloading ? 'Preparing PDF...' : 'Download Invoice PDF'}
                </button>
            </div>

            {/* UPI QR Payment Modal */}
            {showUpiModal && invoice.upiId && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
                        <h3 className="text-base font-black text-slate-900">Scan & Pay via UPI</h3>
                        <p className="text-xs text-slate-500">Scan using any UPI App (GPay, PhonePe, Paytm, BHIM)</p>
                        <div className="flex justify-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${invoice.upiId}&pn=${encodeURIComponent(invoice.companyName)}&am=${invoice.grandTotal}&cu=INR`)}`}
                                alt="UPI QR"
                                className="w-48 h-48 mix-blend-multiply"
                            />
                        </div>
                        <div className="text-xs text-slate-700 font-mono">
                            <p className="font-bold">{invoice.upiId}</p>
                            <p className="text-lg font-black text-emerald-600 mt-1">{formatINR(invoice.grandTotal)}</p>
                        </div>
                        <button
                            onClick={() => setShowUpiModal(false)}
                            className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs active:scale-95 transition-all cursor-pointer"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
