import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ledgerApi, masterApi, pendingTransactionApi } from '@/lib/supabase';
import { checkCreditLimit } from '@/lib/creditLimit';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    Plus, Trash2, Save, Eye, X, Banknote, ArrowLeft,
    AlertCircle, Calculator, Package, UserPlus, User,
    Phone, ChevronRight, Search, ChevronLeft, Sparkles, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Autocomplete from '@/components/shared/Autocomplete';

// Types
interface InvoiceItem {
    productId: string;
    description: string;
    quantity: number;
    rate: number;
    baseAmount: number;
    hsn?: string;
    gstRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalAmount: number;
    discountType?: 'PERCENTAGE' | 'AMOUNT';
    discountValue?: number;
    discountAmount?: number;
    unit?: string;
}

interface Invoice {
    id: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    customerAddress?: string;
    customerGstin?: string;
    customerState?: string;
    date: string;
    dueDate?: string;
    items: InvoiceItem[];
    subtotal: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    total: number;
    discountType?: 'PERCENTAGE' | 'AMOUNT';
    discountValue?: number;
    discountAmount?: number;
    roundUpAmount?: number;
    paymentMode: 'CASH' | 'CREDIT';
    notes?: string;
    gstEnabled: boolean;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(amount) || 0);
}

export default function CreateInvoicePage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [stockItems, setStockItems] = useState<any[]>([]);

    // Form State
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>([]);
    const [paymentMode, setPaymentMode] = useState<'CASH' | 'CREDIT'>('CASH');
    const [notes, setNotes] = useState('');
    const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'AMOUNT'>('PERCENTAGE');
    const [discountValue, setDiscountValue] = useState(0);
    const [includePreviousBalance, setIncludePreviousBalance] = useState(false);

    // UI States
    const [showItemModal, setShowItemModal] = useState(false);
    const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSmartCalculator, setShowSmartCalculator] = useState(false);
    const [smartCalcInput, setSmartCalcInput] = useState('');
    const [calcError, setCalcError] = useState('');
    const [showProductModal, setShowProductModal] = useState(false);
    const [newProductName, setNewProductName] = useState('');

    const modalRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const selectedCustomer = ledgers.find(l => l.id === selectedCustomerId);
    const previousBalance = selectedCustomer?.closing_balance || 0;

    // Load Data
    useEffect(() => {
        if (selectedCompany) loadMasters();
    }, [selectedCompany]);

    // Fetch party ledger masters from Tally (source of truth) instead of local DB
    async function fetchTallyPartyLedgers(companyName: string) {
        if (!companyName) return [];
        try {
            const res = await fetch(`/api/tally/sync?companyName=${encodeURIComponent(String(companyName))}&type=ledgers`, { headers: { Accept: "application/json" } });
            const data = await res.json();
            if (!res.ok || !data || (data.ok === false) || !Array.isArray(data.ledgers)) return [];
            return data.ledgers.map(l => ({
                id: l.id || l.GUID || l.partyName || l.name,
                name: l.name || l.ledgerName || "Unknown",
                parent: l.parent || "",
                ledger_type: l.ledger_type || "",
                opening_balance: l.opening_balance || 0,
                current_balance: l.current_balance || l.closing_balance || 0,
                phone: l.phone || l.LEDGERPHONE || "",
                email: l.email || l.LEDGEREMAIL || "",
                gstin: l.gstin || l.PARTYGSTIN || l.GSTIN || "",
                raw: l.raw || {}
            }));
        } catch (e) {
            console.warn('Tally party ledger fetch failed:', e);
            return [];
        }
    }

    const loadMasters = async () => {
        setLoading(true);
        try {
            const companyName = selectedCompany?.name || selectedCompany?.company_name || '';
            const tallyLedgers = await fetchTallyPartyLedgers(companyName);
            if (tallyLedgers && tallyLedgers.length > 0) {
                setLedgers(tallyLedgers);
            } else {
                const lRes = await ledgerApi.list(selectedCompany.id);
                setLedgers(lRes.data || []);
            }
            const sRes = await masterApi.getStockItems(selectedCompany.id);
            setStockItems(sRes.data || []);

            setInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`);
        } catch (error) {
            console.error('Error loading masters:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter party ledgers: exclude non-party ledger groups
    const partyLedgers = useMemo(() => {
        if (!ledgers || ledgers.length === 0) return [];
        const nonPartyGroups = [
            'duties & taxes', 'sales accounts', 'purchase accounts',
            'direct expenses', 'indirect expenses', 'direct incomes',
            'indirect incomes', 'fixed assets', 'investments', 'stock-in-hand',
            'suspense account', 'provisions', 'loans (liability)'
        ];
        const filtered = ledgers.filter(l => {
            const parent = (l.parent || '').trim().toLowerCase();
            if (!parent) return true;
            return !nonPartyGroups.some(g => parent === g || parent.startsWith(g));
        });
        return filtered.length > 0 ? filtered : ledgers;
    }, [ledgers]);

    // Calculation Logic
    const calculateTaxes = (item: InvoiceItem, isInterState: boolean) => {
        const baseAmount = (item.quantity * item.rate) - (item.discountAmount || 0);
        item.baseAmount = baseAmount;
        const gstRate = item.gstRate || 0;

        if (isInterState) {
            item.igstAmount = (baseAmount * gstRate) / 100;
            item.cgstAmount = 0;
            item.sgstAmount = 0;
        } else {
            item.igstAmount = 0;
            item.cgstAmount = (baseAmount * (gstRate / 2)) / 100;
            item.sgstAmount = (baseAmount * (gstRate / 2)) / 100;
        }
        item.totalAmount = baseAmount + item.igstAmount + item.cgstAmount + item.sgstAmount;
    };

    const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        const customer = ledgers.find(l => l.id === selectedCustomerId);
        const isInterState = customer?.state && selectedCompany?.state && customer.state !== selectedCompany.state;

        if (field === 'productId') {
            const stock = stockItems.find(s => s.id === value);
            if (stock) {
                item.productId = stock.id;
                item.description = stock.name;
                item.rate = stock.last_sale_rate || stock.rate || 0;
                item.gstRate = stock.gst_rate || 0;
                item.hsn = stock.hsn_code || '';
                item.unit = stock.base_unit || stock.unit || stock.uom || 'PC';
            }
        } else {
            (item as any)[field] = value;
        }

        const qty = parseFloat(item.quantity as any) || 0;
        const rate = parseFloat(item.rate as any) || 0;

        if (item.discountType === 'AMOUNT') {
            item.discountAmount = item.discountValue || 0;
        } else {
            item.discountAmount = ((qty * rate) * (item.discountValue || 0)) / 100;
        }

        calculateTaxes(item, !!isInterState);
        newItems[index] = item;
        setItems(newItems);
    };

    const handleAddItem = () => {
        const newItem: InvoiceItem = {
            productId: '',
            description: '',
            quantity: 1,
            rate: 0,
            baseAmount: 0,
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: 0
        };
        setItems([...items, newItem]);
        setActiveItemIndex(items.length);
        setShowItemModal(true);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const totals = () => {
        const subtotal = items.reduce((sum, i) => sum + i.baseAmount, 0);
        const cgst = items.reduce((sum, i) => sum + i.cgstAmount, 0);
        const sgst = items.reduce((sum, i) => sum + i.sgstAmount, 0);
        const igst = items.reduce((sum, i) => sum + i.igstAmount, 0);

        let billDiscount = 0;
        if (discountType === 'AMOUNT') billDiscount = discountValue;
        else billDiscount = (subtotal * discountValue) / 100;

        const total = subtotal + cgst + sgst + igst - billDiscount;
        return { subtotal, cgst, sgst, igst, total, billDiscount };
    };

    const { subtotal, cgst, sgst, igst, total, billDiscount } = totals();

    const handleSubmit = async () => {
        if (!selectedCustomerId) return alert('Please select a customer');
        if (items.length === 0) return alert('Please add at least one item');
        if (items.some(i => !i.productId)) return alert('Some items have no product selected');

        if (paymentMode === 'CREDIT') {
            const customer = ledgers.find(l => l.id === selectedCustomerId);
            const currentBal = Math.abs(Number(customer?.closing_balance || customer?.current_balance || 0));
            const creditCheck = checkCreditLimit(selectedCustomerId, currentBal, total);
            if (!creditCheck.ok) {
                if (!confirm(creditCheck.message + '\n\nContinue anyway?')) return;
            } else if (creditCheck.message) {
                toast(creditCheck.message, { icon: '⚠️' });
            }
        }

        setSubmitting(true);
        try {
            const customer = ledgers.find(l => l.id === selectedCustomerId || l.name === selectedCustomerId);
            const resolvedPartyName = customer?.name || (paymentMode === 'CASH' ? 'Cash' : '');
            if (!resolvedPartyName) return alert('Please select a customer or switch payment mode to Cash');

            const invoiceData: any = {
                id: crypto.randomUUID(),
                invoiceNumber,
                customerId: selectedCustomerId,
                customerName: resolvedPartyName,
                customerGstin: customer?.gstin,
                customerState: customer?.state,
                date,
                dueDate,
                subtotal,
                taxable_amount: subtotal,
                totalCgst: cgst,
                totalSgst: sgst,
                totalIgst: igst,
                cgst_amount: cgst,
                sgst_amount: sgst,
                igst_amount: igst,
                total,
                total_amount: subtotal,
                grand_total: total,
                discountType,
                discountValue,
                discountAmount: billDiscount,
                discount_amount: billDiscount,
                discount_value: discountValue,
                discount_type: discountType,
                paymentMode,
                notes,
                gstEnabled: (cgst + sgst + igst) > 0,

                voucher_type_name: 'Sales',
                voucher_type: 'Sales',
                voucher_number: invoiceNumber,
                party_name: resolvedPartyName,
                party_ledger_name: resolvedPartyName,
                voucher_date: date,
                invoice_date: date,
                narration: notes || `Invoice ${invoiceNumber}`,
                items: items.map(item => ({
                    stock_item_name: item.description,
                    quantity: item.quantity,
                    qty: item.quantity,
                    rate: item.rate,
                    base_amount: item.baseAmount,
                    taxable_amount: item.baseAmount,
                    discount_amount: item.discountAmount || 0,
                    discount_value: item.discountValue || 0,
                    discount_type: item.discountType,
                    amount: item.totalAmount,
                    hsn_code: item.hsn,
                    gst_rate: item.gstRate,
                    unit: item.unit || 'PC'
                }))
            };

            await pendingTransactionApi.create(
                selectedCompany.id,
                'Sales',
                invoiceData
            );

            toast.success('Invoice saved successfully! Queued for Tally sync.');
            navigate('/sales');
        } catch (error) {
            console.error('Error saving invoice:', error);
            alert('Failed to save invoice');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSmartCalcInput = (char: string) => {
        setCalcError('');
        if (char === 'C') setSmartCalcInput('');
        else if (char === '+') {
            if (smartCalcInput) handleSmartAction('ADD');
        } else if (char === '*') {
            if (!smartCalcInput.includes('*')) setSmartCalcInput(prev => prev + char);
        } else if (char === '-') {
            if (smartCalcInput) handleSmartAction('REMOVE');
        } else {
            setSmartCalcInput(prev => prev + char);
        }
    };

    const handleSmartAction = (action: 'ADD' | 'REMOVE') => {
        const parts = smartCalcInput.split('*');
        const id = parts[0];
        const qty = parseFloat(parts[1]) || 1;

        const stock = stockItems.find(s => s.id === id || s.alias === id || s.part_number === id);
        if (!stock) {
            setCalcError('Item Not Found');
            return;
        }

        if (action === 'ADD') {
            const existingIndex = items.findIndex(i => i.productId === stock.id);
            if (existingIndex > -1) {
                handleUpdateItem(existingIndex, 'quantity', items[existingIndex].quantity + qty);
            } else {
                const newItem: InvoiceItem = {
                    productId: stock.id,
                    description: stock.name,
                    quantity: qty,
                    rate: stock.last_sale_rate || stock.rate || 0,
                    baseAmount: 0,
                    gstRate: stock.gst_rate || 0,
                    cgstAmount: 0,
                    sgstAmount: 0,
                    igstAmount: 0,
                    totalAmount: 0
                };
                const customer = ledgers.find(l => l.id === selectedCustomerId);
                const isInterState = customer?.state && selectedCompany?.state && customer.state !== selectedCompany.state;
                calculateTaxes(newItem, !!isInterState);
                setItems(prev => [...prev, newItem]);
            }
        }
        setSmartCalcInput('');
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1118] text-slate-300">
            <div className="w-10 h-10 border-2 border-[#00E599] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-bold text-slate-400">Loading Tally masters &amp; party ledgers...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0B1118] text-slate-100 pb-44 font-sans">
            {/* Sticky Modern Top Header */}
            <header className="sticky top-0 z-40 bg-[#0B1118]/95 backdrop-blur-md border-b border-[#1E2B38] px-3.5 sm:px-6 py-2.5 sm:py-3 shadow-sm">
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-9 h-9 rounded-xl bg-[#142032] border border-[#22334c] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all shrink-0 cursor-pointer shadow-xs"
                            aria-label="Back"
                        >
                            <ChevronLeft size={22} />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none truncate">
                                    {paymentMode === 'CASH' ? 'Cash Invoice' : 'Credit Sale'}
                                </h1>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                    paymentMode === 'CASH'
                                        ? 'bg-[#00E599]/15 text-[#00E599] border border-[#00E599]/30'
                                        : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                }`}>
                                    {paymentMode}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">No:</span>
                                <input
                                    value={invoiceNumber}
                                    onChange={e => setInvoiceNumber(e.target.value)}
                                    className="bg-[#142032] border border-[#22334C] rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-200 outline-none focus:border-[#00E599] w-28 sm:w-32"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setShowPreview(true)}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#16202C] hover:bg-[#1E2D3D] border border-[#22334C] text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
                            title="Preview Invoice"
                        >
                            <Eye size={17} />
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex items-center gap-1.5 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-[#00E599] hover:bg-[#00c985] text-[#0B1118] rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Save size={15} />
                            <span>{submitting ? 'Saving...' : 'Save'}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Form Body */}
            <div className="max-w-5xl mx-auto p-3 sm:p-5 space-y-4">
                {/* Customer & Billing Card */}
                <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row gap-3.5">
                        {/* Customer Autocomplete */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5 px-0.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                                    Customer / Party Name *
                                </label>
                                {selectedCustomer?.closing_balance ? (
                                    <span className="text-[10px] font-bold text-[#00E599]">
                                        Current Bal: {formatCurrency(selectedCustomer.closing_balance)}
                                    </span>
                                ) : null}
                            </div>
                            <Autocomplete
                                options={partyLedgers.map(l => ({
                                    id: l.id,
                                    label: l.name,
                                    subLabel: l.closing_balance > 0 ? `Bal: ₹${l.closing_balance}` : (l.parent ? `(${l.parent})` : undefined)
                                }))}
                                value={selectedCustomerId}
                                onChange={setSelectedCustomerId}
                                placeholder={loading ? "Loading parties..." : "Search Customer / Party..."}
                                type="customer"
                            />
                        </div>

                        {/* Invoice Date */}
                        <div className="w-full md:w-44">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5 block px-0.5">
                                Invoice Date
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-[#16202C] border border-[#22334C] rounded-xl py-2 px-3 text-xs sm:text-sm font-bold text-white outline-none focus:border-[#00E599] transition-colors"
                            />
                        </div>
                    </div>

                    {/* Mode Toggle & Extras Row */}
                    <div className="flex items-center justify-between gap-2.5 flex-wrap pt-2 border-t border-[#1E2B38]">
                        {/* Payment Mode Pills */}
                        <div className="flex bg-[#0B1118] p-1 rounded-xl border border-[#1E2B38] w-48 shadow-inner">
                            <button
                                type="button"
                                onClick={() => setPaymentMode('CASH')}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    paymentMode === 'CASH'
                                        ? 'bg-[#00E599]/20 text-[#00E599] border border-[#00E599]/40 shadow-xs'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Cash
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentMode('CREDIT')}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    paymentMode === 'CREDIT'
                                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Credit
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {previousBalance > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setIncludePreviousBalance(!includePreviousBalance)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase transition-all cursor-pointer ${
                                        includePreviousBalance
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                            : 'bg-[#16202C] text-slate-400 border-[#22334C] hover:text-white'
                                    }`}
                                >
                                    <Banknote size={13} />
                                    <span>Bal: ₹{previousBalance.toLocaleString()} {includePreviousBalance ? '✓' : '+'}</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setShowSmartCalculator(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16202C] hover:bg-[#1E2D3D] text-[#00E599] rounded-xl border border-[#00E599]/30 transition-all cursor-pointer shadow-xs"
                            >
                                <Calculator size={15} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Smart Calc</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Items Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            Added Items ({items.length})
                        </span>
                        {items.length > 0 && (
                            <span className="text-xs font-bold text-slate-300">
                                Subtotal: {formatCurrency(subtotal)}
                            </span>
                        )}
                    </div>

                    <AnimatePresence mode="popLayout">
                        {items.map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-[#121B24] hover:bg-[#152330] p-3.5 sm:p-4 rounded-2xl border border-[#1E2B38] hover:border-[#2A3F55] shadow-sm flex items-center justify-between gap-3 group transition-all cursor-pointer"
                                onClick={() => { setActiveItemIndex(idx); setShowItemModal(true); }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-[#16202C] border border-[#22334C] flex items-center justify-center text-[#00E599] shrink-0">
                                        <Package size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs sm:text-sm font-black text-white leading-tight truncate">
                                            {item.description || 'Select Product...'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-slate-400">
                                                {item.quantity} {item.unit || 'units'} × ₹{item.rate}
                                            </span>
                                            {item.gstRate > 0 && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                                    {item.gstRate}% GST
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right flex items-center gap-3 shrink-0">
                                    <div>
                                        <p className="text-xs sm:text-sm font-black text-[#00E599]">
                                            {formatCurrency(item.totalAmount)}
                                        </p>
                                        <p className="text-[9px] font-medium text-slate-400">
                                            Tap to edit
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }}
                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                        title="Remove item"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Add Item Button */}
                    <button
                        type="button"
                        onClick={handleAddItem}
                        className="w-full py-4 rounded-2xl border-2 border-dashed border-[#00E599]/30 bg-[#00E599]/5 hover:bg-[#00E599]/10 text-[#00E599] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-xs"
                    >
                        <Plus size={17} />
                        <span>Add New Item</span>
                    </button>
                </div>

                {/* Notes Input */}
                <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-3.5 shadow-sm">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                        Invoice Remarks / Notes (Optional)
                    </label>
                    <input
                        type="text"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Add delivery terms, transporter, or invoice notes..."
                        className="w-full bg-[#16202C] border border-[#22334C] rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 outline-none focus:border-[#00E599] transition-colors"
                    />
                </div>
            </div>

            {/* Modern Bottom Summary Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#0B1118]/95 backdrop-blur-xl border-t border-[#1E2B38] p-3 sm:p-4 z-30 shadow-2xl">
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-3">
                        <div className="px-3.5 py-2 rounded-xl bg-[#00E599]/10 border border-[#00E599]/25 flex flex-col items-start justify-center">
                            <span className="text-[8px] font-black uppercase text-[#00E599] tracking-wider leading-none">
                                Net Payable
                            </span>
                            <span className="text-base sm:text-xl font-black text-white leading-tight mt-0.5">
                                ₹{Math.ceil(total).toLocaleString('en-IN')}
                            </span>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Discount</span>
                                {billDiscount > 0 && (
                                    <span className="text-[9px] font-black text-[#00E599]">
                                        -₹{billDiscount.toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                                <select
                                    value={discountType}
                                    onChange={e => setDiscountType(e.target.value as any)}
                                    className="bg-[#16202C] border border-[#22334C] text-[10px] font-bold text-slate-200 py-1 px-1.5 rounded-lg outline-none"
                                >
                                    <option value="PERCENTAGE">%</option>
                                    <option value="AMOUNT">₹</option>
                                </select>
                                <input
                                    type="number"
                                    value={discountValue || ''}
                                    onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-16 bg-[#16202C] border border-[#22334C] text-xs font-black text-white py-1 px-2 rounded-lg outline-none focus:border-[#00E599]"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleAddItem}
                            className="w-10 h-10 rounded-xl bg-[#16202C] border border-[#22334C] text-slate-300 flex items-center justify-center hover:bg-[#1E2D3D] active:scale-95 transition-all md:hidden cursor-pointer"
                            title="Add Item"
                        >
                            <Plus size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="bg-[#00E599] hover:bg-[#00c985] text-[#0B1118] px-5 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <Save size={16} />
                            <span>{submitting ? 'Saving...' : 'Save Invoice'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Item Detail Modal */}
            <AnimatePresence>
                {showItemModal && activeItemIndex !== null && (
                    <div className="fixed inset-0 z-50 flex flex-col justify-end">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowItemModal(false)}
                            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="relative bg-[#0B1118] border-t border-[#1E2B38] w-full max-h-[90vh] rounded-t-3xl shadow-2xl flex flex-col"
                        >
                            <div className="p-4 pb-2 border-b border-[#1E2B38] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Package size={16} className="text-[#00E599]" />
                                    <h3 className="text-sm font-black text-white">Item Details</h3>
                                </div>
                                <button
                                    onClick={() => setShowItemModal(false)}
                                    className="p-1.5 rounded-lg bg-[#16202C] border border-[#22334C] text-slate-400 hover:text-white"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-2xl mx-auto w-full">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5 block">
                                        Select Stock Item *
                                    </label>
                                    <Autocomplete
                                        options={stockItems.map(s => ({
                                            id: s.id,
                                            label: s.name,
                                            subLabel: `Stock: ${s.current_stock || 0} ${s.unit || ''}`
                                        }))}
                                        value={items[activeItemIndex].productId}
                                        onChange={(val) => handleUpdateItem(activeItemIndex, 'productId', val)}
                                        placeholder="Search stock product..."
                                        type="product"
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-[#121B24] border border-[#1E2B38] p-3.5 rounded-2xl">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                            Quantity
                                        </label>
                                        <input
                                            type="number"
                                            value={items[activeItemIndex].quantity || ''}
                                            onChange={e => handleUpdateItem(activeItemIndex, 'quantity', e.target.value)}
                                            className="w-full bg-transparent text-2xl font-black text-[#00E599] outline-none"
                                            placeholder="1"
                                        />
                                    </div>
                                    <div className="bg-[#121B24] border border-[#1E2B38] p-3.5 rounded-2xl">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                            Rate (₹)
                                        </label>
                                        <input
                                            type="number"
                                            value={items[activeItemIndex].rate || ''}
                                            onChange={e => handleUpdateItem(activeItemIndex, 'rate', e.target.value)}
                                            className="w-full bg-transparent text-2xl font-black text-white outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-[#121B24] border border-[#1E2B38] p-3.5 rounded-2xl">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                            Discount Type
                                        </label>
                                        <select
                                            value={items[activeItemIndex].discountType || 'PERCENTAGE'}
                                            onChange={e => handleUpdateItem(activeItemIndex, 'discountType', e.target.value)}
                                            className="w-full bg-[#16202C] border border-[#22334C] text-xs font-bold text-white p-1.5 rounded-lg outline-none"
                                        >
                                            <option value="PERCENTAGE">% Percentage</option>
                                            <option value="AMOUNT">₹ Amount</option>
                                        </select>
                                    </div>
                                    <div className="bg-[#121B24] border border-[#1E2B38] p-3.5 rounded-2xl">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                            Discount Value
                                        </label>
                                        <input
                                            type="number"
                                            value={items[activeItemIndex].discountValue || ''}
                                            onChange={e => handleUpdateItem(activeItemIndex, 'discountValue', parseFloat(e.target.value))}
                                            className="w-full bg-transparent text-2xl font-black text-white outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                <div className="bg-gradient-to-r from-[#122B22] to-[#121B24] border border-[#00E599]/30 p-4 sm:p-5 rounded-2xl flex justify-between items-center shadow-md">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-[#00E599] tracking-wider mb-0.5">
                                            Row Total
                                        </p>
                                        <p className="text-2xl sm:text-3xl font-black text-white">
                                            ₹{items[activeItemIndex].totalAmount.toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="bg-[#0B1118]/80 border border-[#1E2B38] px-2.5 py-1 rounded-xl">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">GST Rate (%)</p>
                                            <input
                                                type="number"
                                                value={items[activeItemIndex].gstRate || 0}
                                                onChange={e => handleUpdateItem(activeItemIndex, 'gstRate', parseFloat(e.target.value) || 0)}
                                                className="w-14 bg-transparent text-xs font-black text-[#00E599] outline-none text-right"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-3.5 sm:p-4 bg-[#121B24] border-t border-[#1E2B38] flex gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleAddItem}
                                    className="flex-1 py-3 bg-[#16202C] hover:bg-[#1E2D3D] text-slate-200 border border-[#22334C] rounded-xl font-bold text-xs uppercase tracking-wider active:scale-95 transition-all"
                                >
                                    + Add Next
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowItemModal(false)}
                                    className="flex-[2] py-3 bg-[#00E599] hover:bg-[#00c985] text-[#0B1118] rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
                                >
                                    Save &amp; Done
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Smart Calculator Drawer */}
            <AnimatePresence>
                {showSmartCalculator && (
                    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSmartCalculator(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="relative bg-[#0B1118] border-t border-[#1E2B38] w-full rounded-t-3xl overflow-hidden"
                        >
                            <div className="p-4 border-b border-[#1E2B38] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Calculator size={18} className="text-[#00E599]" />
                                    <h2 className="text-sm font-black text-white">Smart Billing Keypad</h2>
                                </div>
                                <button onClick={() => setShowSmartCalculator(false)} className="p-1.5 rounded-lg bg-[#16202C] border border-[#22334C] text-slate-400 hover:text-white">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="p-4 sm:p-6 space-y-4 max-w-sm mx-auto">
                                <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl p-4 text-right relative">
                                    <div className="absolute top-2 left-3 text-[10px] font-black text-[#00E599] uppercase">
                                        {calcError || 'Awaiting ID * QTY'}
                                    </div>
                                    <div className="text-3xl font-black font-mono tracking-widest text-white mt-3">
                                        {smartCalcInput || '0'}
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                    {[7, 8, 9].map(n => (
                                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-14 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xl font-black text-white hover:bg-[#1C2A3A]">
                                            {n}
                                        </button>
                                    ))}
                                    <button onClick={() => handleSmartCalcInput('C')} className="h-14 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-black">CLR</button>

                                    {[4, 5, 6].map(n => (
                                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-14 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xl font-black text-white hover:bg-[#1C2A3A]">
                                            {n}
                                        </button>
                                    ))}
                                    <button onClick={() => handleSmartCalcInput('*')} className="h-14 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex flex-col items-center justify-center font-black">
                                        <span className="text-base">×</span>
                                        <span className="text-[7px] uppercase tracking-wider">QTY</span>
                                    </button>

                                    {[1, 2, 3].map(n => (
                                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-14 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xl font-black text-white hover:bg-[#1C2A3A]">
                                            {n}
                                        </button>
                                    ))}
                                    <button onClick={() => handleSmartCalcInput('+')} className="row-span-2 h-full rounded-xl bg-[#00E599] text-[#0B1118] text-2xl font-black shadow-md">+</button>

                                    <button onClick={() => handleSmartCalcInput('0')} className="col-span-2 h-14 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xl font-black text-white">0</button>
                                    <button onClick={() => handleSmartCalcInput('-')} className="h-14 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex flex-col items-center justify-center font-black">
                                        <Trash2 size={16} />
                                        <span className="text-[7px] uppercase tracking-wider">DEL</span>
                                    </button>
                                </div>

                                <div className="flex gap-2.5 pt-2">
                                    <button
                                        onClick={() => setShowSmartCalculator(false)}
                                        className="flex-1 py-3 bg-[#16202C] border border-[#22334C] text-slate-300 rounded-xl font-bold text-xs uppercase"
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={() => setShowSmartCalculator(false)}
                                        className="flex-[2] py-3 bg-[#00E599] text-[#0B1118] rounded-xl font-black text-xs uppercase shadow-md"
                                    >
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Preview Verification Overlay */}
            <AnimatePresence>
                {showPreview && (
                    <motion.div
                        initial={{ opacity: 0, y: "100%" }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: "100%" }}
                        className="fixed inset-0 z-[200] bg-[#0B1118] flex flex-col font-sans"
                    >
                        <div className="p-4 border-b border-[#1E2B38] flex items-center justify-between">
                            <h2 className="text-sm sm:text-base font-black text-white tracking-tight">Invoice Review &amp; Verification</h2>
                            <button onClick={() => setShowPreview(false)} className="p-1.5 bg-[#16202C] border border-[#22334C] rounded-xl text-slate-300">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-3xl mx-auto w-full">
                            <div className="flex justify-between items-start bg-[#121B24] border border-[#1E2B38] p-4 rounded-2xl">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Customer / Party</p>
                                    <p className="text-lg font-black text-white">
                                        {ledgers.find(l => l.id === selectedCustomerId)?.name || (paymentMode === 'CASH' ? 'Cash Customer' : 'Select Customer')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Date</p>
                                    <p className="text-sm font-bold text-white">{format(new Date(date), 'dd MMM yyyy')}</p>
                                </div>
                            </div>

                            <div className="bg-[#121B24] border border-[#1E2B38] rounded-2xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-[#16202C] border-b border-[#1E2B38]">
                                        <tr>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Item</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase">Qty</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1E2B38] text-xs font-bold">
                                        {items.map((item, i) => (
                                            <tr key={i} className="hover:bg-[#16202C]/40">
                                                <td className="px-4 py-3 text-white">{item.description}</td>
                                                <td className="px-4 py-3 text-center text-slate-300">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right text-[#00E599]">₹{item.totalAmount.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-[#16202C]/60 border-t border-[#1E2B38]">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-3 text-xs font-black text-slate-300 uppercase text-right">Net Payable:</td>
                                            <td className="px-4 py-3 text-right text-base font-black text-[#00E599]">₹{total.toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div className="p-4 bg-[#121B24] border-t border-[#1E2B38] flex gap-3">
                            <button onClick={() => setShowPreview(false)} className="flex-1 py-3 bg-[#16202C] border border-[#22334C] text-slate-300 rounded-xl font-bold text-xs uppercase">
                                Edit Bill
                            </button>
                            <button onClick={handleSubmit} className="flex-[2] py-3 bg-[#00E599] text-[#0B1118] rounded-xl font-black text-xs uppercase shadow-md">
                                Confirm &amp; Save
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
