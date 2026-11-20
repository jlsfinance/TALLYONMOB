import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const amount = value => Math.abs(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => /^\d{4}-\d{2}-\d{2}/.test(String(value))
  ? new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replaceAll(' ', '-') : String(value || '');

/** T-account presentation; entry selection and balances remain supplied by the caller. */
export function createLedgerStatementPdf({ company, partyName, from, to, openingBalance, closingBalance, debit, credit, debitTotal, creditTotal, unknown = [], openingVerified = true }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const margin = 15, tableWidth = width - margin * 2, half = tableWidth / 2;
  const font = (size, weight = 'normal') => { doc.setFont('helvetica', weight); doc.setFontSize(size); doc.setTextColor(15); };
  const header = () => {
    font(14, 'bold');
    doc.text(doc.splitTextToSize(company?.name || 'Company', tableWidth).slice(0, 2), width / 2, 20, { align: 'center' });
    font(9);
    doc.text(doc.splitTextToSize(`Ledger Report of ${partyName}`, tableWidth).slice(0, 2), width / 2, 32, { align: 'center' });
    font(8); doc.text(`Period: ${date(from)} to ${date(to)}`, width / 2, 42, { align: 'center' });
    doc.setDrawColor(20); doc.setLineWidth(.35); doc.line(margin, 49, width - margin, 49);
    doc.setLineWidth(.15); doc.line(margin, 50.5, width - margin, 50.5);
  };
  const empty = ['', '', ''];
  const side = line => line ? [date(line[0]), String(line[1]).replace(/\s+#/, ' - '), line[2]] : [...empty];
  const row = (left, right) => [...left, ...right];
  const balanceVerified = openingVerified && unknown.length === 0;
  const drOpening = openingBalance >= 0;
  const rows = [!openingVerified ? row([date(from), 'Opening Balance', 'Unverified'], empty) : row(drOpening ? [date(from), 'Opening Balance (Dr.)', amount(openingBalance)] : empty,
    drOpening ? empty : [date(from), 'Opening Balance (Cr.)', amount(openingBalance)])];
  rows.push(...Array.from({ length: Math.max(debit.length, credit.length) }, (_, i) => row(side(debit[i]), side(credit[i]))));
  if (!debit.length && !credit.length) rows.push(row(['', 'No transactions in this period', ''], empty));
  const subtotalIndex = rows.length;
  const drSubtotal = Number(debitTotal) + (openingVerified && openingBalance > 0 ? Number(openingBalance) : 0);
  const crSubtotal = Number(creditTotal) + (openingVerified && openingBalance < 0 ? Math.abs(Number(openingBalance)) : 0);
  rows.push(row(['', 'Total Dr.', amount(drSubtotal)], ['', 'Total Cr.', amount(crSubtotal)]));
  const closingIndex = rows.length;
  // Closing balance goes on the opposite side of the T-account, as balance c/d.
  rows.push(!balanceVerified ? row(empty, [date(to), 'Closing Balance', 'Unverified']) : row(closingBalance < 0 ? [date(to), 'Closing Balance (Cr.)', amount(closingBalance)] : empty,
    closingBalance >= 0 ? [date(to), 'Closing Balance (Dr.)', amount(closingBalance)] : empty));
  const totalIndex = rows.length;
  if (balanceVerified) rows.push(row(['', 'Total', amount(drSubtotal + (closingBalance < 0 ? Math.abs(closingBalance) : 0))],
    ['', 'Total', amount(crSubtotal + (closingBalance >= 0 ? closingBalance : 0))]));
  autoTable(doc, {
    startY: 55, margin: { top: 55, bottom: 20, left: margin, right: margin }, tableWidth,
    theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
    head: [[{ content: 'DEBIT SIDE', colSpan: 3 }, { content: 'CREDIT SIDE', colSpan: 3 }], ['Date', 'Particulars', 'Amount', 'Date', 'Particulars', 'Amount']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 2.1, bottom: 2.1, left: 1.5, right: 1.5 }, textColor: 15, overflow: 'linebreak', valign: 'top', lineWidth: 0 },
    headStyles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 255, 255], textColor: 0 },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: half - 46 }, 2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 20 }, 4: { cellWidth: half - 46 }, 5: { cellWidth: 26, halign: 'right' } },
    willDrawPage: header,
    didParseCell: hook => {
      if (hook.section === 'head' && hook.row.index === 1) {
        hook.cell.styles.halign = [2, 5].includes(hook.column.index) ? 'right' : 'left';
        hook.cell.styles.lineWidth = { bottom: .25 }; hook.cell.styles.lineColor = 20;
      }
      if (hook.section === 'body' && [0, subtotalIndex, closingIndex, totalIndex].includes(hook.row.index)) hook.cell.styles.fontStyle = 'bold';
      if (hook.section === 'body' && [subtotalIndex, totalIndex].includes(hook.row.index)) {
        hook.cell.styles.lineWidth = { top: .25, ...(hook.row.index === totalIndex ? { bottom: .25 } : {}) }; hook.cell.styles.lineColor = 20;
      }
    },
    didDrawPage: hook => {
      doc.setDrawColor(20); doc.setLineWidth(.2); doc.line(width / 2, 55, width / 2, hook.cursor?.y || 55);
    }
  });
  let y = doc.lastAutoTable.finalY + 10;
  if (y > height - 32) { doc.addPage(); header(); y = 60; }
  font(10, 'bold');
  const message = !balanceVerified ? 'Balance unverified. Reconcile this ledger with Tally.' : closingBalance === 0 ? 'Aapka Balance clear hai Rs 0.00.'
    : `Aapka Balance baaki hai Rs ${amount(closingBalance)} (${closingBalance >= 0 ? 'Dr.' : 'Cr.'})`;
  const messageLines = doc.splitTextToSize(message, tableWidth);
  doc.text(messageLines, width / 2, y, { align: 'center' });
  if (unknown.length) autoTable(doc, {
    startY: y + messageLines.length * 5 + 5, margin: { top: 55, bottom: 20, left: margin, right: margin }, theme: 'plain',
    head: [['Entries not included in verified Dr./Cr. totals', 'Amount (INR)']],
    body: unknown.map(v => [`${date(v.voucher_date)} ${v.voucher_type || 'Voucher'} #${v.voucher_number || ''}`, amount(v.grand_total ?? v.total_amount)]),
    styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fontStyle: 'bold', fillColor: [245, 245, 245], textColor: 20 }, columnStyles: { 1: { halign: 'right', cellWidth: 32 } }, willDrawPage: header
  });
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n); font(7); doc.setTextColor(100);
    doc.text('Made from Syncora App', margin, height - 14);
    doc.text(`Page ${n} of ${pages}`, width / 2, height - 14, { align: 'center' });
    font(7, 'bold'); doc.text(doc.splitTextToSize(company?.name || 'Company', 65).slice(0, 2), width - margin, height - 14, { align: 'right' });
  }
  return doc;
}
