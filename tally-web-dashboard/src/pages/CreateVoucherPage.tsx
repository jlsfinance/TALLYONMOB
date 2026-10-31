import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, masterApi, pendingTransactionApi } from '../lib/insforge';
import {
    Plus, Save, X, Users, Package, Loader2, ArrowLeft
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { VOUCHER_TYPES, type VoucherType } from '../lib/voucherTypes';

interface LedgerEntry {
    ledger_name: string;
    amount: number;
    type: 'Dr' | 'Cr';
}

interface StockEntry {
    item_name: string;
    quantity: number;
    rate: number;
    amount: number;
    unit: string;
    gst_rate: number;
}

export default function CreateVoucherPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialType = searchParams.get('type');

    // Deep links like /create-voucher?type=Purchase skip the type picker.
    const [step, setStep] = useState<'type' | 'form'>(
        VOUCHER_TYPES.some(t => t.type === initialType) ? 'form' : 'type'
    );
    const [voucherType, setVoucherType] = useState<VoucherType>(
        VOUCHER_TYPES.find(t => t.type === initialType)?.type ?? 'Sales'
    );
    const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
    const [voucherNumber, setVoucherNumber] = useState('');
    const [partyName, setPartyName] = useState('');
    const [narration, setNarration] = useState('');
    const [amount, setAmount] = useState('');
    const [cashBankLedger, setCashBankLedger] = useState('');
    const [purchaseLedger, setPurchaseLedger] = useState('');
    const [ledgerError, setLedgerError] = useState('');
    const [masterError, setMasterError] = useState('');
    const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
    const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
    const [saving, setSaving] = useState(false);
    const [allLedgers, setAllLedgers] = useState<any[]>([]);
    const [allStockItems, setAllStockItems] = useState<any[]>([]);
    const [partySearch, setPartySearch] = useState('');
    const [showPartyDropdown, setShowPartyDropdown] = useState(false);
    const [showItemDropdown, setShowItemDropdown] = useState<number | null>(null);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadMasterData();
        }
    }, [selectedCompany]);

    useEffect(() => {
        const requestedType = VOUCHER_TYPES.find(t => t.type === initialType)?.type;
        if (requestedType) {
            setVoucherType(requestedType);
            setStep('form');
        }
    }, [initialType]);

    const loadMasterData = async () => {
        const companyId = selectedCompany.id;
        const loadLedgers = async () => {
            const rows: any[] = [];
            for (let offset = 0; ; offset += 1000) {
                const { data, error } = await supabase.from('ledgers').select('*')
                    .eq('company_id', companyId).order('name').order('id').range(offset, offset + 999);
                if (error) return { data: [], error };
                rows.push(...(data || []));
                if (!data || data.length < 1000) return { data: rows, error: null };
            }
        };
        const [ledgers, stock] = await Promise.all([
            loadLedgers(),
            masterApi.getStockItems(companyId)
        ]);
        setCashBankLedger('');
        setPurchaseLedger('');
        setLedgerError(ledgers.error ? 'Ledgers load nahi hue. Connection check karke page dobara kholen.' : '');
        setMasterError(stock.error ? 'Items load nahi hue. Connection check karke page dobara kholen.' : '');
        setAllLedgers(ledgers.data || []);
        setAllStockItems(stock.data || []);
    };

    const partyLedgers = useMemo(() => {
        const partyGroups = ['Sundry Debtors', 'Sundry Creditors', 'sundry debtors', 'sundry creditors'];
        return allLedgers.filter(l => partyGroups.includes(l.parent));
    }, [allLedgers]);

    const cashBankLedgers = useMemo(() => allLedgers.filter(l =>
        ['cash-in-hand', 'bank accounts', 'bank od accounts', 'bank occ a/c'].includes(String(l.parent || '').trim().toLowerCase())
    ), [allLedgers]);
    const purchaseLedgers = useMemo(() => allLedgers.filter(l =>
        String(l.parent || '').trim().toLowerCase() === 'purchase accounts'
    ), [allLedgers]);

    const filteredParties = useMemo(() => {
        if (!partySearch) return partyLedgers.slice(0, 20);
        return partyLedgers.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase())).slice(0, 20);
    }, [partyLedgers, partySearch]);

    const hasStockEntries = ['Sales', 'Purchase', 'Debit Note', 'Credit Note'].includes(voucherType);
    const isMoneyVoucher = ['Receipt', 'Payment'].includes(voucherType);
    const isLedgerVoucher = ['Contra', 'Journal'].includes(voucherType);
    const itemSuggestions = (index: number) => {
        const query = (stockEntries[index]?.item_name || '').trim().toLowerCase();
        return allStockItems.filter(item => String(item.name || '').toLowerCase().includes(query)).slice(0, 30);
    };

    const selectVoucherType = (type: VoucherType) => {
        setVoucherType(type);
        setStep('form');
        setLedgerEntries([]);
        setStockEntries([]);
        setPartyName('');
        setNarration('');
        setAmount('');
    };

    const addStockEntry = () => {
        setStockEntries([...stockEntries, { item_name: '', quantity: 1, rate: 0, amount: 0, unit: '', gst_rate: 0 }]);
    };

    const updateStockEntry = (index: number, field: keyof StockEntry, value: any) => {
        const updated = [...stockEntries];
        updated[index] = { ...updated[index], [field]: value };
        if (field === 'quantity' || field === 'rate') {
            updated[index].amount = updated[index].quantity * updated[index].rate;
        }
        setStockEntries(updated);
    };

    const selectStockItem = (index: number, item: any) => {
        const updated = [...stockEntries];
        const itemRate = Number(item.last_sale_rate || item.rate || 0);
        updated[index] = {
            ...updated[index],
            item_name: item.name,
            rate: itemRate,
            unit: item.base_unit || item.unit || item.uom || 'PC',
            gst_rate: Number(item.gst_rate) || 0,
            amount: (updated[index].quantity || 1) * itemRate
        };
        setStockEntries(updated);
    };

    const removeStockEntry = (index: number) => {
        setStockEntries(stockEntries.filter((_, i) => i !== index));
    };

    const totalAmount = useMemo(() => {
        return isMoneyVoucher ? Number(amount) || 0 : stockEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    }, [stockEntries, amount, isMoneyVoucher]);

    const totalGST = useMemo(() => {
        return stockEntries.reduce((sum, e) => sum + ((e.amount * (e.gst_rate || 0)) / 100), 0);
    }, [stockEntries]);

    const grandTotal = totalAmount + totalGST;
    const selectedParty = allLedgers.find(l => l.name === partyName);
    const isInterState = Boolean(selectedParty?.state && selectedCompany?.state && selectedParty.state !== selectedCompany.state);
    const cgst = isInterState ? 0 : totalGST / 2;
    const sgst = isInterState ? 0 : totalGST / 2;
    const igst = isInterState ? totalGST : 0;
    // Contra/Journal balance their own ledger entries; every other type needs a party.
    const partyRequired = !['Contra', 'Journal'].includes(voucherType);

    const handleSave = async () => {
        if (partyRequired && !partyName.trim()) {
            toast.error('Please enter a party name');
            return;
        }
        if (hasStockEntries && stockEntries.length === 0) {
            toast.error('Please add at least one item');
            return;
        }
        if (hasStockEntries && stockEntries.some(e => !e.item_name.trim() || e.quantity <= 0 || e.rate <= 0 || !Number.isFinite(e.gst_rate) || e.gst_rate < 0 || e.gst_rate > 100)) {
            toast.error('Enter item name, quantity, rate and a valid GST percentage');
            return;
        }
        if (isMoneyVoucher && (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !cashBankLedgers.some(l => l.name === cashBankLedger))) {
            toast.error('Enter an amount and select a cash or bank ledger');
            return;
        }
        if (voucherType === 'Purchase' && !purchaseLedgers.some(l => l.name === purchaseLedger)) {
            toast.error('Select a purchase ledger from the synced accounts');
            return;
        }
        if (!selectedCompany?.id) { toast.error('Select a company first'); return; }
        if (isLedgerVoucher) {
            const debit = ledgerEntries.filter(e => e.type === 'Dr').reduce((sum, e) => sum + e.amount, 0);
            const credit = ledgerEntries.filter(e => e.type === 'Cr').reduce((sum, e) => sum + e.amount, 0);
            if (ledgerEntries.length < 2 || ledgerEntries.some(e => !e.ledger_name.trim() || e.amount <= 0) || Math.abs(debit - credit) > 0.009) {
                toast.error('Add debit and credit ledgers with matching amounts'); return;
            }
        }

        setSaving(true);
        try {
            const voucherData = {
                voucher_type: voucherType,
                voucher_date: voucherDate,
                voucher_number: voucherNumber || `MOBILE-${Date.now()}`,
                party_name: partyName,
                narration,
                total_amount: totalAmount,
                gst_amount: totalGST,
                cgst_amount: cgst,
                sgst_amount: sgst,
                igst_amount: igst,
                grand_total: grandTotal,
                amount: isMoneyVoucher ? Number(amount) : grandTotal,
                cash_bank_ledger: cashBankLedger.trim(),
                purchase_ledger: purchaseLedger || undefined,
                stock_entries: stockEntries.filter(e => e.item_name),
                ledger_entries: ledgerEntries.filter(e => e.ledger_name),
                source: 'mobile'
            };

            const { data, error } = await pendingTransactionApi.create(
                selectedCompany.id,
                voucherType,
                voucherData
            );

            if (error) throw error;

            toast.success(`${voucherType} saved in the sync queue. Check Sync Status for the Tally result.`);
            navigate(-1);
        } catch (err: any) {
            toast.error(err.message || 'Failed to save voucher');
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);

    // Step 1: Voucher Type Selection
    if (step === 'type') {
        return (
            <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                        <Plus className="w-6 h-6 text-blue-400" />
                        Create Voucher
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Select voucher type to create</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {VOUCHER_TYPES.map(({ type, icon: Icon, color, desc }) => (
                        <button
                            key={type}
                            onClick={() => selectVoucherType(type)}
                            className={`p-4 rounded-xl border ${color} text-left hover:scale-[1.02] transition-all active:scale-[0.98]`}
                        >
                            <Icon className="w-6 h-6 mb-2" />
                            <h3 className="font-semibold text-sm">{type}</h3>
                            <p className="text-xs opacity-70 mt-0.5">{desc}</p>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // Step 2: Voucher Form
    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-32">
          <div className="mx-auto max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <button onClick={() => setStep('type')} className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                    <ArrowLeft className="w-5 h-5 text-[var(--on-surface)]" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-[var(--on-surface)]">New {voucherType}</h1>
                    <p className="text-xs text-[var(--text-muted)]">Add details below to create your voucher</p>
                </div>
            </div>

            {['Contra', 'Debit Note', 'Credit Note'].includes(voucherType) && (
                <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    Connector support for this voucher type has not been verified. Check Sync Status after saving.
                </div>
            )}

            {/* Date & Number */}
            <div className="grid grid-cols-2 gap-3 mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">Date</label>
                    <input
                        type="date"
                        value={voucherDate}
                        onChange={(e) => setVoucherDate(e.target.value)}
                        className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                    />
                </div>
                <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">Voucher No.</label>
                    <input
                        type="text"
                        value={voucherNumber}
                        onChange={(e) => setVoucherNumber(e.target.value)}
                        placeholder="Auto-generate"
                        className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)]"
                    />
                </div>
            </div>

            {isMoneyVoucher && (
                <div className="mb-4 grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-[var(--on-surface)]">Amount (₹)
                        <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--on-surface)]" />
                    </label>
                    <label className="text-sm font-semibold text-[var(--on-surface)]">Cash / bank ledger
                        <select value={cashBankLedger} onChange={e => setCashBankLedger(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--on-surface)]">
                            <option value="">Select cash or bank ledger</option>
                            {cashBankLedgers.map(l => <option key={l.id} value={l.name}>{l.name} ({l.parent})</option>)}
                        </select>
                        <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{ledgerError || (!cashBankLedgers.length ? 'Cash/Bank ledger nahi mila. Tally se masters sync karein.' : 'Tally se synced cash aur bank accounts')}</span>
                    </label>
                </div>
            )}
            {voucherType === 'Purchase' && (
                <label className="mb-4 block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--on-surface)]">Purchase ledger
                    <select value={purchaseLedger} onChange={e => setPurchaseLedger(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base text-[var(--on-surface)]">
                        <option value="">Select purchase ledger</option>
                        {purchaseLedgers.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{ledgerError || (!purchaseLedgers.length ? 'Purchase ledger nahi mila. Tally se masters sync karein.' : 'Wahi purchase account chunein jo Tally mein use hota hai.')}</span>
                </label>
            )}
            {isLedgerVoucher && (
                <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-[var(--on-surface)]">Ledger entries</h2><button type="button" onClick={() => setLedgerEntries([...ledgerEntries, { ledger_name: '', amount: 0, type: ledgerEntries.length ? 'Cr' : 'Dr' }])} className="text-sm font-semibold text-[var(--primary)]">+ Add ledger</button></div>
                    {ledgerEntries.map((entry, index) => <div key={index} className="mb-2 grid grid-cols-[1fr_80px_100px_auto] gap-2">
                        <input list="voucher-ledger-options" value={entry.ledger_name} onChange={e => setLedgerEntries(ledgerEntries.map((row, i) => i === index ? { ...row, ledger_name: e.target.value } : row))} placeholder="Ledger name" className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm text-[var(--on-surface)]" />
                        <select value={entry.type} onChange={e => setLedgerEntries(ledgerEntries.map((row, i) => i === index ? { ...row, type: e.target.value as 'Dr' | 'Cr' } : row))} className="rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--on-surface)]"><option>Dr</option><option>Cr</option></select>
                        <input type="number" min="0" step="0.01" value={entry.amount || ''} onChange={e => setLedgerEntries(ledgerEntries.map((row, i) => i === index ? { ...row, amount: Number(e.target.value) } : row))} placeholder="Amount" className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm text-[var(--on-surface)]" />
                        <button type="button" aria-label="Remove ledger" onClick={() => setLedgerEntries(ledgerEntries.filter((_, i) => i !== index))}><X className="h-4 w-4 text-red-500" /></button>
                    </div>)}
                    <datalist id="voucher-ledger-options">{allLedgers.map(l => <option key={l.id} value={l.name} />)}</datalist>
                    {!ledgerEntries.length && <p className="text-sm text-[var(--text-muted)]">Add debit and credit entries.</p>}
                </div>
            )}

            {/* Party Selection */}
            <div className="mb-4 relative">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Party Name</label>
                <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={partyName}
                        onChange={(e) => { setPartyName(e.target.value); setPartySearch(e.target.value); setShowPartyDropdown(true); }}
                        onFocus={() => setShowPartyDropdown(true)}
                        placeholder="Party name (new name bhi chalega)"
                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] focus:border-blue-500/50 focus:outline-none"
                    />
                </div>
                {showPartyDropdown && filteredParties.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredParties.map(p => (
                            <button
                                key={p.id}
                                onClick={() => { setPartyName(p.name); setPartySearch(''); setShowPartyDropdown(false); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-[var(--background)] text-sm text-[var(--on-surface)] border-b border-[var(--border)] last:border-0 flex justify-between"
                            >
                                <span>{p.name}</span>
                                <span className={`text-xs ${p.closing_balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {formatCurrency(Math.abs(p.closing_balance || 0))}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Stock Items (for Sales/Purchase types) */}
            {hasStockEntries && (
                <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    {masterError && <p role="alert" className="mb-3 text-sm text-red-500">{masterError}</p>}
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                            <Package className="w-3 h-3" /> Items
                        </label>
                        <button
                            onClick={addStockEntry}
                            className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300"
                        >
                            <Plus className="w-3 h-3" /> Add Item
                        </button>
                    </div>

                    {stockEntries.map((entry, i) => (
                        <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mb-2">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={entry.item_name}
                                        onChange={(e) => {
                                            updateStockEntry(i, 'item_name', e.target.value);
                                            setShowItemDropdown(i);
                                            const match = allStockItems.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                                            if (match) selectStockItem(i, match);
                                        }}
                                        onFocus={() => setShowItemDropdown(i)}
                                        onBlur={() => setTimeout(() => setShowItemDropdown(null), 150)}
                                        placeholder="Item name"
                                        className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                    />
                                    {showItemDropdown === i && itemSuggestions(i).length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {itemSuggestions(i).map(s => (
                                                <button
                                                    key={s.id}
                                                    onMouseDown={(e) => { e.preventDefault(); selectStockItem(i, s); setShowItemDropdown(null); }}
                                                    className="w-full text-left px-3 py-2 hover:bg-[var(--background)] text-sm text-[var(--on-surface)] border-b border-[var(--border)] last:border-0 flex justify-between gap-2"
                                                >
                                                    <span className="truncate">{s.name}</span>
                                                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">{s.unit || ''}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => removeStockEntry(i)} className="p-1 text-red-400">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)]">Qty</label>
                                    <input
                                        type="number"
                                        value={entry.quantity}
                                        onChange={(e) => updateStockEntry(i, 'quantity', Number(e.target.value))}
                                        className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)]">Rate</label>
                                    <input
                                        type="number"
                                        value={entry.rate}
                                        onChange={(e) => updateStockEntry(i, 'rate', Number(e.target.value))}
                                        className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)]">GST %</label>
                                    <input
                                        type="number" min="0" max="100" step="0.01" inputMode="decimal"
                                        value={entry.gst_rate}
                                        onChange={(e) => updateStockEntry(i, 'gst_rate', Number(e.target.value))}
                                        aria-label={`GST percentage for item ${i + 1}`}
                                        className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)]">Amount</label>
                                    <p className="px-2 py-1.5 text-sm font-medium text-[var(--on-surface)]">
                                        {formatCurrency(entry.amount)}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
                                <span>GST ({entry.gst_rate}%)</span>
                                <span className="font-semibold text-[var(--on-surface)]">{formatCurrency(entry.amount * entry.gst_rate / 100)}</span>
                            </div>
                            {entry.gst_rate === 0 && <p className="mt-2 text-xs text-[var(--text-muted)]">GST 0% hai. Item master mein rate na ho to yahan sahi GST % daalein.</p>}
                        </div>
                    ))}

                    {stockEntries.length === 0 && (
                        <button
                            onClick={addStockEntry}
                            className="w-full py-8 border-2 border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-muted)] hover:border-blue-500/30 hover:text-blue-400 transition-all"
                        >
                            <Plus className="w-5 h-5 mx-auto mb-1" />
                            Add first item
                        </button>
                    )}
                </div>
            )}

            {/* Narration */}
            <div className="mb-4">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Narration</label>
                <textarea
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder="Optional notes..."
                    rows={2}
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] resize-none"
                />
            </div>

            {/* Total Summary */}
            {hasStockEntries && stockEntries.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-[var(--text-muted)]">Subtotal</span>
                        <span className="text-[var(--on-surface)]">{formatCurrency(totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-[var(--text-muted)]">GST</span>
                        <span className="text-[var(--on-surface)]">{formatCurrency(totalGST)}</span>
                    </div>
                    {totalGST > 0 && (isInterState ? (
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mb-2"><span>IGST</span><span>{formatCurrency(igst)}</span></div>
                    ) : (
                        <div className="mb-2 space-y-1 text-xs text-[var(--text-muted)]"><div className="flex justify-between"><span>CGST</span><span>{formatCurrency(cgst)}</span></div><div className="flex justify-between"><span>SGST</span><span>{formatCurrency(sgst)}</span></div></div>
                    ))}
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--border)]">
                        <span className="text-[var(--on-surface)]">Grand Total</span>
                        <span className="text-green-400">{formatCurrency(grandTotal)}</span>
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <button
                    onClick={handleSave}
                    disabled={saving || (partyRequired && !partyName.trim())}
                    className="w-full py-3 bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-600 disabled:opacity-50 transition-all"
                >
                    {saving ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                    ) : (
                        <><Save className="w-5 h-5" /> Save {voucherType} Voucher</>
                    )}
                </button>
                <p className="text-xs text-center text-[var(--text-muted)] mt-2">
                    Will sync to Tally automatically on next sync
                </p>
            </div>
          </div>
        </div>
    );
}

