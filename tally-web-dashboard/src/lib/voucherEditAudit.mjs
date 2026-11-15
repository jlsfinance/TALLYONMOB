const text = value => String(value ?? '').trim();
const money = value => String(Number(value) || 0);
export function voucherSnapshot(value = {}) {
  return {
    voucher_type_name: text(value.voucher_type_name || value.voucher_type),
    party_name: text(value.party_name),
    voucher_date: text(value.voucher_date).slice(0, 10),
    total_amount: money(value.total_amount ?? value.grand_total ?? value.amount),
    taxable_amount: money(value.taxable_amount ?? value.subtotal),
    cgst_amount: money(value.cgst_amount), sgst_amount: money(value.sgst_amount), igst_amount: money(value.igst_amount),
    round_off: money(value.round_off), discount_amount: money(value.discount_amount),
    cash_bank_ledger: ['Receipt', 'Payment', 'Contra', 'Journal'].includes(value.voucher_type_name || value.voucher_type) ? text(value.cash_bank_ledger) : '',
    narration: text(value.narration),
    ledger_entries: ['Journal', 'Contra'].includes(value.voucher_type_name || value.voucher_type) ? (value.ledger_entries || value.entries || []).map(e => ({ ledger_name: text(e.ledger_name), is_debit: e.is_debit === true, amount: money(e.amount) })) : [],
    inventory_entries: (value.inventory_entries || []).map(i => ({
      name: text(i.stock_item || i.stock_item_name || i.name),
      quantity: money(i.quantity), rate: money(i.rate), amount: money(i.amount),
      discount: money(i.discount ?? i.discount_percent), gst_rate: money(i.gst_rate), hsn_code: text(i.hsn_code), unit: text(i.unit)
    }))
  };
}
export function makeEditAudit(original, proposed, editor, priorAudit) {
  const before = voucherSnapshot(priorAudit?.original || original);
  const after = voucherSnapshot(proposed);
  const labels = { voucher_type_name: 'Voucher type', party_name: 'Party', voucher_date: 'Date', taxable_amount: 'Taxable value (INR)', total_amount: 'Amount (INR)', cgst_amount: 'CGST (INR)', sgst_amount: 'SGST (INR)', igst_amount: 'IGST (INR)', round_off: 'Round off (INR)', discount_amount: 'Bill discount (INR)', cash_bank_ledger: 'Cash / bank ledger', narration: 'Narration', inventory_entries: 'Items', ledger_entries: 'Debit / credit entries' };
  const display = value => Array.isArray(value)
    ? value.map(i => i.ledger_name !== undefined ? `${i.ledger_name}: ${i.is_debit ? 'Dr' : 'Cr'} ${i.amount}` : `${i.name}: qty ${i.quantity}, rate ${i.rate}, amount ${i.amount}, discount ${i.discount}, GST ${i.gst_rate}%, HSN ${i.hsn_code || '—'}, unit ${i.unit || '—'}`).join('; ') || '—'
    : text(value) || '—';
  const changes = Object.entries(labels).filter(([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(([key, label]) => ({ field: key, label, before: display(before[key]), after: display(after[key]) }));
  return { version: 1, original: before, proposed: after, changes, edited_at: new Date().toISOString(), edited_by: editor || 'Syncora user' };
}

export function revisePendingVoucher(existing, proposed, editor) {
  const isEdit = existing.is_modification === true || Boolean(existing.original_voucher_id);
  return {
    ...existing, ...proposed,
    ...(isEdit ? { is_modification: true, edit_audit: makeEditAudit(existing, proposed, editor, existing.edit_audit) } : {})
  };
}
