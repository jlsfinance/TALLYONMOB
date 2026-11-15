export const roundMoney = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function calculateVoucherEdit(items, { taxMode = 'intra', roundOff = 0, billDiscount = 0, autoRound = false } = {}) {
  const lines = items.map(item => {
    const quantity = Number(item.quantity), rate = Number(item.rate), discount = Number(item.discount || 0), gstRate = Number(item.gst_rate);
    if (![quantity, rate, discount, gstRate].every(Number.isFinite) || quantity <= 0 || rate < 0 || discount < 0 || discount > 100 || gstRate < 0 || gstRate > 100 || item.gst_rate === '')
      throw new Error('Check item quantity, rate, discount and GST %.');
    const gross = roundMoney(quantity * rate);
    const discountAmount = roundMoney(gross * discount / 100);
    const taxable = roundMoney(gross - discountAmount);
    const gst = roundMoney(taxable * gstRate / 100);
    const cgst = taxMode === 'intra' ? roundMoney(gst / 2) : 0;
    const sgst = taxMode === 'intra' ? roundMoney(gst - cgst) : 0;
    return { ...item, quantity, rate, discount, gst_rate: gstRate, gross_amount: gross, discount_amount: discountAmount,
      taxable_amount: taxable, amount: taxable, cgst_amount: cgst, sgst_amount: sgst, igst_amount: taxMode === 'inter' ? gst : 0, gst_amount: gst };
  });
  const sum = key => roundMoney(lines.reduce((total, line) => total + line[key], 0));
  const taxable = sum('taxable_amount'), cgst = sum('cgst_amount'), sgst = sum('sgst_amount'), igst = sum('igst_amount');
  if (!Number.isFinite(Number(billDiscount)) || Number(billDiscount) < 0 || Number(billDiscount) > taxable) throw new Error('Bill discount must be between zero and the taxable value.');
  const beforeRound = roundMoney(taxable + cgst + sgst + igst - Number(billDiscount));
  const rounding = autoRound ? roundMoney(Math.round(beforeRound) - beforeRound) : Number(roundOff);
  if (!Number.isFinite(rounding)) throw new Error('Check round off amount.');
  return { lines, taxable_amount: taxable, subtotal: taxable, item_discount_amount: sum('discount_amount'), cgst_amount: cgst, sgst_amount: sgst,
    igst_amount: igst, gst_amount: roundMoney(cgst + sgst + igst), discount_amount: Number(billDiscount), round_off: rounding,
    total_amount: roundMoney(beforeRound + rounding), grand_total: roundMoney(beforeRound + rounding), tax_mode: taxMode };
}
