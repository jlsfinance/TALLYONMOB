import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEditAudit, revisePendingVoucher } from '../src/lib/voucherEditAudit.mjs';
test('audit records actual before and after amount without inventing unchanged changes', () => {
  const original = { voucher_type: 'Receipt', party_name: 'Party', total_amount: 10000 };
  const next = { voucher_type_name: 'Receipt', party_name: 'Party', amount: 1000 };
  const audit = makeEditAudit(original, next, 'tester');
  assert.deepEqual(audit.changes, [{ field: 'total_amount', label: 'Amount (INR)', before: '10000', after: '1000' }]);
});
test('revising pending edit preserves original identity and first snapshot', () => {
  const original = { total_amount: 10000 };
  const existing = { is_modification: true, original_voucher_id: 'original-row', tally_guid: 'tally-guid', tally_master_id: '77', edit_audit: makeEditAudit(original, { amount: 1000 }, 'tester') };
  const revised = revisePendingVoucher(existing, { amount: 500, total_amount: 500 }, 'tester');
  assert.equal(revised.tally_guid, 'tally-guid');
  assert.equal(revised.original_voucher_id, 'original-row');
  assert.equal(revised.tally_master_id, '77');
  assert.equal(revised.edit_audit.changes.find(c => c.field === 'total_amount').before, '10000');
  assert.equal(revised.edit_audit.changes.find(c => c.field === 'total_amount').after, '500');
});
test('inventory changes include quantity rate discount HSN and unit', () => {
  const audit = makeEditAudit({ inventory_entries: [{ stock_item_name: 'Shoe', quantity: 1, rate: 100, amount: 100 }] }, { inventory_entries: [{ stock_item: 'Shoe', quantity: 2, rate: 100, amount: 200, discount: 5, hsn_code: '6401', unit: 'pair' }] }, 'tester');
  assert.match(audit.changes.find(c => c.field === 'inventory_entries').after, /qty 2.*discount 5.*6401.*pair/);
});
test('sales ledger is not falsely reported as a changed cash/bank ledger', () => {
  const audit = makeEditAudit({ voucher_type: 'Sales', total_amount: 100, cash_bank_ledger: 'Sales account' }, { voucher_type_name: 'Sales', total_amount: 1000 }, 'tester');
  assert.deepEqual(audit.changes.map(c => c.field), ['total_amount']);
});
