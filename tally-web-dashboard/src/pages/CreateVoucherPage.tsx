import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, pendingTransactionApi } from '../lib/supabase';
import {
    FileText, Plus, Search, Save, X, ChevronDown, Calendar,
    IndianRupee, Users, Package, Loader2, CheckCircle, ArrowLeft,
    Receipt, CreditCard, ArrowUpRight, ArrowDownRight, RefreshCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

type VoucherType = 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | 'Contra' | 'Journal' | 'Debit Note' | 'Credit Note';

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

const VOUCHER_TYPES: { type: VoucherType; icon: any; color: string; desc: string }[] = [
    { type: 'Sales', icon: ArrowUpRight, color: 'text-green-400 bg-green-500/10 border-green-500/30', desc: 'Create sales invoice' },
    { type: 'Purchase', icon: ArrowDownRight, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', desc: 'Record purchase bill' },
    { type: 'Receipt', icon: IndianRupee, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', desc: 'Money received' },
    { type: 'Payment', icon: CreditCard, color: 'text-red-400 bg-red-500/10 border-red-500/30', desc: 'Money paid out' },
    { type: 'Contra', icon: RefreshCcw, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30', desc: 'Bank to cash transfer' },
    { type: 'Journal', icon: FileText, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', desc: 'Adjustment entry' },
    { type: 'Debit Note', icon: ArrowUpRight, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', desc: 'Return goods to supplier' },
    { type: 'Credit Note', icon: ArrowDownRight, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', desc: 'Accept return from customer' },
];

export default function CreateVoucherPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();

    const [step, setStep] = useState<'type' | 'form'>('type');
    const [voucherType, setVoucherType] = useState<VoucherType>('Sales');
    const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
    const [voucherNumber, setVoucherNumber] = useState('');
    const [partyName, setPartyName] = useState('');
    const [narration, setNarration] = useState('');
    const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
    const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
    const [saving, setSaving] = useState(false);
    const [allLedgers, setAllLedgers] = useState<any[]>([]);
    const [allStockItems, setAllStockItems] = useState<any[]>([]);
    const [partySearch, setPartySearch] = useState('');
    const [showPartyDropdown, setShowPartyDropdown] = useState(false);
    const [ledgerSearch, setLedgerSearch] = useState('');

    useEffect(() => {
        if (selectedCompany?.id) {
            loadMasterData();
        }
    }, [selectedCompany]);

    const loadMasterData = async () => {
        const [ledgers, stock] = await Promise.all([
            supabase.from('ledgers').select('id, name, parent, closing_balance').eq('company_id', selectedCompany.id).order('name').limit(5000),
            supabase.from('stock_items').select('id, name, current_stock, unit, rate, gst_rate, stock_group').eq('company_id', selectedCompany.id).order('name').limit(2000)
        ]);
        setAllLedgers(ledgers.data || []);
        setAllStockItems(stock.data || []);
    };

    const partyLedgers = useMemo(() => {
        const partyGroups = ['Sundry Debtors', 'Sundry Creditors', 'sundry debtors', 'sundry creditors'];
        return allLedgers.filter(l => partyGroups.includes(l.parent));
    }, [allLedgers]);

    const filteredParties = useMemo(() => {
        if (!partySearch) return partyLedgers.slice(0, 20);
        return partyLedgers.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase())).slice(0, 20);
    }, [partyLedgers, partySearch]);

    const hasStockEntries = ['Sales', 'Purchase', 'Debit Note', 'Credit Note'].includes(voucherType);

    const selectVoucherType = (type: VoucherType) => {
        setVoucherType(type);
        setStep('form');
        setLedgerEntries([]);
        setStockEntries([]);
        setPartyName('');
        setNarration('');
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
        updated[index] = {
            ...updated[index],
            item_name: item.name,
            rate: item.rate || 0,
            unit: item.unit || '',
            gst_rate: item.gst_rate || 0,
            amount: (updated[index].quantity || 1) * (item.rate || 0)
        };
        setStockEntries(updated);
    };

    const removeStockEntry = (index: number) => {
        setStockEntries(stockEntries.filter((_, i) => i !== index));
    };

    const totalAmount = useMemo(() => {
        return stockEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    }, [stockEntries]);

    const totalGST = useMemo(() => {
        return stockEntries.reduce((sum, e) => sum + ((e.amount * (e.gst_rate || 0)) / 100), 0);
    }, [stockEntries]);

    const grandTotal = totalAmount + totalGST;

    const handleSave = async () => {
        if (!partyName.trim()) {
            toast.error('Please select a party');
            return;
        }
        if (hasStockEntries && stockEntries.length === 0) {
            toast.error('Please add at least one item');
            return;
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
                grand_total: grandTotal,
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

            toast.success(`${voucherType} voucher created! Will sync to Tally on next sync.`);
            navigate(-1);
        } catch (err: any) {
            toast.error(err.message || 'Failed to save voucher');
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);

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
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setStep('type')} className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                    <ArrowLeft className="w-5 h-5 text-[var(--on-surface)]" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-[var(--on-surface)]">New {voucherType}</h1>
                    <p className="text-xs text-[var(--text-muted)]">Fill details and save</p>
                </div>
            </div>

            {/* Date & Number */}
            <div className="grid grid-cols-2 gap-3 mb-4">
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

            {/* Party Selection */}
            <div className="mb-4 relative">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Party Name</label>
                <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={partyName || partySearch}
                        onChange={(e) => { setPartySearch(e.target.value); setPartyName(''); setShowPartyDropdown(true); }}
                        onFocus={() => setShowPartyDropdown(true)}
                        placeholder="Search party..."
                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] focus:border-blue-500/50 focus:outline-none"
                    />
                </div>
                {showPartyDropdown && filteredParties.length > 0 && !partyName && (
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
                <div className="mb-4">
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
                                <input
                                    type="text"
                                    value={entry.item_name}
                                    onChange={(e) => {
                                        updateStockEntry(i, 'item_name', e.target.value);
                                        const match = allStockItems.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                                        if (match) selectStockItem(i, match);
                                    }}
                                    placeholder="Item name"
                                    list={`stock-items-${i}`}
                                    className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                                <datalist id={`stock-items-${i}`}>
                                    {allStockItems.slice(0, 50).map(s => (
                                        <option key={s.id} value={s.name} />
                                    ))}
                                </datalist>
                                <button onClick={() => removeStockEntry(i)} className="p-1 text-red-400">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
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
                                    <select
                                        value={entry.gst_rate}
                                        onChange={(e) => updateStockEntry(i, 'gst_rate', Number(e.target.value))}
                                        className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--on-surface)]"
                                    >
                                        <option value={0}>0%</option>
                                        <option value={5}>5%</option>
                                        <option value={12}>12%</option>
                                        <option value={18}>18%</option>
                                        <option value={28}>28%</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)]">Amount</label>
                                    <p className="px-2 py-1.5 text-sm font-medium text-[var(--on-surface)]">
                                        {formatCurrency(entry.amount)}
                                    </p>
                                </div>
                            </div>
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
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--border)]">
                        <span className="text-[var(--on-surface)]">Grand Total</span>
                        <span className="text-green-400">{formatCurrency(grandTotal)}</span>
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="fixed bottom-20 left-0 right-0 p-4 bg-[var(--background)] border-t border-[var(--border)]">
                <button
                    onClick={handleSave}
                    disabled={saving || !partyName}
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
    );
}
