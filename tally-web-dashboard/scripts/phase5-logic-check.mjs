import assert from 'node:assert/strict';
import {
  aggregateMonthlyTrend,
  aggregateTopParties,
  calculateAgeing,
  calculatePeriodComparison,
  getFinancialYearRange,
  getInventoryReliability,
  getVoucherAmount,
} from '../src/lib/businessInsights.ts';

const fy = getFinancialYearRange(2025);
assert.deepEqual(fy, { startYear: 2025, from: '2025-04-01', to: '2026-03-31', label: 'FY 2025-26' });
assert.equal(getVoucherAmount({ grand_total: 0, total_amount: 1250 }), 1250);
assert.equal(getVoucherAmount({ grand_total: -400, total_amount: 1250 }), 400);

const rows = [
  { voucher_type: 'Sales', voucher_date: '2025-04-10', grand_total: 1000, party_name: 'Alpha' },
  { voucher_type: 'sales invoice', voucher_date: '2025-04-20', grand_total: 500, party_name: 'Alpha' },
  { voucher_type: 'Purchase', voucher_date: '2025-05-01', total_amount: 700, party_name: 'Beta' },
  { voucher_type: 'Receipt', voucher_date: '2025-05-10', grand_total: 200, party_name: 'Alpha' },
];
const trend = aggregateMonthlyTrend(rows, 2025);
assert.equal(trend[0].sales, 1500);
assert.equal(trend[0].salesCount, 2);
assert.equal(trend[1].purchases, 700);
assert.equal(aggregateTopParties(rows, 'sales')[0].name, 'Alpha');
assert.equal(aggregateTopParties(rows, 'sales')[0].amount, 1500);

const comparison = calculatePeriodComparison(120, 100);
assert.equal(comparison.change, 20);
assert.equal(comparison.percentage, 20);
assert.equal(calculatePeriodComparison(100, 0).percentage, null);

const ageing = calculateAgeing(
  [
    { voucher_type: 'Sales', voucher_date: '2025-04-01', party_name: 'Alpha', grand_total: 1000 },
    { voucher_type: 'Receipt', voucher_date: '2025-04-15', party_name: 'Alpha', grand_total: 250 },
  ],
  [{ id: 'ledger-1', name: 'Alpha', parent: 'Sundry Debtors', opening_balance: 0 }],
  '2025-05-01',
  'receivable',
);
assert.equal(ageing.grandTotal, 750);
assert.equal(ageing.parties[0].buckets.current, 750);

const reliable = getInventoryReliability([{ id: 'stock-1', current_stock: 10 }], [{ quantity: 2 }]);
assert.equal(reliable.reliable, true);
assert.equal(getInventoryReliability([], []).reliable, false);

console.log('Phase 5 business insight logic checks passed');
