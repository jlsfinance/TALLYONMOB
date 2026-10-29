import { autoTable } from 'jspdf-autotable';
import './InvoiceStyledDocument.css';

const money = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const details = (invoice, items, visibility) => {
    const columns = [ { key: 'name', title: 'Description' } ];
    if (visibility.hasHSN) columns.push({ key: 'hsn', title: 'HSN' });
    if (visibility.hasGST) columns.push({ key: 'gst', title: 'GST %' });
    if (visibility.hasQty) columns.push({ key: 'qty', title: 'Qty' });
    if (visibility.hasRate) columns.push({ key: 'rate', title: 'Rate' });
    if (visibility.hasUnit) columns.push({ key: 'unit', title: 'Unit' });
    if (visibility.hasDiscount) columns.push({ key: 'discount', title: 'Disc %' });
    columns.push({ key: 'amount', title: 'Amount' });
    const rows = items.map(item => ({ name: item.stock_item_name || item.item_name || item.name || 'Item', hsn: item.hsn_code || '-', gst: item.gst_rate || 0, qty: item.quantity || 0, rate: money(item.rate), unit: item.unit || '', discount: item.discount_percent || item.discount || 0, amount: money(item.amount) }));
    const totals = [ ['Taxable value', invoice.taxable_amount], ['Discount', invoice.discount_amount], ['CGST', invoice.cgst_amount], ['SGST', invoice.sgst_amount], ['IGST', invoice.igst_amount], ['Round off', invoice.round_off] ].filter(([label, value]) => label === 'Taxable value' || Number(value));
    return { columns, rows, totals };
};

export function InvoiceStyledDocument({ invoice, company, items, visibility, theme, formatDate, numberToWords, hsnSummary }) {
    const { columns, rows, totals } = details(invoice, items, visibility);
    const purchase = String(invoice.voucher_type || '').toLowerCase().includes('purchase');
    const seller = purchase ? invoice.party_ledger_name : company?.name;
    const buyer = purchase ? company?.name : invoice.party_ledger_name;
    return <article className={`styled-invoice styled-invoice-${theme.id}`} style={{ '--style-accent': theme.color, '--style-tint': `rgb(${theme.tint.join(' ')})` }}>
        <header className="styled-invoice-header"><div><strong>{seller || 'Company'}</strong><small>{purchase ? invoice.party_address : company?.address}</small><small>{(purchase ? invoice.party_gstin : company?.gstin) ? `GSTIN: ${purchase ? invoice.party_gstin : company.gstin}` : ''}</small></div><div className="styled-invoice-meta"><b>{purchase ? 'PURCHASE VOUCHER' : 'TAX INVOICE'}</b><span>#{invoice.invoice_number || '—'}</span><span>{formatDate(invoice.invoice_date)}</span></div></header>
        <div className="styled-invoice-buyer"><small>{purchase ? 'PURCHASER' : 'BILL TO'}</small><strong>{buyer || 'Cash'}</strong>{!purchase && invoice.party_address && <span>{invoice.party_address}</span>}{!purchase && invoice.party_gstin && <span>GSTIN: {invoice.party_gstin}</span>}</div>
        <div className="styled-invoice-table-wrap"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(c => <td key={c.key}>{row[c.key]}</td>)}</tr>)}</tbody></table></div>
        <div className="styled-invoice-bottom"><div className="styled-invoice-bank">{company?.bank_name && <><b>Bank details</b><span>{company.bank_name}</span>{company.bank_account && <span>A/C: {company.bank_account}</span>}{company.bank_ifsc && <span>IFSC: {company.bank_ifsc}</span>}</>}</div><div className="styled-invoice-totals">{totals.map(([label, value]) => <div key={label}><span>{label}</span><span>{money(value)}</span></div>)}<div className="styled-invoice-total"><b>Total</b><b>₹{money(invoice.net_amount)}</b></div></div></div>
        <p className="styled-invoice-narration"><b>Amount in words:</b> {numberToWords(invoice.net_amount)}</p>
        {visibility.hasGST && hsnSummary?.length > 0 && <div className="styled-invoice-table-wrap"><table><thead><tr><th>HSN</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th></tr></thead><tbody>{hsnSummary.map((row, index) => <tr key={index}><td>{row.hsn}</td><td>{money(row.taxable)}</td><td>{money(row.cgst)}</td><td>{money(row.sgst)}</td><td>{money(row.igst)}</td></tr>)}</tbody></table></div>}
        {invoice.narration && <p className="styled-invoice-narration">{invoice.narration}</p>}<p className="styled-invoice-sign">for {company?.name || 'Company'}<br />Authorized Signatory</p><footer>Sent by SYNCORA Tally on Mobile</footer>
    </article>;
}

export function renderStyledInvoicePDF(doc, { invoice, company, items, visibility, theme, formatDate, numberToWords, hsnSummary }) {
    const { columns, rows, totals } = details(invoice, items, visibility);
    const width = doc.internal.pageSize.getWidth(), margin = theme.id === 'green' ? 16 : 12;
    const purchase = String(invoice.voucher_type || '').toLowerCase().includes('purchase');
    const seller = purchase ? invoice.party_ledger_name : company?.name;
    const buyer = purchase ? company?.name : invoice.party_ledger_name;
    const heading = purchase ? 'PURCHASE VOUCHER' : 'TAX INVOICE';
    doc.setFillColor(...theme.tint); doc.rect(margin, 12, width - 2 * margin, 28, 'F');
    doc.setFillColor(theme.color); doc.rect(margin, 12, width - 2 * margin, 1.5, 'F');
    const center = ['desi', 'gold', 'retro'].includes(theme.id);
    const x = center ? width / 2 : margin + 3;
    doc.setTextColor(20, 35, 45); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(doc.splitTextToSize(seller || 'Company', center ? 130 : 100), x, 19, { align: center ? 'center' : 'left', maxWidth: center ? 130 : 100 });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const address = purchase ? invoice.party_address : company?.address;
    if (address) doc.text(doc.splitTextToSize(String(address), center ? 130 : 100).slice(0, 2), x, 25, { align: center ? 'center' : 'left' });
    const gst = purchase ? invoice.party_gstin : company?.gstin;
    if (gst) doc.text(`GSTIN: ${gst}`, x, 35, { align: center ? 'center' : 'left' });
    if (!center) { doc.setFont('helvetica', 'bold'); doc.text(heading, width - margin - 3, 19, { align: 'right' }); doc.setFont('helvetica', 'normal'); doc.text(`#${invoice.invoice_number || '—'} | ${formatDate(invoice.invoice_date)}`, width - margin - 3, 25, { align: 'right' }); }
    else { doc.setFont('helvetica', 'bold'); doc.text(`${heading}  #${invoice.invoice_number || '—'}  |  ${formatDate(invoice.invoice_date)}`, width / 2, 46, { align: 'center' }); }
    let y = center ? 54 : 47;
    doc.setFont('helvetica', 'bold'); doc.text(purchase ? 'PURCHASER' : 'BILL TO', margin, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(buyer || 'Cash', 120), margin, y); y += 5;
    if (!purchase && invoice.party_address) { const lines = doc.splitTextToSize(String(invoice.party_address), 130); doc.text(lines, margin, y); y += lines.length * 4; }
    if (!purchase && invoice.party_gstin) { doc.text(`GSTIN: ${invoice.party_gstin}`, margin, y); y += 5; }
    autoTable(doc, { startY: y + 2, head: [columns.map(c => c.title)], body: rows.map(row => columns.map(c => String(row[c.key] ?? ''))), theme: theme.id === 'green' ? 'striped' : 'grid', styles: { fontSize: 8, cellPadding: 2, textColor: [20, 35, 45], overflow: 'linebreak' }, headStyles: { fillColor: theme.tint, textColor: [20, 35, 45], fontStyle: 'bold' }, margin: { left: margin, right: margin, bottom: 24 }, columnStyles: { [columns.length - 1]: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 6;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + totals.length * 6 + 38 > pageHeight - 15) { doc.addPage(); y = 18; }
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    totals.forEach(([label, value]) => { doc.text(label, width - margin - 70, y); doc.text(money(value), width - margin, y, { align: 'right' }); y += 6; });
    doc.setFont('helvetica', 'bold'); doc.text('Total (INR)', width - margin - 70, y); doc.text(money(invoice.net_amount), width - margin, y, { align: 'right' }); y += 7;
    doc.setFont('helvetica', 'normal'); const words = doc.splitTextToSize(`Amount in words: ${numberToWords(invoice.net_amount)}`, width - 2 * margin); doc.text(words, margin, y); y += words.length * 4 + 5;
    if (visibility.hasGST && hsnSummary?.length) { autoTable(doc, { startY: y, head: [['HSN', 'Taxable', 'CGST', 'SGST', 'IGST']], body: hsnSummary.map(row => [row.hsn, money(row.taxable), money(row.cgst), money(row.sgst), money(row.igst)]), theme: 'grid', styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: theme.tint, textColor: [20, 35, 45] }, margin: { left: margin, right: margin, bottom: 24 } }); y = doc.lastAutoTable.finalY + 8; }
    if (y + 22 > pageHeight - 15) { doc.addPage(); y = 18; }
    if (company?.bank_name) { doc.setFont('helvetica', 'normal'); doc.text(`Bank: ${company.bank_name}`, margin, y); if (company.bank_account) doc.text(`A/C: ${company.bank_account}`, margin, y + 5); if (company.bank_ifsc) doc.text(`IFSC: ${company.bank_ifsc}`, margin, y + 10); }
    doc.text(`for ${company?.name || 'Company'}`, width - margin, y, { align: 'right' }); doc.text('Authorized Signatory', width - margin, y + 10, { align: 'right' });
    if (invoice.narration) { y += 17; if (y > pageHeight - 30) { doc.addPage(); y = 18; } doc.text(doc.splitTextToSize(String(invoice.narration), width - 2 * margin), margin, y); }
}

export function addSyncoraPDFFooter(doc) {
    const pages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text('Sent by SYNCORA Tally on Mobile', doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' }); }
}
