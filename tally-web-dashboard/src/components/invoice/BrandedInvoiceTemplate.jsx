import React from 'react';
import { Download, Edit, FileText, Hash, IndianRupee, MessageCircle, Pencil, Printer, Share2 } from 'lucide-react';

const typeOf = (invoice) => String(invoice?.voucher_type || '').trim().toLowerCase();

export default function BrandedInvoiceTemplate({
    invoice,
    items = [],
    companyInfo,
    formatCurrency,
    formatNumber,
    formatDate,
    numberToWords,
    onDownload,
    onShare,
    onEdit,
    template = 'branded',
    onTemplateChange,
}) {
    const type = typeOf(invoice);
    const isReceipt = type === 'receipt';
    const isPayment = type === 'payment';
    const isAccounting = isReceipt || isPayment;
    const title = isReceipt ? 'Receipt' : isPayment ? 'Payment Voucher' : type.includes('purchase') ? 'Purchase Voucher' : 'Tax Invoice';
    const partyLabel = isReceipt ? 'Received from' : isPayment ? 'Paid to' : type.includes('purchase') ? 'Supplier' : 'Bill to';
    const amount = Number(invoice?.net_amount ?? invoice?.total_amount ?? invoice?.grand_total ?? 0) || 0;
    const logo = companyInfo?.logo_url || companyInfo?.logo || companyInfo?.logoUrl;

    return (
        <div className="min-h-screen bg-slate-100 px-3 py-4 pb-12 font-sans text-slate-900 sm:px-6 sm:py-8">
            <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-3 pb-4 print:hidden">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">Branded template</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">Preview · {title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {onTemplateChange && <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm"><span className="hidden sm:inline">Template</span><select value={template} onChange={(event) => onTemplateChange(event.target.value)} className="bg-transparent font-bold outline-none"><option value="professional">Default</option><option value="branded">Branded</option></select></label>}
                    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Printer size={14} /> Print</button>
                    <button type="button" onClick={() => onShare?.()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-900"><Share2 size={14} /> Share</button>
                    <button type="button" onClick={() => onDownload?.()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Download size={14} /> Download PDF</button>
                    {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Edit size={14} /> Edit</button>}
                </div>
            </div>

            <article className="mx-auto w-full max-w-[794px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(15,23,42,0.15)] print:max-w-none print:rounded-none print:shadow-none">
                <div className="h-2 bg-indigo-600" />
                <div className="p-5 sm:p-10">
                    <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-7 sm:flex-row">
                        <div className="flex min-w-0 gap-3">
                            {logo ? <img src={logo} alt="Company logo" className="h-14 w-14 rounded-xl object-contain ring-1 ring-slate-200" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText size={24} /></div>}
                            <div className="min-w-0">
                                <h1 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{companyInfo?.name || 'Company Name'}</h1>
                                {companyInfo?.address && <p className="mt-1 max-w-md whitespace-pre-wrap text-xs leading-5 text-slate-500">{companyInfo.address}</p>}
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
                                    {companyInfo?.gstin && <span>GSTIN {companyInfo.gstin}</span>}
                                    {companyInfo?.phone && <span>{companyInfo.phone}</span>}
                                    {companyInfo?.email && <span>{companyInfo.email}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="shrink-0 sm:text-right">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-600">{title}</p>
                            <p className="mt-3 text-sm font-bold text-slate-950">#{invoice?.invoice_number || 'Draft'}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDate(invoice?.invoice_date)}</p>
                        </div>
                    </header>

                    <section className="mt-7 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{partyLabel}</p>
                            <p className="mt-2 text-base font-black text-slate-950">{invoice?.party_ledger_name || invoice?.party_name || 'Cash / Bank'}</p>
                            {invoice?.party_address && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">{invoice.party_address}</p>}
                            {invoice?.party_gstin && <p className="mt-2 text-[10px] font-bold text-slate-500">GSTIN {invoice.party_gstin}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 text-xs">
                            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</p><p className="mt-1 font-bold text-slate-800">{formatDate(invoice?.invoice_date)}</p></div>
                            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mode</p><p className="mt-1 font-bold text-slate-800">{invoice?.payment_mode || 'Cash / Bank'}</p></div>
                            <div className="col-span-2 border-t border-slate-100 pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference</p><p className="mt-1 font-bold text-slate-800">{invoice?.invoice_number || '-'}</p></div>
                        </div>
                    </section>

                    {isAccounting ? (
                        <section className="mt-7 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 sm:p-7">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">{isReceipt ? 'Amount received' : 'Amount paid'}</p>
                            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{formatCurrency(amount)}</p>
                            <p className="mt-2 text-xs italic text-slate-600">{numberToWords(amount)}</p>
                        </section>
                    ) : (
                        <section className="mt-7 overflow-hidden rounded-xl border border-slate-200">
                            <div className="grid grid-cols-[36px_1fr_70px_90px] gap-2 bg-slate-900 px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-white sm:grid-cols-[44px_1fr_90px_110px_120px]">
                                <span>#</span><span>Item</span><span className="hidden sm:block">Qty</span><span>Rate</span><span className="text-right">Amount</span>
                            </div>
                            {(items.length ? items : [{ stock_item_name: 'No item lines available', quantity: '', rate: '', amount: invoice?.taxable_amount ?? amount }]).map((item, index) => (
                                <div key={`${item.stock_item_name || item.item_name || 'item'}-${index}`} className="grid grid-cols-[36px_1fr_70px_90px] gap-2 border-t border-slate-200 px-3 py-3 text-xs sm:grid-cols-[44px_1fr_90px_110px_120px]">
                                    <span className="font-semibold text-slate-400">{index + 1}</span><span className="font-bold text-slate-800">{item.stock_item_name || item.item_name || 'Item'}{item.hsn_code && <small className="ml-2 font-normal text-slate-400">HSN {item.hsn_code}</small>}</span><span className="hidden text-slate-600 sm:block">{item.quantity || '-'} {item.unit || ''}</span><span className="text-slate-600">{item.rate === '' ? '-' : formatNumber(item.rate)}</span><span className="text-right font-bold text-slate-900">{formatNumber(item.amount)}</span>
                                </div>
                            ))}
                        </section>
                    )}

                    <section className="mt-6 flex flex-col gap-6 border-t border-slate-200 pt-6 sm:flex-row sm:justify-between">
                        <div className="max-w-md">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Amount in words</p>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{numberToWords(amount)}</p>
                            {invoice?.narration && <><p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Notes</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{invoice.narration}</p></>}
                        </div>
                        {!isAccounting && <div className="w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between text-slate-500"><span>Taxable amount</span><span>{formatCurrency(invoice?.taxable_amount ?? amount)}</span></div>{Number(invoice?.cgst_amount) > 0 && <div className="flex justify-between text-slate-500"><span>CGST</span><span>{formatCurrency(invoice.cgst_amount)}</span></div>}{Number(invoice?.sgst_amount) > 0 && <div className="flex justify-between text-slate-500"><span>SGST</span><span>{formatCurrency(invoice.sgst_amount)}</span></div>}{Number(invoice?.igst_amount) > 0 && <div className="flex justify-between text-slate-500"><span>IGST</span><span>{formatCurrency(invoice.igst_amount)}</span></div>}<div className="flex justify-between border-t border-slate-300 pt-3 text-base font-black text-slate-950"><span>Grand total</span><span>{formatCurrency(amount)}</span></div></div>}
                    </section>

                    <footer className="mt-10 flex flex-col justify-between gap-5 border-t border-slate-200 pt-5 text-[10px] text-slate-500 sm:flex-row"><div>{companyInfo?.bank_name && <p><span className="font-bold">Bank:</span> {companyInfo.bank_name}</p>}{companyInfo?.bank_account && <p><span className="font-bold">A/C:</span> {companyInfo.bank_account}</p>}</div><div className="text-left sm:text-right"><p className="font-bold text-slate-700">For {companyInfo?.name || 'Company'}</p><p className="mt-7">Authorized signatory</p></div></footer>
                </div>
            </article>
        </div>
    );
}
