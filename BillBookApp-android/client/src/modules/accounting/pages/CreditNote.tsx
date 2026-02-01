import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, X, Package, Plus, ChevronRight, ArrowDownLeft } from 'lucide-react';
import { StorageService } from '../../../services/storageService';
import { Invoice, InvoiceItem, Customer, Product, InvoiceFormat } from '@/types';
import { HapticService } from '@/services/hapticService';
import { useCompany } from '@/contexts/CompanyContext';
import { ContactsService } from '@/services/contactsService';

// --- Types ---
interface CreditNoteProps {
    onBack: () => void;
    onSaveSuccess: (invoice: Invoice) => void;
}

// --- Component ---
const CreditNote: React.FC<CreditNoteProps> = ({ onBack, onSaveSuccess }) => {
    const { company } = useCompany();
    const gstEnabled = company?.gst_enabled ?? true;

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [items, setItems] = useState<InvoiceItem[]>([]);

    // Calculator State
    const [smartCalcInput, setSmartCalcInput] = useState('');
    const [calcError, setCalcError] = useState('');

    // Global Discount State
    const [discountType] = useState<'PERCENTAGE' | 'AMOUNT'>('PERCENTAGE');
    const [discountValue] = useState<number>(0);

    // Round Up State
    const [roundUpTo] = useState<0 | 10 | 100>(company?.roundUpDefault ?? 0);

    // Modal State
    const [showPartyModal, setShowPartyModal] = useState(true); // Start with Party Selection for Return
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Invoice Creation State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customersSearch, setCustomersSearch] = useState('');

    // Contacts & New Party States
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [contactSuggestions, setContactSuggestions] = useState<{ name: string; phone: string }[]>([]);
    const [isCreatingNewParty, setIsCreatingNewParty] = useState(false);
    const [newPartyName, setNewPartyName] = useState('');
    const [newPartyPhone, setNewPartyPhone] = useState('');

    useEffect(() => {
        setCustomers(StorageService.getCustomers());
        setProducts(StorageService.getProducts());
    }, []);

    // --- Tax Calculation ---
    const calculateTaxes = (item: InvoiceItem, supplier: any, customer: any) => {
        let baseAmount = item.quantity * item.rate;
        // Apply Item Discount if present
        if (item.discountValue && item.discountValue > 0) {
            if (item.discountType === 'AMOUNT') {
                item.discountAmount = item.discountValue;
                baseAmount -= item.discountValue;
            } else {
                const discAmt = (baseAmount * item.discountValue / 100);
                item.discountAmount = discAmt;
                baseAmount -= discAmt;
            }
        } else {
            item.discountAmount = 0;
        }

        if (baseAmount < 0) baseAmount = 0;

        const gstRate = item.gstRate || 0;
        const taxType = supplier?.state === customer?.state ? 'INTRA_STATE' : 'INTER_STATE';

        if (taxType === 'INTRA_STATE') {
            item.cgstAmount = baseAmount * (gstRate / 2) / 100;
            item.sgstAmount = baseAmount * (gstRate / 2) / 100;
            item.igstAmount = 0;
        } else {
            item.cgstAmount = 0;
            item.sgstAmount = 0;
            item.igstAmount = baseAmount * gstRate / 100;
        }

        item.baseAmount = baseAmount;
        item.totalAmount = baseAmount + (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0);
    };

    // --- Smart Calculator Input Handler ---
    const handleSmartCalcInput = (char: string) => {
        HapticService.light();
        setCalcError('');
        if (char === 'C') {
            setSmartCalcInput('');
        } else if (char === '+') {
            if (smartCalcInput) handleSmartAction('ADD');
        } else if (char === '*') {
            if (!smartCalcInput.includes('*')) setSmartCalcInput(prev => prev + char);
        } else if (char === '-') {
            if (smartCalcInput && smartCalcInput !== '-') {
                handleSmartAction('REMOVE');
            } else {
                setSmartCalcInput(prev => prev + char);
            }
        } else {
            setSmartCalcInput(prev => prev + char);
        }
    };

    // --- Smart Action (ADD/REMOVE) ---
    const handleSmartAction = (action: 'ADD' | 'REMOVE') => {
        let finalAction = action;
        let inputToParse = smartCalcInput;
        let itemDiscountValue = 0;

        if (smartCalcInput.startsWith('-')) {
            finalAction = 'REMOVE';
            inputToParse = smartCalcInput.substring(1);
        }

        const parts = inputToParse.split('*');
        let product: Product | undefined;
        let quantityOp = 1;

        if (parts.length === 1) {
            product = products.find(p => p.id === parts[0]);
        } else if (parts.length === 2) {
            let p = products.find(prod => prod.id === parts[0]);
            if (p) {
                product = p;
                quantityOp = Number(parts[1]) || 1;
            } else {
                p = products.find(prod => prod.id === parts[1]);
                if (p) {
                    product = p;
                    quantityOp = Number(parts[0]) || 1;
                }
            }
        }

        if (!product) {
            setCalcError('Item ID not found');
            HapticService.heavy();
            return;
        }

        const existingItemIndex = items.findIndex(i => i.productId === product!.id);

        if (finalAction === 'ADD') {
            if (existingItemIndex > -1) {
                const newItems = [...items];
                newItems[existingItemIndex].quantity += quantityOp;
                newItems[existingItemIndex].baseAmount = newItems[existingItemIndex].quantity * newItems[existingItemIndex].rate;
                if (itemDiscountValue > 0) {
                    newItems[existingItemIndex].discountType = 'AMOUNT';
                    newItems[existingItemIndex].discountValue = itemDiscountValue;
                }
                if (gstEnabled) calculateTaxes(newItems[existingItemIndex], company, selectedCustomer);
                else newItems[existingItemIndex].totalAmount = newItems[existingItemIndex].baseAmount;
                setItems(newItems);
            } else {
                const newItem: InvoiceItem = {
                    productId: product.id,
                    description: product.name,
                    quantity: quantityOp,
                    rate: product.price,
                    baseAmount: 0,
                    hsn: product.hsn || '',
                    gstRate: product.gstRate || 0,
                    cgstAmount: 0,
                    sgstAmount: 0,
                    igstAmount: 0,
                    totalAmount: 0,
                    discountType: 'AMOUNT',
                    discountValue: itemDiscountValue,
                    discountAmount: itemDiscountValue
                };
                newItem.baseAmount = (newItem.quantity * newItem.rate) - itemDiscountValue;
                if (gstEnabled) calculateTaxes(newItem, company, selectedCustomer);
                else newItem.totalAmount = newItem.baseAmount;

                setItems(prev => [...prev, newItem]);
            }
        } else {
            if (existingItemIndex > -1) {
                const currentQty = items[existingItemIndex].quantity;
                const newQty = currentQty - quantityOp;

                if (newQty <= 0) {
                    setItems(items.filter((_, i) => i !== existingItemIndex));
                } else {
                    const newItems = [...items];
                    newItems[existingItemIndex].quantity = newQty;
                    newItems[existingItemIndex].baseAmount = newItems[existingItemIndex].quantity * newItems[existingItemIndex].rate;
                    if (gstEnabled) calculateTaxes(newItems[existingItemIndex], company, selectedCustomer);
                    else newItems[existingItemIndex].totalAmount = newItems[existingItemIndex].baseAmount;
                    setItems(newItems);
                }
            } else {
                setCalcError('Item not in list');
                HapticService.heavy();
                return;
            }
        }

        setSmartCalcInput('');
        HapticService.medium();
    };

    // --- Calculations ---
    const calculateSubtotal = () => items.reduce((sum, item) => sum + (item.baseAmount || 0), 0);
    const calculateTotalCGST = () => items.reduce((sum, item) => sum + (item.cgstAmount || 0), 0);
    const calculateTotalSGST = () => items.reduce((sum, item) => sum + (item.sgstAmount || 0), 0);
    const calculateTotalIGST = () => items.reduce((sum, item) => sum + (item.igstAmount || 0), 0);

    const calculateTotal = () => {
        const subtotal = calculateSubtotal();
        let globalDiscountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            globalDiscountAmount = (subtotal * discountValue) / 100;
        } else {
            globalDiscountAmount = discountValue;
        }
        const cgst = calculateTotalCGST();
        const sgst = calculateTotalSGST();
        const igst = calculateTotalIGST();
        const totalBeforeDiscount = subtotal + cgst + sgst + igst;
        const finalTotal = totalBeforeDiscount - globalDiscountAmount;
        return finalTotal > 0 ? finalTotal : 0;
    };

    const calculateRoundedTotal = () => {
        const total = calculateTotal();
        if (roundUpTo === 0) return total;
        return Math.ceil(total / roundUpTo) * roundUpTo;
    };

    const getRoundUpAmount = () => {
        if (roundUpTo === 0) return 0;
        return calculateRoundedTotal() - calculateTotal();
    };

    // --- Save Handler ---
    const handleSave = () => {
        if (!selectedCustomer) {
            setCalcError('Select a Party First');
            setShowPartyModal(true);
            return;
        }
        if (items.length === 0) {
            setCalcError('Add at least one item');
            HapticService.heavy();
            return;
        }
        createCreditNote();
    };

    // --- Invoice Creation ---
    const createCreditNote = async () => {
        const cleanedItems: InvoiceItem[] = items.map(item => ({
            ...item,
            quantity: Number(item.quantity) || 1,
            rate: Number(item.rate) || 0,
            baseAmount: Number(item.baseAmount) || 0,
            gstRate: Number(item.gstRate) || 0,
            cgstAmount: Number(item.cgstAmount) || 0,
            sgstAmount: Number(item.sgstAmount) || 0,
            igstAmount: Number(item.igstAmount) || 0,
            totalAmount: Number(item.totalAmount) || 0
        }));

        const subtotal = calculateSubtotal();
        const totalCgst = calculateTotalCGST();
        const totalSgst = calculateTotalSGST();
        const totalIgst = calculateTotalIGST();

        const supplier = company as any;
        const taxType = (supplier?.state || 'Delhi') === (selectedCustomer?.state || '') ? 'INTRA_STATE' : 'INTER_STATE';

        let globalDiscountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            globalDiscountAmount = (subtotal * discountValue) / 100;
        } else {
            globalDiscountAmount = discountValue;
        }

        const roundedTotal = calculateRoundedTotal();
        const roundUpAmount = getRoundUpAmount();

        const invNumber = StorageService.generateInvoiceNumber(
            selectedCustomer?.id || 'cash',
            new Date().toISOString()
        );

        const newInvoice: Invoice = {
            id: crypto.randomUUID(),
            invoiceNumber: `CN-${invNumber}`, // Prefix CN for Credit Note
            customerId: selectedCustomer?.id || 'Unknown',
            customerName: selectedCustomer?.name || 'Unknown',
            customerAddress: selectedCustomer?.address || '',
            customerState: selectedCustomer?.state || '',
            customerGstin: selectedCustomer?.gstin || '',
            supplierGstin: supplier?.gstin || '',
            taxType: taxType,
            date: new Date().toISOString().split('T')[0],
            dueDate: new Date().toISOString().split('T')[0],
            items: cleanedItems,
            discountType,
            discountValue,
            discountAmount: Math.round(globalDiscountAmount * 100) / 100,
            subtotal: Math.round(subtotal * 100) / 100,
            totalCgst: Math.round(totalCgst * 100) / 100,
            totalSgst: Math.round(totalSgst * 100) / 100,
            totalIgst: Math.round(totalIgst * 100) / 100,
            gstEnabled: gstEnabled && cleanedItems.some(i => (i.gstRate || 0) > 0),
            roundUpTo: roundUpTo,
            roundUpAmount: Math.round(roundUpAmount * 100) / 100,
            total: Math.round(roundedTotal * 100) / 100,
            status: 'PENDING', // It's a record of return, acts like a negative invoice
            paymentMode: 'CREDIT',
            type: 'CREDIT_NOTE', // Explicit Type
            notes: 'Sales Return / Credit Note',
            templateFormat: company?.invoiceSettings?.format || (company as any).invoiceTemplate?.toUpperCase() || InvoiceFormat.DEFAULT
        };

        StorageService.saveCreditNote(newInvoice); // Call the new Service Method

        onSaveSuccess(newInvoice);
        setShowSuccessModal(true);
        HapticService.success();
    };


    const handlePartySelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        setShowPartyModal(false);
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(customersSearch.toLowerCase()) ||
        c.phone.includes(customersSearch)
    );

    const handleClear = () => {
        HapticService.medium();
        setSmartCalcInput('');
        setCalcError('');
    };

    return (
        <div
            className="fixed inset-0 bg-background z-[60] flex flex-col"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)'
            }}
        >
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-md">
                <h2 className="text-lg font-bold font-heading text-foreground flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                        <ArrowDownLeft className="w-5 h-5 text-orange-600" />
                    </div>
                    Sales Return (Credit Note)
                </h2>
                <button onClick={onBack} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                    <X className="w-5 h-5 text-foreground" />
                </button>
            </div>

            {/* Selected Party Header */}
            {selectedCustomer && (
                <div
                    onClick={() => setShowPartyModal(true)}
                    className="mx-4 mt-2 p-3 bg-orange-500/5 rounded-xl border border-orange-500/20 flex items-center justify-between active:scale-[0.99] transition-transform"
                >
                    <div>
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Returning Party</p>
                        <p className="font-bold text-foreground">{selectedCustomer.name}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Balance</p>
                        <p className="font-bold text-foreground">₹{selectedCustomer.balance}</p>
                    </div>
                </div>
            )}

            {/* List of Added Items (Preview) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface-container-low">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                        <Package className="w-16 h-16 mb-4 opacity-50" strokeWidth={1.5} />
                        <p className="font-bold text-sm">Enter Returned Item ID & Press '+'</p>
                        <p className="text-xs mt-2">Stock will increase, Balance will decrease</p>
                    </div>
                ) : (
                    items.slice().reverse().map((item, idx) => (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={idx}
                            className="bg-surface-container p-4 rounded-2xl shadow-sm flex justify-between items-center border border-border border-l-4 border-l-orange-500"
                            onContextMenu={(e) => {
                                e.preventDefault();
                                if (window.confirm(`Remove ${item.description}?`)) {
                                    setItems(items.filter(i => i.productId !== item.productId));
                                }
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-600">
                                    <ArrowDownLeft className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-foreground truncate max-w-[150px]">{item.description}</p>
                                    <p className="text-xs text-muted-foreground font-bold">ID: {item.productId} | ₹{item.rate}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="font-black text-orange-600 text-lg">x{item.quantity}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-foreground">₹{(item.totalAmount || 0).toLocaleString('en-IN')}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Calculator Interface */}
            <div className="bg-surface-container p-4 pb-2 shadow-google-lg rounded-t-[32px] shrink-0 z-10 border-t border-border/50">
                {/* Display */}
                <div className="bg-surface-container-high rounded-2xl p-4 mb-3 flex flex-col items-end justify-center min-h-[72px] border border-border">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${calcError ? 'text-google-red' : 'text-muted-foreground'}`}>
                        {calcError || 'ITEM ID / CALC'}
                    </span>
                    <span className={`text-3xl font-mono font-black tracking-widest ${calcError ? 'text-google-red' : 'text-foreground'}`}>
                        {smartCalcInput || '0'}
                    </span>
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-4 gap-2">
                    {/* Row 1: 7, 8, 9, CLR */}
                    {[7, 8, 9].map(n => (
                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">{n}</button>
                    ))}
                    <button onClick={handleClear} className="h-14 rounded-2xl bg-google-red/10 text-google-red text-lg font-black hover:bg-google-red/20 active:scale-95 transition-all">CLR</button>

                    {/* Row 2: 4, 5, 6, QTY(*) */}
                    {[4, 5, 6].map(n => (
                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">{n}</button>
                    ))}
                    <button onClick={() => handleSmartCalcInput('*')} className="h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 text-lg font-black hover:bg-indigo-500/20 active:scale-95 transition-all flex flex-col items-center justify-center leading-none">
                        <span>×</span>
                        <span className="text-[8px] uppercase tracking-widest">QTY</span>
                    </button>

                    {/* Row 3: 1, 2, 3, ADD(+) */}
                    {[1, 2, 3].map(n => (
                        <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">{n}</button>
                    ))}
                    <button onClick={() => handleSmartCalcInput('+')} className="row-span-2 h-full rounded-2xl bg-orange-500 text-white text-2xl font-black hover:bg-orange-600 active:scale-95 transition-all shadow-google shadow-orange-500/30">+</button>

                    {/* Row 4: 0, 00, REMOVE(-) */}
                    <button onClick={() => handleSmartCalcInput('0')} className="h-14 col-span-2 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">0</button>
                    <button onClick={() => handleSmartCalcInput('-')} className="h-14 rounded-2xl bg-slate-100 text-slate-600 font-bold active:scale-95 transition-all flex flex-col items-center justify-center hover:bg-slate-200 leading-none shadow-sm border border-slate-200">
                        <span className="text-lg">−</span>
                    </button>
                </div>
            </div>

            {/* Fixed Bottom Bar with Total and Save */}
            <div
                className="bg-surface-container border-t border-border p-4 shrink-0"
                style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">RETURN TOTAL</p>
                        <p className="text-2xl font-black text-orange-600">₹{calculateRoundedTotal().toLocaleString('en-IN')}</p>
                    </div>

                    <button onClick={handleSave} className="py-3 px-6 rounded-2xl bg-orange-600 text-white font-bold font-heading uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-google shadow-orange-600/30 shrink-0">
                        <Check className="w-5 h-5" />
                        <span>Confirm Return</span>
                    </button>
                </div>
            </div>

            {/* Party Select Modal (Reuse logic roughly) */}
            <AnimatePresence>
                {showPartyModal && (
                    <div
                        className="fixed inset-0 z-[70] flex flex-col bg-background"
                        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button onClick={() => { if (selectedCustomer) setShowPartyModal(false); else onBack(); }} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors"><ArrowLeft className="w-5 h-5 text-foreground" /></button>
                                <h2 className="text-xl font-bold font-heading text-foreground">Select Party for Return</h2>
                            </div>
                        </div>

                        {!isCreatingNewParty ? (
                            <>
                                <div className="p-4">
                                    <input
                                        type="text"
                                        placeholder="Search Name or Phone..."
                                        className="w-full p-4 bg-surface-container-high rounded-[20px] border border-transparent focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-foreground font-bold outline-none transition-all placeholder:text-muted-foreground/50"
                                        value={customersSearch}
                                        onChange={e => setCustomersSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-3 pt-0">
                                    <button
                                        onClick={() => {
                                            HapticService.medium();
                                            setIsCreatingNewParty(true);
                                            setNewPartyName(customersSearch);
                                        }}
                                        className="w-full p-4 bg-orange-500/5 border-2 border-dashed border-orange-500/30 rounded-[24px] text-left flex items-center gap-4 mb-4 active:scale-[0.98] transition-all group hover:bg-orange-500/10"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Plus className="w-6 h-6" /></div>
                                        <div className="flex-1">
                                            <p className="font-black text-orange-600">Add New Party</p>
                                        </div>
                                    </button>

                                    {filteredCustomers.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { HapticService.medium(); handlePartySelect(c); }}
                                            className="w-full p-4 bg-surface-container rounded-[24px] text-left flex items-center gap-4 border border-border active:scale-[0.98] transition-all shadow-sm group hover:border-orange-500/30"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-surface-container-highest font-black text-lg text-muted-foreground flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                                {c.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-lg text-foreground leading-tight truncate">{c.name}</div>
                                                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">{c.phone || 'No Phone'}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Balance</p>
                                                <p className={`font-black ${c.balance > 0 ? 'text-google-red' : 'text-google-green'}`}>₹{c.balance.toLocaleString()}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                                <div className="space-y-2 relative">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Party Name</label>
                                    <input
                                        type="text"
                                        value={newPartyName}
                                        onChange={async (e) => {
                                            const val = e.target.value;
                                            setNewPartyName(val);
                                            if (val.length >= 2) {
                                                const results = await ContactsService.searchContacts(val);
                                                setContactSuggestions(results);
                                                setShowContactSuggestions(results.length > 0);
                                            } else {
                                                setShowContactSuggestions(false);
                                            }
                                        }}
                                        placeholder="Type to search contacts..."
                                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-orange-500/30 rounded-[20px] font-bold text-foreground outline-none transition-all"
                                    />

                                    {/* Contact Suggestions */}
                                    {/* (Reusing similar logic from SmartCalculator, trimmed for brevity but functional) */}
                                    <AnimatePresence>
                                        {showContactSuggestions && contactSuggestions.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface-container border border-border rounded-[24px] shadow-google-lg max-h-60 overflow-y-auto p-2"
                                            >
                                                {contactSuggestions.map((s, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setNewPartyName(s.name);
                                                            setNewPartyPhone(s.phone.replace(/\D/g, '').slice(-10));
                                                            setShowContactSuggestions(false);
                                                            HapticService.light();
                                                        }}
                                                        className="w-full p-3 flex items-center justify-between hover:bg-surface-container-high rounded-[16px] transition-all group"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-google-blue/10 text-google-blue flex items-center justify-center font-black text-xs">{s.name.charAt(0)}</div>
                                                            <div className="text-left">
                                                                <p className="text-sm font-bold text-foreground">{s.name}</p>
                                                                <p className="text-[10px] font-bold text-muted-foreground">{s.phone}</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Mobile Number</label>
                                    <div className="relative">
                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-orange-600 font-black tracking-widest">+91</span>
                                        <input
                                            type="tel"
                                            value={newPartyPhone}
                                            onChange={e => setNewPartyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            placeholder="00000 00000"
                                            className="w-full p-4 pl-16 bg-surface-container-high border-2 border-transparent focus:border-orange-500/30 rounded-[20px] font-black text-foreground outline-none tracking-[0.2em] transition-all"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        if (!newPartyName) return;
                                        const customerData: Customer = {
                                            id: crypto.randomUUID(),
                                            name: newPartyName,
                                            phone: newPartyPhone,
                                            company: '',
                                            email: '',
                                            address: '',
                                            balance: 0,
                                            notifications: []
                                        };
                                        StorageService.saveCustomer(customerData);
                                        handlePartySelect(customerData);
                                        HapticService.heavy();
                                    }}
                                    className="w-full py-5 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-google hover:scale-105 active:scale-95 transition-all"
                                >
                                    Save & Continue
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </AnimatePresence>

            {/* Success Modal */}
            <AnimatePresence>
                {showSuccessModal && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-orange-600 text-white p-6">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-center"
                        >
                            <div className="w-24 h-24 rounded-full bg-white text-orange-600 flex items-center justify-center mx-auto mb-6 shadow-xl">
                                <Check className="w-12 h-12" strokeWidth={3} />
                            </div>
                            <h2 className="text-4xl font-black font-heading mb-2">Return Logged!</h2>
                            <p className="text-white/80 font-bold mb-8">Stock Updated & Balance Adjusted</p>
                            <button onClick={onBack} className="w-full py-4 bg-white text-orange-600 rounded-[20px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                                Done
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default CreditNote;
