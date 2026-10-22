import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ledgerApi, masterApi } from '@/lib/supabase';
import { format } from 'date-fns';
import {
    Plus, Trash2, Save, Eye, X, Banknote, ArrowLeft,
    AlertCircle, Calculator, Package, User, CheckCircle2,
    ChevronLeft, ChevronRight, Check, ShoppingCart, CreditCard,
    FileText, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Autocomplete from '@/components/shared/Autocomplete';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// ─── Types ────────────────────────────────────────────
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

// ─── Steps ────────────────────────────────────────────
const STEPS = [
    { id: 0, label: 'Customer & Details', icon: FileText },
    { id: 1, label: 'Line Items', icon: ShoppingCart },
    { id: 2, label: 'Review & Confirm', icon: CheckCircle2 },
];

// ─── Floating Label Input ─────────────────────────────
function FloatingInput({ label, icon: Icon, error, success, touched, ...props }: {
    label: string;
    icon?: any;
    error?: string;
    success?: boolean;
    touched?: boolean;
    value?: string | number;
    type?: string;
    placeholder?: string;
    onChange?: any;
    className?: string;
    wrapperClassName?: string;
}) {
    const hasValue = props.value !== undefined && props.value !== '' && props.value !== 0;
    const showError = touched && error;
    const showSuccess = touched && success && !error;

    return (
        <div className={`relative ${props.wrapperClassName || ''}`}>
            <div className={`
                relative rounded-2xl border-2 transition-all duration-200 bg-[var(--surface-variant)]
                ${showError ? 'border-red-400 bg-red-50 dark:bg-red-500/5' : ''}
                ${showSuccess ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/5' : ''}
                ${!showError && !showSuccess && hasValue ? 'border-blue-400' : ''}
                ${!showError && !showSuccess && !hasValue ? 'border-transparent' : ''}
                group-focus-within:border-blue-500
            `}>
                <div className="relative px-4 pt-5 pb-2">
                    {/* Floating Label */}
                    <label className={`
                        absolute left-4 transition-all duration-200 pointer-events-none
                        ${hasValue || props.value === 0
                            ? 'top-1.5 text-[9px] font-black uppercase tracking-widest'
                            : 'top-1/2 -translate-y-1/2 text-sm font-bold'
                        }
                        ${showError ? 'text-red-500' : ''}
                        ${showSuccess ? 'text-emerald-500' : ''}
                        ${!showError && !showSuccess && hasValue ? 'text-blue-500' : ''}
                        ${!showError && !showSuccess && !hasValue ? 'text-[var(--text-muted)]' : ''}
                    `}>
                        {label}
                    </label>
                    {Icon && (
                        <div className={`
                            absolute right-4 top-1/2 -translate-y-1/2 transition-colors
                            ${showError ? 'text-red-400' : ''}
                            ${showSuccess ? 'text-emerald-400' : ''}
                            ${!showError && !showSuccess ? 'text-[var(--text-muted)]' : ''}
                        `}>
                            {showSuccess ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                        </div>
                    )}
                    <input
                        {...props}
                        className={`
                            w-full bg-transparent outline-none text-sm font-bold text-[var(--on-surface)]
                            placeholder:text-[var(--text-muted)] placeholder:opacity-0
                            ${Icon ? 'pr-10' : ''}
                            ${props.className || ''}
                        `}
                    />
                </div>
            </div>
            {/* Error / Success message */}
            {showError && (
                <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] font-bold text-red-500 mt-1.5 ml-2 flex items-center gap-1"
                >
                    <AlertCircle size={12} />
                    {error}
                </motion.p>
            )}
            {showSuccess && !showError && (
                <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] font-bold text-emerald-500 mt-1.5 ml-2"
                >
                    Looks good
                </motion.p>
            )}
        </div>
    );
}

// ─── Grouped Section ──────────────────────────────────
function Section({ title, icon: Icon, children, className }: {
    title: string;
    icon?: any;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`bg-white dark:bg-slate-900/50 rounded-[32px] border border-[var(--border)] shadow-sm overflow-hidden ${className || ''}`}>
            <div className="px-5 pt-5 pb-1 flex items-center gap-2.5">
                {Icon && (
                    <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Icon size={16} />
                    </div>
                )}
                <h3 className="text-[11px] font-black text-[var(--on-surface)] uppercase tracking-widest">{title}</h3>
            </div>
            <div className="p-5 pt-4 space-y-4">
                {children}
            </div>
        </div>
    );
}

// ─── Progress Indicator ──────────────────────────────
function ProgressIndicator({ currentStep, onStepClick }: {
    currentStep: number;
    onStepClick: (step: number) => void;
}) {
    return (
        <div className="flex items-center gap-0 px-2 py-1">
            {STEPS.map((step, idx) => {
                const StepIcon = step.icon;
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                const isClickable = step.id <= currentStep;

                return (
                    <div key={step.id} className="flex items-center flex-1 last:flex-none">
                        <button
                            type="button"
                            onClick={() => isClickable && onStepClick(step.id)}
                            disabled={!isClickable}
                            className={`
                                flex items-center gap-2.5 transition-all
                                ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                                ${isActive ? 'scale-105' : ''}
                            `}
                        >
                            <div className={`
                                w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black
                                transition-all duration-300 shadow-sm
                                ${isCompleted
                                    ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                                    : isActive
                                        ? 'bg-blue-600 text-white shadow-blue-500/30 ring-4 ring-blue-500/20'
                                        : 'bg-[var(--surface-variant)] text-[var(--text-muted)]'
                                }
                            `}>
                                {isCompleted ? <Check size={18} /> : <StepIcon size={18} />}
                            </div>
                            <span className={`
                                text-[9px] font-black uppercase tracking-widest hidden md:block
                                ${isCompleted ? 'text-emerald-500' : isActive ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-muted)]'}
                            `}>
                                {step.label}
                            </span>
                        </button>
                        {idx < STEPS.length - 1 && (
                            <div className={`
                                flex-1 h-0.5 mx-3 rounded-full transition-all duration-500
                                ${isCompleted ? 'bg-emerald-400' : 'bg-[var(--border)]'}
                            `} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Toast ────────────────────────────────────────────
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

// ─── Main Component ──────────────────────────────────
export default function CreateInvoicePage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Data
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [stockItems, setStockItems] = useState<any[]>([]);

    // Multi-step
    const [currentStep, setCurrentStep] = useState(0);

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

    // Validation
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    // UI States
    const [showItemModal, setShowItemModal] = useState(false);
    const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSmartCalculator, setShowSmartCalculator] = useState(false);
    const [smartCalcInput, setSmartCalcInput] = useState('');
    const [calcError, setCalcError] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
            setInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`);
        } catch (error) {
            console.error('Error loading masters:', error);
        } finally {
            setLoading(false);
        }
    };

    // ─── Validation ──────────────────────────────────
    const getValidation = useCallback(() => {
        const errors: Record<string, string> = {};
        if (!selectedCustomerId) errors.customer = 'Please select a customer';
        if (!date) errors.date = 'Invoice date is required';
        if (items.length === 0) errors.items = 'Add at least one item';
        return errors;
    }, [selectedCustomerId, date, items]);

    const validateStep = useCallback((step: number): boolean => {
        const errors = getValidation();
        const newTouched = { ...touched };
        if (step === 0) {
            newTouched.customer = true;
            newTouched.date = true;
            if (errors.customer || errors.date) {
                setTouched(newTouched);
                return false;
            }
        }
        if (step === 1) {
            newTouched.items = true;
            if (errors.items) {
                setTouched(newTouched);
                return false;
            }
        }
        setTouched(newTouched);
        return true;
    }, [getValidation, touched]);

    const markTouched = (field: string) => {
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    const errors = getValidation();
    const canProceedFromStep0 = selectedCustomerId && date;
    const canProceedFromStep1 = items.length > 0;

    // ─── Calculations ────────────────────────────────
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
            productId: '', description: '', quantity: 1, rate: 0,
            baseAmount: 0, gstRate: 0, cgstAmount: 0, sgstAmount: 0,
            igstAmount: 0, totalAmount: 0
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

    // ─── Submit ──────────────────────────────────────
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
                id: crypto.randomUUID(), invoiceNumber,
                customerId: selectedCustomerId,
                customerName: customer?.name || 'Cash Customer',
                customerGstin: customer?.gstin, customerState: customer?.state,
                date, dueDate, items, subtotal,
                totalCgst: cgst, totalSgst: sgst, totalIgst: igst, total,
                discountType, discountValue, discountAmount: billDiscount,
                paymentMode, notes,
                gstEnabled: (cgst + sgst + igst) > 0
            };

            const res = await fetch(`${API_BASE}/payments/pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId: selectedCompany.id, voucherType: 'Sales', voucherData: invoiceData })
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || result.message || 'Failed to save invoice');
            }

            setToast({ message: `✅ Invoice saved! It will be synced to Tally shortly.`, type: 'success' });
            setTimeout(() => navigate('/sales'), 2000);
        } catch (error: any) {
            console.error('Error saving invoice:', error);
            setToast({ message: error?.message || 'Failed to save invoice. Please try again.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Smart Calc ──────────────────────────────────
    const handleSmartCalcInput = (char: string) => {
        setCalcError('');
        if (char === 'C') setSmartCalcInput('');
        else if (char === '+') { if (smartCalcInput) handleSmartAction('ADD'); }
        else if (char === '*') { if (!smartCalcInput.includes('*')) setSmartCalcInput(prev => prev + char); }
        else if (char === '-') { if (smartCalcInput) handleSmartAction('REMOVE'); }
        else { setSmartCalcInput(prev => prev + char); }
    };

    const handleSmartAction = (action: 'ADD' | 'REMOVE') => {
        const parts = smartCalcInput.split('*');
        const id = parts[0];
        const qty = parseFloat(parts[1]) || 1;
        const stock = stockItems.find(s => s.id === id || s.alias === id || s.part_number === id);
        if (!stock) { setCalcError('Item Not Found'); return; }

        if (action === 'ADD') {
            const existingIndex = items.findIndex(i => i.productId === stock.id);
            if (existingIndex > -1) {
                handleUpdateItem(existingIndex, 'quantity', items[existingIndex].quantity + qty);
            } else {
                const newItem: InvoiceItem = {
                    productId: stock.id, description: stock.name, quantity: qty,
                    rate: stock.last_sale_rate || stock.rate || 0, baseAmount: 0,
                    gstRate: stock.gst_rate || 0, cgstAmount: 0, sgstAmount: 0,
                    igstAmount: 0, totalAmount: 0
                };
                const customer = ledgers.find(l => l.id === selectedCustomerId);
                const isInterState = customer?.state && selectedCompany?.state && customer.state !== selectedCompany.state;
                calculateTaxes(newItem, !!isInterState);
                setItems(prev => [...prev, newItem]);
            }
        }
        setSmartCalcInput('');
    };

    // ─── Navigation ──────────────────────────────────
    const goToNextStep = () => {
        if (currentStep === 0) {
            markTouched('customer');
            markTouched('date');
            if (!canProceedFromStep0) return;
            setCurrentStep(1);
        } else if (currentStep === 1) {
            if (!canProceedFromStep1) {
                markTouched('items');
                return;
            }
            setCurrentStep(2);
        }
    };

    const goToPrevStep = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    // ─── Loading ─────────────────────────────────────
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--border)] border-t-blue-500" />
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Loading Masters...</p>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════
    return (
        <div className="min-h-screen bg-[var(--background)] pb-48 font-sans">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
                <div className="max-w-5xl mx-auto px-4 py-3 md:px-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <button onClick={() => navigate(-1)} className="p-2 hover:bg-[var(--surface-active)] rounded-full text-[var(--on-surface)]">
                                <ArrowLeft size={22} />
                            </button>
                            <div>
                                <h1 className="text-lg font-black text-[var(--on-surface)] tracking-tight">
                                    {paymentMode === 'CASH' ? 'Cash Invoice' : 'Credit Sale'}
                                </h1>
                                <input
                                    value={invoiceNumber}
                                    onChange={e => setInvoiceNumber(e.target.value)}
                                    className="bg-transparent text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest outline-none border-b border-transparent focus:border-blue-500 w-28"
                                />
                            </div>
                        </div>
                        {currentStep === 2 && (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                            >
                                <Save size={16} />
                                {submitting ? 'Saving...' : 'Save'}
                            </button>
                        )}
                    </div>
                    {/* Progress Bar */}
                    <ProgressIndicator currentStep={currentStep} onStepClick={setCurrentStep} />
                </div>
            </div>

            {/* ─── Body ─────────────────────────────── */}
            <div className="max-w-5xl mx-auto p-4 space-y-5">

                {/**************** STEP 0: Customer & Details ****************/}
                {currentStep === 0 && (
                    <motion.div
                        key="step0"
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        className="space-y-5"
                    >
                        {/* Section: Customer */}
                        <Section title="Customer Details" icon={User}>
                            <div>
                                <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block px-1">
                                    Select Customer
                                </label>
                                <Autocomplete
                                    options={ledgers.map(l => ({
                                        id: l.id,
                                        label: l.name,
                                        subLabel: l.closing_balance > 0 ? `Bal: ₹${l.closing_balance}` : undefined
                                    }))}
                                    value={selectedCustomerId}
                                    onChange={(val) => { setSelectedCustomerId(val); markTouched('customer'); }}
                                    placeholder="Search customer..."
                                    type="customer"
                                />
                                {touched.customer && errors.customer && (
                                    <p className="text-[10px] font-bold text-red-500 mt-1.5 ml-2 flex items-center gap-1">
                                        <AlertCircle size={12} /> {errors.customer}
                                    </p>
                                )}
                                {touched.customer && selectedCustomerId && !errors.customer && (
                                    <p className="text-[10px] font-bold text-emerald-500 mt-1.5 ml-2">Customer selected ✓</p>
                                )}
                            </div>

                            {selectedCustomer && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="flex items-center gap-3 p-3 rounded-2xl bg-blue-600/5 border border-blue-600/10"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                        <User size={18} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-[var(--on-surface)]">{selectedCustomer.name}</p>
                                        <div className="flex items-center gap-3 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                            {selectedCustomer.gstin && <span>GST: {selectedCustomer.gstin}</span>}
                                            {previousBalance > 0 && <span>Balance: ₹{previousBalance.toLocaleString()}</span>}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </Section>

                        {/* Section: Invoice Info */}
                        <Section title="Invoice Details" icon={FileText}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FloatingInput
                                    label="Invoice Date"
                                    icon={Calendar}
                                    type="date"
                                    value={date}
                                    onChange={e => { setDate(e.target.value); markTouched('date'); }}
                                    error={touched.date && errors.date ? errors.date : undefined}
                                    success={touched.date && !errors.date}
                                    touched={touched.date}
                                />
                                <FloatingInput
                                    label="Due Date"
                                    icon={Calendar}
                                    type="date"
                                    value={dueDate}
                                    onChange={e => setDueDate(e.target.value)}
                                />
                            </div>
                        </Section>

                        {/* Section: Payment */}
                        <Section title="Payment Settings" icon={CreditCard}>
                            <div>
                                <div className="flex bg-[var(--surface-variant)] p-1 rounded-2xl border border-[var(--border)] max-w-xs">
                                    <button
                                        onClick={() => setPaymentMode('CASH')}
                                        className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                            paymentMode === 'CASH'
                                                ? 'bg-white dark:bg-slate-800 text-emerald-500 shadow-sm'
                                                : 'text-[var(--text-muted)]'
                                        }`}
                                    >
                                        Cash
                                    </button>
                                    <button
                                        onClick={() => setPaymentMode('CREDIT')}
                                        className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                            paymentMode === 'CREDIT'
                                                ? 'bg-white dark:bg-slate-800 text-blue-500 shadow-sm'
                                                : 'text-[var(--text-muted)]'
                                        }`}
                                    >
                                        Credit
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 flex-wrap">
                                {previousBalance > 0 && (
                                    <button
                                        onClick={() => setIncludePreviousBalance(!includePreviousBalance)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all text-[9px] font-black uppercase tracking-widest ${
                                            includePreviousBalance
                                                ? 'bg-amber-500 text-white border-amber-600'
                                                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                        }`}
                                    >
                                        <Banknote size={14} />
                                        Bal: ₹{previousBalance.toLocaleString()} {includePreviousBalance ? '✓' : '+ Include'}
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowSmartCalculator(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-[9px] font-black uppercase tracking-widest"
                                >
                                    <Calculator size={14} />
                                    Smart Billing
                                </button>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block px-1">Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Optional: Add notes for this invoice..."
                                    rows={2}
                                    className="w-full bg-[var(--surface-variant)] border-2 border-transparent focus:border-blue-500/50 rounded-2xl p-3 text-sm font-bold text-[var(--on-surface)] placeholder:text-[var(--text-muted)] outline-none resize-none transition-all"
                                />
                            </div>
                        </Section>

                        {/* Step Navigation */}
                        <div className="flex justify-end">
                            <button
                                onClick={goToNextStep}
                                disabled={!canProceedFromStep0}
                                className={`
                                    flex items-center gap-2 px-8 py-4 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all shadow-lg
                                    ${canProceedFromStep0
                                        ? 'bg-blue-600 text-white shadow-blue-500/20 hover:scale-105 active:scale-95'
                                        : 'bg-[var(--surface-variant)] text-[var(--text-muted)] cursor-not-allowed'
                                    }
                                `}
                            >
                                Add Items <ChevronRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/**************** STEP 1: Line Items ****************/}
                {currentStep === 1 && (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        className="space-y-5"
                    >
                        {/* Section: Items */}
                        <Section title={`Line Items (${items.length})`} icon={ShoppingCart}>
                            {items.length === 0 && (
                                <div className="text-center py-10">
                                    <div className="w-16 h-16 rounded-3xl bg-[var(--surface-variant)] flex items-center justify-center mx-auto mb-4">
                                        <Package size={28} className="text-[var(--text-muted)]" />
                                    </div>
                                    <p className="text-sm font-black text-[var(--on-surface)]">No items added yet</p>
                                    <p className="text-[10px] font-bold text-[var(--text-muted)] mt-1">Tap below to add your first item</p>
                                </div>
                            )}

                            <AnimatePresence mode="popLayout">
                                {items.map((item, idx) => (
                                    <motion.div
                                        key={idx}
                                        layout
                                        initial={{ opacity: 0, y: 10, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95, x: -50 }}
                                        className="relative"
                                    >
                                        <div
                                            onClick={() => { setActiveItemIndex(idx); setShowItemModal(true); }}
                                            className="bg-[var(--surface-variant)] p-3 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-[var(--surface-active)] transition-all active:scale-[0.98] group"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-[var(--surface)] flex items-center justify-center text-[var(--text-muted)] shrink-0 border border-[var(--border)]">
                                                <Package size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-[var(--on-surface)] truncate">{item.description || 'Select Item'}</p>
                                                <div className="flex items-center gap-3 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                                    <span>{item.quantity} units × ₹{item.rate}</span>
                                                    {item.gstRate > 0 && <span className="text-blue-500">{item.gstRate}% GST</span>}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-black text-[var(--on-surface)]">₹{item.totalAmount.toLocaleString('en-IN')}</p>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }}
                                                className="p-2 text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-xl"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            <button
                                onClick={handleAddItem}
                                className="w-full py-5 rounded-3xl border-2 border-dashed border-blue-500/30 bg-blue-500/5 text-blue-500 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-500/10 transition-all active:scale-[0.98]"
                            >
                                <Plus size={18} />
                                Add Item
                            </button>

                            {touched.items && errors.items && (
                                <p className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                                    <AlertCircle size={12} /> {errors.items}
                                </p>
                            )}

                            {/* Quick Summary */}
                            {items.length > 0 && (
                                <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-600/10 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Running Total</span>
                                    <span className="text-2xl font-black text-blue-600">₹{Math.ceil(total).toLocaleString('en-IN')}</span>
                                </div>
                            )}
                        </Section>

                        {/* Step Navigation */}
                        <div className="flex items-center justify-between">
                            <button
                                onClick={goToPrevStep}
                                className="flex items-center gap-2 px-6 py-4 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-[28px] font-black text-xs uppercase tracking-widest hover:bg-[var(--surface-active)] transition-all"
                            >
                                <ChevronLeft size={18} /> Back
                            </button>
                            <button
                                onClick={goToNextStep}
                                disabled={!canProceedFromStep1}
                                className={`
                                    flex items-center gap-2 px-8 py-4 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all shadow-lg
                                    ${canProceedFromStep1
                                        ? 'bg-blue-600 text-white shadow-blue-500/20 hover:scale-105 active:scale-95'
                                        : 'bg-[var(--surface-variant)] text-[var(--text-muted)] cursor-not-allowed'
                                    }
                                `}
                            >
                                Review Invoice <ChevronRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/**************** STEP 2: Review & Confirm ****************/}
                {currentStep === 2 && (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        className="space-y-5"
                    >
                        {/* Section: Customer Summary */}
                        <Section title="Customer" icon={User}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-black text-[var(--on-surface)]">
                                        {ledgers.find(l => l.id === selectedCustomerId)?.name || 'Walk-in Customer'}
                                    </p>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
                                        {format(new Date(date), 'dd MMM yyyy')} · {paymentMode} · {invoiceNumber}
                                    </p>
                                </div>
                                <button onClick={() => setCurrentStep(0)} className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline">
                                    Edit
                                </button>
                            </div>
                        </Section>

                        {/* Section: Items Summary */}
                        <Section title="Line Items" icon={ShoppingCart}>
                            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-[var(--surface-variant)]">
                                        <tr>
                                            <th className="px-4 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Item</th>
                                            <th className="px-4 py-3 text-center text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Qty</th>
                                            <th className="px-4 py-3 text-right text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {items.map((item, i) => (
                                            <tr key={i} className="hover:bg-[var(--surface-variant)]/50">
                                                <td className="px-4 py-3 font-bold text-[var(--on-surface)]">{item.description}</td>
                                                <td className="px-4 py-3 text-center text-[var(--text-muted)] font-bold">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right font-black text-[var(--on-surface)]">₹{item.totalAmount.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-xs">
                                    <span className="font-bold text-[var(--text-muted)]">Subtotal</span>
                                    <span className="font-black text-[var(--on-surface)]">₹{subtotal.toLocaleString('en-IN')}</span>
                                </div>
                                {(cgst > 0 || sgst > 0) && (
                                    <>
                                        <div className="flex justify-between text-[10px]">
                                            <span className="font-bold text-[var(--text-muted)]">CGST</span>
                                            <span className="font-black text-[var(--on-surface)]">₹{cgst.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                            <span className="font-bold text-[var(--text-muted)]">SGST</span>
                                            <span className="font-black text-[var(--on-surface)]">₹{sgst.toLocaleString('en-IN')}</span>
                                        </div>
                                    </>
                                )}
                                {igst > 0 && (
                                    <div className="flex justify-between text-[10px]">
                                        <span className="font-bold text-[var(--text-muted)]">IGST</span>
                                        <span className="font-black text-[var(--on-surface)]">₹{igst.toLocaleString('en-IN')}</span>
                                    </div>
                                )}
                                {billDiscount > 0 && (
                                    <div className="flex justify-between text-[10px]">
                                        <span className="font-bold text-emerald-500">Discount</span>
                                        <span className="font-black text-emerald-500">-₹{billDiscount.toLocaleString('en-IN')}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm pt-3 border-t border-[var(--border)]">
                                    <span className="font-black text-[var(--on-surface)] uppercase tracking-widest text-[10px]">Total Payable</span>
                                    <span className="font-black text-blue-600 text-xl">₹{Math.ceil(total).toLocaleString('en-IN')}</span>
                                </div>
                            </div>

                            <button onClick={() => setCurrentStep(1)} className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline">
                                Edit Items
                            </button>
                        </Section>

                        {/* Confirm Box */}
                        <div className="p-5 bg-blue-600/5 border border-blue-600/10 rounded-3xl flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-black text-[var(--on-surface)]">Final Review Required</p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">Once saved, this invoice will be posted to Tally. Please verify all items and totals are correct.</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={goToPrevStep}
                                className="flex-1 py-5 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-[var(--surface-active)] transition-all"
                            >
                                <ChevronLeft size={18} className="inline mr-1" /> Back
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" /> Saving...</>
                                ) : (
                                    <><Save size={18} /> Confirm & Save Invoice</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}

            </div>

            {/* ─── Item Detail Modal ─────────────────── */}
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
                                <h3 className="text-lg font-black text-[var(--on-surface)] text-center">Edit Item</h3>
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
                                                <p className="text-[9px] font-black uppercase tracking-tight">GST (%)</p>
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
                                    onClick={() => { handleAddItem(); setActiveItemIndex(items.length); }}
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
                )}
            </AnimatePresence>

            {/* ─── Smart Calculator Drawer ──────────── */}
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
                            className="relative bg-[var(--background)] w-full rounded-t-[40px] overflow-hidden"
                        >
                            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                                        <Calculator size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-[var(--on-surface)]">Smart Billing</h2>
                                        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Entry: ID * QTY</p>
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
                                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)]">{n}</button>
                                    ))}
                                    <button onClick={() => handleSmartCalcInput('C')} className="h-20 rounded-2xl bg-red-500/10 text-red-500 text-xl font-black">CLR</button>
                                    {[4, 5, 6].map(n => (
                                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)]">{n}</button>
                                    ))}
                                    <button onClick={() => handleSmartCalcInput('*')} className="h-20 rounded-2xl bg-indigo-500/10 text-indigo-500 flex flex-col items-center justify-center font-black">
                                        <span className="text-2xl">×</span>
                                        <span className="text-[7px] uppercase tracking-widest">QTY</span>
                                    </button>
                                    {[1, 2, 3].map(n => (
                                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)]">{n}</button>
                                    ))}
                                    <button onClick={() => handleSmartCalcInput('+')} className="row-span-2 h-full rounded-2xl bg-blue-600 text-white text-3xl font-black shadow-lg shadow-blue-500/20">+</button>
                                    <button onClick={() => handleSmartCalcInput('0')} className="col-span-2 h-20 rounded-2xl bg-[var(--surface-variant)] text-2xl font-black text-[var(--on-surface)]">0</button>
                                    <button onClick={() => handleSmartCalcInput('-')} className="h-20 rounded-2xl bg-orange-500/10 text-orange-500 flex flex-col items-center justify-center font-black">
                                        <Trash2 size={24} />
                                        <span className="text-[7px] uppercase tracking-widest">REM</span>
                                    </button>
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={() => setShowSmartCalculator(false)} className="flex-1 py-5 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-3xl font-black text-xs uppercase tracking-widest">Close</button>
                                    <button onClick={() => setShowSmartCalculator(false)} className="flex-[2] py-5 bg-emerald-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20">Confirm Items</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ─── Toast ─────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
