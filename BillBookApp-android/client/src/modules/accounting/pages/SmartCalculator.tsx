import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Download, Calculator, X, Package, Plus, ChevronRight, MessageCircle, QrCode, Users, Search, Minus, Eye, Edit2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import { StorageService } from '../../../services/storageService';
import { Invoice, InvoiceItem, Customer, Product, InvoiceFormat } from '@/types';
import { InvoicePdfService } from '../../../services/invoicePdfService';
import { HapticService } from '@/services/hapticService';
import { useCompany } from '@/contexts/CompanyContext';
import { ContactsService } from '@/services/contactsService';
import { WhatsAppService } from '@/services/whatsappService';
import { WhatsAppNumberModal } from '@/components/WhatsAppNumberModal';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { toast } from 'sonner';

// --- Types ---
interface SmartCalculatorProps {
    onBack: () => void;
    onSaveSuccess: (invoice: Invoice) => void;
    onSwitchToNormal?: () => void;
}

// --- Component ---
const SmartCalculator: React.FC<SmartCalculatorProps> = ({ onBack, onSaveSuccess, onSwitchToNormal }) => {
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
    const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'AMOUNT'>('PERCENTAGE');
    const [discountValue, setDiscountValue] = useState<number>(0);

    // Round Up State
    const [roundUpTo] = useState<0 | 10 | 100>(company?.roundUpDefault ?? 0);

    // Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showPartyModal, setShowPartyModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [showBillPreview, setShowBillPreview] = useState(false);

    // Delete Confirmation State
    const [itemToDelete, setItemToDelete] = useState<InvoiceItem | null>(null);

    // Invoice Creation State
    // const [isPaid, setIsPaid] = useState(true); // Removed unused state
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
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
        } else if (char === 'BILL_DISC') {
            const val = parseFloat(smartCalcInput);
            if (!isNaN(val) && val > 0) {
                setDiscountValue(val);
                setDiscountType('PERCENTAGE');
                setSmartCalcInput('');
                HapticService.success();
                toast.success(`Discount: ${val}% applied`);
            } else {
                if (discountValue > 0) {
                    if (discountType === 'PERCENTAGE') {
                        setDiscountType('AMOUNT');
                        HapticService.light();
                        // toast.info('Switched to Amount Discount'); // Optional: user might find too many toasts annoying
                    } else {
                        setDiscountValue(0);
                        HapticService.medium();
                        toast.info('Bill Discount Removed');
                    }
                }
            }
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
        } else if (smartCalcInput.includes('-')) {
            const discParts = smartCalcInput.split('-');
            if (discParts.length === 2) {
                inputToParse = discParts[0];
                itemDiscountValue = Number(discParts[1]) || 0;
            }
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
                if (gstEnabled) calculateTaxes(newItems[existingItemIndex], company, null);
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
                if (gstEnabled) calculateTaxes(newItem, company, null);
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
                    if (gstEnabled) calculateTaxes(newItems[existingItemIndex], company, null);
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
        if (items.length === 0) {
            setCalcError('Add at least one item');
            HapticService.heavy();
            return;
        }
        HapticService.success();
        setShowPaymentModal(true);
    };

    // --- Invoice Creation ---
    const createInvoice = async (paid: boolean, customer: Customer | null) => {
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
        const taxType = (supplier?.state || 'Delhi') === (customer?.state || '') ? 'INTRA_STATE' : 'INTER_STATE';

        let globalDiscountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            globalDiscountAmount = (subtotal * discountValue) / 100;
        } else {
            globalDiscountAmount = discountValue;
        }

        const roundedTotal = calculateRoundedTotal();
        const roundUpAmount = getRoundUpAmount();

        const invNumber = StorageService.generateInvoiceNumber(
            customer?.id || 'cash',
            new Date().toISOString()
        );

        const newInvoice: Invoice = {
            id: crypto.randomUUID(),
            invoiceNumber: invNumber,
            customerId: customer?.id || 'CASH_SALE',
            customerName: customer?.name || (paid ? 'CASH SALES' : 'Unknown'),
            customerAddress: customer?.address || '',
            customerState: customer?.state || '',
            customerGstin: customer?.gstin || '',
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
            status: paid ? 'PAID' : 'PENDING',
            paymentMode: paid ? 'CASH' : 'CREDIT',
            notes: '',
            templateFormat: company?.invoiceSettings?.format || (company as any).invoiceTemplate?.toUpperCase() || InvoiceFormat.DEFAULT
        };

        StorageService.saveInvoice(newInvoice);
        setCreatedInvoice(newInvoice);
        // setIsPaid(paid); // Removed unused state setter
        setSelectedCustomer(customer);

        onSaveSuccess(newInvoice);
        setShowSuccessModal(true);
        HapticService.success();
        toast.success(`Invoice #${newInvoice.invoiceNumber} Saved`);
    };

    const handlePaymentChoice = (received: boolean) => {
        setShowPaymentModal(false);
        if (received) {
            createInvoice(true, null);
        } else {
            setShowPartyModal(true);
        }
    };

    const handlePartySelect = (customer: Customer) => {
        setShowPartyModal(false);
        createInvoice(false, customer);
    };

    const handleDownload = async () => {
        if (createdInvoice) {
            await InvoicePdfService.generatePDF(createdInvoice, company as any, selectedCustomer);
        }
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

    const handleClearAll = () => {
        HapticService.heavy();
        setItems([]);
        setDiscountValue(0);
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
                    <div className="w-8 h-8 rounded-full bg-google-green/10 flex items-center justify-center">
                        <Calculator className="w-5 h-5 text-google-green" />
                    </div>
                    Smart Billing
                </h2>
                <div className="flex items-center gap-2">
                    {/* Switch to Normal Calculator */}
                    {onSwitchToNormal && (
                        <button
                            onClick={() => { HapticService.light(); onSwitchToNormal(); }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-500/20 transition-colors"
                        >
                            <Calculator className="w-4 h-4" />
                            Normal
                        </button>
                    )}
                    <button
                        onClick={() => { setShowBillPreview(true); HapticService.medium(); }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${items.length > 0 ? 'bg-google-blue/10 text-google-blue' : 'bg-surface-container-high text-muted-foreground opacity-50 cursor-not-allowed'}`}
                        disabled={items.length === 0}
                    >
                        <Eye className="w-5 h-5" />
                    </button>
                    <button onClick={onBack} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                        <X className="w-5 h-5 text-foreground" />
                    </button>
                </div>
            </div>

            {/* List of Added Items (Preview) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface-container-low">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                        <Calculator className="w-16 h-16 mb-4 opacity-50" strokeWidth={1.5} />
                        <p className="font-bold text-sm">Enter Item ID & Press '+'</p>
                    </div>
                ) : (
                    items.slice().reverse().map((item, idx) => (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={idx}
                            className="bg-surface-container p-4 rounded-2xl shadow-sm flex justify-between items-center border border-border"
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setItemToDelete(item);
                                HapticService.medium();
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-google-blue/10 flex items-center justify-center text-google-blue">
                                    <Package className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-foreground truncate max-w-[150px]">{item.description}</p>
                                    <p className="text-xs text-muted-foreground font-bold">ID: {item.productId} | ₹{item.rate}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="font-black text-google-blue text-lg">x{item.quantity}</p>
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
                {/* Display with Search Button */}
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => { setShowProductSearch(true); setProductSearchQuery(''); HapticService.light(); }}
                        className="h-[72px] w-[72px] rounded-2xl bg-google-blue/10 border border-google-blue/20 flex flex-col items-center justify-center gap-1 shrink-0 hover:bg-google-blue/20 active:scale-95 transition-all"
                    >
                        <Search className="w-6 h-6 text-google-blue" />
                        <span className="text-[8px] font-black text-google-blue uppercase tracking-widest">Search</span>
                    </button>
                    <div className="flex-1 bg-surface-container-high rounded-2xl p-4 flex flex-col items-end justify-center min-h-[72px] border border-border">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${calcError ? 'text-google-red' : 'text-muted-foreground'}`}>
                            {calcError || 'ITEM ID / CALC'}
                        </span>
                        <span className={`text-3xl font-mono font-black tracking-widest ${calcError ? 'text-google-red' : 'text-foreground'}`}>
                            {smartCalcInput || '0'}
                        </span>
                    </div>
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
                    <button onClick={() => handleSmartCalcInput('+')} className="row-span-2 h-full rounded-2xl bg-google-blue text-white text-2xl font-black hover:bg-google-blue/90 active:scale-95 transition-all shadow-google shadow-google-blue/30">+</button>

                    {/* Row 4: 0, SEARCH, %, REMOVE(-) */}
                    <button onClick={() => handleSmartCalcInput('0')} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">0</button>
                    <button
                        onClick={() => { HapticService.light(); setShowProductSearch(true); setProductSearchQuery(''); }}
                        className="h-14 rounded-2xl bg-google-green/10 text-google-green font-bold active:scale-95 transition-all flex flex-col items-center justify-center hover:bg-google-green/20 leading-none shadow-sm border border-google-green/20"
                    >
                        <Search className="w-5 h-5" />
                        <span className="text-[8px] uppercase tracking-widest mt-0.5">SEARCH</span>
                    </button>
                    <button onClick={() => handleSmartCalcInput('-')} className="h-14 rounded-2xl bg-orange-500/10 text-orange-600 font-bold active:scale-95 transition-all flex flex-col items-center justify-center hover:bg-orange-500/20 leading-none shadow-sm border border-orange-500/10">
                        <span className="text-lg">−</span>
                        <span className="text-[8px] uppercase tracking-widest">REM</span>
                    </button>

                    {/* Row 5: DISC button spanning first 3 columns */}
                    <button onClick={() => handleSmartCalcInput('BILL_DISC')} className={`col-span-3 h-12 rounded-2xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2 leading-none shadow-sm border ${discountValue > 0 ? 'bg-purple-600 text-white border-purple-600 shadow-purple-500/30' : 'bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20'}`}>
                        <span className="text-lg">{discountValue > 0 ? (discountType === 'PERCENTAGE' ? '%' : '₹') : '%'}</span>
                        <span className="text-xs uppercase tracking-widest font-black">{discountValue > 0 ? `BILL DISCOUNT: ${discountValue}${discountType === 'PERCENTAGE' ? '%' : '₹'} OFF` : 'BILL DISCOUNT'}</span>
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
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TOTAL ({items.length} ITEMS)</p>
                        <p className="text-2xl font-black text-foreground">₹{calculateRoundedTotal().toLocaleString('en-IN')}</p>
                    </div>
                    {items.length > 0 && (
                        <button onClick={handleClearAll} className="text-xs font-bold text-google-red bg-google-red/10 px-4 py-2 rounded-xl shrink-0 hover:bg-google-red/20 transition-colors">Clear All</button>
                    )}
                    <button onClick={handleSave} className="py-3 px-6 rounded-2xl bg-google-green text-white font-bold font-heading uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-google shadow-google-green/30 shrink-0">
                        <Check className="w-5 h-5" />
                        <span>Save</span>
                    </button>
                </div>
            </div>

            {/* Payment Modal */}
            <AnimatePresence>
                {showPaymentModal && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-surface-container w-full max-w-md rounded-[32px] p-8 pb-10 border border-border mb-safe shadow-google-lg"
                        >
                            <div className="text-center mb-6">
                                <motion.div
                                    initial={{ scale: 0, rotate: -45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    className="w-20 h-20 bg-google-green/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border-4 border-surface-container-high shadow-xl shadow-google-green/10"
                                >
                                    <QrCode className="w-10 h-10 text-google-green" />
                                </motion.div>
                                <h2 className="text-3xl font-black font-heading text-foreground mb-2 tracking-tight">Payment Received?</h2>
                                <p className="text-muted-foreground font-medium text-sm">Please confirm if you have received the payment of</p>
                                <div className="mt-4 inline-block px-6 py-2 bg-foreground rounded-2xl">
                                    <p className="text-2xl font-black text-background tracking-tighter">₹{calculateRoundedTotal().toLocaleString('en-IN')}</p>
                                </div>
                            </div>

                            {/* UPI QR Card - Always Show */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="mb-8 relative group"
                            >
                                <div className="absolute -inset-1 bg-gradient-to-r from-google-blue to-indigo-600 rounded-[40px] blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                                <div className="relative p-6 bg-surface-container-high rounded-[36px] border border-border flex flex-col items-center gap-4 shadow-lg">
                                    <div className="bg-white p-4 rounded-[28px] shadow-sm border border-slate-100">
                                        <QRCode
                                            value={`upi://pay?pa=${company?.upiId || 'demo@upi'}&pn=${encodeURIComponent(company?.name || 'Store')}&am=${calculateRoundedTotal()}&cu=INR`}
                                            size={160}
                                            level="H"
                                            fgColor="#000000"
                                        />
                                    </div>
                                    <div className="text-center space-y-1">
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-google-green animate-pulse"></span>
                                            <p className="text-[11px] font-black text-google-blue uppercase tracking-[0.2em]">Scan to Pay UPI</p>
                                        </div>
                                        <p className="text-sm font-bold text-foreground">{company?.name || 'Your Store'}</p>
                                        {company?.upiId ? (
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">{company.upiId}</p>
                                        ) : (
                                            <p className="text-[10px] font-medium text-orange-500">⚠️ Set UPI ID in Settings</p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handlePaymentChoice(true)}
                                    className="w-full py-5 bg-gradient-to-r from-google-green to-emerald-600 rounded-[24px] font-black font-heading text-lg text-white flex items-center justify-center gap-3 shadow-google shadow-google-green/30 active:scale-[0.98] transition-all"
                                >
                                    YES, RECEIVED <span className="text-sm opacity-80 font-normal tracking-wide hidden sm:inline">(CASH)</span>
                                </button>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handlePaymentChoice(false)}
                                        className="py-4 bg-google-red rounded-[24px] font-bold text-white flex items-center justify-center gap-2 shadow-google shadow-google-red/20 active:scale-[0.98] transition-all"
                                    >
                                        NOT YET <span className="text-[10px] opacity-80 font-normal uppercase tracking-tighter hidden sm:inline">(DUE)</span>
                                    </button>
                                    <button
                                        onClick={() => setShowPaymentModal(false)}
                                        className="py-4 bg-surface-container-high rounded-[24px] font-bold text-muted-foreground active:scale-[0.98] transition-all hover:bg-surface-container-highest"
                                    >
                                        CANCEL
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Party Select Modal */}
            <AnimatePresence>
                {showPartyModal && (
                    <div
                        className="fixed inset-0 z-[70] flex flex-col bg-background"
                        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button onClick={() => { setShowPartyModal(false); setIsCreatingNewParty(false); }} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors"><ArrowLeft className="w-5 h-5 text-foreground" /></button>
                                <h2 className="text-xl font-bold font-heading text-foreground">{isCreatingNewParty ? 'Create New Party' : 'Select Party'}</h2>
                            </div>
                            {isCreatingNewParty && (
                                <button onClick={() => setIsCreatingNewParty(false)} className="text-xs font-bold text-google-blue uppercase tracking-widest px-3 py-1.5 bg-google-blue/10 rounded-full">Back to List</button>
                            )}
                        </div>

                        {!isCreatingNewParty ? (
                            <>
                                <div className="p-4">
                                    <input
                                        type="text"
                                        placeholder="Search Name or Phone..."
                                        className="w-full p-4 bg-surface-container-high rounded-[20px] border border-transparent focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-foreground font-bold outline-none transition-all placeholder:text-muted-foreground/50"
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
                                        className="w-full p-4 bg-google-blue/5 border-2 border-dashed border-google-blue/30 rounded-[24px] text-left flex items-center gap-4 mb-4 active:scale-[0.98] transition-all group hover:bg-google-blue/10"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-google-blue text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Plus className="w-6 h-6" /></div>
                                        <div className="flex-1">
                                            <p className="font-black text-google-blue">Add New Party</p>
                                            <p className="text-[10px] font-bold text-google-blue/60 uppercase tracking-widest">Create record for "{customersSearch || 'Customer'}"</p>
                                        </div>
                                    </button>

                                    {filteredCustomers.length === 0 && customersSearch && (
                                        <div className="text-center py-10 opacity-40">
                                            <Users className="w-12 h-12 mx-auto mb-2" />
                                            <p className="font-bold">No existing party found.</p>
                                            <p className="text-xs">Click "Add New Party" above.</p>
                                        </div>
                                    )}

                                    {filteredCustomers.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { HapticService.medium(); handlePartySelect(c); }}
                                            className="w-full p-4 bg-surface-container rounded-[24px] text-left flex items-center gap-4 border border-border active:scale-[0.98] transition-all shadow-sm group hover:border-google-blue/30"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-surface-container-highest font-black text-lg text-muted-foreground flex items-center justify-center group-hover:bg-google-blue group-hover:text-white transition-colors">
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
                                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[20px] font-bold text-foreground outline-none transition-all"
                                    />

                                    {/* Contact Suggestions */}
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
                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-google-blue font-black tracking-widest">+91</span>
                                        <input
                                            type="tel"
                                            value={newPartyPhone}
                                            onChange={e => setNewPartyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            placeholder="00000 00000"
                                            className="w-full p-4 pl-16 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[20px] font-black text-foreground outline-none tracking-[0.2em] transition-all"
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
                                    className="w-full py-5 bg-google-blue text-white rounded-[24px] font-black uppercase tracking-widest shadow-google hover:scale-105 active:scale-95 transition-all"
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
                    <div
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-google-green text-white p-6"
                        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-center w-full max-w-sm"
                        >
                            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
                                <Check className="w-12 h-12 text-white" strokeWidth={4} />
                            </div>
                            <h2 className="text-4xl font-black font-heading mb-2">Saved!</h2>
                            <p className="text-white/80 font-bold mb-8">Transaction recorded successfully.</p>

                            <div className="space-y-4">
                                <button
                                    onClick={() => {
                                        setShowSuccessModal(false);
                                        setShowWhatsAppModal(true);
                                    }}
                                    className="w-full py-4 bg-white text-google-green rounded-[24px] font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-white/90"
                                >
                                    <MessageCircle className="w-5 h-5 fill-current" />
                                    Send on WhatsApp
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="w-full py-4 bg-black/20 text-white rounded-[24px] font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-black/30"
                                >
                                    <Download className="w-5 h-5" />
                                    Download Bill
                                </button>
                                <button
                                    onClick={() => {
                                        setShowSuccessModal(false);
                                        handleClearAll();
                                    }}
                                    className="w-full py-4 text-white/60 font-bold text-sm uppercase tracking-widest hover:text-white transition-colors"
                                >
                                    Start New Bill
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Product Search Modal */}
            <AnimatePresence>
                {showProductSearch && (
                    <div
                        className="fixed inset-0 z-[70] flex flex-col bg-background"
                        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <div className="p-4 border-b border-border flex items-center justify-between bg-surface-container">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowProductSearch(false)}
                                    className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5 text-foreground" />
                                </button>
                                <h2 className="text-xl font-bold font-heading text-foreground">Search Products</h2>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</p>
                                <p className="font-black text-google-blue">₹{calculateRoundedTotal().toLocaleString('en-IN')}</p>
                            </div>
                        </div>

                        <div className="p-4 bg-surface-container-low">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search by name, ID or price..."
                                    className="w-full p-4 pl-12 bg-surface-container-high rounded-2xl border border-transparent focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-foreground font-bold outline-none transition-all placeholder:text-muted-foreground/50"
                                    value={productSearchQuery}
                                    onChange={e => setProductSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {products
                                .filter(p =>
                                    p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                                    p.id.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                                    p.price.toString().includes(productSearchQuery)
                                )
                                .map(product => {
                                    const existingItem = items.find(i => i.productId === product.id);
                                    const currentQty = existingItem?.quantity || 0;

                                    return (
                                        <motion.div
                                            key={product.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`p-4 rounded-2xl border transition-all ${currentQty > 0
                                                ? 'bg-google-blue/5 border-google-blue/30'
                                                : 'bg-surface-container border-border'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${currentQty > 0 ? 'bg-google-blue text-white' : 'bg-surface-container-high text-muted-foreground'
                                                        }`}>
                                                        <Package className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-foreground truncate">{product.name}</p>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-google-blue bg-google-blue/10 px-2 py-0.5 rounded-full">ID: {product.id}</span>
                                                            <span className="text-xs font-bold text-muted-foreground">₹{product.price}</span>
                                                            {product.gstRate ? <span className="text-[10px] font-bold text-green-600">GST {product.gstRate}%</span> : null}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Quantity Controls */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {currentQty > 0 && (
                                                        <button
                                                            onClick={() => {
                                                                HapticService.medium();
                                                                setSmartCalcInput(`-${product.id}`);
                                                                handleSmartAction('REMOVE');
                                                            }}
                                                            className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center active:scale-95 transition-all"
                                                        >
                                                            <Minus className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    {currentQty > 0 && (
                                                        <input
                                                            type="number"
                                                            className="w-12 text-center bg-transparent text-lg font-black text-google-blue outline-none p-0 border-b-2 border-transparent focus:border-google-blue transition-colors"
                                                            value={currentQty.toString()}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value);
                                                                const newQty = isNaN(val) ? 0 : val;

                                                                const newItems = [...items];
                                                                const idx = newItems.findIndex(i => i.productId === product.id);

                                                                if (idx > -1) {
                                                                    if (newQty <= 0) {
                                                                        newItems.splice(idx, 1);
                                                                    } else {
                                                                        newItems[idx].quantity = newQty;
                                                                        newItems[idx].baseAmount = newQty * newItems[idx].rate;
                                                                        if (gstEnabled) calculateTaxes(newItems[idx], company, null); // Assumes calculateTaxes is in scope
                                                                        else newItems[idx].totalAmount = newItems[idx].baseAmount;
                                                                    }
                                                                    setItems(newItems);
                                                                }
                                                            }}
                                                        />
                                                    )}

                                                    <button
                                                        onClick={() => {
                                                            HapticService.medium();
                                                            setSmartCalcInput(product.id);
                                                            handleSmartAction('ADD');
                                                        }}
                                                        className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all ${currentQty > 0
                                                            ? 'bg-google-blue text-white'
                                                            : 'bg-google-green text-white'
                                                            }`}
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Show item total if added */}
                                            {currentQty > 0 && existingItem && (
                                                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                                                    <span className="text-xs font-bold text-muted-foreground">{currentQty} × ₹{product.price}</span>
                                                    <span className="font-black text-foreground">₹{(existingItem.totalAmount || 0).toLocaleString('en-IN')}</span>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })
                            }

                            {products.filter(p =>
                                p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                                p.id.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                                p.price.toString().includes(productSearchQuery)
                            ).length === 0 && (
                                    <div className="text-center py-16 opacity-50">
                                        <Package className="w-16 h-16 mx-auto mb-4" strokeWidth={1.5} />
                                        <p className="font-bold text-muted-foreground">No products found</p>
                                        <p className="text-sm text-muted-foreground">Try a different search term</p>
                                    </div>
                                )}
                        </div>

                        {/* Bottom Summary Bar */}
                        {items.length > 0 && (
                            <div className="p-4 border-t border-border bg-surface-container">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TOTAL ({items.length} ITEMS)</p>
                                        <p className="text-2xl font-black text-foreground">₹{calculateRoundedTotal().toLocaleString('en-IN')}</p>
                                    </div>
                                    <button
                                        onClick={() => setShowProductSearch(false)}
                                        className="py-3 px-6 rounded-2xl bg-google-green text-white font-bold font-heading uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-google shadow-google-green/30"
                                    >
                                        <Check className="w-5 h-5" />
                                        <span>Done</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </AnimatePresence>

            {/* Bill Preview Modal */}
            <AnimatePresence>
                {showBillPreview && (
                    <div className="fixed inset-0 z-[110] bg-background flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                        <div className="p-4 border-b border-border flex items-center justify-between bg-surface-container">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-google-blue/10 flex items-center justify-center">
                                    <Eye className="w-5 h-5 text-google-blue" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black font-heading text-foreground">Bill Preview</h2>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{items.length} Items Added</p>
                                </div>
                            </div>
                            <button onClick={() => setShowBillPreview(false)} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-container-low">
                            {items.map((item, idx) => (
                                <div key={idx} className="bg-surface-container p-4 rounded-2xl border border-border shadow-sm flex justify-between items-center">
                                    <div className="flex gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-google-blue/10 flex items-center justify-center text-google-blue font-black text-xs">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-foreground">{item.description}</p>
                                            <p className="text-xs text-muted-foreground font-medium">₹{item.rate} × {item.quantity}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-foreground">₹{(item.totalAmount || 0).toLocaleString('en-IN')}</p>
                                        {item.gstRate ? <p className="text-[9px] font-bold text-google-green uppercase tracking-tighter">GST {item.gstRate}% Included</p> : null}
                                    </div>
                                </div>
                            ))}

                            <div className="mt-6 p-6 bg-surface-container rounded-[32px] border border-border space-y-3">
                                <div className="flex justify-between items-center text-sm font-bold text-muted-foreground">
                                    <span>Subtotal</span>
                                    <span>₹{calculateSubtotal().toLocaleString('en-IN')}</span>
                                </div>
                                {discountValue > 0 && (
                                    <div className="flex justify-between items-center text-sm font-bold text-purple-600">
                                        <span>Discount ({discountValue}{discountType === 'PERCENTAGE' ? '%' : '₹'})</span>
                                        <span>- ₹{(calculateSubtotal() - calculateTotal()).toLocaleString('en-IN')}</span>
                                    </div>
                                )}
                                {(calculateTotalCGST() > 0 || calculateTotalSGST() > 0 || calculateTotalIGST() > 0) && (
                                    <div className="pt-2 border-t border-dashed border-border flex flex-col gap-1">
                                        {calculateTotalCGST() > 0 && (
                                            <div className="flex justify-between items-center text-[11px] font-bold text-muted-foreground">
                                                <span>CGST Total</span>
                                                <span>₹{calculateTotalCGST().toLocaleString('en-IN')}</span>
                                            </div>
                                        )}
                                        {calculateTotalSGST() > 0 && (
                                            <div className="flex justify-between items-center text-[11px] font-bold text-muted-foreground">
                                                <span>SGST Total</span>
                                                <span>₹{calculateTotalSGST().toLocaleString('en-IN')}</span>
                                            </div>
                                        )}
                                        {calculateTotalIGST() > 0 && (
                                            <div className="flex justify-between items-center text-[11px] font-bold text-muted-foreground">
                                                <span>IGST Total</span>
                                                <span>₹{calculateTotalIGST().toLocaleString('en-IN')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="pt-3 border-t-2 border-border flex justify-between items-center">
                                    <span className="text-sm font-black uppercase tracking-widest text-foreground">Grand Total</span>
                                    <span className="text-2xl font-black text-google-blue">₹{calculateRoundedTotal().toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-surface-container border-t border-border flex gap-3">
                            <button
                                onClick={() => { setShowBillPreview(false); HapticService.light(); }}
                                className="flex-1 py-4 rounded-2xl bg-surface-container-high text-foreground font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-border active:scale-95 transition-all"
                            >
                                <Edit2 className="w-4 h-4" />
                                Vapas (Edit)
                            </button>
                            <button
                                onClick={() => {
                                    setShowBillPreview(false);
                                    handleSave();
                                    HapticService.success();
                                }}
                                className="flex-[1.5] py-4 rounded-2xl bg-google-green text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-google shadow-google-green/20 active:scale-95 transition-all"
                            >
                                <Check className="w-5 h-5" />
                                Save & Bill
                            </button>
                        </div>
                    </div>
                )}
            </AnimatePresence>
            <ConfirmationModal
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={() => {
                    if (itemToDelete) {
                        setItems(items.filter(i => i.productId !== itemToDelete.productId));
                        toast.success(`${itemToDelete.description} removed`);
                    }
                }}
                title="Remove Item?"
                message={`Are you sure you want to remove ${itemToDelete?.description} from the list?`}
                confirmText="Remove"
                variant="danger"
            />
            <WhatsAppNumberModal
                isOpen={showWhatsAppModal}
                onClose={() => setShowWhatsAppModal(false)}
                onSubmit={async (phone) => {
                    if (createdInvoice && company) {
                        await WhatsAppService.shareInvoice(createdInvoice, selectedCustomer || undefined, company as any, phone);
                    }
                }}
            />
        </div>
    );
};

export default SmartCalculator;
