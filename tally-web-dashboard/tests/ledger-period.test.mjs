import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLedgerPeriod, loadLedgerPeriod } from '../src/lib/ledgerPeriod.mjs';
import { readAllPages } from '../src/lib/readAllPages.mjs';

test('period starts with prior Dr./Cr. movement and withholds an unverified balance', () => {
  const vouchers = [
    { id: 'old', voucher_date: '2026-03-31', voucher_type: 'Journal' },
    { id: 'now', voucher_date: '2026-04-01', voucher_type: 'Custom Entry' },
  ];
  const entries = [
    { voucher_id: 'old', amount: 12.5, is_debit: false },
    { voucher_id: 'now', amount: 2.1, is_debit: true },
  ];
  const period = calculateLedgerPeriod(vouchers, entries, 20, '2026-04-01');
  assert.equal(period.opening, 7.5);
  assert.equal(period.closing, 9.6);
  assert.equal(period.transactions.length, 1);
  const incomplete = calculateLedgerPeriod(vouchers, entries.slice(1), 20, '2026-04-01');
  assert.equal(incomplete.openingVerified, false);
  assert.equal(incomplete.unknown[0].id, 'old');
  const mismatch = calculateLedgerPeriod(vouchers, entries, 20, '2026-04-01', '2026-04-30', 10);
  assert.equal(mismatch.masterMismatch, true);
  assert.equal(mismatch.openingVerified, false);
});

test('all pages are fetched, including the partial final page', async () => {
  const records = Array.from({ length: 20588 }, (_, id) => ({ id }));
  const result = await readAllPages(() => ({ range: async (from, to) => ({
    data: records.slice(from, to + 1), error: null,
  }) }));
  assert.deepEqual(result.data, records);
});

test('a ledger on a voucher for another party contributes its own amount', async () => {
  const voucher = { id: 'receipt', party_name: 'Other', voucher_date: '2026-04-02', total_amount: 400 };
  const entry = { id: 'line', voucher_id: 'receipt', amount: 31, is_debit: true };
  const db = { from(table) {
    const rows = table === 'vouchers' ? [voucher] : [entry];
    let result = rows;
    const query = {
      select: () => query, eq: () => query, lte: () => query, order: () => query,
      ilike(column, value) {
        if (column === 'party_name') result = result.filter(row => row[column] === value);
        return query;
      },
      in(column, values) { result = result.filter(row => values.includes(row[column])); return query; },
      range: async (from, to) => ({ data: result.slice(from, to + 1), error: null }),
      then(resolve) { resolve({ data: result, error: null }); },
    };
    return query;
  } };
  const period = await loadLedgerPeriod(db, 'company', 'Bank', 10, '2026-04-01', '2026-04-30');
  assert.equal(period.closing, 41);
  assert.equal(period.transactions[0].ledgerDebit, 31);
});
