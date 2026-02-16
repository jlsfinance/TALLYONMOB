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
    const [companyInfo, setCompanyInfo] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [template, setTemplate] = useState('professional');
    const [upiId, setUpiId] = useState('');

    useEffect(() => {
        if (id && selectedCompany?.id) {
            loadInvoice();
            const savedUpi = localStorage.getItem(`upi_${selectedCompany.id}`);
            if (savedUpi) setUpiId(savedUpi);
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
                // Fetch full company details to get address/gstin (Moved up to be available for calculations)
                const { data: companyData } = await supabase
                    .from('companies')
                    .select('*')
                    .eq('id', voucherData.company_id)
                    .single();

                if (companyData) {
                    console.log('DEBUG: Fetched Company Data:', companyData);
                    // Critical Fix: Remove null values so they don't overwrite valid context data
                    const cleanCompanyData = Object.fromEntries(
                        Object.entries(companyData).filter(([_, v]) => v != null && v !== '')
                    );
                    setCompanyInfo({ ...(selectedCompany || {}), ...cleanCompanyData });
                } else {
                    console.warn('DEBUG: No company data found in DB, using context fallback as last resort.');
                    setCompanyInfo(selectedCompany);
                }

                // Fetch Party Details (Address, GSTIN)
                let partyDetails = {};
                if (voucherData.party_ledger_id) {
                    const { data: pData, error: pErr } = await supabase
                        .from('ledgers')
                        .select('address, gstin, email, phone')
                        .eq('id', voucherData.party_ledger_id)
                        .single();
                    if (pErr) console.error('DEBUG: Party Ledger Fetch Error:', pErr);
                    if (pData) partyDetails = pData;
                } else if (voucherData.party_name) {
                    const { data: pData, error: pErr } = await supabase
                        .from('ledgers')
                        .select('address, gstin, email, phone')
                        .eq('company_id', voucherData.company_id)
                        .ilike('name', voucherData.party_name.trim())
                        .maybeSingle();
                    if (pErr) console.error('DEBUG: Party Name Fetch Error:', pErr);
                    if (pData) partyDetails = pData;
                }

                // Fallback for Company GSTIN: Check if a ledger exists with Company Name
                // Fix: Check against companyData/selectedCompany variables (fresh) not state (stale/async)
                const currentGstin = companyData?.gstin || selectedCompany?.gstin;
                if (!currentGstin || currentGstin === 'N/A') {
                    const { data: cLedger } = await supabase
                        .from('ledgers')
                        .select('gstin, address, email, phone')
                        .eq('company_id', voucherData.company_id)
                        .ilike('name', companyData?.name || selectedCompany?.name)
                        .maybeSingle();

                    if (cLedger && cLedger.gstin) {
                        setCompanyInfo(prev => ({ ...prev, ...cLedger }));
                    }

                    // Bank Details Fallback: Search for any ledger in 'Bank Accounts' group
                    const { data: bLedger } = await supabase
                        .from('ledgers')
                        .select('name, address')
                        .eq('company_id', voucherData.company_id)
                        .eq('parent', 'Bank Accounts')
                        .limit(1)
                        .maybeSingle();

                    if (bLedger) {
                        setCompanyInfo(prev => ({
                            ...prev,
                            bank_name: prev?.bank_name || bLedger.name,
                            bank_account: prev?.bank_account || (bLedger.address?.match(/\d{10,}/)?.[0] || '') // Try to extract account number from address if possible
                        }));
                    }
                }

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
                        discount: Number(item.discount) || Number(item.discount_percent) || 0,
                        taxable_value: taxable
                    };
                });

                setItems(enrichedItems);

                // Fetch ledger entries to get GST amounts (CGST, SGST, IGST are posted as ledgers in Tally)
                const { data: ledgerEntries } = await supabase
                    .from('voucher_ledger_entries')
                    .select('ledger_name, amount')
                    .eq('voucher_id', voucherData.id);



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


                }

                // If still no GST from ledgers, try calculating from items
                if (cgstAmount === 0 && sgstAmount === 0 && igstAmount === 0) {
                    const companyState = companyData?.state || selectedCompany?.state || '';
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



                // Calculate taxable amount (excluding GST)
                const totalGSTAmount = cgstAmount + sgstAmount + igstAmount;
                const netAmount = Math.abs(Number(voucherData.grand_total) || Number(voucherData.total_amount) || 0);
                const taxableAmount = totalGSTAmount > 0 ? (netAmount - totalGSTAmount) : Math.abs(Number(voucherData.taxable_value) || netAmount);

                const sale = {
                    ...voucherData,
                    invoice_number: voucherData.voucher_number,
                    invoice_date: voucherData.voucher_date,
                    party_ledger_name: voucherData.party_name,
                    party_gstin: voucherData.party_gstin || partyDetails.gstin || '',
                    party_address: voucherData.party_address || partyDetails.address || '',
                    party_state: voucherData.party_state || voucherData.place_of_supply || partyDetails.state || '',
                    party_email: partyDetails.email || '',
                    party_phone: partyDetails.phone || '',
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

    // Smart column detection — Tally-style: hide every column with no data
    const columnVisibility = useMemo(() => {
        if (!items || !invoice) return {};

        const hasHSN = items.some(i => i.hsn_code && i.hsn_code !== '-' && i.hsn_code.trim() !== '');
        const hasGST = items.some(i => Number(i.gst_rate) > 0) || Number(invoice?.cgst_amount) > 0 || Number(invoice?.igst_amount) > 0;
        const hasDiscount = items.some(i => Number(i.discount) > 0 || Number(i.discount_percent) > 0);
        const hasUnit = items.some(i => i.unit && i.unit.trim() !== '');
        const hasRate = items.some(i => Number(i.rate) > 0);
        const hasQty = items.some(i => Number(i.quantity) > 0);
        const isIGST = Number(invoice?.igst_amount) > 0;
        const hasCGST = Number(invoice?.cgst_amount) > 0;
        const hasSGST = Number(invoice?.sgst_amount) > 0;
        const hasRoundOff = Number(invoice?.round_off) > 0 && Math.abs(Number(invoice?.round_off)) > 0.001;

        // Critical Fix: Use companyInfo instead of invoice.selectedCompany
        const hasBankDetails = !!(companyInfo?.bank_name || companyInfo?.bank_account);

        return { hasHSN, hasGST, hasDiscount, hasUnit, hasRate, hasQty, isIGST, hasCGST, hasSGST, hasRoundOff, hasBankDetails };
    }, [items, invoice, companyInfo]);

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
    const generatePDF = async (action = 'download') => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        let y = 15;

        // --- STYLES ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);

        // --- HEADER ---
        // Header Box
        const headerH = 30; // Compact height
        doc.rect(margin, y, pageWidth - 2 * margin, headerH);

        // Vertical Divider
        const midX = margin + (pageWidth - 2 * margin) * 0.55; // 55% Left, 45% Right for better balance
        doc.line(midX, y, midX, y + headerH);

        // LEFT: Company Info
        let leftY = y + 5;
        const leftX = margin + 4;
        const maxLeftW = midX - leftX - 2;

        doc.setFontSize(12); // Slightly smaller but bold
        doc.setFont('helvetica', 'bold');

        // Handle long company names by wrapping
        const companyName = companyInfo?.name || 'Company Name';
        const nameLines = doc.splitTextToSize(companyName, maxLeftW);
        doc.text(nameLines, leftX, leftY);
        leftY += (nameLines.length * 5); // Dynamic height adjustment

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (companyInfo?.phone) {
            doc.text(`Contact: ${companyInfo.phone}`, leftX, leftY);
            leftY += 4;
        }
        if (companyInfo?.address) {
            const addrLines = doc.splitTextToSize(companyInfo.address, maxLeftW);
            doc.text(addrLines, leftX, leftY);
            // leftY += (addrLines.length * 4); // Not strictly needed as nothing follows currently
        }

        // RIGHT: Invoice Title & Details
        let rightY = y + 6;
        const rightX = midX + 4;
        const isPurchase = invoice?.voucher_type?.toLowerCase().includes('purchase') || invoice?.voucher_type?.toLowerCase().includes('payment');
        const title = isPurchase ? 'PURCHASE VOUCHER' : 'TAX INVOICE';

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(title, midX + ((pageWidth - margin - midX) / 2), rightY, { align: 'center' });

        const subY1 = y + 10;
        const subY2 = y + 22; // Compacted rows

        doc.line(midX, subY1, pageWidth - margin, subY1);
        doc.line(midX, subY2, pageWidth - margin, subY2);

        // Invoice No | Date
        const subMidX = midX + ((pageWidth - margin - midX) / 2);
        doc.line(subMidX, subY1, subMidX, y + headerH);

        // Row 1: Invoice No | Date
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("Invoice No.", rightX, subY1 + 4);
        doc.text("Dated", subMidX + 2, subY1 + 4);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(invoice?.invoice_number || '-', rightX, subY1 + 9);
        doc.text(formatDate(invoice?.invoice_date), subMidX + 2, subY1 + 9);

        // Row 2: Mode/Terms
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("Mode/Terms of Payment", rightX, subY2 + 4);

        y += headerH;

        // --- BORDERS & GRID ---
        const contentStartY = y;

        // --- BILL TO / BUYER SECTION ---
        // Auto-calculate height based on address length
        doc.setFontSize(9);
        const partyAddrLines = invoice?.party_address ? doc.splitTextToSize(invoice.party_address, pageWidth - 2 * margin - 10) : [];
        const partySectionH = Math.max(25, 15 + (partyAddrLines.length * 4)); // Compact dynamic height

        doc.rect(margin, y, pageWidth - 2 * margin, partySectionH);

        let partyY = y + 5;
        // const leftX = margin + 4; // Reusing leftX from above

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        const partyLabel = isPurchase ? 'SUPPLIER (BILL FROM)' : 'BUYER (BILL TO)';
        doc.text(partyLabel, leftX, partyY);
        partyY += 5;

        doc.setFontSize(10);
        doc.text(invoice?.party_ledger_name || 'Cash', leftX, partyY);
        partyY += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        if (partyAddrLines.length > 0) {
            doc.text(partyAddrLines, leftX, partyY);
            partyY += (partyAddrLines.length * 4);
        }

        partyY += 2;
        if (invoice?.party_gstin) {
            doc.setFont('helvetica', 'bold');
            doc.text(`GSTIN/UIN: ${invoice.party_gstin}`, leftX, partyY);
            if (invoice?.party_state || invoice?.place_of_supply) {
                doc.text(`State Name: ${invoice?.party_state || invoice?.place_of_supply}`, leftX + 80, partyY);
            }
            doc.setFont('helvetica', 'normal');
        }

        y += partySectionH; // Move Y past party section

        // --- ITEMS TABLE ---
        const hasItems = items.length > 0;
        const _hasHSN = hasItems && items.some(i => i.hsn_code);
        const _hasGST = hasItems;
        const _hasDisc = hasItems && items.some(i => Number(i.discount) > 0 || Number(i.discount_percent) > 0);

        const tableColumns = [
            { header: 'SI No.', dataKey: 'sno' },
            { header: 'Description of Goods', dataKey: 'desc' },
        ];

        if (_hasHSN || true) tableColumns.push({ header: 'HSN/SAC', dataKey: 'hsn' });
        if (_hasGST || true) tableColumns.push({ header: 'GST Rate', dataKey: 'gst' }); // Corrected logic below
        tableColumns.push({ header: 'Quantity', dataKey: 'qty' });
        tableColumns.push({ header: 'Rate', dataKey: 'rate' });
        tableColumns.push({ header: 'Per', dataKey: 'unit' });
        if (_hasDisc) tableColumns.push({ header: 'Disc %', dataKey: 'disc' });
        tableColumns.push({ header: 'Amount', dataKey: 'amount' });

        const tableBody = items.map((item, index) => {
            // Logic to find valid GST Rate: Item Rate > Master Rate > HSN Summary Rate
            let displayGst = 0;
            if (Number(item.gst_rate) > 0) {
                displayGst = Number(item.gst_rate);
            } else {
                const hsnMatch = hsnSummary.find(h => h.hsn === (item.hsn_code || 'NIL'));
                if (hsnMatch && hsnMatch.gst_rate > 0) displayGst = hsnMatch.gst_rate;
            }

            return {
                sno: index + 1,
                desc: item.stock_item_name || 'Item',
                hsn: item.hsn_code || '-',
                gst: displayGst > 0 ? `${displayGst}%` : '0%', // Format cleanly
                qty: item.quantity || 0,
                rate: formatNumber(item.rate),
                unit: item.unit || '',
                disc: item.discount ? `${item.discount}%` : '',
                amount: formatNumber(item.amount)
            };
        });

        autoTable(doc, {
            startY: y,
            columns: tableColumns,
            body: tableBody,
            theme: 'plain',
            styles: {
                lineWidth: 0.1,
                lineColor: [0, 0, 0],
                textColor: [0, 0, 0],
                fontSize: 9,
                valign: 'middle', // Better vertical alignment
                cellPadding: 2,   // More breathing room
            },
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                halign: 'center',
                lineWidth: 0.1,
                lineColor: [0, 0, 0]
            },
            columnStyles: {
                sno: { halign: 'center', cellWidth: 10 },
                desc: { halign: 'left' },
                hsn: { halign: 'center', cellWidth: 20 },
                gst: { halign: 'center', cellWidth: 15 },
                qty: { halign: 'right', cellWidth: 20 },
                rate: { halign: 'right', cellWidth: 25 },
                unit: { halign: 'center', cellWidth: 15 },
                disc: { halign: 'center', cellWidth: 15 },
                amount: { halign: 'right', cellWidth: 30 }
            },
            margin: { left: margin, right: margin },
            tableLineWidth: 0.1,
            tableLineColor: [0, 0, 0],
        });

        y = doc.lastAutoTable.finalY;

        // --- TOTALS ROW ---
        doc.line(margin, y, pageWidth - margin, y);
        y += 1;

        const totalQtyVal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

        // Align totals with columns - simplified approach
        doc.setFont('helvetica', 'bold');
        doc.text('Total', margin + 60, y + 5, { align: 'right' });
        doc.text(totalQtyVal.toString(), pageWidth - margin - 85, y + 5, { align: 'right' }); // Approx Qty col
        doc.text(formatNumber(invoice.taxable_amount), pageWidth - margin - 2, y + 5, { align: 'right' }); // Amount col

        y += 6;
        doc.line(margin, y, pageWidth - margin, y);

        // --- AMOUNT IN WORDS & TAXES ---
        const bottomSectionStart = y;

        // Left: Amount in words
        doc.setFontSize(9);
        doc.text('Amount Chargeable (in words)', margin + 2, y + 4);
        doc.setFont('helvetica', 'bold');

        const words = numberToWords(invoice?.net_amount || 0);
        const wordLines = doc.splitTextToSize(words, (pageWidth / 2) - 10);
        doc.text(wordLines, margin + 2, y + 9);

        // Right: Tax Breakdown
        let taxY = y + 2;
        const rightXStart = pageWidth - 80;

        doc.line(rightXStart, y, rightXStart, y + 40);

        const drawTaxRow = (label, amount) => {
            if (amount > 0) {
                doc.setFont('helvetica', 'normal');
                doc.text(label, rightXStart + 2, taxY + 3);
                doc.setFont('helvetica', 'bold');
                doc.text(formatNumber(amount), pageWidth - margin - 2, taxY + 3, { align: 'right' });
                taxY += 5;
            }
        };

        if (invoice?.cgst_amount) drawTaxRow('CGST Amount', invoice.cgst_amount);
        if (invoice?.sgst_amount) drawTaxRow('SGST Amount', invoice.sgst_amount);
        if (invoice?.igst_amount) drawTaxRow('IGST Amount', invoice.igst_amount);
        if (invoice?.round_off) drawTaxRow('Round Off', invoice.round_off);

        // Grand Total Line
        doc.line(rightXStart, taxY, pageWidth - margin, taxY);
        taxY += 5;
        doc.text('Total (INR)', rightXStart + 2, taxY);
        doc.text(formatNumber(invoice.net_amount), pageWidth - margin - 2, taxY, { align: 'right' });

        y = Math.max(y + 10, taxY + 2);
        y = Math.max(y, bottomSectionStart + 30); // Reduced min height

        doc.line(margin, y, pageWidth - margin, y);

        // --- TAX ANALYSIS (HSN SUMMARY) ---
        if (columnVisibility.hasGST && hsnSummary.length > 0) {
            y += 4;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text("Tax Analysis:", margin, y);
            y += 2;

            const taxColumns = [
                { header: 'HSN/SAC', dataKey: 'hsn' },
                { header: 'Taxable Value', dataKey: 'taxable', halign: 'right' },
            ];

            if (columnVisibility.isIGST) {
                taxColumns.push({ header: 'IGST Rate', dataKey: 'rate', halign: 'center' });
                taxColumns.push({ header: 'IGST Amount', dataKey: 'tax', halign: 'right' });
            } else {
                taxColumns.push({ header: 'CGST Rate', dataKey: 'crate', halign: 'center' });
                taxColumns.push({ header: 'CGST Amount', dataKey: 'cval', halign: 'right' });
                taxColumns.push({ header: 'SGST Rate', dataKey: 'srate', halign: 'center' });
                taxColumns.push({ header: 'SGST Amount', dataKey: 'sval', halign: 'right' });
            }
            taxColumns.push({ header: 'Total Tax', dataKey: 'total_tax', halign: 'right' });

            const taxBody = hsnSummary.map(row => {
                const base = {
                    hsn: row.hsn,
                    taxable: formatNumber(row.taxable),
                    total_tax: formatNumber(row.total - row.taxable)
                };

                if (columnVisibility.isIGST) {
                    return { ...base, rate: `${row.gst_rate}%`, tax: formatNumber(row.igst) };
                } else {
                    return {
                        ...base,
                        crate: `${row.gst_rate / 2}%`,
                        cval: formatNumber(row.cgst),
                        srate: `${row.gst_rate / 2}%`,
                        sval: formatNumber(row.sgst)
                    };
                }
            });

            autoTable(doc, {
                startY: y,
                columns: taxColumns,
                body: taxBody,
                theme: 'plain',
                styles: { lineWidth: 0.1, lineColor: [0, 0, 0], textColor: [0, 0, 0], fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0], halign: 'center' },
                columnStyles: {
                    hsn: { halign: 'center' },
                    taxable: { halign: 'right' },
                    rate: { halign: 'center' },
                    tax: { halign: 'right' },
                    crate: { halign: 'center' },
                    cval: { halign: 'right' },
                    srate: { halign: 'center' },
                    sval: { halign: 'right' },
                    total_tax: { halign: 'right' }
                },
                margin: { left: margin, right: margin },
                tableLineWidth: 0.1,
                tableLineColor: [0, 0, 0],
            });

            y = doc.lastAutoTable.finalY + 2;
        } else {
            y += 2;
        }

        // --- FOOTER (Bank & Sign) ---
        const footerY = y;
        const footerH = 30;
        const contentW = pageWidth - 2 * margin;

        if (upiId) {
            // 3 Columns: Bank (40%), QR (20%), Sign (40%)
            const col1X = margin + (contentW * 0.4);
            const col2X = margin + (contentW * 0.6);

            doc.line(col1X, footerY, col1X, footerY + footerH);
            doc.line(col2X, footerY, col2X, footerY + footerH);

            // Fetch and Draw QR
            try {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyInfo?.name || '')}&am=${invoice.net_amount}&cu=INR`)}`;

                const loadImage = (src) => new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = src;
                });

                const qrImg = await loadImage(qrUrl);
                const qrSize = 20;
                const qrX = col1X + ((col2X - col1X) - qrSize) / 2;
                const qrY = footerY + (footerH - qrSize) / 2 - 2;
                doc.addImage(qrImg, 'PNG', qrX, qrY, qrSize, qrSize);
                doc.setFontSize(8);
                doc.text("Scan to Pay", col1X + ((col2X - col1X) / 2), qrY + qrSize + 4, { align: 'center' });

            } catch (err) {
                console.error("Failed to load QR for PDF", err);
            }
        } else {
            const middleX = pageWidth / 2;
            doc.line(middleX, footerY, middleX, footerY + footerH); // Vertical split
        }

        // Left: Bank Details
        doc.setFontSize(9);
        doc.text('Company\'s Bank Details', margin + 2, footerY + 4);
        doc.setFont('helvetica', 'bold');
        doc.text(`Bank Name: ${companyInfo?.bank_name || '-'}`, margin + 2, footerY + 9);
        doc.text(`A/C No: ${companyInfo?.bank_account || '-'}`, margin + 2, footerY + 14);
        doc.text(`IFS Code: ${companyInfo?.bank_ifsc || '-'}`, margin + 2, footerY + 19);
        if (companyInfo?.bank_branch) {
            doc.text(`Branch: ${companyInfo?.bank_branch}`, margin + 2, footerY + 24);
        }
        doc.setFont('helvetica', 'normal');

        // Right: Signature
        doc.text(`for ${companyInfo?.name}`, pageWidth - margin - 2, footerY + 4, { align: 'right' });
        doc.setFontSize(8);
        doc.text('Authorized Signatory', pageWidth - margin - 2, footerY + 28, { align: 'right' });

        // Bottom border
        doc.rect(margin, contentStartY, pageWidth - 2 * margin, (footerY + 30) - contentStartY); // Re-draw outer box to be sure it covers all

        const filename = `Invoice_${invoice?.invoice_number || 'Draft'}.pdf`;

        if (action === 'share') {
            const blob = doc.output('blob');
            const file = new File([blob], filename, { type: 'application/pdf' });
            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: filename,
                    text: `Invoice #${invoice?.invoice_number} from ${companyInfo?.name}`
                });
            } else {
                console.warn('Web Share API not supported or validation failed');
                // Fallback to download
                doc.save(filename);
            }
        } else {
            doc.save(filename);
        }
    };

    const handleWhatsAppShare = () => {
        const message = `*TAX INVOICE*
    ━━━━━━━━━━━━━━━━━━━
    📋 *Invoice #${invoice?.invoice_number}*
    📅 Date: ${formatDate(invoice?.invoice_date)}

    🏢 *From:*
    ${companyInfo?.name}
    GSTIN: ${companyInfo?.gstin || 'N/A'}

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
        <div className="bg-gray-100 min-h-screen pb-10 font-sans">
            {/* Sticky Header with Actions */}
            <div className="sticky top-0 z-20 bg-white shadow-md border-b border-gray-200 px-6 py-3 mb-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900 flex items-center gap-1 font-medium">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back
                    </button>
                    <h1 className="text-lg font-bold text-gray-800 hidden md:block">Invoice #{invoice.invoice_number}</h1>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => navigate(`/edit-invoice/${id}`)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow transition-colors font-medium text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        Edit
                    </button>
                    <button
                        onClick={handleWhatsAppShare}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg shadow transition-colors font-medium text-sm"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                        WhatsApp
                    </button>
                    <button
                        onClick={() => generatePDF('share')}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow transition-colors font-medium text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        Share PDF
                    </button>
                    <button
                        onClick={() => generatePDF('download')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition-colors font-medium text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Mobile View (Responsive Layout) */}
            <div className="md:hidden px-4 space-y-4 pb-20">
                {/* Invoice Summary Card */}
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Invoice No</p>
                            <p className="font-bold text-lg">{invoice.invoice_number}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase">Date</p>
                            <p className="font-medium">{formatDate(invoice.invoice_date)}</p>
                        </div>
                    </div>
                    <div className="pt-2 border-t border-gray-100 flex justify-between">
                        <div className="text-xs text-gray-500">{invoice.voucher_type}</div>
                        <div className="font-bold text-green-600">₹ {formatNumber(invoice.net_amount)}</div>
                    </div>
                </div>

                {/* Parties Card */}
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <div className="mb-4">
                        <p className="text-xs text-gray-500 uppercase mb-1">Billed To</p>
                        <p className="font-bold">{invoice.party_ledger_name}</p>
                        {invoice.party_gstin && <p className="text-xs text-gray-600">GSTIN: {invoice.party_gstin}</p>}
                        <p className="text-xs text-gray-600 mt-1">{invoice.party_address}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">From</p>
                        <p className="font-medium text-sm">{companyInfo?.name}</p>
                    </div>
                </div>

                {/* Items List */}
                <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700">Items ({totalQty})</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {items.map((item, idx) => (
                            <div key={idx} className="p-3">
                                <div className="flex justify-between mb-1">
                                    <span className="font-medium text-sm">{item.stock_item_name}</span>
                                    <span className="font-bold text-sm">₹ {formatNumber(item.amount)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>{item.quantity} {item.unit} x ₹ {formatNumber(item.rate)}</span>
                                    <span>HSN: {item.hsn_code || '-'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bill Details */}
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">Bill Details</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600">Taxable Amount</span>
                            <span>{formatNumber(invoice.taxable_amount)}</span>
                        </div>
                        {invoice.cgst_amount > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600">CGST</span>
                                <span>{formatNumber(invoice.cgst_amount)}</span>
                            </div>
                        )}
                        {invoice.sgst_amount > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600">SGST</span>
                                <span>{formatNumber(invoice.sgst_amount)}</span>
                            </div>
                        )}
                        {invoice.igst_amount > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600">IGST</span>
                                <span>{formatNumber(invoice.igst_amount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-gray-100 font-bold text-base">
                            <span>Grand Total</span>
                            <span>₹ {formatNumber(invoice.net_amount)}</span>
                        </div>
                        <div className="text-xs text-gray-500 italic text-right mt-1">
                            {numberToWords(invoice.net_amount)}
                        </div>
                    </div>
                </div>
            </div>

            {/* A4 Paper Preview (Hidden on Mobile) */}
            <div className="hidden md:block max-w-[210mm] mx-auto bg-white shadow-2xl printable-content text-sm text-gray-900" style={{ minHeight: '297mm' }}>
                <div className="p-8 h-full flex flex-col relative border border-gray-300">

                    {/* Tally Style Border Container */}
                    <div className="border-2 border-black h-full flex flex-col">

                        {/* Header Section — Tally Style: Only show fields that have data */}
                        <div className="grid grid-cols-2 border-b-2 border-black">
                            {/* Company Info - Left */}
                            <div className="p-4 border-r-2 border-black flex flex-col justify-center">
                                <h1 className="text-xl font-bold uppercase tracking-tight mb-1">{companyInfo?.name}</h1>

                                {(companyInfo?.address) && (
                                    <p className="text-xs whitespace-pre-wrap leading-tight mb-2">
                                        {companyInfo?.address}
                                    </p>
                                )}

                                <div className="text-xs space-y-0.5">
                                    {(companyInfo?.gstin) && (
                                        <p><span className="font-semibold">GSTIN/UIN:</span> {companyInfo.gstin}</p>
                                    )}
                                    {(companyInfo?.state) && (
                                        <p><span className="font-semibold">State Name:</span> {companyInfo.state}</p>
                                    )}
                                    {(companyInfo?.email) && (
                                        <p><span className="font-semibold">E-Mail:</span> {companyInfo.email}</p>
                                    )}
                                    {(companyInfo?.phone) && (
                                        <p><span className="font-semibold">Contact:</span> {companyInfo.phone}</p>
                                    )}
                                </div>
                            </div>

                            {/* Invoice Info - Right (Tally: only show filled fields) */}
                            <div className="flex flex-col">
                                <div className="p-2 border-b-2 border-black text-center bg-gray-50">
                                    <h2 className="text-base font-bold uppercase tracking-wider">
                                        {invoice.voucher_type?.toLowerCase().includes('purchase') ? 'Purchase Voucher' : 'Tax Invoice'}
                                    </h2>
                                </div>
                                <div className="flex-grow text-xs">
                                    {/* Invoice No & Date — always shown */}
                                    <div className="grid grid-cols-2">
                                        <div className="p-2 border-r border-black border-b border-black">
                                            <p className="font-semibold">Invoice No.</p>
                                            <p className="font-bold text-sm">{invoice.invoice_number}</p>
                                        </div>
                                        <div className="p-2 border-b border-black">
                                            <p className="font-semibold">Dated</p>
                                            <p className="font-bold">{formatDate(invoice.invoice_date)}</p>
                                        </div>
                                    </div>
                                    {/* Only show Delivery Note / Mode of Payment if data exists */}
                                    {(invoice.delivery_note || invoice.payment_mode || invoice.voucher_type) && (
                                        <div className="grid grid-cols-2">
                                            {invoice.delivery_note ? (
                                                <div className="p-2 border-r border-black border-b border-black">
                                                    <p className="font-semibold">Delivery Note</p>
                                                    <p>{invoice.delivery_note}</p>
                                                </div>
                                            ) : (
                                                <div className="p-2 border-r border-black border-b border-black"></div>
                                            )}
                                            <div className="p-2 border-b border-black">
                                                <p className="font-semibold">Mode/Terms</p>
                                                <p>{invoice.payment_mode || invoice.voucher_type}</p>
                                            </div>
                                        </div>
                                    )}
                                    {/* Buyer's Order — only if exists */}
                                    {(invoice.buyers_order_number || invoice.dispatch_through || invoice.destination) && (
                                        <div className="grid grid-cols-2">
                                            <div className="p-2 border-r border-black">
                                                {invoice.buyers_order_number && (
                                                    <><p className="font-semibold">Buyer's Order No.</p><p>{invoice.buyers_order_number}</p></>
                                                )}
                                                {invoice.dispatch_through && (
                                                    <><p className="font-semibold mt-1">Dispatch Through</p><p>{invoice.dispatch_through}</p></>
                                                )}
                                            </div>
                                            <div className="p-2">
                                                {invoice.destination && (
                                                    <><p className="font-semibold">Destination</p><p>{invoice.destination}</p></>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Buyer Info */}
                        <div className="border-b-2 border-black p-0">
                            <div className="bg-gray-100 px-2 py-1 text-xs font-bold border-b border-black uppercase">Buyer (Bill to)</div>
                            <div className="p-3 text-xs">
                                <p className="font-bold text-sm uppercase">{invoice.party_ledger_name}</p>
                                <p className="whitespace-pre-wrap max-w-md my-1">{invoice.party_address || ''}</p>
                                <div className="flex gap-4 mt-2">
                                    <p><span className="font-semibold">GSTIN/UIN:</span> {invoice.party_gstin || 'N/A'}</p>
                                    <p><span className="font-semibold">State Name:</span> {invoice.party_state || invoice.place_of_supply}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items Table — Tally Style: only show columns that have data */}
                        <div className="flex-grow flex flex-col border-b-2 border-black relative">
                            {/* Table Header */}
                            <div className="flex text-xs font-bold border-b border-black text-center bg-gray-50">
                                <div className="w-10 p-2 border-r border-black">SI No.</div>
                                <div className="flex-1 p-2 border-r border-black text-left">Description of Goods</div>
                                {columnVisibility.hasHSN && <div className="w-16 p-2 border-r border-black">HSN/SAC</div>}
                                {columnVisibility.hasGST && <div className="w-12 p-2 border-r border-black">GST Rate</div>}
                                {columnVisibility.hasQty && <div className="w-14 p-2 border-r border-black">Quantity</div>}
                                {columnVisibility.hasRate && <div className="w-20 p-2 border-r border-black">Rate</div>}
                                {columnVisibility.hasUnit && <div className="w-10 p-2 border-r border-black">Per</div>}
                                {columnVisibility.hasDiscount && <div className="w-16 p-2 border-r border-black">Disc %</div>}
                                <div className="w-24 p-2 text-right">Amount</div>
                            </div>

                            {/* Table Body - Rows */}
                            <div className="flex-grow text-xs relative">
                                {items.map((item, idx) => {
                                    const hsnData = hsnSummary.find(h => h.hsn === (item.hsn_code || 'NIL'));
                                    const displayGstRate = item.gst_rate > 0 ? item.gst_rate : (hsnData?.gst_rate || 0);

                                    return (
                                        <div key={idx} className="flex border-b border-gray-300 last:border-0 sticky-row">
                                            <div className="w-10 p-2 border-r border-black text-center">{idx + 1}</div>
                                            <div className="flex-1 p-2 border-r border-black font-semibold text-left">{item.stock_item_name}</div>
                                            {columnVisibility.hasHSN && <div className="w-16 p-2 border-r border-black text-center">{item.hsn_code || ''}</div>}
                                            {columnVisibility.hasGST && <div className="w-12 p-2 border-r border-black text-center">{displayGstRate > 0 ? `${displayGstRate}%` : ''}</div>}
                                            {columnVisibility.hasQty && <div className="w-14 p-2 border-r border-black text-center font-bold">{item.quantity}</div>}
                                            {columnVisibility.hasRate && <div className="w-20 p-2 border-r border-black text-right">{formatNumber(item.rate)}</div>}
                                            {columnVisibility.hasUnit && <div className="w-10 p-2 border-r border-black text-center">{item.unit}</div>}
                                            {columnVisibility.hasDiscount && <div className="w-16 p-2 border-r border-black text-right">
                                                {(Number(item.discount) > 0 || Number(item.discount_percent) > 0) ? (item.discount || item.discount_percent) + '%' : ''}
                                            </div>}
                                            <div className="w-24 p-2 text-right font-bold">{formatNumber(item.amount)}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Totals Row */}
                            <div className="flex border-t-2 border-black font-bold text-xs bg-gray-50">
                                <div className="w-10 p-2 border-r border-black text-center"></div>
                                <div className="flex-1 p-2 border-r border-black text-right font-bold">Total</div>
                                {columnVisibility.hasHSN && <div className="w-16 p-2 border-r border-black"></div>}
                                {columnVisibility.hasGST && <div className="w-12 p-2 border-r border-black"></div>}
                                {columnVisibility.hasQty && <div className="w-14 p-2 border-r border-black text-center font-bold">{totalQty}</div>}
                                {columnVisibility.hasRate && <div className="w-20 p-2 border-r border-black"></div>}
                                {columnVisibility.hasUnit && <div className="w-10 p-2 border-r border-black"></div>}
                                {columnVisibility.hasDiscount && <div className="w-16 p-2 border-r border-black"></div>}
                                <div className="w-24 p-2 text-right font-bold">{formatNumber(invoice.taxable_amount)}</div>
                            </div>
                        </div>

                        {/* Bottom Section: Words & Tax Breakdown */}
                        <div className="grid grid-cols-2 border-b-2 border-black text-xs">
                            {/* Left: Amount in Words */}
                            <div className="p-2 border-r-2 border-black">
                                <p className="text-[10px] text-gray-500 mb-1">Amount Chargeable (in words)</p>
                                <p className="font-bold italic text-sm">{numberToWords(invoice.net_amount)}</p>
                            </div>

                            {/* Right: Tax Amounts */}
                            <div className="text-right">
                                {invoice.cgst_amount > 0 && (
                                    <div className="flex justify-between p-1.5 border-b border-dotted border-gray-400">
                                        <span className="italic px-2">CGST Amount</span>
                                        <span className="font-semibold px-2">{formatNumber(invoice.cgst_amount)}</span>
                                    </div>
                                )}
                                {invoice.sgst_amount > 0 && (
                                    <div className="flex justify-between p-1.5 border-b border-dotted border-gray-400">
                                        <span className="italic px-2">SGST Amount</span>
                                        <span className="font-semibold px-2">{formatNumber(invoice.sgst_amount)}</span>
                                    </div>
                                )}
                                {invoice.igst_amount > 0 && (
                                    <div className="flex justify-between p-1.5 border-b border-dotted border-gray-400">
                                        <span className="italic px-2">IGST Amount</span>
                                        <span className="font-semibold px-2">{formatNumber(invoice.igst_amount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between p-2 bg-gray-100 font-bold text-sm border-t border-black">
                                    <span>Total (INR)</span>
                                    <span>₹ {formatNumber(invoice.net_amount)}</span>
                                </div>
                            </div>
                        </div>
                        {/* HSN/SAC Summary (If GST) */}
                        {columnVisibility.hasGST && (
                            <div className="border-b-2 border-black p-2">
                                <p className="text-[10px] font-bold underline mb-1">Tax Analysis:</p>
                                <table className="w-full text-[10px] border border-black text-center">
                                    <thead>
                                        <tr className="bg-gray-100 border-b border-black">
                                            <th className="border-r border-black">HSN/SAC</th>
                                            <th className="border-r border-black">Taxable Value</th>
                                            {columnVisibility.isIGST ? (
                                                <>
                                                    <th className="border-r border-black" colSpan="2">Integrated Tax</th>
                                                    <th>Total Tax</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="border-r border-black" colSpan="2">Central Tax</th>
                                                    <th className="border-r border-black" colSpan="2">State Tax</th>
                                                    <th>Total Tax</th>
                                                </>
                                            )}
                                        </tr>
                                        <tr className="bg-gray-50 border-b border-black">
                                            <th className="border-r border-black"></th>
                                            <th className="border-r border-black"></th>
                                            {columnVisibility.isIGST ? (
                                                <>
                                                    <th className="border-r border-black">Rate</th>
                                                    <th className="border-r border-black">Amount</th>
                                                    <th>Amount</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="border-r border-black">Rate</th>
                                                    <th className="border-r border-black">Amount</th>
                                                    <th className="border-r border-black">Rate</th>
                                                    <th className="border-r border-black">Amount</th>
                                                    <th>Amount</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hsnSummary.map((row, i) => (
                                            <tr key={i} className="border-b border-gray-300 last:border-0">
                                                <td className="border-r border-black p-1">{row.hsn}</td>
                                                <td className="border-r border-black p-1 text-right">{formatNumber(row.taxable)}</td>
                                                {columnVisibility.isIGST ? (
                                                    <>
                                                        <td className="border-r border-black p-1">{row.gst_rate}%</td>
                                                        <td className="border-r border-black p-1 text-right">{formatNumber(row.igst)}</td>
                                                        <td className="p-1 text-right">{formatNumber(row.total)}</td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="border-r border-black p-1">{row.gst_rate / 2}%</td>
                                                        <td className="border-r border-black p-1 text-right">{formatNumber(row.cgst)}</td>
                                                        <td className="border-r border-black p-1">{row.gst_rate / 2}%</td>
                                                        <td className="border-r border-black p-1 text-right">{formatNumber(row.sgst)}</td>
                                                        <td className="p-1 text-right">{formatNumber(row.total)}</td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Footer Section — Tally: only show bank if filled */}
                        <div className="grid grid-cols-5 flex-grow h-32">
                            {/* Bank & Terms (40%) */}
                            <div className="col-span-2 border-r-2 border-black p-2 text-xs flex flex-col justify-between h-full">
                                {(companyInfo?.bank_name || companyInfo?.bank_account) ? (
                                    <div>
                                        <p className="font-bold underline mb-1">Company's Bank Details:</p>
                                        {companyInfo?.bank_name && <p>Bank Name: <span className="font-semibold">{companyInfo.bank_name}</span></p>}
                                        {companyInfo?.bank_account && <p>A/C No.: <span className="font-semibold">{companyInfo.bank_account}</span></p>}
                                        {companyInfo?.bank_ifsc && <p>Branch & IFS Code: <span className="font-semibold">{companyInfo.bank_ifsc}</span></p>}
                                    </div>
                                ) : <div />}
                                <div className="mt-2 text-[10px]">
                                    <p className="underline mb-0.5">Declaration:</p>
                                    <p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
                                </div>
                            </div>

                            {/* QR Code (20%) */}
                            <div className="col-span-1 border-r-2 border-black flex flex-col items-center justify-center p-2">
                                {upiId && (
                                    <>
                                        <div className="bg-white p-1">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyInfo?.name || '')}&am=${invoice.net_amount}&cu=INR`)}`}
                                                alt="UPI QR"
                                                className="w-20 h-20 mix-blend-multiply"
                                                crossOrigin="anonymous"
                                            />
                                        </div>
                                        <p className="text-[9px] font-bold mt-1 text-center uppercase tracking-tight">Scan to Pay</p>
                                    </>
                                )}
                            </div>

                            {/* Signatory (40%) */}
                            <div className="col-span-2 p-2 flex flex-col justify-between h-full text-center">
                                <p className="text-right text-xs font-bold">for {companyInfo?.name}</p>
                                <div className="h-16"></div>
                                <div className="text-right">
                                    <p className="border-t border-black inline-block px-8 pt-1 text-xs font-bold">Authorized Signatory</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center text-[10px] text-gray-400 mt-2">
                        SUBJECT TO JURISDICTION | This is a Computer Generated Invoice
                    </div>
                </div>
            </div>
        </div>
    );
}

