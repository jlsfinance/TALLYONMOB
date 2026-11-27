import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, pendingTransactionApi } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
    ArrowLeft, Save, Trash2, Plus, X, Calendar,
    User, FileText, IndianRupee, Package, RefreshCw,
    AlertCircle, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { effectiveGstRate } from '@/lib/effectiveGst.mjs';
import { calculateVoucherEdit, roundMoney } from '@/lib/voucherEditTotals.mjs';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
}).format(Math.abs(Number(amount)) || 0);

interface LineItem {
    stock_item_name: string;
    hsn_code: string;
    unit: string;
    quantity: number;
    rate: number;
    discount: number;
    amount: number;
    gst_rate: number | '';
}

import { makeEditAudit, revisePendingVoucher } from '@/lib/voucherEditAudit.mjs';
export default function EditVoucherPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany, user, can } = useAuth() as any;
    const canEditVoucher = typeof can === 'function' ? can('Vouchers:Edit') : true;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [voucher, setVoucher] = useState<any>(null);
    const [isPending, setIsPending] = useState(false); // from pending_transactions
    const [originalSnapshot, setOriginalSnapshot] = useState<any>(null);
    const [taxMode, setTaxMode] = useState('intra');
    const [roundOff, setRoundOff] = useState(0);
    const [billDiscount, setBillDiscount] = useState(0);
    const [autoRound, setAutoRound] = useState(false);

    // Editable fields
    const [partyName, setPartyName] = useState('');
    const [voucherDate, setVoucherDate] = useState('');
    const [voucherType, setVoucherType] = useState('Sales');
    const [narration, setNarration] = useState('');
    const [items, setItems] = useState<LineItem[]>([]);
    // Receipt/Payment/Journal etc. ka amount + cash/bank ledger (inventory nahi hota)
    const [amount, setAmount] = useState(0);
    const [cashBankLedger, setCashBankLedger] = useState('');
    const [accountingEntries, setAccountingEntries] = useState<any[]>([]);

    // Ledger suggestions for autocomplete
    const [ledgerSuggestions, setLedgerSuggestions] = useState<string[]>([]);
    const [partyMasters, setPartyMasters] = useState<any[]>([]);
    const [stockSuggestions, setStockSuggestions] = useState<any[]>([]);
    const [showPartySuggestions, setShowPartySuggestions] = useState(false);
    const [activeStockIdx, setActiveStockIdx] = useState<number | null>(null);
    useEffect(() => {
        setItems(current => current.map(item => {
            const stock = stockSuggestions.find(s => String(s.name).toLowerCase() === item.stock_item_name.toLowerCase());
            return stock?.gst_details?.effective_rates?.length ? { ...item, gst_rate: effectiveGstRate(stock, voucherDate) } : item;
        }));
    }, [voucherDate, stockSuggestions]);
    useEffect(() => {
        const party = partyMasters.find(p => String(p.name).toLowerCase() === partyName.toLowerCase());
        const stateKey = (record: any) => String(record?.gstin || record?.gst_number || '').slice(0, 2).match(/^\d{2}$/)?.[0] || String(record?.state || '').trim().toLowerCase();
        const from = stateKey(selectedCompany), to = stateKey(party);
        if (from && to) setTaxMode(from === to ? 'intra' : 'inter');
    }, [partyName, partyMasters, selectedCompany?.id]);

    useEffect(() => {
        if (id && selectedCompany) {
            loadVoucher();
            loadSuggestions();
        }
    }, [id, selectedCompany]);

    const loadSuggestions = async () => {
        // Load party ledgers (Tally sub-groups jaise "DEBTOR BAGODA" ke ledgers bhi party hain)
        const { data: ledgers } = await supabase
            .from('ledgers')
            .select('*')
            .eq('company_id', selectedCompany.id)
            .or('parent.ilike.*debtor*,parent.ilike.*creditor*,ledger_type.ilike.*debtor*,ledger_type.ilike.*creditor*')
            .order('name')
            .limit(500);
        setLedgerSuggestions((ledgers || []).map(l => l.name));
        setPartyMasters(ledgers || []);

        // Load stock items for autocomplete
        const { data: stocks } = await supabase
            .from('stock_items')
            .select('*')
            .eq('company_id', selectedCompany.id)
            .order('name')
            .limit(500);
        setStockSuggestions(stocks || []);
    };

    const loadVoucher = async () => {
        setLoading(true);
        try {
            const decodedId = decodeURIComponent(id!);

            // Try vouchers table first
            const { data: vData, error: vError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', decodedId)
                .single();

            if (vData && !vError) {
                setVoucher(vData);
                setIsPending(false);
                setPartyName(vData.party_name || '');
                setVoucherDate(vData.voucher_date || format(new Date(), 'yyyy-MM-dd'));
                setVoucherType(vData.voucher_type || 'Sales');
                setNarration(vData.narration || '');
                setAmount(Number(vData.total_amount || vData.grand_total || vData.amount) || 0);

                // Accounting voucher ka cash/bank side: party ke alawa doosri ledger line.
                const { data: ledgerEntries } = await supabase
                    .from('voucher_ledger_entries')
                    .select('ledger_name,amount')
                    .eq('is_deleted', false)
                    .eq('voucher_id', vData.id);
                const otherLedger = (ledgerEntries || [])
                    .map((e: any) => e.ledger_name)
                    .find((name: string) => name && name.toLowerCase() !== String(vData.party_name || '').toLowerCase());
                setCashBankLedger(otherLedger || '');
                setAccountingEntries((ledgerEntries || []).map((e: any) => ({ ledger_name: e.ledger_name, is_debit: Number(e.amount) < 0, amount: Math.abs(Number(e.amount) || 0) })));

                // Load stock entries
                const { data: stockEntries } = await supabase
                    .from('voucher_stock_entries')
                    .select('*').eq('is_deleted', false)
                    .eq('voucher_id', vData.id);

                let inventoryItems = stockEntries || [];

                // Fallback to raw_data
                if (inventoryItems.length === 0 && vData.raw_data?.inventory_entries) {
                    inventoryItems = vData.raw_data.inventory_entries;
                }
                if (inventoryItems.length === 0 && vData.inventory_entries) {
                    inventoryItems = vData.inventory_entries;
                }

                const { data: masters, error: mastersError } = await supabase.from('stock_items').select('*').eq('company_id', selectedCompany.id);
                if (mastersError) throw mastersError;
                const tax = (name: string) => Math.abs((ledgerEntries || []).filter((e: any) => String(e.ledger_name).toUpperCase().includes(name)).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0));
                const cgst = tax('CGST') || Number(vData.cgst_amount) || 0;
                const sgst = tax('SGST') || Number(vData.sgst_amount) || 0;
                const igst = tax('IGST') || Number(vData.igst_amount) || 0;
                const allTax = cgst + sgst + igst;
                const net = inventoryItems.reduce((sum: number, i: any) => sum + Math.abs(Number(i.amount) || Number(i.quantity) * Number(i.rate) || 0), 0);
                const normalized = inventoryItems.map((item: any) => {
                    const stock = (masters || []).find((s: any) => String(s.name).trim().toLowerCase() === String(item.stock_item_name || item.item_name || item.name).trim().toLowerCase());
                    const knownRate = stock && (stock.gst_rate != null || stock.gst_details?.effective_rates?.length);
                    const gstRate = item.gst_rate ?? (knownRate ? effectiveGstRate(stock, vData.voucher_date) : allTax === 0 ? 0 : inventoryItems.length === 1 && net > 0 ? roundMoney(allTax * 100 / net) : '');
                    return {
                    stock_item_name: item.stock_item_name || item.item_name || item.name || '',
                    hsn_code: item.hsn_code || stock?.hsn_code || '',
                    unit: item.unit || stock?.unit || '',
                    quantity: Number(item.quantity) || 0,
                    rate: Number(item.rate) || 0,
                    discount: Number(item.discount_percent ?? item.discount ?? (Number(item.quantity) * Number(item.rate) > 0 ? Math.max(0, 100 * (1 - Math.abs(Number(item.amount)) / (Number(item.quantity) * Number(item.rate)))) : 0)) || 0,
                    amount: Math.abs(Number(item.amount)) || ((Number(item.quantity) || 0) * (Number(item.rate) || 0)),
                    gst_rate: gstRate
                }; });
                const side = ['Purchase', 'Credit Note'].includes(vData.voucher_type) ? -1 : 1;
                const signedLedger = (name: string) => (ledgerEntries || []).filter((e: any) => String(e.ledger_name).toLowerCase().includes(name)).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
                const rounding = Number(vData.round_off ?? side * signedLedger('round'));
                const discount = Math.abs(Number(vData.discount_amount ?? signedLedger('discount')));
                setTaxMode(igst > 0 ? 'inter' : 'intra'); setRoundOff(rounding); setBillDiscount(discount);
                setAutoRound(rounding !== 0 && Math.abs(rounding) <= 0.5 && Number.isInteger(Number(vData.total_amount)));
                setOriginalSnapshot({ ...vData, taxable_amount: net, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
                    round_off: rounding, discount_amount: discount, cash_bank_ledger: otherLedger || '', inventory_entries: normalized,
                    ledger_entries: (ledgerEntries || []).map((e: any) => ({ ledger_name: e.ledger_name, is_debit: Number(e.amount) < 0, amount: Math.abs(Number(e.amount) || 0) })) });
                setItems(normalized);
            } else {
                // Try pending_transactions
                const { data: pData, error: pError } = await supabase
                    .from('pending_transactions')
                    .select('*')
                    .eq('id', decodedId)
                    .single();

                if (pData && !pError) {
                    const vd = pData.voucher_data || {};
                    setVoucher(pData);
                    setIsPending(true);
                    setPartyName(vd.party_name || vd.customerName || '');
                    setVoucherDate(vd.voucher_date || vd.date || format(new Date(), 'yyyy-MM-dd'));
                    setVoucherType(vd.voucher_type_name || pData.transaction_type || 'Sales');
                    setNarration(vd.narration || '');
                    setAmount(Number(vd.total_amount || vd.grand_total || vd.amount) || 0);
                    setCashBankLedger(vd.cash_bank_ledger || '');
                    setAccountingEntries(vd.ledger_entries || vd.entries || []);
                    setTaxMode(vd.tax_mode || (Number(vd.igst_amount) > 0 ? 'inter' : 'intra'));
                    setRoundOff(Number(vd.round_off) || 0); setBillDiscount(Number(vd.discount_amount) || 0); setAutoRound(vd.auto_round === true);

                    const rawItems = vd.inventory_entries || vd.items || vd.sales_items || [];
                    setItems(rawItems.map((item: any) => ({
                        stock_item_name: item.stock_item || item.stock_item_name || item.name || '',
                        hsn_code: item.hsn_code || '',
                        unit: item.unit || '',
                        quantity: Number(item.quantity) || 0,
                        rate: Number(item.rate) || 0,
                        discount: Number(item.discount) || 0,
                        amount: Number(item.amount) || ((Number(item.quantity) || 0) * (Number(item.rate) || 0)),
                        gst_rate: item.gst_rate ?? 0
                    })));
                } else {
                    toast.error('Voucher not found');
                    navigate(-1);
                    return;
                }
            }
        } catch (error) {
            console.error('Load error:', error);
            toast.error('Failed to load voucher');
        }
        setLoading(false);
    };

    const updateItem = (idx: number, field: keyof LineItem, value: any) => {
        const newItems = [...items];
        (newItems[idx] as any)[field] = value;
        if (field === 'quantity' || field === 'rate' || field === 'discount') {
            const qty = Number(newItems[idx].quantity) || 0;
            const rate = Number(newItems[idx].rate) || 0;
            const disc = Number(newItems[idx].discount) || 0;
            const base = qty * rate;
            newItems[idx].amount = base - (base * disc / 100);
        }
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, {
            stock_item_name: '',
            hsn_code: '',
            unit: '',
            quantity: 1,
            rate: 0,
            discount: 0,
            amount: 0
            , gst_rate: 0
        }]);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const selectStockItem = (idx: number, stock: any) => {
        const newItems = [...items];
        newItems[idx] = {
            ...newItems[idx],
            stock_item_name: stock.name,
            hsn_code: stock.hsn_code || '',
            unit: stock.unit || '',
            gst_rate: effectiveGstRate(stock, voucherDate),
            rate: Number(stock.rate) || newItems[idx].rate,
            amount: (Number(newItems[idx].quantity) || 1) * (Number(stock.rate) || newItems[idx].rate)
        };
        setItems(newItems);
        setActiveStockIdx(null);
    };

    const getFilteredStocks = (query: string) => {
        if (!query || query.length < 1) return stockSuggestions.slice(0, 10);
        return stockSuggestions
            .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);
    };

    const calculation = useMemo(() => {
        try { return { totals: calculateVoucherEdit(items, { taxMode, roundOff, billDiscount, autoRound }), error: '' }; }
        catch (error: any) { return { totals: null, error: error.message }; }
    }, [items, taxMode, roundOff, billDiscount, autoRound]);
    const totalAmount = calculation.totals?.grand_total || 0;

    const filteredParties = useMemo(() => {
        if (!partyName || partyName.length < 2) return [];
        return ledgerSuggestions
            .filter(l => l.toLowerCase().includes(partyName.toLowerCase()))
            .slice(0, 8);
    }, [partyName, ledgerSuggestions]);

    const isItemVoucher = ['Sales', 'Purchase', 'Credit Note', 'Debit Note'].includes(voucherType);
    const needsLedgerEntries = ['Journal', 'Contra'].includes(voucherType);
    const accountingDebit = roundMoney(accountingEntries.filter(e => e.is_debit).reduce((sum, e) => sum + Number(e.amount || 0), 0));
    const accountingCredit = roundMoney(accountingEntries.filter(e => !e.is_debit).reduce((sum, e) => sum + Number(e.amount || 0), 0));

    const handleSave = async () => {
        if (!canEditVoucher) {
            toast.error('You do not have permission to edit vouchers');
            return;
        }
        if (!needsLedgerEntries && !partyName.trim()) {
            toast.error('Party name is required');
            return;
        }
        if (isItemVoucher && items.length === 0) {
            toast.error('At least one item is required');
            return;
        }
        if (isItemVoucher && calculation.error) { toast.error(calculation.error); return; }
        if (needsLedgerEntries && (accountingEntries.length < 2 || accountingEntries.some(e => !e.ledger_name?.trim() || Number(e.amount) <= 0) || accountingDebit !== accountingCredit)) {
            toast.error('Enter balanced debit and credit ledger entries.'); return;
        }
        if (!isItemVoucher && !needsLedgerEntries && amount <= 0) {
            toast.error('Amount is required');
            return;
        }

        const amountFields = isItemVoucher
            ? { ...calculation.totals, lines: undefined, auto_round: autoRound }
            : needsLedgerEntries ? { amount: accountingDebit, total_amount: accountingDebit, grand_total: accountingDebit, ledger_entries: accountingEntries }
            : { amount, total_amount: amount, grand_total: amount, cash_bank_ledger: cashBankLedger || undefined };
        const lineItems = isItemVoucher
            ? (calculation.totals?.lines || []).map(i => ({
                ...i,
                stock_item: i.stock_item_name,
                quantity: i.quantity,
                rate: i.rate,
                amount: i.amount,
                hsn_code: i.hsn_code,
                unit: i.unit,
                discount: i.discount
            }))
            : [];

        setSaving(true);
        try {
            if (isPending) {
                // Update pending_transaction
                if (voucher.status !== 'pending') throw new Error('Only an unsynced pending request can be changed. Open the synced voucher to edit it.');
                const voucherData = revisePendingVoucher(voucher.voucher_data || {}, {
                    voucher_type_name: voucherType,
                    party_name: partyName,
                    voucher_date: voucherDate,
                    narration: narration,
                    ...amountFields,
                    inventory_entries: lineItems
                }, user?.email);

                const { error } = await supabase
                    .from('pending_transactions')
                    .update({
                        transaction_type: voucherData.is_modification ? 'VOUCHER_EDIT' : voucherType,
                        voucher_data: voucherData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', voucher.id).eq('status', 'pending').select('id').single();

                if (error) throw error;
                toast.success('Pending entry updated!');
            } else {
                // Synced voucher: queue a VOUCHER_EDIT; connector Tally me existing voucher alter karta hai.
                const modificationData = {
                    voucher_type_name: voucherType,
                    party_name: partyName,
                    voucher_date: voucherDate,
                    narration: narration,
                    ...amountFields,
                    original_voucher_id: voucher.id,
                    voucher_number: voucher.voucher_number,
                    tally_guid: voucher.guid,
                    tally_master_id: voucher.master_id,
                    original_voucher_date: voucher.voucher_date,
                    is_modification: true,
                    inventory_entries: lineItems
                };

                if (!voucher.guid) throw new Error('Original Tally identity is missing. Sync the voucher before editing.');
                const { data: queued, error: queueError } = await supabase.from('pending_transactions')
                    .select('id,status,voucher_data').eq('company_id', selectedCompany.id)
                    .eq('transaction_type', 'VOUCHER_EDIT').eq('voucher_data->>original_voucher_id', voucher.id)
                    .in('status', ['pending', 'processing']).order('created_at', { ascending: false }).limit(1);
                if (queueError) throw queueError;
                const previous = queued?.[0];
                if (previous?.status === 'processing') throw new Error('This edit is currently syncing. Wait for it to finish before editing again.');
                const auditedData = { ...modificationData, edit_audit: makeEditAudit(originalSnapshot || voucher, modificationData, user?.email, previous?.voucher_data?.edit_audit) };
                if (!auditedData.edit_audit.changes.length) throw new Error('No changes to save.');
                const request = previous
                    ? supabase.from('pending_transactions').update({ voucher_data: auditedData, updated_at: new Date().toISOString() }).eq('id', previous.id).eq('status', 'pending').select('id').single()
                    : supabase.from('pending_transactions').insert([{
                        company_id: selectedCompany.id,
                        transaction_type: 'VOUCHER_EDIT',
                        voucher_data: auditedData,
                        status: 'pending',
                        created_by: user?.id
                    }]);
                const { error } = await request;

                if (error) throw error;

                toast.success('Edit request queued. Connector next sync par Tally me voucher alter karega.');
            }

            navigate(-1);
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error('Save failed: ' + (error.message || 'Unknown error'));
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[3px] text-gray-400">Loading Voucher...</p>
            </div>
        );
    }

    if (!voucher) {
        return (
            <div className="p-10 text-center space-y-4">
                <AlertCircle size={48} className="mx-auto text-gray-400" />
                <p className="font-black text-xl uppercase tracking-tighter">Voucher Not Found</p>
                <button
                    onClick={() => navigate(-1)}
                    className="px-6 py-3 bg-[var(--primary)] text-white rounded-xl font-bold text-sm"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] pb-32">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2.5 rounded-2xl bg-[var(--surface-variant)] text-[var(--on-surface)]"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-[var(--on-surface)] tracking-tight">Edit Voucher</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    {isPending ? 'â³ Pending Entry' : `#${voucher.voucher_number || 'N/A'}`}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving || !canEditVoucher}
                        className="px-5 py-2.5 bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-40"
                    >
                        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {!isPending && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-4 items-start animate-in fade-in slide-in-from-top-2">
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500 flex-shrink-0">
                            <AlertCircle size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-500">Live Sync Modification</p>
                            <p className="text-xs text-amber-500/80 mt-1 leading-relaxed">
                                This voucher is already synced with Tally. Your edits will be saved locally
                                and queued for synchronization. Tally Desktop app will pick these changes
                                during the next sync cycle.
                            </p>
                        </div>
                    </div>
                )}
                {/* Voucher Type */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Voucher Type</label>
                    <div className="flex gap-2 flex-wrap">
                        {['Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Journal', 'Credit Note', 'Debit Note'].map(type => (
                            <button
                                key={type}
                                onClick={() => setVoucherType(type)}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${voucherType === type
                                    ? 'bg-[var(--primary)] text-white shadow-lg'
                                    : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Basic Info */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">
                        <FileText size={12} className="inline mr-1" /> Basic Details
                    </label>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="relative">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Party / Ledger</label>
                            <div className="relative">
                                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={partyName}
                                    onChange={e => { setPartyName(e.target.value); setShowPartySuggestions(true); }}
                                    onFocus={() => setShowPartySuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowPartySuggestions(false), 200)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                    placeholder="Party name"
                                />
                                <AnimatePresence>
                                    {showPartySuggestions && filteredParties.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                                        >
                                            {filteredParties.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onMouseDown={() => { setPartyName(s); setShowPartySuggestions(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-xs text-[var(--on-surface)] hover:bg-[var(--surface-variant)] transition-colors border-b border-[var(--border)]/20 last:border-0"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Date</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="date"
                                    value={voucherDate}
                                    onChange={e => setVoucherDate(e.target.value)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Narration</label>
                            <textarea
                                value={narration}
                                onChange={e => setNarration(e.target.value)}
                                rows={2}
                                placeholder="Optional notes..."
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                {isItemVoucher && (
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                <Package size={12} className="inline mr-1" /> Line Items ({items.length})
                            </label>
                            <button
                                onClick={addItem}
                                className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-bold hover:underline"
                            >
                                <Plus size={14} /> Add Item
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.map((item, idx) => (
                                <motion.div
                                    key={idx}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-[var(--surface-variant)] border border-[var(--border)]/50 rounded-xl p-4"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex-1 relative">
                                            <input
                                                className="w-full bg-transparent border-b border-[var(--border)] py-1 text-sm font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] placeholder:text-[var(--text-muted)]"
                                                placeholder="Search stock item..."
                                                value={item.stock_item_name}
                                                onChange={e => { updateItem(idx, 'stock_item_name', e.target.value); setActiveStockIdx(idx); }}
                                                onFocus={() => setActiveStockIdx(idx)}
                                                onBlur={() => setTimeout(() => setActiveStockIdx(null), 200)}
                                            />
                                            <AnimatePresence>
                                                {activeStockIdx === idx && getFilteredStocks(item.stock_item_name).length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -5 }}
                                                        className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 max-h-52 overflow-y-auto"
                                                    >
                                                        {getFilteredStocks(item.stock_item_name).map((stock, si) => (
                                                            <button
                                                                key={si}
                                                                onMouseDown={() => selectStockItem(idx, stock)}
                                                                className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-variant)] transition-colors border-b border-[var(--border)]/20 last:border-0"
                                                            >
                                                                <span className="text-xs font-bold text-[var(--on-surface)] block">{stock.name}</span>
                                                                <span className="text-[10px] text-[var(--text-muted)]">
                                                                    {stock.hsn_code ? `HSN: ${stock.hsn_code}` : ''} {stock.unit ? `? ${stock.unit}` : ''} {stock.rate ? `? â‚¹${Number(stock.rate).toLocaleString('en-IN')}` : ''}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <button
                                            onClick={() => removeItem(idx)}
                                            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">HSN</label>
                                            <input
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                                placeholder="HSN"
                                                value={item.hsn_code}
                                                onChange={e => updateItem(idx, 'hsn_code', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Qty</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-center"
                                                value={item.quantity}
                                                onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Rate</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-right font-mono"
                                                value={item.rate}
                                                onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Disc %</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-center"
                                                value={item.discount}
                                                onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">GST %</label>
                                            <input type="number" min="0" max="100" step="0.01" value={item.gst_rate}
                                                aria-label={`GST rate for item ${idx + 1}`}
                                                onChange={e => updateItem(idx, 'gst_rate', e.target.value === '' ? '' : Number(e.target.value))}
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)]" />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Taxable</label>
                                            <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs font-bold text-[var(--on-surface)] text-right font-mono">
                                                â‚¹{Number(item.amount).toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Amount (accounting vouchers) */}
                {needsLedgerEntries && <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
                    <h2 className="font-bold">Debit / credit entries</h2>
                    {accountingEntries.map((entry, index) => <div key={index} className="grid grid-cols-[1fr_5rem_6rem_auto] gap-2">
                        <input aria-label={`Ledger ${index + 1}`} value={entry.ledger_name} onChange={e => setAccountingEntries(rows => rows.map((row, i) => i === index ? { ...row, ledger_name: e.target.value } : row))} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
                        <select aria-label={`Side ${index + 1}`} value={entry.is_debit ? 'Dr' : 'Cr'} onChange={e => setAccountingEntries(rows => rows.map((row, i) => i === index ? { ...row, is_debit: e.target.value === 'Dr' } : row))} className="rounded-lg bg-[var(--surface)] border border-[var(--border)]"><option>Dr</option><option>Cr</option></select>
                        <input aria-label={`Amount ${index + 1}`} type="number" min="0" step="0.01" value={entry.amount} onChange={e => setAccountingEntries(rows => rows.map((row, i) => i === index ? { ...row, amount: Number(e.target.value) } : row))} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" />
                        <button type="button" aria-label={`Remove entry ${index + 1}`} onClick={() => setAccountingEntries(rows => rows.filter((_, i) => i !== index))}>×</button>
                    </div>)}
                    <button type="button" onClick={() => setAccountingEntries(rows => [...rows, { ledger_name: '', is_debit: true, amount: 0 }])}>+ Add ledger entry</button>
                    <p className={accountingDebit === accountingCredit ? 'text-emerald-600' : 'text-red-500'}>Dr {formatCurrency(accountingDebit)} · Cr {formatCurrency(accountingCredit)}</p>
                </div>}
                {!isItemVoucher && !needsLedgerEntries && (
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">
                            <IndianRupee size={12} className="inline mr-1" /> Amount
                        </label>
                        <div className="grid md:grid-cols-2 gap-4">
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                placeholder="Amount"
                            />
                            <div className="text-xs text-[var(--text-muted)] self-center">
                                {cashBankLedger ? `Cash/Bank: ${cashBankLedger}` : 'Cash/Bank Tally se liya jayega'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Total Summary */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                    {isItemVoucher && <div className="space-y-3 mb-4 text-sm">
                        <label className="block">GST treatment
                            <select value={taxMode} onChange={e => setTaxMode(e.target.value)} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 mt-1">
                                <option value="intra">Within state — CGST + SGST</option><option value="inter">Interstate — IGST</option>
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label>Bill discount (₹)<input type="number" min="0" step="0.01" value={billDiscount} onChange={e => setBillDiscount(Number(e.target.value))} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" /></label>
                            <label>Round off (₹)<input type="number" step="0.01" disabled={autoRound} value={autoRound ? calculation.totals?.round_off || 0 : roundOff} onChange={e => setRoundOff(Number(e.target.value))} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" /></label>
                        </div>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={autoRound} onChange={e => setAutoRound(e.target.checked)} />Automatically round total to nearest rupee</label>
                        {calculation.error ? <p role="alert" className="text-red-500">{calculation.error}</p> : <dl className="grid grid-cols-2 gap-2">
                            <dt>Taxable value</dt><dd className="text-right">{formatCurrency(calculation.totals?.taxable_amount || 0)}</dd>
                            {taxMode === 'intra' ? <><dt>CGST</dt><dd className="text-right">{formatCurrency(calculation.totals?.cgst_amount || 0)}</dd><dt>SGST</dt><dd className="text-right">{formatCurrency(calculation.totals?.sgst_amount || 0)}</dd></> : <><dt>IGST</dt><dd className="text-right">{formatCurrency(calculation.totals?.igst_amount || 0)}</dd></>}
                        </dl>}
                    </div>}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Grand Total</p>
                            <p className="text-xs text-[var(--text-muted)]">{items.length} item(s)</p>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-black text-[var(--on-surface)] tracking-tight">
                                {formatCurrency(isItemVoucher ? totalAmount : needsLedgerEntries ? accountingDebit : amount)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                {!isPending && (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Synced Voucher</p>
                            <p className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-0.5">
                                Changes will be saved locally and pushed to Tally on the next sync cycle. The original voucher number will be preserved.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Save Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex-1 h-14 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-[20px] border border-[var(--border)] font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-[var(--surface-active)] transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !canEditVoucher}
                        className="flex-[2] h-14 bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white rounded-[20px] shadow-xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
