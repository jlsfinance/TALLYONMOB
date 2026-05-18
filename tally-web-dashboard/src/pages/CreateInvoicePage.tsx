import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ledgerApi, masterApi } from '@/lib/supabase';
import { format } from 'date-fns';
import {
    Plus, Trash2, Save, Eye, X, Banknote, ArrowLeft,
    AlertCircle, Calculator, Package, UserPlus, User,
    Phone, ChevronRight, Search, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Autocomplete from '@/components/shared/Autocomplete';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// Toast notification component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[9999] flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border ${
                type === 'success'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-500/30'
                    : 'bg-red-600 text-white border-red-400 shadow-red-500/30'
            }`}
        >
            {type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            <span className="text-sm font-bold">{message}</span>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-all">
                <X size={18} />
            </button>
        </motion.div>
    );
}

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
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const modalRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const selectedCustomer = ledgers.find(l => l.id === selectedCustomerId);
    const previousBalance = selectedCustomer?.closing_balance || 0;

    // Load Data
    useEffect(() => {
        if (selectedCompany) loadMasters();
    }, [selectedCompany]);

    const loadMasters = async () => {
        setLoading(true);
        try {
            const [lRes, sRes] = await Promise.all([
                ledgerApi.list(selectedCompany.id),
                masterApi.getStockItems(selectedCompany.id)
            ]);
            setLedgers(lRes.data || []);
            setStockItems(sRes.data || []);

            // Set initial invoice number placeholder
            setInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`);
        } catch (error) {
            console.error('Error loading masters:', error);
        } finally {
            setLoading(false);
        }
    };

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
            }
        } else {
            (item as any)[field] = value;
        }

        // Recalculate Row
        const qty = parseFloat(item.quantity as any) || 0;
        const rate = parseFloat(item.rate as any) || 0;

        // Handle Item Discount
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
        if (!selectedCustomerId) {
            setToast({ message: 'Please select a customer', type: 'error' });
            return;
        }
        if (items.length === 0) {
            setToast({ message: 'Please add at least one item', type: 'error' });
            return;
        }
        if (items.some(i => !i.productId)) {
            setToast({ message: 'Some items have no product selected', type: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            const customer = ledgers.find(l => l.id === selectedCustomerId);
            const invoiceData: Invoice = {
                id: crypto.randomUUID(),
                invoiceNumber,
                customerId: selectedCustomerId,
                customerName: customer?.name || 'Cash Customer',
                customerGstin: customer?.gstin,
                customerState: customer?.state,
                date,
                dueDate,
                items,
                subtotal,
                totalCgst: cgst,
                totalSgst: sgst,
                totalIgst: igst,
                total,
                discountType,
                discountValue,
                discountAmount: billDiscount,
                paymentMode,
                notes,
                gstEnabled: (cgst + sgst + igst) > 0
            };

            // Post to backend API (which saves to pending_transactions in Supabase)
            const res = await fetch(`${API_BASE}/payments/pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: selectedCompany.id,
                    voucherType: 'Sales',
                    voucherData: invoiceData
                })
            });

            const result = await res.json();

            if (!res.ok || !result.success) {
                throw new Error(result.error || result.message || 'Failed to save invoice');
            }

            setToast({
                message: `✅ Invoice saved! It will be synced to Tally shortly.`,
                type: 'success'
            });

            setTimeout(() => navigate('/sales'), 2000);
        } catch (error: any) {
            console.error('Error saving invoice:', error);
            setToast({
                message: error?.message || 'Failed to save invoice. Please try again.',
                type: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Keypad Logic for Smart Billing
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
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-blue-500" />
        </div>
    );

    return (
        <div className="min-h-screen bg-[var(--background)] pb-48 font-sans">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 py-4 md:px-6">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(-1)} className="p-2 hover:bg-[var(--surface-active)] rounded-full text-[var(--on-surface)]">
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-[var(--on-surface)] tracking-tight">
                                {paymentMode === 'CASH' ? 'Cash Invoice' : 'Credit Sale'}
                            </h1>
                            <input
                                value={invoiceNumber}
                                onChange={e => setInvoiceNumber(e.target.value)}
                                className="bg-transparent text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest outline-none border-b border-transparent focus:border-blue-500 w-32"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPreview(true)}
                            className="p-3 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-2xl hover:bg-[var(--surface-active)] transition-all shadow-sm"
                        >
                            <Eye size={20} />
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                        >
                            <Save size={18} />
                            {submitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-4 space-y-4">
                {/* Customer & Settings Section */}
                <div className="bg-white dark:bg-slate-900/50 p-5 rounded-[32px] border border-[var(--border)] shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block px-1">Customer Selection</label>
                            <Autocomplete
                                options={ledgers.map(l => ({ id: l.id, label: l.name, subLabel: l.closing_balance > 0 ? `Bal: ₹${l.closing_balance}` : undefined }))}
                                value={selectedCustomerId}
                                onChange={setSelectedCustomerId}
                                placeholder="Search Customer..."
                                type="customer"
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block px-1">Invoice Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-[var(--surface-variant)] border-2 border-transparent rounded-2xl py-3 px-4 text-sm font-bold text-[var(--on-surface)] outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex bg-[var(--surface-variant)] p-1.5 rounded-2xl border border-[var(--border)] flex-1 md:max-w-xs">
                            <button
                                onClick={() => setPaymentMode('CASH')}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMode === 'CASH' ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-sm' : 'text-[var(--text-muted)]'}`}
                            >
                                Cash
                            </button>
                            <button
                                onClick={() => setPaymentMode('CREDIT')}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMode === 'CREDIT' ? 'bg-white dark:bg-slate-800 text-blue-500 shadow-sm' : 'text-[var(--text-muted)]'}`}
                            >
                                Credit
                            </button>
                        </div>

                        {previousBalance > 0 && (
                            <button
                                onClick={() => setIncludePreviousBalance(!includePreviousBalance)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all ${includePreviousBalance ? 'bg-amber-500 text-white border-amber-600' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}
                            >
                                <Banknote size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Bal: ₹{previousBalance.toLocaleString()} {includePreviousBalance ? '✓' : '+'}</span>
                            </button>
                        )}

                        <button
                            onClick={() => setShowSmartCalculator(true)}
                            className="flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                        >
                            <Calculator size={20} />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Smart Billing</span>
                        </button>
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Added Items ({items.length})</span>
                    </div>

                    <AnimatePresence mode="popLayout">
                        {items.map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white dark:bg-slate-900/50 p-4 rounded-[24px] border border-[var(--border)] shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer"
                                onClick={() => { setActiveItemIndex(idx); setShowItemModal(true); }}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--surface-variant)] flex items-center justify-center text-[var(--text-muted)]">
                                        <Package size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-[var(--on-surface)] leading-tight">{item.description || 'Select Item'}</p>
                                        <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">
                                            {item.quantity} units x ₹{item.rate}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                    <div>
                                        <p className="text-sm font-black text-[var(--on-surface)]">₹{item.totalAmount.toLocaleString('en-IN')}</p>
                                        {item.gstRate > 0 && <p className="text-[9px] font-bold text-blue-500">{item.gstRate}% GST Incl.</p>}
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }}
                                        className="p-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 rounded-lg"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    <button
                        onClick={handleAddItem}
                        className="w-full py-6 rounded-[32px] border-2 border-dashed border-blue-500/30 bg-blue-500/5 text-blue-500 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-500/10 transition-all active:scale-[0.98]"
                    >
                        <Plus size={20} />
                        Add New Item
                    </button>
                </div>
            </div>

            {/* Bottom Summary Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-t border-[var(--border)] p-4 pb-8 md:pb-6 z-30">
                <div className="max-w-5xl mx-auto flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex flex-col items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <span className="text-[7px] font-black uppercase mb-0.5 opacity-70">Payable</span>
                            <span className="text-lg font-black leading-none">₹{Math.ceil(total).toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Total Bill</span>
                                {billDiscount > 0 && <span className="text-[9px] font-black text-emerald-500 uppercase">Save ₹{billDiscount.toLocaleString()}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <select
                                    value={discountType}
                                    onChange={e => setDiscountType(e.target.value as any)}
                                    className="bg-[var(--surface-variant)] text-[9px] font-black p-1 rounded-md outline-none"
                                >
                                    <option value="PERCENTAGE">% Disc</option>
                                    <option value="AMOUNT">₹ Flat</option>
                                </select>
                                <input
                                    type="number"
                                    value={discountValue || ''}
                                    onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-16 bg-[var(--surface-variant)] text-xs font-black p-1.5 rounded-md outline-none border border-transparent focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAddItem}
                            className="bg-[var(--surface-variant)] text-[var(--on-surface)] p-4 rounded-2xl hover:bg-[var(--surface-active)] transition-all md:hidden"
                            title="Add Item"
                        >
                            <Plus size={20} />
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="bg-blue-600 text-white px-8 md:px-10 py-4 rounded-[24px] md:rounded-[28px] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <Save size={18} />
                            <span className="hidden sm:inline">Save Invoice</span>
                            <span className="sm:hidden">Save</span>
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
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="relative bg-[var(--background)] w-full max-h-[90vh] rounded-t-[40px] shadow-2xl flex flex-col"
                        >
                            <div className="p-6 pb-2">
                                <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto mb-4" />
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 pt-0">
                                <div key={activeItemIndex} className="space-y-6 max-w-2xl mx-auto">
                                    <div>
                                        <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 block px-1">Item Selection</label>
                                        <Autocomplete
                                            options={stockItems.map(s => ({ id: s.id, label: s.name, subLabel: `Stock: ${s.current_stock || 0} ${s.unit || ''}` }))}
                                            value={items[activeItemIndex].productId}
                                            onChange={(val) => handleUpdateItem(activeItemIndex, 'productId', val)}
                                            placeholder="Search Product..."
                                            type="product"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-[var(--surface-variant)] p-5 rounded-3xl">
                                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Quantity</label>
                                            <input
                                                type="number"
                                                value={items[activeItemIndex].quantity || ''}
                                                onChange={e => handleUpdateItem(activeItemIndex, 'quantity', e.target.value)}
                                                className="w-full bg-transparent text-3xl font-black text-blue-500 outline-none"
                                                placeholder="1"
                                            />
                                        </div>
                                        <div className="bg-[var(--surface-variant)] p-5 rounded-3xl">
                                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Rate (Price)</label>
                                            <input
                                                type="number"
                                                value={items[activeItemIndex].rate || ''}
                                                onChange={e => handleUpdateItem(activeItemIndex, 'rate', e.target.value)}
                                                className="w-full bg-transparent text-3xl font-black text-[var(--on-surface)] outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-[var(--surface-variant)] p-5 rounded-3xl">
                                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Discount Type</label>
                                            <select
                                                value={items[activeItemIndex].discountType || 'PERCENTAGE'}
                                                onChange={e => handleUpdateItem(activeItemIndex, 'discountType', e.target.value)}
                                                className="w-full bg-transparent text-sm font-bold text-[var(--on-surface)] outline-none"
                                            >
                                                <option value="PERCENTAGE">% Percentage</option>
                                                <option value="AMOUNT">₹ Amount</option>
                                            </select>
                                        </div>
                                        <div className="bg-[var(--surface-variant)] p-5 rounded-3xl">
                                            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Discount Value</label>
                                            <input
                                                type="number"
                                                value={items[activeItemIndex].discountValue || ''}
                                                onChange={e => handleUpdateItem(activeItemIndex, 'discountValue', parseFloat(e.target.value))}
                                                className="w-full bg-transparent text-3xl font-black text-[var(--on-surface)] outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-blue-600 p-8 rounded-[40px] text-white flex justify-between items-center shadow-xl shadow-blue-500/30">
                                        <div>
                                            <p className="text-[10px] font-black uppercase opacity-70 tracking-widest mb-1">Row Total</p>
                                            <p className="text-5xl font-black tracking-tighter">₹{items[activeItemIndex].totalAmount.toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="bg-white/20 px-3 py-1.5 rounded-xl border border-white/20">
                                                <p className="text-[10px] font-black uppercase tracking-tight">GST Rate (%)</p>
                                                <input
                                                    type="number"
                                                    value={items[activeItemIndex].gstRate || 0}
                                                    onChange={e => handleUpdateItem(activeItemIndex, 'gstRate', parseFloat(e.target.value) || 0)}
                                                    className="w-16 bg-transparent text-sm font-black text-white outline-none text-right"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <div className="p-6 bg-[var(--background)] border-t border-[var(--border)] flex gap-3">
                                <button
                                    onClick={handleAddItem}
                                    className="flex-1 py-5 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-[var(--surface-active)]"
                                >
                                    Save & Add Next
                                </button>
                                <button
                                    onClick={() => setShowItemModal(false)}
                                    className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] shadow-lg shadow-blue-500/20"
                                >
                                    Save & Done
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )
                }
            </AnimatePresence >

            {/* Smart Calculator Drawer */}
            <AnimatePresence>
                {
                    showSmartCalculator && (
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
                                className="relative bg-[var(--background)] w-full rounded-t-[40px] overflow-hidden"
                            >
                                <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                                            <Calculator size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black text-[var(--on-surface)]">Smart Billing</h2>
                                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Entry: ID * QTY</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowSmartCalculator(false)} className="p-3 hover:bg-[var(--surface-active)] rounded-2xl">
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="p-6 space-y-6">
                                    <div className="bg-[var(--surface-variant)] rounded-3xl p-6 text-right relative overflow-hidden">
                                        <div className="absolute top-0 left-0 p-3 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                                            {calcError || 'Awaiting ID'}
                                        </div>
                                        <div className="text-5xl font-black font-mono tracking-widest text-[var(--on-surface)]">
                                            {smartCalcInput || '0'}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-4 gap-3">
                                        {[7, 8, 9].map(n => (
                                            <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)]">
                                                {n}
                                            </button>
                                        ))}
                                        <button onClick={() => handleSmartCalcInput('C')} className="h-20 rounded-2xl bg-red-500/10 text-red-500 text-xl font-black">CLR</button>

                                        {[4, 5, 6].map(n => (
                                            <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)]">
                                                {n}
                                            </button>
                                        ))}
                                        <button onClick={() => handleSmartCalcInput('*')} className="h-20 rounded-2xl bg-indigo-500/10 text-indigo-500 flex flex-col items-center justify-center font-black">
                                            <span className="text-2xl">×</span>
                                            <span className="text-[8px] uppercase tracking-widest">QTY</span>
                                        </button>

                                        {[1, 2, 3].map(n => (
                                            <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)]">
                                                {n}
                                            </button>
                                        ))}
                                        <button onClick={() => handleSmartCalcInput('+')} className="row-span-2 h-full rounded-2xl bg-blue-600 text-white text-3xl font-black shadow-lg shadow-blue-500/20">+</button>

                                        <button onClick={() => handleSmartCalcInput('0')} className="col-span-2 h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)]">0</button>
                                        <button onClick={() => handleSmartCalcInput('-')} className="h-20 rounded-2xl bg-orange-500/10 text-orange-500 flex flex-col items-center justify-center font-black">
                                            <Trash2 size={24} />
                                            <span className="text-[8px] uppercase tracking-widest">REM</span>
                                        </button>
                                    </div>

                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setShowSmartCalculator(false)}
                                            className="flex-1 py-5 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-3xl font-black text-xs uppercase tracking-widest"
                                        >
                                            Close Keypad
                                        </button>
                                        <button
                                            onClick={() => setShowSmartCalculator(false)}
                                            className="flex-[2] py-5 bg-emerald-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                                        >
                                            Confirm Items
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Preview Verification Overlay */}
            <AnimatePresence>
                {
                    showPreview && (
                        <motion.div
                            initial={{ opacity: 0, y: "100%" }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: "100%" }}
                            className="fixed inset-0 z-[200] bg-[var(--background)] flex flex-col"
                        >
                            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                                <h2 className="text-xl font-black text-[var(--on-surface)] tracking-tight">Invoice Verification</h2>
                                <button onClick={() => setShowPreview(false)} className="p-3 bg-[var(--surface-variant)] rounded-2xl">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="max-w-3xl mx-auto space-y-8">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Customer</p>
                                            <p className="text-2xl font-black text-[var(--on-surface)]">
                                                {ledgers.find(l => l.id === selectedCustomerId)?.name || 'Walk-in Customer'}
                                            </p>
                                        </div>
                                        <div className="text-right space-y-1">
                                            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Invoice Date</p>
                                            <p className="text-lg font-black text-[var(--on-surface)]">{format(new Date(date), 'dd MMM yyyy')}</p>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-900/50 rounded-[32px] border border-[var(--border)] overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-[var(--surface-variant)]">
                                                <tr>
                                                    <th className="px-6 py-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Item Name</th>
                                                    <th className="px-6 py-4 text-center text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Qty</th>
                                                    <th className="px-6 py-4 text-right text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border)] text-sm font-bold">
                                                {items.map((item, i) => (
                                                    <tr key={i}>
                                                        <td className="px-6 py-4 text-[var(--on-surface)]">{item.description}</td>
                                                        <td className="px-6 py-4 text-center text-[var(--text-muted)]">{item.quantity}</td>
                                                        <td className="px-6 py-4 text-right text-[var(--on-surface)]">₹{item.totalAmount.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-[var(--surface-variant)]/50">
                                                <tr>
                                                    <td colSpan={2} className="px-6 py-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-right">Net Payable</td>
                                                    <td className="px-6 py-4 text-right text-xl font-black text-blue-600">₹{total.toLocaleString()}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    <div className="p-6 bg-blue-600/5 border border-blue-600/10 rounded-3xl flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                                            <AlertCircle size={24} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-[var(--on-surface)]">Final Review Required</p>
                                            <p className="text-xs text-[var(--text-muted)]">Please ensure all items and totals are correct before committing to Tally.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-[var(--surface-variant)] flex gap-4">
                                <button onClick={() => setShowPreview(false)} className="flex-1 py-5 bg-white dark:bg-slate-800 text-[var(--on-surface)] rounded-3xl font-black text-xs uppercase tracking-widest shadow-sm">
                                    Go Back
                                </button>
                                <button onClick={handleSubmit} className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20">
                                    Confirm & Save Invoice
                                </button>
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence >

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}
