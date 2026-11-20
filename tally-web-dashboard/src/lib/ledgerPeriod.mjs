import { readAllPages } from './readAllPages.mjs';

export function calculateLedgerPeriod(vouchers, entries, masterOpening, from, to = '9999-12-31', masterClosing = null) {
  const entriesByVoucher = new Map();
  for (const entry of entries) {
    if (!entriesByVoucher.has(entry.voucher_id)) entriesByVoucher.set(entry.voucher_id, []);
    entriesByVoucher.get(entry.voucher_id).push(entry);
  }
  let opening = Number(masterOpening);
  let openingVerified = masterOpening != null && Number.isFinite(opening);
  if (!openingVerified) opening = 0;
  let debitTotal = 0;
  let creditTotal = 0;
  let historyNet = 0;
  let historyComplete = true;
  const transactions = [];
  const unknown = [];
  for (const voucher of vouchers) {
    const rows = entriesByVoucher.get(voucher.id) ?? [];
    const complete = rows.length > 0 && rows.every(row =>
      typeof row.is_debit === 'boolean' && row.amount != null && Number.isFinite(Number(row.amount)));
    const date = voucher.voucher_date.slice(0, 10);
    const beforePeriod = date < from;
    if (!complete) {
      historyComplete = false;
      if (date <= to) unknown.push(voucher);
      if (beforePeriod) openingVerified = false;
    }
    const verifiedRows = complete ? rows : [];
    const debit = verifiedRows.filter(row => row.is_debit).reduce((sum, row) => sum + Math.round(Math.abs(Number(row.amount)) * 100), 0) / 100;
    const credit = verifiedRows.filter(row => !row.is_debit).reduce((sum, row) => sum + Math.round(Math.abs(Number(row.amount)) * 100), 0) / 100;
    historyNet += debit - credit;
    if (beforePeriod) {
      opening += debit - credit;
    } else if (date <= to) {
      debitTotal += debit;
      creditTotal += credit;
      transactions.push({ ...voucher, ledgerDebit: debit, ledgerCredit: credit, ledgerEntries: verifiedRows });
    }
  }
  const money = value => Math.round(value * 100) / 100;
  const masterMismatch = masterClosing != null && historyComplete &&
    money(Number(masterOpening) + historyNet) !== money(Number(masterClosing));
  if (masterMismatch) openingVerified = false;
  return { opening: money(opening), openingVerified, debitTotal: money(debitTotal), creditTotal: money(creditTotal),
    closing: money(opening + debitTotal - creditTotal), transactions, unknown, masterMismatch };
}

export async function loadLedgerPeriod(db, companyId, ledgerName, masterOpening, from, to, masterClosing = null) {
  // Escape LIKE metacharacters while matching the full ledger name case-insensitively.
  const exactName = ledgerName.replace(/[\\%_]/g, '\\$&');
  const vouchersQuery = () => db.from('vouchers').select('*').eq('company_id', companyId)
    .eq('is_deleted', false).order('id');
  const [entries, primary] = await Promise.all([
    readAllPages(() => db.from('voucher_ledger_entries').select('id,voucher_id,amount,is_debit')
      .eq('company_id', companyId).eq('is_deleted', false).ilike('ledger_name', exactName).order('id')),
    readAllPages(() => vouchersQuery().ilike('party_name', exactName)),
  ]);
  if (entries.error || primary.error) throw entries.error || primary.error;
  const vouchers = new Map(primary.data.map(row => [row.id, row]));
  const linked = [...new Set(entries.data.map(row => row.voucher_id))].filter(id => id && !vouchers.has(id));
  for (let start = 0; start < linked.length; start += 100) {
    const { data, error } = await vouchersQuery().in('id', linked.slice(start, start + 100));
    if (error) throw error;
    for (const row of data ?? []) vouchers.set(row.id, row);
  }
  const ordered = [...vouchers.values()].sort((a, b) =>
    a.voucher_date.localeCompare(b.voucher_date) || a.id.localeCompare(b.id));
  return calculateLedgerPeriod(ordered, entries.data, masterOpening, from, to, masterClosing);
}
