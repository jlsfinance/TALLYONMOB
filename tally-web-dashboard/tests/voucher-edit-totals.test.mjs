import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateVoucherEdit } from '../src/lib/voucherEditTotals.mjs';
const row = { quantity: 1, rate: 100, discount: 0, gst_rate: 18 };
test('quantity and rate edits rebuild taxable value GST and total together', () => {
  const result = calculateVoucherEdit([{ ...row, quantity: 2, rate: 1000 }]);
  assert.equal(result.taxable_amount, 2000); assert.equal(result.cgst_amount, 180); assert.equal(result.sgst_amount, 180); assert.equal(result.grand_total, 2360);
});
test('discount reduces the taxable value before GST', () => {
  const r = calculateVoucherEdit([{ ...row, quantity: 2, discount: 10 }]);
  assert.equal(r.taxable_amount, 180); assert.equal(r.gst_amount, 32.4); assert.equal(r.grand_total, 212.4);
});
test('interstate and changed GST rate use IGST only', () => {
  const r = calculateVoucherEdit([{ ...row, gst_rate: 12 }], { taxMode: 'inter' });
  assert.equal(r.igst_amount, 12); assert.equal(r.cgst_amount, 0); assert.equal(r.sgst_amount, 0); assert.equal(r.grand_total, 112);
});
test('mixed rates, bill discount and automatic round off remain balanced to paise', () => {
  const r = calculateVoucherEdit([{ ...row, rate: 99.99 }, { ...row, gst_rate: 5, quantity: 3 }], { billDiscount: 5, autoRound: true });
  assert.equal(r.grand_total, Math.round(r.taxable_amount + r.gst_amount - 5));
  assert.equal(Math.round((r.taxable_amount+r.gst_amount-5+r.round_off)*100), Math.round(r.grand_total*100));
});
test('unknown tax rates are blocked rather than silently becoming zero', () => assert.throws(() => calculateVoucherEdit([{ ...row, gst_rate: '' }])));
