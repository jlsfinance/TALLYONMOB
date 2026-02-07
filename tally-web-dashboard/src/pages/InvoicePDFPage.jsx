import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/Material3.css';

export default function InvoicePDFPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const printRef = useRef();

    const [invoice, setInvoice] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [template, setTemplate] = useState('professional');

    useEffect(() => {
        if (id && selectedCompany?.id) {
            loadInvoice();
        }
    }, [id, selectedCompany]);

    const loadInvoice = async () => {
        setLoading(true);
        try {
            let { data: voucherData } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', id)
                .single();

            if (!voucherData) {
                const { data: fallback } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('voucher_id', id)
                    .single();
                voucherData = fallback;
            }

            if (voucherData) {
                // Fetch stock entries first to calculate GST from items
                const { data: stockEntries } = await supabase
                    .from('voucher_stock_entries')
                    .select('*')
                    .eq('voucher_id', voucherData.id);

                const { data: stockItems } = await supabase
                    .from('stock_items')
                    .select('name, hsn_code, unit, gst_rate')
                    .eq('company_id', voucherData.company_id);

                const stockLookup = {};
                stockItems?.forEach(item => {
                    stockLookup[item.name] = item;
                });

                // Enrich items with GST info
                const enrichedItems = (stockEntries || []).map(item => {
                    const master = stockLookup[item.item_name || item.stock_item_name] || {};
                    const gstRate = Number(item.gst_rate) || Number(master.gst_rate) || 0;
                    const amount = Number(item.amount) || 0;
                    const taxable = amount; // Item amount is typically taxable

                    return {
                        ...item,
                        stock_item_name: item.item_name || item.stock_item_name || 'Item',
                        hsn_code: item.hsn_code || master.hsn_code || '',
                        unit: item.unit || master.unit || '',
                        gst_rate: gstRate,
                        quantity: Number(item.quantity) || Number(item.billed_qty) || 0,
                        rate: Number(item.rate) || Number(item.unit_price) || 0,
                        amount: amount,
                        discount: Number(item.discount) || 0,
                        taxable_value: taxable
                    };
                });

                setItems(enrichedItems);

                // Fetch ledger entries to get GST amounts (CGST, SGST, IGST are posted as ledgers in Tally)
                const { data: ledgerEntries } = await supabase
                    .from('voucher_ledger_entries')
                    .select('ledger_name, amount')
                    .eq('voucher_id', voucherData.id);

                console.log('Ledger entries:', ledgerEntries);

                // Calculate GST from items if not in voucher data
                let cgstAmount = Number(voucherData.cgst_amount) || 0;
                let sgstAmount = Number(voucherData.sgst_amount) || 0;
                let igstAmount = Number(voucherData.igst_amount) || 0;

                // Extract GST from ledger entries (Tally posts GST to separate ledgers)
                if (cgstAmount === 0 && sgstAmount === 0 && igstAmount === 0 && ledgerEntries) {
                    ledgerEntries.forEach(entry => {
                        const ledgerName = (entry.ledger_name || '').toUpperCase();
                        const amount = Math.abs(Number(entry.amount) || 0);

                        if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL GST')) {
                            cgstAmount += amount;
                        } else if (ledgerName.includes('SGST') || ledgerName.includes('STATE GST') || ledgerName.includes('UTGST')) {
                            sgstAmount += amount;
                        } else if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED GST')) {
                            igstAmount += amount;
                        }
                    });

                    console.log('GST from ledgers:', { cgstAmount, sgstAmount, igstAmount });
                }

                // If still no GST from ledgers, try calculating from items
                if (cgstAmount === 0 && sgstAmount === 0 && igstAmount === 0) {
                    const companyState = selectedCompany?.state || '';
                    const partyState = voucherData.party_state || voucherData.place_of_supply || '';
                    const isIGST = companyState && partyState && companyState !== partyState;

                    let totalGST = 0;
                    let hasGSTRates = false;

                    enrichedItems.forEach(item => {
                        const itemAmount = Number(item.amount) || 0;
                        const gstRate = Number(item.gst_rate) || 0;
                        if (gstRate > 0) {
                            hasGSTRates = true;
                            const gstAmount = (itemAmount * gstRate) / (100 + gstRate);
                            totalGST += gstAmount;
                        }
                    });

                    console.log('GST from items:', { hasGSTRates, totalGST });

                    // If no GST from items, check voucher totals
                    if (!hasGSTRates || totalGST === 0) {
                        const grandTotal = Math.abs(Number(voucherData.grand_total) || 0);
                        const taxableValue = Math.abs(Number(voucherData.taxable_value) || 0);
                        const totalAmount = Math.abs(Number(voucherData.total_amount) || 0);

                        if (grandTotal > taxableValue && taxableValue > 0) {
                            totalGST = grandTotal - taxableValue;
                        } else if (grandTotal > totalAmount && totalAmount > 0) {
                            totalGST = grandTotal - totalAmount;
                        }
                        console.log('Fallback GST:', { grandTotal, taxableValue, totalAmount, totalGST });
                    }

                    if (totalGST > 0) {
                        if (isIGST) {
                            igstAmount = Math.round(totalGST * 100) / 100;
                        } else {
                            cgstAmount = Math.round((totalGST / 2) * 100) / 100;
                            sgstAmount = Math.round((totalGST / 2) * 100) / 100;
                        }
                    }
                }

                console.log('Final GST:', { cgstAmount, sgstAmount, igstAmount });

                // Calculate taxable amount (excluding GST)
                const totalGSTAmount = cgstAmount + sgstAmount + igstAmount;
                const netAmount = Math.abs(Number(voucherData.grand_total) || Number(voucherData.total_amount) || 0);
                const taxableAmount = totalGSTAmount > 0 ? (netAmount - totalGSTAmount) : Math.abs(Number(voucherData.taxable_value) || netAmount);

                const sale = {
                    ...voucherData,
                    invoice_number: voucherData.voucher_number,
                    invoice_date: voucherData.voucher_date,
                    party_ledger_name: voucherData.party_name,
                    party_gstin: voucherData.party_gstin || '',
                    party_address: voucherData.party_address || '',
                    party_state: voucherData.party_state || voucherData.place_of_supply || '',
                    place_of_supply: voucherData.place_of_supply || '',
                    net_amount: netAmount,
                    taxable_amount: taxableAmount,
                    cgst_amount: cgstAmount,
                    sgst_amount: sgstAmount,
                    igst_amount: igstAmount,
                    round_off: Number(voucherData.round_off) || 0,
                    voucher_type: voucherData.voucher_type || 'Sales'
                };
                setInvoice(sale);
            }
        } catch (error) {
            console.error('Error loading invoice:', error);
        }
        setLoading(false);
    };

    // Smart column detection
    const columnVisibility = useMemo(() => {
        const hasHSN = items.some(i => i.hsn_code && i.hsn_code !== '-');
        const hasGST = items.some(i => i.gst_rate > 0) || invoice?.cgst_amount > 0 || invoice?.igst_amount > 0;
        const hasDiscount = items.some(i => i.discount > 0);
        const hasUnit = items.some(i => i.unit);
        const isIGST = invoice?.igst_amount > 0;
        return { hasHSN, hasGST, hasDiscount, hasUnit, isIGST };
    }, [items, invoice]);

    // HSN Summary calculation - distribute invoice GST proportionally
    const hsnSummary = useMemo(() => {
        const summary = {};
        let totalTaxable = 0;

        // First pass: calculate taxable amounts per HSN
        items.forEach(item => {
            const hsn = item.hsn_code || 'NIL';
            const gstRate = item.gst_rate || 0;
            const key = `${hsn}_${gstRate}`;
            if (!summary[key]) {
                summary[key] = { hsn, gst_rate: gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
            }
            const taxable = item.amount || 0;
            summary[key].taxable += taxable;
            totalTaxable += taxable;
        });

        // Second pass: distribute GST proportionally
        const invoiceCGST = invoice?.cgst_amount || 0;
        const invoiceSGST = invoice?.sgst_amount || 0;
        const invoiceIGST = invoice?.igst_amount || 0;
        const totalInvoiceGST = invoiceCGST + invoiceSGST + invoiceIGST;

        Object.values(summary).forEach(row => {
            const proportion = totalTaxable > 0 ? row.taxable / totalTaxable : 0;

            // If items have GST rates, use them; otherwise distribute invoice GST
            if (row.gst_rate > 0) {
                if (columnVisibility.isIGST) {
                    row.igst = (row.taxable * row.gst_rate) / 100;
                } else {
                    row.cgst = (row.taxable * row.gst_rate) / 200;
                    row.sgst = (row.taxable * row.gst_rate) / 200;
                }
            } else if (totalInvoiceGST > 0) {
                // Distribute invoice GST proportionally
                row.cgst = Math.round(invoiceCGST * proportion * 100) / 100;
                row.sgst = Math.round(invoiceSGST * proportion * 100) / 100;
                row.igst = Math.round(invoiceIGST * proportion * 100) / 100;
                // Calculate effective GST rate
                const itemGST = row.cgst + row.sgst + row.igst;
                row.gst_rate = row.taxable > 0 ? Math.round((itemGST / row.taxable) * 100 * 10) / 10 : 0;
            }

            row.total = row.taxable + row.cgst + row.sgst + row.igst;
        });

        return Object.values(summary);
    }, [items, invoice, columnVisibility.isIGST]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatNumber = (num) => {
        return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
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
        num = Math.round(num);

        const crore = Math.floor(num / 10000000);
        const lakh = Math.floor((num % 10000000) / 100000);
        const thousand = Math.floor((num % 100000) / 1000);
        const hundred = Math.floor((num % 1000) / 100);
        const remainder = Math.floor(num % 100);

        let words = '';
        if (crore > 0) words += `${convertLessThanHundred(crore)} Crore `;
        if (lakh > 0) words += `${convertLessThanHundred(lakh)} Lakh `;
        if (thousand > 0) words += `${convertLessThanHundred(thousand)} Thousand `;
        if (hundred > 0) words += `${ones[hundred]} Hundred `;
        if (remainder > 0) words += convertLessThanHundred(remainder);

        words += ' Rupees Only';
        return words.trim();

        function convertLessThanHundred(n) {
            if (n < 20) return ones[n];
            return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        }
    };

    // Generate Professional PDF using jsPDF
    const handleDownloadPDF = () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 10;
        let y = 15;

        // Colors
        const primaryColor = [30, 58, 95]; // Dark blue
        const accentColor = [0, 128, 128]; // Teal
        const lightGray = [245, 245, 245];

        // Header Background
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 40, 'F');

        // Company Name
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(selectedCompany?.name || 'Company Name', pageWidth / 2, 15, { align: 'center' });

        // Company Address
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(selectedCompany?.address || '', pageWidth / 2, 22, { align: 'center' });

        // GSTIN & Phone
        doc.setFontSize(8);
        const gstPhone = `GSTIN: ${selectedCompany?.gstin || 'N/A'} | Phone: ${selectedCompany?.phone || 'N/A'}`;
        doc.text(gstPhone, pageWidth / 2, 28, { align: 'center' });

        // Email
        if (selectedCompany?.email) {
            doc.text(`Email: ${selectedCompany.email}`, pageWidth / 2, 34, { align: 'center' });
        }

        y = 48;

        // TAX INVOICE Title
        doc.setFillColor(255, 193, 7); // Amber
        doc.rect(margin, y - 5, pageWidth - margin * 2, 10, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('TAX INVOICE', pageWidth / 2, y + 2, { align: 'center' });

        y += 12;

        // Invoice Details & Party Info (Two columns)
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(margin, y, (pageWidth - margin * 2) / 2 - 2, 35);
        doc.rect(margin + (pageWidth - margin * 2) / 2 + 2, y, (pageWidth - margin * 2) / 2 - 2, 35);

        // Left Column - Invoice Details
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        doc.text('INVOICE DETAILS', margin + 3, y + 5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(`Invoice No: ${invoice?.invoice_number || ''}`, margin + 3, y + 12);
        doc.text(`Date: ${formatDate(invoice?.invoice_date)}`, margin + 3, y + 18);
        doc.text(`Mode: ${invoice?.voucher_type || 'Sales'}`, margin + 3, y + 24);
        if (invoice?.place_of_supply) {
            doc.text(`Place of Supply: ${invoice.place_of_supply}`, margin + 3, y + 30);
        }

        // Right Column - Bill To
        const rightX = margin + (pageWidth - margin * 2) / 2 + 5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(8);
        doc.text('BILL TO', rightX, y + 5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.text(invoice?.party_ledger_name || 'Customer', rightX, y + 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        if (invoice?.party_address) {
            const addrLines = doc.splitTextToSize(invoice.party_address, 80);
            doc.text(addrLines, rightX, y + 18);
        }
        if (invoice?.party_gstin) {
            doc.text(`GSTIN: ${invoice.party_gstin}`, rightX, y + 28);
        }
        if (invoice?.party_state) {
            doc.text(`State: ${invoice.party_state}`, rightX, y + 33);
        }

        y += 42;

        // Items Table
        const tableColumns = ['#', 'Item Description'];
        const columnStyles = {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 'auto' }
        };
        let colIndex = 2;

        if (columnVisibility.hasHSN) {
            tableColumns.push('HSN');
            columnStyles[colIndex] = { cellWidth: 20, halign: 'center' };
            colIndex++;
        }

        tableColumns.push('Qty');
        columnStyles[colIndex] = { cellWidth: 15, halign: 'center' };
        colIndex++;

        if (columnVisibility.hasUnit) {
            tableColumns.push('Unit');
            columnStyles[colIndex] = { cellWidth: 12, halign: 'center' };
            colIndex++;
        }

        tableColumns.push('Rate');
        columnStyles[colIndex] = { cellWidth: 22, halign: 'right' };
        colIndex++;

        if (columnVisibility.hasDiscount) {
            tableColumns.push('Disc');
            columnStyles[colIndex] = { cellWidth: 15, halign: 'right' };
            colIndex++;
        }

        if (columnVisibility.hasGST) {
            tableColumns.push('GST%');
            columnStyles[colIndex] = { cellWidth: 15, halign: 'center' };
            colIndex++;
        }

        tableColumns.push('Amount');
        columnStyles[colIndex] = { cellWidth: 25, halign: 'right' };

        // Prepare table data
        const tableData = items.map((item, idx) => {
            const row = [(idx + 1).toString(), item.stock_item_name];
            if (columnVisibility.hasHSN) row.push(item.hsn_code || '-');
            row.push(item.quantity.toString());
            if (columnVisibility.hasUnit) row.push(item.unit || '');
            row.push(formatNumber(item.rate));
            if (columnVisibility.hasDiscount) row.push(formatNumber(item.discount));
            if (columnVisibility.hasGST) row.push(item.gst_rate ? `${item.gst_rate}%` : '-');
            row.push(formatNumber(item.amount));
            return row;
        });

        // If no items, show placeholder
        if (tableData.length === 0) {
            tableData.push(['1', 'As per details', '', '1', '', formatNumber(invoice?.taxable_amount || 0), formatNumber(invoice?.taxable_amount || 0)]);
        }

        autoTable(doc, {
            startY: y,
            head: [tableColumns],
            body: tableData,
            theme: 'grid',
            headStyles: {
                fillColor: primaryColor,
                textColor: 255,
                fontSize: 8,
                fontStyle: 'bold',
                halign: 'center'
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [30, 30, 30]
            },
            columnStyles: columnStyles,
            margin: { left: margin, right: margin },
            tableWidth: 'auto'
        });

        y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 5 : y + 60;

        // Two column layout: Amount in Words + Totals
        const totalsStartX = pageWidth - margin - 80;

        // Amount in Words (Left side)
        doc.setFillColor(...lightGray);
        doc.rect(margin, y, totalsStartX - margin - 5, 20, 'F');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'bold');
        doc.text('AMOUNT IN WORDS', margin + 3, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        const wordsLines = doc.splitTextToSize(numberToWords(invoice?.net_amount || 0), totalsStartX - margin - 15);
        doc.text(wordsLines, margin + 3, y + 11);

        // Totals (Right side)
        let totalsY = y;
        const drawTotalRow = (label, value, isBold = false, highlight = false) => {
            if (highlight) {
                doc.setFillColor(...primaryColor);
                doc.rect(totalsStartX, totalsY, 80, 7, 'F');
                doc.setTextColor(255, 255, 255);
            } else {
                doc.setTextColor(0, 0, 0);
            }
            doc.setFontSize(8);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.text(label, totalsStartX + 3, totalsY + 5);
            doc.text(formatNumber(value), totalsStartX + 77, totalsY + 5, { align: 'right' });
            totalsY += 7;
        };

        drawTotalRow('Taxable Amount', invoice?.taxable_amount || 0);
        if (invoice?.cgst_amount > 0) drawTotalRow('CGST', invoice.cgst_amount);
        if (invoice?.sgst_amount > 0) drawTotalRow('SGST', invoice.sgst_amount);
        if (invoice?.igst_amount > 0) drawTotalRow('IGST', invoice.igst_amount);
        if (invoice?.round_off) drawTotalRow('Round Off', invoice.round_off);
        drawTotalRow('GRAND TOTAL', invoice?.net_amount || 0, true, true);

        y = Math.max(y + 25, totalsY + 5);

        // GST Summary Table (if applicable)
        if (columnVisibility.hasGST && hsnSummary.length > 0 && hsnSummary[0].hsn !== 'NIL') {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('GST SUMMARY', margin, y + 5);

            const gstHeaders = columnVisibility.isIGST
                ? ['HSN', 'Taxable Value', 'IGST Rate', 'IGST Amt', 'Total']
                : ['HSN', 'Taxable Value', 'CGST Rate', 'CGST Amt', 'SGST Rate', 'SGST Amt', 'Total'];

            const gstData = hsnSummary.map(row => {
                if (columnVisibility.isIGST) {
                    return [
                        row.hsn,
                        formatNumber(row.taxable),
                        `${row.gst_rate}%`,
                        formatNumber(row.igst),
                        formatNumber(row.total)
                    ];
                } else {
                    return [
                        row.hsn,
                        formatNumber(row.taxable),
                        `${row.gst_rate / 2}%`,
                        formatNumber(row.cgst),
                        `${row.gst_rate / 2}%`,
                        formatNumber(row.sgst),
                        formatNumber(row.total)
                    ];
                }
            });

            autoTable(doc, {
                startY: y + 8,
                head: [gstHeaders],
                body: gstData,
                theme: 'grid',
                headStyles: {
                    fillColor: accentColor,
                    textColor: 255,
                    fontSize: 7,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    fontSize: 7,
                    halign: 'center'
                },
                margin: { left: margin, right: margin },
                tableWidth: 'auto'
            });

            y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 5 : y + 30;
        }

        // Bank Details & Signature (Footer)
        y = Math.max(y, 220);

        // Bank Details
        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, y, 90, 30);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        doc.text('BANK DETAILS', margin + 3, y + 5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.text(`Bank: ${selectedCompany?.bank_name || 'N/A'}`, margin + 3, y + 12);
        doc.text(`A/C No: ${selectedCompany?.bank_account || 'N/A'}`, margin + 3, y + 18);
        doc.text(`IFSC: ${selectedCompany?.bank_ifsc || 'N/A'}`, margin + 3, y + 24);

        // Authorized Signatory
        doc.rect(pageWidth - margin - 70, y, 70, 30);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`For ${selectedCompany?.name || ''}`, pageWidth - margin - 67, y + 6);
        doc.setDrawColor(0, 0, 0);
        doc.line(pageWidth - margin - 60, y + 22, pageWidth - margin - 10, y + 22);
        doc.setFontSize(7);
        doc.text('Authorized Signatory', pageWidth - margin - 50, y + 27);

        // Footer
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text('This is a computer generated invoice.', pageWidth / 2, 285, { align: 'center' });
        doc.text('Powered by JLS BillBook', pageWidth / 2, 290, { align: 'center' });

        // Save PDF
        doc.save(`Invoice_${invoice?.invoice_number || 'Draft'}.pdf`);
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
${invoice?.cgst_amount > 0 ? `CGST: ${formatCurrency(invoice?.cgst_amount)}` : ''}
${invoice?.sgst_amount > 0 ? `SGST: ${formatCurrency(invoice?.sgst_amount)}` : ''}
${invoice?.igst_amount > 0 ? `IGST: ${formatCurrency(invoice?.igst_amount)}` : ''}
━━━━━━━━━━━━━━━━━━━
*TOTAL: ${formatCurrency(invoice?.net_amount)}*
━━━━━━━━━━━━━━━━━━━

Thank you for your business! 🙏
Generated via JLS BillBook`;

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
                    <p className="text-sm text-gray-500">Loading Invoice...</p>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return <div className="page-m3 flex justify-center items-center"><p>Invoice not found</p></div>;
    }

    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

    return (
        <div className="page-m3">
            {/* Controls */}
            <div className="page-m3__action-bar" style={{ marginBottom: '24px' }}>
                <button onClick={() => navigate(-1)} className="page-m3__back-link">
                    <span>←</span> Back
                </button>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={handleDownloadPDF}
                        className="page-m3__button page-m3__button--primary"
                        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 100%)' }}
                    >
                        📄 Download PDF
                    </button>
                    <button
                        onClick={handleWhatsAppShare}
                        className="page-m3__button page-m3__button--secondary"
                        style={{ background: '#25D366', color: 'white', border: 'none' }}
                    >
                        📱 WhatsApp
                    </button>
                </div>
            </div>

            {/* Invoice Preview - Clean White Design */}
            <div ref={printRef} className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200 max-w-3xl mx-auto text-gray-800" style={{ fontSize: '12px' }}>

                {/* Header - Minimal ink usage */}
                <div className="border-b-2 border-gray-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">{selectedCompany?.name}</h1>
                            {selectedCompany?.address && (
                                <p className="text-[11px] text-gray-600 mt-0.5 max-w-xs">{selectedCompany.address}</p>
                            )}
                            <div className="flex flex-wrap gap-x-4 text-[10px] text-gray-500 mt-1">
                                {selectedCompany?.gstin && <span>GSTIN: <b className="text-gray-700">{selectedCompany.gstin}</b></span>}
                                {selectedCompany?.phone && <span>Ph: {selectedCompany.phone}</span>}
                                {selectedCompany?.email && <span>Email: {selectedCompany.email}</span>}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="border-2 border-gray-800 px-3 py-1">
                                <span className="font-bold text-sm">TAX INVOICE</span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">Original for Buyer</p>
                        </div>
                    </div>
                </div>

                {/* Invoice Details Row - Compact */}
                <div className="grid grid-cols-3 border-b border-gray-300 text-[11px]">
                    <div className="p-2 border-r border-gray-300">
                        <p className="text-gray-500">Invoice No.</p>
                        <p className="font-bold">{invoice.invoice_number}</p>
                    </div>
                    <div className="p-2 border-r border-gray-300">
                        <p className="text-gray-500">Date</p>
                        <p className="font-bold">{formatDate(invoice.invoice_date)}</p>
                    </div>
                    <div className="p-2">
                        <p className="text-gray-500">Mode</p>
                        <p className="font-bold">{invoice.voucher_type || 'Cash'}</p>
                    </div>
                </div>

                {/* Bill To */}
                <div className="p-3 border-b border-gray-300 bg-gray-50">
                    <div className="flex justify-between">
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase">Bill To / Ship To</p>
                            <p className="font-bold text-sm">{invoice.party_ledger_name}</p>
                            {invoice.party_address && <p className="text-[11px] text-gray-600 max-w-sm">{invoice.party_address}</p>}
                            {invoice.party_gstin && <p className="text-[10px] mt-0.5">GSTIN: <b>{invoice.party_gstin}</b></p>}
                            {invoice.party_state && <p className="text-[10px] text-gray-500">State: {invoice.party_state}</p>}
                        </div>
                        {invoice.place_of_supply && (
                            <div className="text-right text-[10px]">
                                <p className="text-gray-500">Place of Supply</p>
                                <p className="font-bold">{invoice.place_of_supply}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Items Table - Compact */}
                <table className="w-full text-[11px] border-collapse">
                    <thead>
                        <tr className="border-y border-gray-400 bg-gray-100">
                            <th className="px-1.5 py-1.5 text-left w-6 border-r border-gray-300">#</th>
                            <th className="px-1.5 py-1.5 text-left border-r border-gray-300">Description</th>
                            {columnVisibility.hasHSN && <th className="px-1.5 py-1.5 text-center w-16 border-r border-gray-300">HSN</th>}
                            {columnVisibility.hasGST && <th className="px-1.5 py-1.5 text-center w-12 border-r border-gray-300">GST%</th>}
                            <th className="px-1.5 py-1.5 text-center w-10 border-r border-gray-300">Qty</th>
                            {columnVisibility.hasUnit && <th className="px-1.5 py-1.5 text-center w-10 border-r border-gray-300">Unit</th>}
                            <th className="px-1.5 py-1.5 text-right w-16 border-r border-gray-300">Rate</th>
                            {columnVisibility.hasDiscount && <th className="px-1.5 py-1.5 text-right w-14 border-r border-gray-300">Disc</th>}
                            <th className="px-1.5 py-1.5 text-right w-20">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length > 0 ? items.map((item, idx) => {
                            // Get GST rate from hsnSummary for this item's HSN
                            const hsnData = hsnSummary.find(h => h.hsn === (item.hsn_code || 'NIL'));
                            const displayGstRate = item.gst_rate > 0 ? item.gst_rate : (hsnData?.gst_rate || 0);

                            return (
                                <tr key={idx} className="border-b border-gray-200">
                                    <td className="px-1.5 py-1 text-gray-500 border-r border-gray-200">{idx + 1}</td>
                                    <td className="px-1.5 py-1 border-r border-gray-200">{item.stock_item_name}</td>
                                    {columnVisibility.hasHSN && <td className="px-1.5 py-1 text-center font-mono text-[10px] border-r border-gray-200">{item.hsn_code || '-'}</td>}
                                    {columnVisibility.hasGST && <td className="px-1.5 py-1 text-center border-r border-gray-200">{displayGstRate > 0 ? `${displayGstRate}%` : '-'}</td>}
                                    <td className="px-1.5 py-1 text-center border-r border-gray-200">{item.quantity}</td>
                                    {columnVisibility.hasUnit && <td className="px-1.5 py-1 text-center text-gray-500 border-r border-gray-200">{item.unit || '-'}</td>}
                                    <td className="px-1.5 py-1 text-right border-r border-gray-200">{formatNumber(item.rate)}</td>
                                    {columnVisibility.hasDiscount && <td className="px-1.5 py-1 text-right border-r border-gray-200">{item.discount > 0 ? formatNumber(item.discount) : '-'}</td>}
                                    <td className="px-1.5 py-1 text-right font-medium">{formatNumber(item.amount)}</td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td className="px-1.5 py-1">1</td>
                                <td className="px-1.5 py-1">As per details</td>
                                <td className="px-1.5 py-1 text-center">-</td>
                                <td className="px-1.5 py-1 text-center">1</td>
                                <td className="px-1.5 py-1 text-right" colSpan={2}>{formatNumber(invoice.taxable_amount)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Summary - Two Column Compact */}
                <div className="grid grid-cols-2 border-t border-gray-400 text-[11px]">
                    {/* Left: In Words */}
                    <div className="p-2 border-r border-gray-300">
                        <p className="text-[9px] text-gray-500 uppercase">Amount in Words</p>
                        <p className="text-[10px] font-medium mt-0.5">{numberToWords(invoice.net_amount)}</p>
                        <p className="text-[10px] text-gray-500 mt-1">Total Qty: <b>{totalQty}</b></p>
                    </div>

                    {/* Right: Totals */}
                    <div>
                        <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                            <span>Taxable Amount</span>
                            <span>{formatCurrency(invoice.taxable_amount)}</span>
                        </div>
                        {invoice.cgst_amount > 0 && (
                            <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                                <span>CGST</span>
                                <span>{formatCurrency(invoice.cgst_amount)}</span>
                            </div>
                        )}
                        {invoice.sgst_amount > 0 && (
                            <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                                <span>SGST</span>
                                <span>{formatCurrency(invoice.sgst_amount)}</span>
                            </div>
                        )}
                        {invoice.igst_amount > 0 && (
                            <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                                <span>IGST</span>
                                <span>{formatCurrency(invoice.igst_amount)}</span>
                            </div>
                        )}
                        {invoice.round_off !== 0 && (
                            <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                                <span>Round Off</span>
                                <span>{formatCurrency(invoice.round_off)}</span>
                            </div>
                        )}
                        <div className="flex justify-between px-2 py-1.5 bg-gray-100 font-bold border-t border-gray-400">
                            <span>GRAND TOTAL</span>
                            <span>₹{formatNumber(invoice.net_amount)}</span>
                        </div>
                    </div>
                </div>

                {/* GST Summary (if applicable) - Compact */}
                {columnVisibility.hasGST && hsnSummary.length > 0 && hsnSummary[0].hsn !== 'NIL' && (
                    <div className="p-2 border-t border-gray-300 text-[10px]">
                        <p className="text-[9px] text-gray-500 uppercase mb-1">GST Summary</p>
                        <table className="w-full border border-gray-300">
                            <thead>
                                <tr className="bg-gray-100 border-b border-gray-300">
                                    <th className="px-1.5 py-1 text-left border-r border-gray-300">HSN</th>
                                    <th className="px-1.5 py-1 text-right border-r border-gray-300">Taxable</th>
                                    {columnVisibility.isIGST ? (
                                        <>
                                            <th className="px-1.5 py-1 text-center border-r border-gray-300">Rate</th>
                                            <th className="px-1.5 py-1 text-right border-r border-gray-300">IGST</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-1.5 py-1 text-center border-r border-gray-300">Rate</th>
                                            <th className="px-1.5 py-1 text-right border-r border-gray-300">CGST</th>
                                            <th className="px-1.5 py-1 text-right border-r border-gray-300">SGST</th>
                                        </>
                                    )}
                                    <th className="px-1.5 py-1 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hsnSummary.map((row, i) => (
                                    <tr key={i} className="border-b border-gray-200">
                                        <td className="px-1.5 py-1 font-mono border-r border-gray-200">{row.hsn}</td>
                                        <td className="px-1.5 py-1 text-right border-r border-gray-200">{formatNumber(row.taxable)}</td>
                                        {columnVisibility.isIGST ? (
                                            <>
                                                <td className="px-1.5 py-1 text-center border-r border-gray-200">{row.gst_rate}%</td>
                                                <td className="px-1.5 py-1 text-right border-r border-gray-200">{formatNumber(row.igst)}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-1.5 py-1 text-center border-r border-gray-200">{row.gst_rate / 2}%</td>
                                                <td className="px-1.5 py-1 text-right border-r border-gray-200">{formatNumber(row.cgst)}</td>
                                                <td className="px-1.5 py-1 text-right border-r border-gray-200">{formatNumber(row.sgst)}</td>
                                            </>
                                        )}
                                        <td className="px-1.5 py-1 text-right font-medium">{formatNumber(row.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer: Bank Details & Signature - Compact */}
                <div className="grid grid-cols-2 border-t border-gray-300 text-[10px]">
                    <div className="p-2 border-r border-gray-300">
                        <p className="text-[9px] text-gray-500 uppercase">Bank Details</p>
                        {(selectedCompany?.bank_name || selectedCompany?.bank_account) ? (
                            <div className="mt-0.5">
                                {selectedCompany.bank_name && <p>Bank: <b>{selectedCompany.bank_name}</b></p>}
                                {selectedCompany.bank_account && <p>A/C: <b>{selectedCompany.bank_account}</b></p>}
                                {selectedCompany.bank_ifsc && <p>IFSC: <b>{selectedCompany.bank_ifsc}</b></p>}
                            </div>
                        ) : (
                            <p className="text-gray-400 mt-0.5">-</p>
                        )}
                    </div>
                    <div className="p-2 text-right">
                        <p className="text-[9px] text-gray-500">For {selectedCompany?.name}</p>
                        <div className="h-8"></div>
                        <p className="border-t border-gray-400 pt-1 inline-block px-4">Authorized Signatory</p>
                    </div>
                </div>

                {/* Footer Note */}
                <div className="p-1.5 border-t border-gray-200 text-[9px] text-gray-500 text-center">
                    <span>E. & O.E. | Computer Generated Invoice | Subject to Jurisdiction</span>
                </div>
            </div>
        </div>
    );
}
