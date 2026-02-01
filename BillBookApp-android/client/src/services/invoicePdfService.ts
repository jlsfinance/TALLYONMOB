
import { jsPDF } from 'jspdf';
import { Invoice, CompanyProfile, Customer } from '../types';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import QRCode from 'qrcode';
import { formatDate } from '../utils/dateUtils';
import { addBrandedFooter } from './pdfFooterUtils';
import { AIService } from './aiService';

// Font Configuration
const HINDI_FONT_PATH = '/fonts/Hind-Regular.ttf';

const loadHindiFont = async (doc: jsPDF) => {
    try {
        // Check if font is already in VFS
        if (doc.getFontList().Devanagari) {
            return true;
        }

        // Use bundled font from public directory
        console.log("AI: Loading bundled Hindi font...");
        const response = await fetch(HINDI_FONT_PATH);
        if (!response.ok) throw new Error("Local font file not found");

        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(blob);
        });

        doc.addFileToVFS('Hindi.ttf', base64);
        doc.addFont('Hindi.ttf', 'Devanagari', 'normal');
        doc.addFont('Hindi.ttf', 'Devanagari', 'bold');
        return true;
    } catch (e) {
        console.error("Font loading failed (Hindi).", e);
        return false;
    }
};

const getFont = (language: string | undefined, originalFont: string) => {
    if (language === 'Hindi' || language === 'Hinglish') {
        return 'Devanagari';
    }
    return originalFont;
};

// Helper for Amount in Words (Indian Format)
const numberToWords = (num: number): string => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const convert = (n: number): string => {
        if (n === 0) return "";
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
        if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convert(n % 100) : "");
        if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
        if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + convert(n % 100000) : "");
        return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + convert(n % 10000000) : "");
    };

    const integerPart = Math.floor(Math.abs(num));
    const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

    let result = integerPart === 0 ? "Zero" : convert(integerPart);

    if (decimalPart > 0) {
        result += " and " + convert(decimalPart) + " Paise";
    }

    return result + " Only";
};

// ... (imports)
import { InvoiceFormat } from '../types';

// ... (helpers like numberToWords, getHSNSummary - keep them globally in file)

// --- FORMAT GENERATORS ---

const generateDefaultPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance: boolean = false) => {
    const a4Width = 210;
    const leftMargin = 15;
    const rightMargin = a4Width - 15;
    let yPos = 15;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        billedTo: "Bill To:",
        invoice: "TAX INVOICE",
        date: "Date:",
        invoiceNo: "Invoice #:",
        mode: "Mode:",
        desc: "DESCRIPTION",
        qty: "QTY",
        rate: "RATE",
        amount: "AMOUNT",
        subtotal: "Subtotal:",
        total: "Total:",
        amtWords: "Amount in Words:",
        scanToPay: "Scan to Pay:"
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "helvetica"), bold ? "bold" : "normal");
    };

    const safeCompany = {
        name: company.name || 'Company Name',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || ''
    };

    // Header
    setDocFont(true);
    doc.setFontSize(18);
    doc.text(safeCompany.name, a4Width / 2, yPos, { align: "center" });
    yPos += 6;

    setDocFont(false);
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(safeCompany.address, a4Width / 2, yPos, { align: "center" });
    yPos += 4;
    doc.text(`Ph: ${safeCompany.phone} | ${safeCompany.email}`, a4Width / 2, yPos, { align: "center" });
    yPos += 4;

    if (invoice.gstEnabled && (company.gstin || (company as any).gst)) {
        setDocFont(true);
        doc.setFontSize(9);
        doc.setTextColor(34, 197, 94);
        const gstin = company.gstin || (company as any).gst || '';
        doc.text(`GSTIN: ${gstin}`, a4Width / 2, yPos, { align: "center" });
        yPos += 4;
        doc.setTextColor(0);
    }
    yPos += 2;

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 7;

    setDocFont(true);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(labels.invoice, a4Width / 2, yPos, { align: "center" });
    yPos += 10;

    const infoStartY = yPos;
    doc.setFontSize(9);
    setDocFont(true);
    doc.text(labels.billedTo, leftMargin, yPos);
    yPos += 4;

    setDocFont(true);
    doc.setFontSize(10);
    doc.text(invoice.customerName || 'Customer', leftMargin, yPos);
    yPos += 4;

    setDocFont(false);
    doc.setFontSize(9);
    const addressLines = doc.splitTextToSize(invoice.customerAddress || '', 80);
    doc.text(addressLines, leftMargin, yPos);

    let rightColY = infoStartY;
    const rightColX = 120;
    const lineSpacing = 5;

    setDocFont(true);
    doc.text(labels.invoiceNo, rightColX, rightColY);
    setDocFont(false);
    doc.text(invoice.invoiceNumber || '-', rightColX + 25, rightColY);
    rightColY += lineSpacing;

    setDocFont(true);
    doc.text(labels.date, rightColX, rightColY);
    setDocFont(false);
    doc.text(formatDate(invoice.date), rightColX + 25, rightColY);
    rightColY += lineSpacing;

    setDocFont(true);
    doc.text(labels.mode, rightColX, rightColY);
    setDocFont(false);
    const modeText = invoice.status === 'PAID' ? 'Cash' : 'Credit';
    doc.text(modeText, rightColX + 25, rightColY);

    yPos = Math.max(yPos + (addressLines.length * 4), rightColY) + 8;

    doc.setFillColor(245, 247, 250);
    doc.rect(leftMargin, yPos, rightMargin - leftMargin, 8, 'F');
    setDocFont(true);
    doc.setFontSize(8);
    doc.setTextColor(60);

    const hasHSN = invoice.items.some(i => i.hsn);
    const colX = {
        idx: leftMargin + 5,
        desc: leftMargin + 15,
        hsn: leftMargin + 60,
        qty: rightMargin - (invoice.gstEnabled ? 75 : 65),
        rate: rightMargin - (invoice.gstEnabled ? 45 : 35),
        gst: rightMargin - 20,
        amount: rightMargin - 5
    };

    doc.text("#", colX.idx, yPos + 5);
    doc.text(labels.desc || "DESCRIPTION", colX.desc, yPos + 5);
    if (hasHSN) doc.text("HSN", colX.hsn, yPos + 5);
    doc.text(labels.qty || "QTY", colX.qty, yPos + 5, { align: "right" });
    doc.text(labels.rate || "RATE", colX.rate, yPos + 5, { align: "right" });
    if (invoice.gstEnabled) doc.text("GST%", colX.gst, yPos + 5, { align: "right" });
    doc.text(labels.amount || "AMOUNT", colX.amount, yPos + 5, { align: "right" });

    yPos += 8;

    setDocFont(false);
    doc.setTextColor(0);
    doc.setFontSize(9);

    const rowHeight = 7;
    const pageHeight = doc.internal.pageSize.getHeight();

    invoice.items.forEach((item, i) => {
        if (yPos > pageHeight - 30) {
            doc.addPage();
            yPos = 20;
        }

        doc.text(`${i + 1}`, colX.idx, yPos + 5);
        doc.text(item.description || '-', colX.desc, yPos + 5);
        if (hasHSN) doc.text(item.hsn || '-', colX.hsn, yPos + 5);
        doc.text((item.quantity || 0).toString(), colX.qty, yPos + 5, { align: "right" });
        doc.text(`Rs. ${(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX.rate, yPos + 5, { align: "right" });
        if (invoice.gstEnabled) doc.text(`${((item.gstRate || 0)).toFixed(1)}%`, colX.gst, yPos + 5, { align: "right" });
        setDocFont(true);
        const amountWithGST = (item.totalAmount || item.baseAmount) || 0;
        doc.text(`Rs. ${amountWithGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX.amount, yPos + 5, { align: "right" });
        setDocFont(false);

        doc.setDrawColor(230);
        doc.line(leftMargin, yPos + rowHeight, rightMargin, yPos + rowHeight);
        yPos += rowHeight;
    });

    yPos += 4;
    const totalQty = invoice.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    doc.setFontSize(8);
    setDocFont(true);
    doc.text(`Total Qty: ${totalQty}`, colX.qty, yPos + 4, { align: "right" });
    doc.setFontSize(9);
    yPos += 5;

    const totalXLabel = rightMargin - 45;
    const totalXValue = rightMargin - 5;

    setDocFont(true);
    doc.text(labels.subtotal || "Subtotal:", totalXLabel, yPos + 5, { align: "right" });
    setDocFont(false);
    doc.text(`Rs. ${(invoice.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totalXValue, yPos + 5, { align: "right" });
    yPos += 5;

    if (invoice.discountAmount && invoice.discountAmount > 0) {
        doc.setFont("helvetica", "normal");
        let label = "Discount:";
        // Check for percentage logic
        if (invoice.discountType === 'PERCENTAGE' && invoice.discountValue) {
            label = `Discount (${invoice.discountValue}%):`;
        }
        doc.text(label, totalXLabel, yPos + 5, { align: "right" });
        doc.text(`- Rs. ${(invoice.discountAmount).toFixed(2)}`, totalXValue, yPos + 5, { align: "right" });
        yPos += 5;
    }

    const totalGSTAmount = (invoice.totalCgst || 0) + (invoice.totalSgst || 0) + (invoice.totalIgst || 0);
    if (invoice.gstEnabled && totalGSTAmount > 0) {
        if ((invoice.totalCgst || 0) > 0) {
            setDocFont(true);
            doc.setTextColor(34, 197, 94);
            doc.text("CGST:", totalXLabel, yPos + 5, { align: "right" });
            setDocFont(false);
            doc.text(`Rs. ${(invoice.totalCgst || 0).toFixed(2)}`, totalXValue, yPos + 5, { align: "right" });
            yPos += 5;
        }
        if ((invoice.totalSgst || 0) > 0) {
            setDocFont(true);
            doc.text("SGST:", totalXLabel, yPos + 5, { align: "right" });
            setDocFont(false);
            doc.text(`Rs. ${(invoice.totalSgst || 0).toFixed(2)}`, totalXValue, yPos + 5, { align: "right" });
            yPos += 5;
        }
        if ((invoice.totalIgst || 0) > 0) {
            setDocFont(true);
            doc.text("IGST:", totalXLabel, yPos + 5, { align: "right" });
            setDocFont(false);
            doc.text(`Rs. ${(invoice.totalIgst || 0).toFixed(2)}`, totalXValue, yPos + 5, { align: "right" });
            yPos += 5;
        }
        doc.setTextColor(0);
    }

    doc.setDrawColor(0);
    doc.line(rightMargin - 70, yPos + 2, rightMargin, yPos + 2);
    yPos += 8;

    setDocFont(true);
    doc.setFontSize(10);
    doc.text(labels.total || "Total:", totalXLabel, yPos + 5, { align: "right" });
    doc.text(`Rs. ${invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totalXValue, yPos + 5, { align: "right" });
    yPos += 8;

    if (_showPreviousBalance && invoice.previousBalance && invoice.previousBalance > 0) {
        setDocFont(false);
        doc.text("Previous Balance:", totalXLabel, yPos + 5, { align: "right" });
        doc.text(`Rs. ${invoice.previousBalance.toFixed(2)}`, totalXValue, yPos + 5, { align: "right" });
        yPos += 6;

        setDocFont(true);
        doc.setFontSize(11);
        doc.setTextColor(239, 68, 68); // Red
        doc.text("Grand Total Due:", totalXLabel, yPos + 5, { align: "right" });
        doc.text(`Rs. ${(invoice.total + invoice.previousBalance).toFixed(2)}`, totalXValue, yPos + 5, { align: "right" });
        doc.setTextColor(0);
        yPos += 8;
    }

    const amountInWords = invoice.totalInWords || numberToWords(_showPreviousBalance && invoice.previousBalance ? (invoice.total + invoice.previousBalance) : invoice.total);
    doc.setFontSize(9);
    setDocFont(true);
    doc.text(labels.amtWords || "Amount in Words:", leftMargin, yPos);
    setDocFont(false);
    doc.text(amountInWords, leftMargin + 40, yPos);

    // --- QR Code for Payments ---
    if (company.upiId && invoice.total > 0) {
        const upiLink = `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.name)}&am=${invoice.total}&cu=INR`;
        try {
            const qrUrl = await QRCode.toDataURL(upiLink, { margin: 1, width: 128 });
            let footerY = Math.max(yPos + 20, pageHeight - 35);
            if (footerY > pageHeight - 30) {
                doc.addPage();
                footerY = 20;
            }
            doc.setFontSize(8);
            setDocFont(true);
            doc.text(labels.scanToPay, rightMargin, footerY - 2, { align: "right" });
            doc.addImage(qrUrl, 'PNG', rightMargin - 25, footerY, 25, 25);
        } catch (qrErr) {
            console.error("QR Generation failed", qrErr);
        }
    }
};

const generateModernPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance?: boolean) => {
    // Modern Redesign: Optimized for Ink & Paper Saving
    const a4Width = 210;
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 12; // Reduced margin for paper saving
    const rightMargin = a4Width - 12;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        billedTo: "BILL TO",
        invoice: "TAX INVOICE",
        date: "Date",
        invoiceNo: "Invoice No",
        desc: "DESCRIPTION",
        qty: "QTY",
        rate: "RATE",
        amount: "AMOUNT",
        total: "TOTAL AMOUNT",
        gstin: "GSTIN"
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "helvetica"), bold ? "bold" : "normal");
    };

    const accentColor = [30, 58, 138]; // Deep Indigo

    // Ink Saving: No solid header background. Use a thick border instead.
    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setLineWidth(0.8);
    doc.line(leftMargin, 10, rightMargin, 10);

    let yPos = 18;

    // Company Info (Black for ink saving)
    doc.setTextColor(0);
    setDocFont(true);
    doc.setFontSize(22);
    doc.text(company.name || 'Company Name', leftMargin, yPos);

    // Invoice Title (Right, Outline/Bold)
    doc.setFontSize(24);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(labels.invoice, rightMargin, yPos, { align: "right" });

    yPos += 8;
    doc.setTextColor(80);
    doc.setFontSize(9);
    setDocFont(false);
    const companyAddress = doc.splitTextToSize(company.address || '', 100);
    doc.text(companyAddress, leftMargin, yPos);

    // Invoice Details (Right)
    doc.setTextColor(0);
    doc.text(`${labels.invoiceNo}: ${invoice.invoiceNumber}`, rightMargin, yPos, { align: "right" });
    doc.text(`${labels.date}: ${formatDate(invoice.date)}`, rightMargin, yPos + 4, { align: "right" });

    yPos += (companyAddress.length * 4) + 2;
    doc.setFontSize(8);
    doc.text(`Phone: ${company.phone} | Email: ${company.email}`, leftMargin, yPos);

    yPos += 8;
    doc.setLineWidth(0.2);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 8;

    // Customer & Seller Details (Compact)
    const colWidth = (a4Width - 24) / 2;

    setDocFont(true);
    doc.setFontSize(8);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(labels.billedTo, leftMargin, yPos);
    doc.text("SELLER DETAILS", a4Width / 2 + 5, yPos);

    yPos += 5;
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(invoice.customerName || 'Customer', leftMargin, yPos);

    doc.setFontSize(8);
    setDocFont(false);
    const custAddress = doc.splitTextToSize(invoice.customerAddress || '', colWidth - 5);
    doc.text(custAddress, leftMargin, yPos + 4);

    // Seller Tax Info
    const gstin = company.gstin || (company as any).gst || '';
    doc.text(`GSTIN: ${gstin}`, a4Width / 2 + 5, yPos + 4);
    if (company.upiId) doc.text(`UPI: ${company.upiId}`, a4Width / 2 + 5, yPos + 8);

    yPos += Math.max(custAddress.length * 4 + 6, 12);

    // Table Header (Ink Saving: Outline instead of solid)
    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 5;
    setDocFont(true);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setFontSize(9);

    const colX = {
        idx: leftMargin + 2,
        desc: leftMargin + 10,
        qty: rightMargin - 75,
        rate: rightMargin - 50,
        gst: rightMargin - 25,
        amount: rightMargin - 2
    };

    doc.text("#", colX.idx, yPos);
    doc.text(labels.desc, colX.desc, yPos);
    doc.text(labels.qty, colX.qty, yPos, { align: 'right' });
    doc.text(labels.rate, colX.rate, yPos, { align: 'right' });
    if (invoice.gstEnabled) doc.text("GST", colX.gst, yPos, { align: 'right' });
    doc.text(labels.amount, colX.amount, yPos, { align: 'right' });

    yPos += 3;
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 6;

    doc.setTextColor(0);
    setDocFont(false);

    invoice.items.forEach((item, index) => {
        if (yPos > pageHeight - 30) {
            doc.addPage();
            yPos = 20;
            doc.line(leftMargin, yPos, rightMargin, yPos);
            yPos += 5;
        }

        doc.text(String(index + 1), colX.idx, yPos);
        doc.text(item.description, colX.desc, yPos);
        doc.text(String(item.quantity), colX.qty, yPos, { align: 'right' });
        doc.text(item.rate.toLocaleString('en-IN'), colX.rate, yPos, { align: 'right' });
        if (invoice.gstEnabled) doc.text(`${item.gstRate}%`, colX.gst, yPos, { align: 'right' });

        setDocFont(true);
        const itemTotal = (item.totalAmount || item.baseAmount || 0);
        doc.text(itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX.amount, yPos, { align: 'right' });
        setDocFont(false);

        yPos += 7; // Reduced row height for paper saving
    });

    // Summary Section (Compact)
    yPos += 4;
    doc.setLineWidth(0.2);
    doc.line(rightMargin - 60, yPos, rightMargin, yPos);
    yPos += 5;

    const summaryX = rightMargin - 60;
    doc.setFontSize(8);
    doc.text("Subtotal:", summaryX, yPos);
    doc.text(`Rs. ${invoice.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightMargin, yPos, { align: 'right' });

    if (invoice.gstEnabled) {
        yPos += 4;
        const totalGst = (invoice.totalCgst || 0) + (invoice.totalSgst || 0) + (invoice.totalIgst || 0);
        doc.text("Total GST:", summaryX, yPos);
        doc.text(`Rs. ${totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightMargin, yPos, { align: 'right' });
    }

    yPos += 6;
    setDocFont(true);
    doc.setFontSize(10);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(labels.total, summaryX, yPos);
    doc.text(`Rs. ${invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightMargin, yPos, { align: 'right' });

    doc.setTextColor(0);
    yPos += 10;

    // Amount in Words & QR (Side by Side for paper saving)
    setDocFont(true);
    doc.setFontSize(7);
    doc.text("AMOUNT IN WORDS", leftMargin, yPos);
    setDocFont(false);
    const amtWords = invoice.totalInWords || numberToWords(invoice.total);
    doc.text(amtWords, leftMargin, yPos + 4, { maxWidth: 100 });

    if (company.upiId && _qrCodeUrl) {
        const qrSize = 20;
        doc.setFontSize(7);
        setDocFont(true);
        doc.text("SCAN TO PAY", rightMargin, yPos, { align: 'right' });
        doc.addImage(_qrCodeUrl, 'PNG', rightMargin - qrSize, yPos + 2, qrSize, qrSize);
    }
};

// ... Placeholder for Tally and Desi - will implement logic later or map to default for now to prevent errors
const generateTallyPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance?: boolean) => {
    // Tally Prime Style: Optimized for Ink & Paper Saving
    const a4Width = 210;
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 8;
    const rightMargin = a4Width - 8;
    const midX = a4Width / 2;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        invoice: "Tax Invoice",
        no: "Invoice No.",
        date: "Dated",
        buyer: "Buyer",
        desc: "Description of Goods",
        hsn: "HSN/SAC",
        qty: "Quantity",
        rate: "Rate",
        per: "per",
        amt: "Amount",
        total: "Total",
        amtWords: "Amount Chargeable (in words)",
        declaration: "Declaration",
        authSig: "for",
        eoe: "E. & O.E."
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "times"), bold ? "bold" : "normal");
    };

    // Ink Saving: Very thin border
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.rect(leftMargin, 8, rightMargin - leftMargin, pageHeight - 16);

    let yPos = 8;

    setDocFont(true);
    doc.setFontSize(10);
    doc.text(labels.invoice, midX, yPos + 4, { align: 'center' });
    yPos += 7;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    // Top Section (Compact)
    const topSectionHeight = 35;
    doc.line(midX, yPos, midX, yPos + topSectionHeight);

    doc.setFontSize(10);
    doc.text(company.name, leftMargin + 2, yPos + 4);
    setDocFont(false);
    doc.setFontSize(8);
    const companyAddr = doc.splitTextToSize(company.address, midX - leftMargin - 5);
    doc.text(companyAddr, leftMargin + 2, yPos + 8);
    doc.text(`GSTIN/UIN: ${company.gstin || (company as any).gst || 'N/A'}`, leftMargin + 2, yPos + 22);

    // Right: Invoice Details
    doc.text(`${labels.no}: ${invoice.invoiceNumber}`, midX + 2, yPos + 4);
    doc.line(midX, yPos + 6, rightMargin, yPos + 6);
    doc.text(`${labels.date}: ${formatDate(invoice.date)}`, midX + 2, yPos + 10);
    doc.line(midX, yPos + 12, rightMargin, yPos + 12);
    doc.text(`Mode: ${invoice.status === 'PAID' ? 'Cash' : 'Credit'}`, midX + 2, yPos + 16);

    yPos += topSectionHeight;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    // Buyer Section (Compact)
    doc.setFontSize(8);
    doc.text(`${labels.buyer}:`, leftMargin + 2, yPos + 4);
    setDocFont(true);
    doc.text(invoice.customerName, leftMargin + 2, yPos + 8);
    setDocFont(false);
    const buyerAddr = doc.splitTextToSize(invoice.customerAddress || '', midX - leftMargin - 5);
    doc.text(buyerAddr, leftMargin + 2, yPos + 12);
    doc.text(`GSTIN/UIN: ${invoice.customerGstin || 'N/A'}`, leftMargin + 2, yPos + 24);

    yPos += 28;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    // Table Header
    const colX = {
        idx: leftMargin + 2,
        desc: leftMargin + 10,
        hsn: midX + 10,
        qty: midX + 35,
        rate: midX + 55,
        per: midX + 70,
        amt: rightMargin - 2
    };

    setDocFont(true);
    doc.text("S.N.", colX.idx, yPos + 4);
    doc.text(labels.desc, colX.desc, yPos + 4);
    doc.text(labels.hsn, colX.hsn, yPos + 4);
    doc.text(labels.qty, colX.qty, yPos + 4, { align: 'right' });
    doc.text(labels.rate, colX.rate, yPos + 4, { align: 'right' });
    doc.text(labels.amt, colX.amt, yPos + 4, { align: 'right' });

    yPos += 6;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    // Items (Tight row height)
    const tableEndY = pageHeight - 50;
    setDocFont(false);
    invoice.items.forEach((item, i) => {
        if (yPos < tableEndY - 5) {
            doc.text(String(i + 1), colX.idx, yPos + 4);
            doc.text(item.description, colX.desc, yPos + 4);
            doc.text(item.hsn || '', colX.hsn, yPos + 4);
            doc.text(String(item.quantity), colX.qty, yPos + 4, { align: 'right' });
            doc.text(item.rate.toLocaleString('en-IN'), colX.rate, yPos + 4, { align: 'right' });
            setDocFont(true);
            doc.text((item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX.amt, yPos + 4, { align: 'right' });
            setDocFont(false);
            yPos += 6;
        }
    });

    // Totals
    yPos = tableEndY;
    doc.line(leftMargin, yPos, rightMargin, yPos);
    setDocFont(true);
    doc.text(labels.total, colX.desc, yPos + 4);
    const totalQty = invoice.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    doc.text(String(totalQty), colX.qty, yPos + 4, { align: 'right' });
    doc.text(`Rs. ${invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX.amt, yPos + 4, { align: 'right' });

    yPos += 6;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    setDocFont(false);
    doc.setFontSize(7);
    const amtWords = invoice.totalInWords || numberToWords(invoice.total);
    doc.text(`${labels.amtWords}: INR ${amtWords}`, leftMargin + 2, yPos + 4);

    yPos += 8;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    // Footer
    doc.setFontSize(7);
    doc.text(labels.declaration, leftMargin + 2, yPos + 4);
    doc.text("We declare that this invoice shows the actual price of the goods described.", leftMargin + 2, yPos + 8, { maxWidth: midX - 20 });

    doc.line(midX, yPos, midX, pageHeight - 8);
    doc.text(`${labels.authSig} ${company.name}`, rightMargin - 5, yPos + 4, { align: 'right' });
    doc.text("Authorised Signatory", rightMargin - 5, pageHeight - 12, { align: 'right' });
};


// ... (previous code)

const generateMinimalPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance?: boolean) => {
    // Minimal: Optimized for Ink & Paper Saving
    const a4Width = 210;
    const leftMargin = 15;
    const rightMargin = a4Width - 15;
    let yPos = 15;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        billedTo: "BILL TO",
        invoice: "INVOICE",
        date: "DATE",
        item: "ITEM",
        total: "TOTAL"
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "helvetica"), bold ? "bold" : "normal");
    };

    // Ink Saving: Removed top bar.
    setDocFont(true);
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(company.name, leftMargin, yPos);

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(labels.invoice, rightMargin, yPos, { align: 'right' });
    yPos += 6;

    setDocFont(false);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(company.address, leftMargin, yPos, { maxWidth: 100 });

    doc.setTextColor(40, 40, 40);
    setDocFont(true);
    doc.text(`#${invoice.invoiceNumber}`, rightMargin, yPos, { align: 'right' });
    yPos += 10;

    doc.setDrawColor(240, 240, 240);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 10;

    // Billed To & Date (Compact)
    setDocFont(true);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(labels.billedTo, leftMargin, yPos);
    doc.text(labels.date, rightMargin, yPos, { align: 'right' });
    yPos += 4;

    setDocFont(true);
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text(invoice.customerName, leftMargin, yPos);
    doc.text(formatDate(invoice.date), rightMargin, yPos, { align: 'right' });
    yPos += 4;

    setDocFont(false);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const custAddr = doc.splitTextToSize(invoice.customerAddress || '', 80);
    doc.text(custAddr, leftMargin, yPos);
    yPos += Math.max(custAddr.length * 4, 10);

    // Items Table (Compact)
    setDocFont(true);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(labels.item, leftMargin, yPos);
    doc.text(labels.total, rightMargin, yPos, { align: 'right' });
    yPos += 3;
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 7;

    setDocFont(false);
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    invoice.items.forEach(item => {
        if (yPos > doc.internal.pageSize.getHeight() - 30) {
            doc.addPage();
            yPos = 20;
        }
        setDocFont(true);
        doc.text(item.description, leftMargin, yPos);
        doc.text(`Rs. ${(item.totalAmount || 0).toLocaleString('en-IN')}`, rightMargin, yPos, { align: 'right' });
        yPos += 4;
        setDocFont(false);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`${item.quantity} x Rs. ${item.rate.toLocaleString('en-IN')}`, leftMargin, yPos);
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(9);
        yPos += 6; // Tight row height
    });

    yPos += 5;
    doc.setDrawColor(240, 240, 240);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 10;

    setDocFont(true);
    doc.setFontSize(14);
    doc.text(labels.total, leftMargin, yPos);
    doc.text(`Rs. ${invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightMargin, yPos, { align: 'right' });

    yPos += 8;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const amtWords = invoice.totalInWords || numberToWords(invoice.total);
    doc.text(amtWords.toUpperCase(), leftMargin, yPos);
};

const generateDesiPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance?: boolean) => {
    // Desi Redesign: Optimized for Ink & Paper Saving
    const a4Width = 210;
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 12;
    const rightMargin = a4Width - 12;
    let yPos = 12;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        invoice: "CASH MEMO / BILL",
        date: "Date:",
        no: "Bill No:",
        customer: "M/s:",
        particulars: "PARTICULARS",
        qty: "QTY",
        rate: "RATE",
        amount: "AMOUNT",
        grandTotal: "TOTAL:",
        signature: "Signature"
    };

    const setDocFont = (bold = false, italic = false) => {
        doc.setFont(getFont(lang, "times"), bold ? (italic ? "bolditalic" : "bold") : (italic ? "italic" : "normal"));
    };

    // Ink Saving: Single thin red border instead of double thick
    doc.setDrawColor(185, 28, 28);
    doc.setLineWidth(0.3);
    doc.rect(8, 8, a4Width - 16, pageHeight - 16);

    // Auspicious Header (Minimal)
    doc.setTextColor(185, 28, 28);
    setDocFont(true, true);
    doc.setFontSize(9);
    doc.text("|| SHREE GANESHAYA NAMAH ||", a4Width / 2, yPos, { align: 'center' });
    yPos += 8;

    // Company Name (Traditional but compact)
    doc.setFontSize(22);
    doc.text(company.name.toUpperCase(), a4Width / 2, yPos, { align: 'center' });
    yPos += 6;

    setDocFont(false, true);
    doc.setFontSize(9);
    doc.setTextColor(0);
    const addrLines = doc.splitTextToSize(company.address, 140);
    doc.text(addrLines, a4Width / 2, yPos, { align: 'center' });
    yPos += (addrLines.length * 4);
    doc.text(`Contact: ${company.phone}`, a4Width / 2, yPos, { align: 'center' });
    yPos += 6;

    // Single Line Separator
    doc.setDrawColor(185, 28, 28);
    doc.line(8, yPos, a4Width - 8, yPos);
    yPos += 6;

    // Bill Details (Compact)
    setDocFont(true);
    doc.setFontSize(11);
    doc.text(labels.invoice, a4Width / 2, yPos, { align: 'center' });
    yPos += 8;

    setDocFont(false);
    doc.setFontSize(10);
    doc.text(`${labels.no} ${invoice.invoiceNumber}`, leftMargin, yPos);
    doc.text(`${labels.date} ${formatDate(invoice.date)}`, rightMargin, yPos, { align: 'right' });
    yPos += 6;

    doc.text(labels.customer, leftMargin, yPos);
    setDocFont(true, true);
    doc.text(invoice.customerName, leftMargin + 12, yPos);
    doc.setDrawColor(220);
    doc.line(leftMargin + 12, yPos + 0.5, rightMargin, yPos + 0.5);
    yPos += 10;

    // Table Structure (Compact)
    const colX = {
        idx: leftMargin + 2,
        desc: leftMargin + 10,
        qty: a4Width / 2 + 20,
        rate: a4Width / 2 + 45,
        amt: rightMargin - 2
    };

    doc.setDrawColor(185, 28, 28);
    doc.line(8, yPos - 4, a4Width - 8, yPos - 4);
    setDocFont(true);
    doc.setTextColor(185, 28, 28);
    doc.text("S.N.", colX.idx, yPos);
    doc.text(labels.particulars, colX.desc, yPos);
    doc.text(labels.qty, colX.qty, yPos, { align: 'right' });
    doc.text(labels.rate, colX.rate, yPos, { align: 'right' });
    doc.text(labels.amount, colX.amt, yPos, { align: 'right' });
    yPos += 3;
    doc.line(8, yPos, a4Width - 8, yPos);
    yPos += 7;

    // Items
    doc.setTextColor(0);
    setDocFont(false, true);
    const tableEndY = pageHeight - 40;
    invoice.items.forEach((item, i) => {
        if (yPos < tableEndY - 5) {
            doc.text(String(i + 1), colX.idx, yPos);
            doc.text(item.description, colX.desc, yPos);
            doc.text(String(item.quantity), colX.qty, yPos, { align: 'right' });
            doc.text(item.rate.toLocaleString('en-IN'), colX.rate, yPos, { align: 'right' });
            setDocFont(true);
            doc.text((item.totalAmount || 0).toLocaleString('en-IN'), colX.amt, yPos, { align: 'right' });
            setDocFont(false, true);
            yPos += 6; // Tight row height
        }
    });

    // Footer (Compact)
    yPos = tableEndY;
    doc.setDrawColor(185, 28, 28);
    doc.line(8, yPos, a4Width - 8, yPos);
    yPos += 8;

    setDocFont(true);
    doc.setFontSize(12);
    doc.setTextColor(185, 28, 28);
    doc.text(labels.grandTotal, colX.rate, yPos, { align: 'right' });
    doc.text(`Rs. ${invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX.amt, yPos, { align: 'right' });

    yPos += 10;
    doc.setFontSize(8);
    doc.setTextColor(0);
    setDocFont(false, true);
    doc.text("Goods once sold will not be taken back.", leftMargin, yPos);

    setDocFont(true);
    doc.text(`For ${company.name} | Signature: ___________`, rightMargin, yPos, { align: 'right' });
};

const generateKacchiPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance?: boolean) => {
    // Kacchi Parchi: Optimized for Ink & Paper Saving
    const a4Width = 210;
    const leftMargin = 15;
    const rightMargin = a4Width - 15;
    let yPos = 15;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        estimate: "KACCHI PARCHI / ESTIMATE",
        date: "Date:",
        no: "No:",
        total: "TOTAL:",
        qty: "Qty",
        item: "Item",
        rate: "Rate",
        amt: "Amt"
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "courier"), bold ? "bold" : "normal");
    };

    // Ink Saving: Removed solid yellow background. Use a very light dashed border.
    doc.setDrawColor(200);
    doc.setLineDashPattern([1, 2], 0);
    doc.rect(10, 10, a4Width - 20, doc.internal.pageSize.getHeight() - 20);
    doc.setLineDashPattern([], 0);

    // Header (Blue ink feel but minimal)
    setDocFont(true);
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 150);
    doc.text(company.name.toUpperCase(), a4Width / 2, yPos, { align: 'center' });

    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`${company.address} | Mob: ${company.phone}`, a4Width / 2, yPos, { align: 'center' });

    yPos += 8;
    doc.setDrawColor(50, 50, 150);
    doc.setLineWidth(0.1);
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 6;
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 150);
    doc.text(labels.estimate, a4Width / 2, yPos, { align: 'center' });

    yPos += 4;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 8;
    doc.setTextColor(0);
    doc.text(`${labels.no} ${invoice.invoiceNumber}`, leftMargin, yPos);
    doc.text(`${labels.date} ${formatDate(invoice.date)}`, rightMargin, yPos, { align: 'right' });

    yPos += 6;
    doc.text(`To: ${invoice.customerName}`, leftMargin, yPos);

    yPos += 8;
    // Table Header (Very compact)
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 5;
    setDocFont(true);
    doc.text(labels.item, leftMargin + 2, yPos);
    doc.text(labels.qty, rightMargin - 50, yPos, { align: 'right' });
    doc.text(labels.rate, rightMargin - 30, yPos, { align: 'right' });
    doc.text(labels.amt, rightMargin - 2, yPos, { align: 'right' });
    yPos += 3;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 7;
    setDocFont(false);
    invoice.items.forEach(item => {
        if (yPos > doc.internal.pageSize.getHeight() - 30) {
            doc.addPage();
            yPos = 20;
            doc.line(leftMargin, yPos, rightMargin, yPos);
            yPos += 7;
        }
        doc.text(item.description, leftMargin + 2, yPos);
        doc.text(String(item.quantity), rightMargin - 50, yPos, { align: 'right' });
        doc.text(item.rate.toLocaleString('en-IN'), rightMargin - 30, yPos, { align: 'right' });
        doc.text((item.totalAmount || 0).toLocaleString('en-IN'), rightMargin - 2, yPos, { align: 'right' });
        yPos += 6; // Very tight row height for paper saving
    });

    yPos += 4;
    doc.setLineDashPattern([1, 1], 0);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    doc.setLineDashPattern([], 0);

    yPos += 8;
    setDocFont(true);
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 150);
    doc.text(labels.total, rightMargin - 50, yPos);
    doc.text(`Rs. ${invoice.total.toLocaleString('en-IN')}/-`, rightMargin - 2, yPos, { align: 'right' });

    yPos += 10;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("E. & O.E. | Signature: ___________", rightMargin, yPos, { align: 'right' });
};

const generateRetroPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance?: boolean) => {
    // Retro: Optimized for Ink & Paper Saving
    const a4Width = 210;
    const leftMargin = 15;
    const rightMargin = a4Width - 15;
    let yPos = 15;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        invoice: "INVOICE",
        date: "DATE",
        no: "NO.",
        total: "TOTAL"
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "courier"), bold ? "bold" : "normal");
    };

    // Ink Saving: Removed solid vintage background. Use a thin double border.
    doc.setDrawColor(60, 40, 20);
    doc.setLineWidth(0.2);
    doc.rect(10, 10, a4Width - 20, doc.internal.pageSize.getHeight() - 20);
    doc.rect(11, 11, a4Width - 22, doc.internal.pageSize.getHeight() - 22);

    // Header (Compact)
    setDocFont(true);
    doc.setFontSize(20);
    doc.setTextColor(60, 40, 20);
    doc.text(company.name.toUpperCase(), a4Width / 2, yPos, { align: 'center' });

    yPos += 6;
    doc.setFontSize(8);
    doc.text(`${company.address.toUpperCase()} | PHONE: ${company.phone}`, a4Width / 2, yPos, { align: 'center' });

    yPos += 8;
    doc.setLineWidth(0.1);
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 6;
    doc.setFontSize(12);
    doc.text(labels.invoice, leftMargin, yPos);
    doc.text(`${labels.no} ${invoice.invoiceNumber}`, rightMargin, yPos, { align: 'right' });

    yPos += 4;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.text(`DATE: ${formatDate(invoice.date)}`, leftMargin, yPos);
    yPos += 5;
    doc.text(`CUSTOMER: ${invoice.customerName.toUpperCase()}`, leftMargin, yPos);

    yPos += 8;
    // Table (Compact)
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 5;
    doc.text("DESCRIPTION", leftMargin + 2, yPos);
    doc.text("QTY", rightMargin - 50, yPos, { align: 'right' });
    doc.text("RATE", rightMargin - 30, yPos, { align: 'right' });
    doc.text("AMOUNT", rightMargin - 2, yPos, { align: 'right' });
    yPos += 3;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 7;
    setDocFont(false);
    invoice.items.forEach(item => {
        if (yPos > doc.internal.pageSize.getHeight() - 30) {
            doc.addPage();
            yPos = 20;
            doc.line(leftMargin, yPos, rightMargin, yPos);
            yPos += 7;
        }
        doc.text(item.description.toUpperCase(), leftMargin + 2, yPos);
        doc.text(String(item.quantity), rightMargin - 50, yPos, { align: 'right' });
        doc.text(item.rate.toLocaleString('en-IN'), rightMargin - 30, yPos, { align: 'right' });
        doc.text((item.totalAmount || 0).toLocaleString('en-IN'), rightMargin - 2, yPos, { align: 'right' });
        yPos += 6; // Tight row height
    });

    yPos += 5;
    doc.line(leftMargin, yPos, rightMargin, yPos);

    yPos += 8;
    setDocFont(true);
    doc.setFontSize(12);
    doc.text(labels.total, leftMargin, yPos);
    doc.text(`RS. ${invoice.total.toLocaleString('en-IN')}/-`, rightMargin, yPos, { align: 'right' });

    yPos += 10;
    doc.setFontSize(7);
    doc.text("COMPUTER GENERATED DOCUMENT", a4Width / 2, yPos, { align: 'center' });
};


const generateSavePaperPDF = async (doc: jsPDF, invoice: Invoice, company: CompanyProfile, _customer: Customer | null, _qrCodeUrl?: string, _showPreviousBalance: boolean = false) => {
    // SavePaper - Optimized for vertical space
    const a4Width = 210;
    const leftMargin = 15;
    const rightMargin = a4Width - 15;
    let yPos = 15;

    const lang = company.invoiceSettings?.language;
    const labels = (invoice as any).translatedLabels || {
        billedTo: "Bill To:",
        // invoice: "TAX INVOICE", // Removed to save space
        date: "Date:",
        invoiceNo: "Inv #:",
        mode: "Mode:",
        desc: "Item",
        qty: "Qty",
        rate: "Rate",
        amount: "Amt",
        subtotal: "Subtotal:",
        total: "Total:",
        amtWords: "In Words:",
        scanToPay: "Scan to Pay:"
    };

    const setDocFont = (bold = false) => {
        doc.setFont(getFont(lang, "helvetica"), bold ? "bold" : "normal");
    };

    const safeCompany = {
        name: company.name || 'Company Name',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || ''
    };

    // --- Compact Header ---
    // Left: Invoice No
    // Center: Company
    // Right: Date & Mode

    const midX = a4Width / 2;

    // Company (Center)
    setDocFont(true);
    doc.setFontSize(16);
    doc.text(safeCompany.name, midX, yPos, { align: "center" });

    // QR Code (Left)
    if (_qrCodeUrl && company.upiId && invoice.total > 0) {
        const qrSize = 19;
        doc.addImage(_qrCodeUrl, 'PNG', leftMargin, yPos - 8, qrSize, qrSize);
    } else {
        // Fallback text if no QR
        doc.setFontSize(10);
        doc.text(labels.invoiceNo, leftMargin, yPos);
    }

    // Date (Right)
    doc.setFontSize(10);
    doc.text(`${labels.date} ${formatDate(invoice.date)}`, rightMargin, yPos, { align: 'right' });

    yPos += 5;

    // Company Details (Center)
    setDocFont(false);
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(safeCompany.address, midX, yPos, { align: "center" });

    // Mode (Right)
    doc.setTextColor(0);
    doc.setFontSize(10);
    const modeText = invoice.status === 'PAID' ? 'Cash' : 'Credit';
    doc.text(`${labels.mode} ${modeText}`, rightMargin, yPos, { align: 'right' });

    // Invoice # (Right - moved from left)
    const invLabel = labels.invoiceNo || "Inv #:";
    doc.text(`${invLabel} ${invoice.invoiceNumber || '-'}`, rightMargin, yPos + 5, { align: 'right' });

    yPos += 4;
    doc.setTextColor(80);
    doc.text(`Ph: ${safeCompany.phone}`, midX, yPos, { align: "center" });

    // GSTIN (if exists)
    if (invoice.gstEnabled && (company.gstin || (company as any).gst)) {
        yPos += 4;
        setDocFont(true);
        doc.setTextColor(34, 197, 94);
        const gstin = company.gstin || (company as any).gst || '';
        doc.text(`GSTIN: ${gstin}`, midX, yPos, { align: "center" });
        doc.setTextColor(0);
    }

    yPos += 4;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 6;

    // Customer Name (Center Prominent) - replacing Tax Invoice label
    setDocFont(true);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(invoice.customerName || 'Customer', midX, yPos, { align: "center" });

    if (invoice.customerAddress) {
        yPos += 4;
        setDocFont(false);
        doc.setFontSize(9);
        doc.text(invoice.customerAddress, midX, yPos, { align: "center" });
    }

    yPos += 8;

    // --- Compact Table ---
    doc.setFillColor(245, 247, 250);
    doc.rect(leftMargin, yPos, rightMargin - leftMargin, 6, 'F'); // Smaller header
    setDocFont(true);
    doc.setFontSize(8);
    doc.setTextColor(60);

    const colX = {
        idx: leftMargin + 2,
        desc: leftMargin + 10,
        qty: rightMargin - 60,
        rate: rightMargin - 40,
        amount: rightMargin - 2
    };

    doc.text("#", colX.idx, yPos + 4);
    doc.text(labels.desc, colX.desc, yPos + 4);
    doc.text(labels.qty, colX.qty, yPos + 4, { align: "right" });
    doc.text(labels.rate, colX.rate, yPos + 4, { align: "right" });
    doc.text(labels.amount, colX.amount, yPos + 4, { align: "right" });

    yPos += 8;

    setDocFont(false);
    doc.setTextColor(0);
    doc.setFontSize(9);

    const rowHeight = 6; // Reduced row height
    const pageHeight = doc.internal.pageSize.getHeight();

    invoice.items.forEach((item, i) => {
        if (yPos > pageHeight - 25) { // Smaller margin
            doc.addPage();
            yPos = 15;
        }

        doc.text(`${i + 1}`, colX.idx, yPos + 4);
        doc.text(item.description.substring(0, 35) || '-', colX.desc, yPos + 4); // Limit desc length
        doc.text((item.quantity || 0).toString(), colX.qty, yPos + 4, { align: "right" });
        doc.text(item.rate.toLocaleString('en-IN'), colX.rate, yPos + 4, { align: "right" });

        setDocFont(true);
        const amountWithGST = (item.totalAmount || item.baseAmount) || 0;
        doc.text(amountWithGST.toLocaleString('en-IN', { minimumFractionDigits: 2 }), colX.amount, yPos + 4, { align: "right" });
        setDocFont(false);

        doc.setDrawColor(240); // Lighter line
        doc.line(leftMargin, yPos + rowHeight, rightMargin, yPos + rowHeight);
        yPos += rowHeight;
    });

    yPos += 4;

    // Totals (Inline to save space)
    const midPage = a4Width / 2;

    // Amount Word (Left)
    const amountWords = invoice.totalInWords || numberToWords(_showPreviousBalance && invoice.previousBalance ? (invoice.total + invoice.previousBalance) : invoice.total);
    doc.setFontSize(8);
    setDocFont(true);
    doc.text(`${labels.amtWords} ${amountWords}`, leftMargin, yPos + 4, { maxWidth: midPage - leftMargin });

    // Total Stats (Right)
    const totalQty = invoice.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    setDocFont(true);
    doc.setFontSize(8);
    doc.text(`Total Qty: ${totalQty}`, colX.qty, yPos + 4, { align: 'right' });
    doc.setFontSize(10);
    doc.text(`${labels.total} Rs. ${invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightMargin, yPos + 4, { align: 'right' });

    if (_showPreviousBalance && invoice.previousBalance && invoice.previousBalance > 0) {
        yPos += 5;
        doc.setFontSize(9);
        doc.setTextColor(239, 68, 68);
        doc.text(`Grand Total: Rs. ${(invoice.total + invoice.previousBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightMargin, yPos + 4, { align: 'right' });
        doc.setTextColor(0);
    }

    // QR Code Removed from Footer (Moved to Header)
};


export const InvoicePdfService = {
    generatePDF: async (invoice: Invoice, company: CompanyProfile, customer: Customer | null, qrCodeUrl?: string, showPreviousBalance: boolean = false, shouldShare: boolean = true): Promise<string> => {
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Handle Translation if needed
            // Handle Translation if needed
            let language = company.invoiceSettings?.language || 'English';
            let processedInvoice = invoice;

            if (language !== 'English') {
                if (AIService.isConfigured()) {
                    try {
                        processedInvoice = await AIService.translateInvoiceData(invoice, language as any);
                    } catch (e) {
                        console.warn("Translation failed", e);
                    }
                }

                // Always load font for Hindi/Hinglish
                if (language === 'Hindi' || language === 'Hinglish') {
                    const fontLoaded = await loadHindiFont(doc);
                    if (!fontLoaded) {
                        console.warn("Hindi font failed to load. Falling back to English.");
                        language = 'English';
                    }
                }
            }

            // Create a temporary company profile with the resolved language
            // This ensures getFont uses the correct logic (Devanagari if loaded, otherwise standard)
            const safeCompany = {
                ...company,
                invoiceSettings: {
                    ...company.invoiceSettings,
                    language: language as any
                }
            } as CompanyProfile;

            const format = company.invoiceSettings?.format ||
                ((company as any).invoiceTemplate?.toUpperCase() as InvoiceFormat) ||
                InvoiceFormat.DEFAULT;

            switch (format) {
                case InvoiceFormat.MODERN:
                case InvoiceFormat.PROFESSIONAL: // Map similar
                    await generateModernPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.MINIMAL:
                case InvoiceFormat.ELEGANT:
                    await generateMinimalPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.DESI_BILL_BOOK:
                    await generateDesiPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.KACCHI_BILL_BOOK:
                    await generateKacchiPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.TALLY_PRIME_STYLE:
                case InvoiceFormat.COMPACT:
                    await generateTallyPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.RETRO:
                case InvoiceFormat.BOLD: // Map Bold to Retro for now or Default
                    await generateRetroPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.SAVE_PAPER:
                    await generateSavePaperPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;

                case InvoiceFormat.DEFAULT:
                default:
                    await generateDefaultPDF(doc, processedInvoice, safeCompany, customer, qrCodeUrl, showPreviousBalance);
                    break;
            }

            // --- BRANDED FOOTER WATERMARK ---
            addBrandedFooter(doc, { showDisclaimer: true });

            // Save/Share Logic (Unified)
            const fileName = `Invoice-${invoice.invoiceNumber}.pdf`;
            if (Capacitor.isNativePlatform()) {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const cacheResult = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });

                if (shouldShare) {
                    await Share.share({
                        title: fileName,
                        files: [cacheResult.uri],
                        dialogTitle: 'Save or Share PDF...'
                    });
                }
                return cacheResult.uri;
            } else {
                if (shouldShare) {
                    doc.save(fileName);
                }
                return ''; // No path on web
            }
        } catch (error) {
            console.error("PDF Generation Error:", error);
            throw error;
        }
    },

    generateReceiptPDF: async (payment: any, company: CompanyProfile, customer: Customer | null, shouldShare = true) => {
        try {
            const doc = new jsPDF({
                orientation: 'landscape', // Use Landscape for Receipts usually, or stick to Portrait but half page. Let's do A5 Landscape style on A4 or just nice Portrait. User's screenshot was Portrait. Let's make it a nice Portrait Center Bill.
                unit: 'mm',
                format: 'a4'
            });

            const lang = company.invoiceSettings?.language;
            if (lang === 'Hindi' || lang === 'Hinglish') {
                await loadHindiFont(doc);
            }

            const setDocFont = (bold = false, size = 10, color = [0, 0, 0] as [number, number, number]) => {
                doc.setFont(getFont(lang, "helvetica"), bold ? "bold" : "normal");
                doc.setFontSize(size);
                doc.setTextColor(color[0], color[1], color[2]);
            };

            const primaryColor = [30, 64, 175]; // Blue 800
            const secondaryColor = [100, 116, 139]; // Slate 500
            // Canvas Setup
            const pageWidth = doc.internal.pageSize.getWidth();
            // const pageHeight = doc.internal.pageSize.getHeight(); // Unused
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);
            let yPos = 20;

            // 1. Header Background
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, 0, pageWidth, 40, 'F');

            // 2. Title & Company (White Text)
            yPos = 15;
            setDocFont(true, 24, [255, 255, 255]);
            doc.text("PAYMENT RECEIPT", pageWidth - margin, 25, { align: "right" });

            setDocFont(true, 16, [255, 255, 255]);
            doc.text(company.name || "Company Name", margin, 20);

            setDocFont(false, 9, [226, 232, 240]);
            const addressText = (company as any).city ? `${company.address}, ${(company as any).city}` : company.address;
            const companyDetails = [
                addressText,
                `Phone: ${company.phone}`,
                company.email
            ].filter(Boolean).join(" | ");

            doc.text(companyDetails, margin, 28, { maxWidth: 120 });

            yPos = 55;

            // 3. Receipt Info Grid (Top Section)
            const gridY = yPos;

            // Left Column: Receipt Details
            setDocFont(false, 9, secondaryColor as [number, number, number]);
            doc.text("Receipt No", margin, gridY);
            setDocFont(true, 11, [15, 23, 42]);
            doc.text(payment.id.substring(0, 8).toUpperCase(), margin, gridY + 6);

            setDocFont(false, 9, secondaryColor as [number, number, number]);
            doc.text("Date", margin + 50, gridY);
            setDocFont(true, 11, [15, 23, 42]);
            doc.text(formatDate(payment.date), margin + 50, gridY + 6);

            setDocFont(false, 9, secondaryColor as [number, number, number]);
            doc.text("Payment Mode", margin + 100, gridY);
            setDocFont(true, 11, [15, 23, 42]);
            doc.text((payment.mode || 'CASH').toUpperCase(), margin + 100, gridY + 6);

            yPos += 25;

            // 4. Main Content Box (Received From)
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(252, 253, 255);
            doc.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'FD');

            setDocFont(true, 9, secondaryColor as [number, number, number]);
            doc.text("RECEIVED WITH THANKS FROM", margin + 6, yPos + 10);

            setDocFont(true, 14, [15, 23, 42]);
            doc.text(customer?.company || customer?.name || "Unknown Party", margin + 6, yPos + 22);

            // Contact info if available
            if (customer?.phone) {
                setDocFont(false, 9, secondaryColor as [number, number, number]);
                doc.text(`Contact: ${customer.phone}`, margin + 6, yPos + 29);
            }

            yPos += 45;

            // 5. Amount Section (Highlight)
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.roundedRect(margin, yPos, contentWidth, 40, 3, 3, 'F');

            // Amount Label
            setDocFont(true, 9, [255, 255, 255]);
            doc.text("AMOUNT RECEIVED", margin + 10, yPos + 12);

            // Big Amount
            doc.setFontSize(28);
            doc.text(`Rs. ${payment.amount.toLocaleString()}/-`, margin + 10, yPos + 28);

            // Amount in Words (Bottom of blue box)
            doc.setFontSize(9);
            const amtWords = numberToWords(payment.amount);
            doc.text(amtWords, margin + 10, yPos + 38, { maxWidth: contentWidth - 20 });

            // 5.1 Pattern/Decoration
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.5);
            doc.circle(pageWidth - margin - 20, yPos + 20, 30, 'S');
            doc.circle(pageWidth - margin - 20, yPos + 20, 25, 'S');

            yPos += 55;

            // 6. Reference & Note
            if (payment.reference || payment.note) {
                if (payment.reference) {
                    setDocFont(false, 9, secondaryColor as [number, number, number]);
                    doc.text("Reference No:", margin, yPos);
                    setDocFont(true, 10, [15, 23, 42]);
                    doc.text(payment.reference, margin + 25, yPos);
                    yPos += 8;
                }
                if (payment.note) {
                    setDocFont(false, 9, secondaryColor as [number, number, number]);
                    doc.text("Note:", margin, yPos);
                    setDocFont(false, 10, [15, 23, 42]);
                    doc.text(payment.note, margin + 25, yPos, { maxWidth: contentWidth - 30 });
                    yPos += 15;
                }
            } else {
                yPos += 10;
            }

            yPos += 20;

            // 7. Footer / Signatory
            const footerY = yPos;

            // Line
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(pageWidth - margin - 60, footerY, pageWidth - margin, footerY);

            setDocFont(true, 9, [15, 23, 42]);
            doc.text("Authorized Signatory", pageWidth - margin - 30, footerY + 5, { align: "center" });

            setDocFont(false, 8, secondaryColor as [number, number, number]);
            doc.text(company.name, pageWidth - margin - 30, footerY + 10, { align: "center" });

            // 8. Bottom Branding
            addBrandedFooter(doc, { showDisclaimer: false });

            const fileName = `Receipt-${payment.date}-${payment.amount}.pdf`;

            if (Capacitor.isNativePlatform()) {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const cacheResult = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });

                if (shouldShare) {
                    await Share.share({
                        title: "Payment Receipt",
                        files: [cacheResult.uri],
                        dialogTitle: 'Share Receipt...'
                    });
                }
                return cacheResult.uri;
            } else {
                if (shouldShare) {
                    doc.save(fileName);
                }
                return '';
            }
        } catch (error) {
            console.error("Receipt PDF Error:", error);
            throw error;
        }
    }
};
