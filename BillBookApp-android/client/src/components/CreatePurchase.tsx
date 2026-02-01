
import React, { useState, useEffect } from 'react';
import { Customer, Product, Invoice, InvoiceItem, Payment } from '../types';
import { StorageService } from '../services/storageService';
import { Save, ArrowLeft, Package, Sparkles, Users, Banknote } from 'lucide-react';
import Autocomplete from './Autocomplete';
import { useCompany } from '@/contexts/CompanyContext';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { HapticService } from '@/services/hapticService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { GeminiService } from '../services/geminiService';
import { AIService } from '../services/aiService';

interface CreatePurchaseProps {
    onSave: (purchase: Invoice) => void;
    onCancel: () => void;
    initialPurchase?: Invoice | null;
}

const CreatePurchase: React.FC<CreatePurchaseProps> = ({ onSave, onCancel, initialPurchase }) => {
    const { company } = useCompany();
    const [vendors, setVendors] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    const [selectedVendorId, setSelectedVendorId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>([]);

    const gstEnabled = company?.gst_enabled ?? true;
    const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH'>('CREDIT');
    const [paidAmount, setPaidAmount] = useState<number>(0);
    const [notes, setNotes] = useState('');

    // AI Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // States for Modals
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [newVendorName, setNewVendorName] = useState('');
    const [newVendorPhone, setNewVendorPhone] = useState('');

    // Product Creation
    const [newProductName, setNewProductName] = useState('');
    const [newProductPurchasePrice, setNewProductPurchasePrice] = useState(''); // Purchase Price
    const [newProductGST, setNewProductGST] = useState('0');
    const [newProductId, setNewProductId] = useState('');
    const [pendingProductIndex, setPendingProductIndex] = useState<number | null>(null);

    const [hasChanges, setHasChanges] = useState(false);
    const [showEditWarning, setShowEditWarning] = useState(false);

    // Focus navigation
    // Focus navigation

    useEffect(() => {
        // Filter for vendors if we marked them, but for now getting all customers (contacts)
        setVendors(StorageService.getCustomers());
        setProducts(StorageService.getProducts());

        if (initialPurchase) {
            setSelectedVendorId(initialPurchase.customerId);
            setDate(initialPurchase.date);
            setDueDate(initialPurchase.dueDate);
            setItems(initialPurchase.items.map(i => ({ ...i })));
            setPaymentMode(initialPurchase.status === 'PAID' ? 'CASH' : 'CREDIT');
            setNotes(initialPurchase.notes || '');
        } else {
            const d = new Date();
            d.setDate(d.getDate() + 30);
            setDueDate(d.toISOString().split('T')[0]);
            if (items.length === 0) handleAddItem();
        }
    }, [initialPurchase]);

    const handleAddItem = () => {
        setItems([...items, {
            productId: '',
            description: '',
            quantity: 1,
            rate: 0,
            baseAmount: 0,
            hsn: '',
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: 0,
            discountType: 'AMOUNT',
            discountValue: 0,
            discountAmount: 0
        }]);
    };

    const calculateTaxes = (item: InvoiceItem, _supplier: any, _customer: any) => {
        // For Purchase, WE are the customer, Vendor is the Supplier.
        // Logic remains: Intra-state if states match.
        // Supplier = Vendor, Customer = Us (Company)

        // BUT item.rate is Unit Price.

        // Discount Calculation
        let discount = 0;
        if (item.discountType === 'PERCENTAGE') {
            discount = (item.quantity * item.rate) * (item.discountValue || 0) / 100;
        } else {
            discount = item.discountValue || 0;
        }
        item.discountAmount = discount;

        const baseAmount = Math.max(0, (item.quantity * item.rate) - discount);

        const gstRate = item.gstRate || 0;

        // Simple check: If Vendor State == Company State -> Intra
        // If not set, assume Intra (Delhi default mock)
        const vendorState = vendors.find(v => v.id === selectedVendorId)?.state || (company as any)?.state || 'Delhi';
        const companyState = (company as any)?.state || 'Delhi';
        const taxType = vendorState === companyState ? 'INTRA_STATE' : 'INTER_STATE';

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

    const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
    const [showItemModal, setShowItemModal] = useState(false);

    const handleOpenItemModal = (index: number) => {
        setActiveItemIndex(index);
        setShowItemModal(true);
        HapticService.light();
    };

    const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        setHasChanges(true);
        const newItems = [...items];
        const item = newItems[index];

        if (field === 'productId') {
            const product = products.find(p => p.id === value);
            if (product) {
                item.productId = product.id;
                item.description = product.name;
                item.hsn = product.hsn || '';
                item.gstRate = product.gstRate || 0;

                // Use Purchase Price if available, else Price
                item.rate = product.purchasePrice || product.price || 0;

                // Calculate
                calculateTaxes(item, null, null);
            }
        } else {
            // @ts-ignore
            item[field] = value;
            if (['quantity', 'rate', 'decreaseAmount', 'discountType', 'discountValue', 'gstRate'].includes(field as string)) {
                // Re-calc
                if (field === 'quantity') item.quantity = Number(value);
                if (field === 'rate') item.rate = Number(value);
                if (field === 'discountValue') item.discountValue = Number(value);
                if (field === 'gstRate') item.gstRate = Number(value);

                calculateTaxes(item, null, null);
            }
        }

        setItems(newItems);
    };

    const handleRemoveItem = (index: number) => {
        setHasChanges(true);
        setItems(items.filter((_, i) => i !== index));
    };

    // Calculations
    const calculateSubtotal = () => items.reduce((sum, item) => sum + (item.baseAmount || 0), 0);
    // const calculateTotalDiscount = () => items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
    const calculateTotalCGST = () => items.reduce((sum, item) => sum + (item.cgstAmount || 0), 0);
    const calculateTotalSGST = () => items.reduce((sum, item) => sum + (item.sgstAmount || 0), 0);
    const calculateTotalIGST = () => items.reduce((sum, item) => sum + (item.igstAmount || 0), 0);

    const calculateTotal = () => {
        const subtotal = calculateSubtotal();
        const cgst = calculateTotalCGST();
        const sgst = calculateTotalSGST();
        const igst = calculateTotalIGST();
        return subtotal + cgst + sgst + igst;
    };

    // Creation Handlers
    const handleCreateVendor = (nameQuery: string) => {
        setNewVendorName(nameQuery);
        setNewVendorPhone('');
        setShowVendorModal(true);
    };

    const saveNewVendor = () => {
        const newVendor: Customer = {
            id: crypto.randomUUID(),
            name: newVendorName,
            company: newVendorName,
            email: '',
            phone: newVendorPhone,
            address: '',
            balance: 0,
            notifications: [],
            type: 'VENDOR' // Mark as vendor
        };
        StorageService.saveCustomer(newVendor);
        setVendors(StorageService.getCustomers());
        setSelectedVendorId(newVendor.id);
        setShowVendorModal(false);
    };

    const handleCreateProduct = (nameQuery: string, index: number) => {
        setNewProductName(nameQuery);
        setNewProductPurchasePrice('');
        setNewProductId('');
        setPendingProductIndex(index);
        setShowProductModal(true);
    };

    const saveNewProduct = () => {
        const newProduct: Product = {
            id: newProductId.trim() || crypto.randomUUID(),
            name: newProductName,
            price: 0, // Sales Price (can be 0 or optional for now)
            purchasePrice: Number(newProductPurchasePrice) || 0, // Save Cost
            stock: 0, // Will be incremented by purchase
            category: 'General',
            hsn: '',
            gstRate: Number(newProductGST) || 0
        };
        StorageService.saveProduct(newProduct);
        setProducts(StorageService.getProducts());

        if (pendingProductIndex !== null) {
            const newItems = [...items];
            // Ensure item exists (if parallel access issue, though React state usually handles this sequence)
            if (newItems[pendingProductIndex]) {
                const item = newItems[pendingProductIndex];
                item.productId = newProduct.id;
                item.description = newProduct.name;
                item.rate = newProduct.purchasePrice || 0;
                item.quantity = 1;
                item.gstRate = newProduct.gstRate || 0;
                item.hsn = newProduct.hsn || '';
                calculateTaxes(item, null, null);
                setItems(newItems);
            }
        }
        setShowProductModal(false);
        // Reset inputs...
        // Reset inputs...
        setNewProductName('');
        setNewProductPurchasePrice('');
    };

    const handleQuickAdd = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const newItem: InvoiceItem = {
            productId: product.id,
            description: product.name,
            quantity: 1,
            rate: product.purchasePrice || product.price || 0,
            baseAmount: 0,
            hsn: product.hsn || '',
            gstRate: product.gstRate || 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: 0,
            discountType: 'AMOUNT',
            discountValue: 0,
            discountAmount: 0
        };

        calculateTaxes(newItem, null, null);

        setItems(prev => [...prev, newItem]);
        // Auto-open modal to confirm/edit price/qty
        setTimeout(() => handleOpenItemModal(items.length), 100);
    };

    const handleQuickCreate = (name: string) => {
        // We need a placeholder item for the new product to land in
        const newItem: InvoiceItem = {
            productId: '',
            description: '',
            quantity: 1,
            rate: 0,
            baseAmount: 0,
            hsn: '',
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: 0,
            discountType: 'AMOUNT',
            discountValue: 0,
            discountAmount: 0
        };

        const newIndex = items.length;
        setItems(prev => [...prev, newItem]);

        // Setup Product Creation
        setNewProductName(name);
        setNewProductPurchasePrice('');
        setNewProductId('');
        setPendingProductIndex(newIndex);
        setShowProductModal(true);
    };

    const handleScanBill = async () => {
        try {
            const image = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Prompt
            });

            if (image.base64String) {
                setIsAnalyzing(true);
                // Use central AIService for API Key
                let apiKey = AIService.getApiKey();
                if (!apiKey) {
                    apiKey = prompt("Enter Google Gemini API Key for AI Analysis:");
                    if (apiKey) AIService.setApiKey(apiKey);
                }

                if (!apiKey) {
                    alert("API Key required for AI features.");
                    setIsAnalyzing(false);
                    return;
                }

                const result = await GeminiService.analyzeBill(image.base64String, apiKey);

                if (result) {
                    // 1. Populate Vendor
                    if (result.vendorName) {
                        const existingVendor = vendors.find(v =>
                            v.name.toLowerCase().includes(result.vendorName!.toLowerCase()) ||
                            v.company?.toLowerCase().includes(result.vendorName!.toLowerCase())
                        );
                        if (existingVendor) {
                            setSelectedVendorId(existingVendor.id);
                        } else {
                            if (confirm(`Vendor "${result.vendorName}" not found. Create new?`)) {
                                handleCreateVendor(result.vendorName);
                            }
                        }
                    }

                    // 2. Populate Date
                    if (result.date) {
                        setDate(result.date);
                    }

                    // 3. Populate Items
                    if (result.items && result.items.length > 0) {
                        const newItems: InvoiceItem[] = result.items.map(imgItem => {
                            const matchedProduct = products.find(p => p.name.toLowerCase() === imgItem.description.toLowerCase());

                            const item: InvoiceItem = {
                                productId: matchedProduct ? matchedProduct.id : '',
                                description: imgItem.description,
                                quantity: imgItem.quantity || 1,
                                rate: imgItem.rate || 0,
                                baseAmount: 0,
                                hsn: matchedProduct?.hsn || '',
                                gstRate: matchedProduct?.gstRate || 0,
                                cgstAmount: 0,
                                sgstAmount: 0,
                                igstAmount: 0,
                                totalAmount: 0,
                                discountType: 'AMOUNT',
                                discountValue: 0,
                                discountAmount: 0
                            };
                            item.totalAmount = item.quantity * item.rate; // Simple calc before tax
                            item.baseAmount = item.totalAmount;
                            calculateTaxes(item, null, null);
                            return item;
                        });

                        if (confirm(`Found ${result.items.length} items. Replace current items?`)) {
                            setItems(newItems);
                        } else {
                            setItems([...items, ...newItems]);
                        }
                    }
                    HapticService.success();
                }
            }
        } catch (error) {
            console.error(error);
            alert("Failed to analyze bill. " + error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSubmit = () => {
        if (initialPurchase && hasChanges && !showEditWarning) {
            setShowEditWarning(true);
            return;
        }

        const vendor = vendors.find(v => v.id === selectedVendorId);
        if (!vendor) return alert('Select a vendor');
        if (items.length === 0) return alert('Add at least one item');

        const cleanedItems: InvoiceItem[] = items.map(item => ({
            ...item,
            quantity: Number(item.quantity) || 1,
            rate: Number(item.rate) || 0,
            baseAmount: Number(item.baseAmount) || 0,
            gstRate: Number(item.gstRate) || 0,
            discountValue: Number(item.discountValue) || 0,
            discountAmount: Number(item.discountAmount) || 0,
        }));

        if (items.length === 0) return alert('Add at least one item');
        const totalCgst = calculateTotalCGST();
        const totalSgst = calculateTotalSGST();
        const totalIgst = calculateTotalIGST();

        // Vendor Logic
        const vendorState = vendor.state || (company as any)?.state || 'Delhi';
        const companyState = (company as any)?.state || 'Delhi';
        const taxType = vendorState === companyState ? 'INTRA_STATE' : 'INTER_STATE';

        const invoiceData: Invoice = {
            id: initialPurchase ? initialPurchase.id : crypto.randomUUID(),
            type: 'PURCHASE',
            invoiceNumber: initialPurchase ? initialPurchase.invoiceNumber : `PUR-${Date.now().toString().slice(-6)}`, // Simple Auto Gen for purchase
            customerId: vendor.id,
            customerName: vendor.company || vendor.name,
            customerAddress: vendor.address || '',
            customerState: vendor.state || '',
            customerGstin: vendor.gstin || '',
            supplierGstin: (company as any)?.gstin || (company as any)?.gst || '', // Our GST
            taxType: taxType,
            date,
            dueDate,
            items: cleanedItems,
            subtotal: Math.round(calculateSubtotal() * 100) / 100,
            totalCgst: Math.round(totalCgst * 100) / 100,
            totalSgst: Math.round(totalSgst * 100) / 100,
            totalIgst: Math.round(totalIgst * 100) / 100,
            gstEnabled: gstEnabled && cleanedItems.some(i => (i.gstRate || 0) > 0),
            total: Math.round(calculateTotal() * 100) / 100,
            status: (paidAmount >= Math.round(calculateTotal() * 100) / 100) ? 'PAID' : 'PENDING',
            paymentMode: paymentMode,
            paidAmount: paidAmount,
            notes: notes
        };

        if (paidAmount > 0) {
            const payment: Payment = {
                id: crypto.randomUUID(),
                customerId: vendor.id,
                date: date,
                amount: paidAmount,
                mode: 'CASH',
                type: 'PAID',
                reference: 'Purchase Entry',
                note: `Payment for Purchase ${invoiceData.invoiceNumber}`
            };
            StorageService.savePayment(payment);
        }

        onSave(invoiceData);
    };

    const { scrollY } = useScroll();
    const [isScrolled, setIsScrolled] = useState(false);
    useMotionValueEvent(scrollY, "change", (latest: number) => setIsScrolled(latest > 50));

    return (
        <div className="bg-background min-h-screen pb-48 font-sans">
            {/* Edit Warning Modal */}
            {showEditWarning && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    {/* ... Reuse similar modal ... */}
                    {/* Keeping it simple for brevity in this tool call, assume standard modal structure */}
                    <div className="bg-white p-6 rounded-2xl max-w-sm w-full">
                        <h3 className="font-bold text-lg mb-4">Save Changes?</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setShowEditWarning(false)} className="flex-1 p-3 rounded-xl bg-slate-100 font-bold">Cancel</button>
                            <button onClick={handleSubmit} className="flex-1 p-3 rounded-xl bg-orange-600 text-white font-bold">Yes, Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <motion.div className={`sticky top-0 z-30 transition-all duration-300 ${isScrolled ? 'bg-background/95 backdrop-blur-xl border-b border-border shadow-sm' : 'bg-background'}`}>
                <div className="flex items-center justify-between px-4 h-16 max-w-5xl mx-auto">
                    <button onClick={onCancel} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold tracking-tight">Record Purchase</h1>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleScanBill}
                            disabled={isAnalyzing}
                            className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 transition-all ${isAnalyzing ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'}`}
                        >
                            {isAnalyzing ? (
                                <span className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                            ) : (
                                <Sparkles className="w-4 h-4" />
                            )}
                            {isAnalyzing ? 'Scanning...' : 'AI Scan'}
                        </button>

                        <button onClick={handleSubmit} className="bg-orange-600 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-orange-500/20 flex items-center gap-2">
                            <Save className="w-5 h-5" /> Save
                        </button>
                    </div>
                </div>
            </motion.div>

            <div className="max-w-5xl mx-auto space-y-4 pt-6 px-4">
                {/* Vendor Section */}
                <div className="bg-surface-container p-6 rounded-[32px] border border-border">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-bold">Vendor / Party</h2>
                            <p className="text-xs text-muted-foreground">Select supplier</p>
                        </div>
                    </div>
                    <Autocomplete
                        options={vendors.map(c => ({ id: c.id, label: c.company || c.name, subLabel: c.name }))}
                        value={selectedVendorId}
                        onChange={(val) => { setSelectedVendorId(val); setHasChanges(true); }}
                        onCreate={handleCreateVendor}
                        placeholder="Search Vendor..."
                        type="customer"
                    />
                    {/* Dates */}
                    <div className="grid grid-cols-1 gap-4 mt-4">
                        <div className="bg-surface-container-high rounded-xl p-3 border border-border">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent font-bold outline-none text-foreground" />
                        </div>
                    </div>
                </div>

                {/* Payment Section */}
                <div className="bg-surface-container p-6 rounded-[32px] border border-border space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                            <Banknote className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-bold">Payment Details</h2>
                            <p className="text-xs text-muted-foreground">Record payment</p>
                        </div>
                    </div>

                    <div className="flex p-1 bg-surface-container-high rounded-full border border-border">
                        <button onClick={() => { setPaymentMode('CREDIT'); setPaidAmount(0); }} className={`flex-1 py-3 rounded-full font-bold transition-all ${paymentMode === 'CREDIT' ? 'bg-red-500 text-white shadow-lg' : 'text-muted-foreground '}`}>Unpaid (Credit)</button>
                        <button onClick={() => { setPaymentMode('CASH'); setPaidAmount(calculateTotal()); }} className={`flex-1 py-3 rounded-full font-bold transition-all ${paymentMode === 'CASH' ? 'bg-green-600 text-white shadow-lg' : 'text-muted-foreground '}`}>Paid (Cash)</button>
                    </div>

                    {/* Paid Amount Input */}
                    <div className="bg-surface-container-high rounded-xl p-3 border border-border flex justify-between items-center">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Amount Paid</label>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-muted-foreground">₹</span>
                            <input
                                type="number"
                                value={paidAmount === 0 ? '' : paidAmount}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    setPaidAmount(val);
                                    setPaymentMode(val >= calculateTotal() ? 'CASH' : 'CREDIT');
                                }}
                                placeholder="0"
                                className="w-32 bg-transparent font-black text-right outline-none text-foreground text-lg"
                            />
                        </div>
                    </div>
                </div>

                {/* Items */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Items</h2>
                    </div>
                    {items.map((item, idx) => (
                        <motion.div key={idx}
                            onClick={() => handleOpenItemModal(idx)}
                            className="bg-surface-container p-4 rounded-3xl border border-border flex items-center gap-4 active:scale-95 transition-transform cursor-pointer"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"><Package className="w-6 h-6 text-slate-500" /></div>
                            <div className="flex-1">
                                <p className="font-bold text-foreground">{item.description || 'New Item'}</p>
                                <div className="flex gap-2 mt-1">
                                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-600">{item.quantity} x ₹{item.rate}</span>
                                    {item.discountAmount ? <span className="text-xs text-green-600 font-bold">-{item.discountAmount} Off</span> : null}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-black text-lg">₹{item.totalAmount?.toFixed(2)}</p>
                            </div>
                        </motion.div>
                    ))}

                    {/* Quick Add Bar */}
                    <div className="bg-surface-container p-2 rounded-2xl border-2 border-dashed border-border/50">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground ml-2">Add Items</label>
                        <Autocomplete
                            options={products.map(p => ({ id: p.id, label: p.name }))}
                            value=""
                            onChange={handleQuickAdd}
                            onCreate={handleQuickCreate}
                            placeholder="Type to Search or Add Product..."
                            type="product" // assuming Autocomplete supports icons for product
                        />
                    </div>
                </div>
            </div>

            {/* Item Modal (Simplified reuse) */}
            <AnimatePresence>
                {showItemModal && activeItemIndex !== null && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowItemModal(false)} />
                        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-surface w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] p-6 relative z-10 max-h-[90vh] overflow-y-auto">
                            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />
                            <h3 className="font-bold text-xl mb-6">Edit Item</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold uppercase text-muted-foreground">Product</label>
                                    <Autocomplete
                                        options={products.map(p => ({ id: p.id, label: p.name }))}
                                        value={items[activeItemIndex].productId}
                                        onChange={(val) => handleUpdateItem(activeItemIndex, 'productId', val)}
                                        onCreate={(q) => handleCreateProduct(q, activeItemIndex)}
                                        placeholder="Search Product..."
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold uppercase text-muted-foreground">Quantity</label>
                                        <input type="number" value={items[activeItemIndex].quantity} onChange={e => handleUpdateItem(activeItemIndex, 'quantity', e.target.value)} className="w-full p-3 bg-surface-container-highest rounded-xl font-bold border border-border outline-none focus:border-orange-500 text-foreground" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-muted-foreground">Purchase Rate</label>
                                        <input type="number" value={items[activeItemIndex].rate} onChange={e => handleUpdateItem(activeItemIndex, 'rate', e.target.value)} className="w-full p-3 bg-surface-container-highest rounded-xl font-bold border border-border outline-none focus:border-orange-500 text-foreground" />
                                    </div>
                                </div>

                                {/* Discount Section */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <label className="text-xs font-bold uppercase text-muted-foreground mb-2 block">Discount (Optional)</label>
                                    <div className="flex gap-2">
                                        <select
                                            value={items[activeItemIndex].discountType || 'AMOUNT'}
                                            onChange={e => handleUpdateItem(activeItemIndex, 'discountType', e.target.value)}
                                            className="bg-white rounded-xl border border-slate-200 px-3 font-bold outline-none"
                                        >
                                            <option value="AMOUNT">₹ Flat</option>
                                            <option value="PERCENTAGE">% Percent</option>
                                        </select>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={items[activeItemIndex].discountValue || ''}
                                            onChange={e => handleUpdateItem(activeItemIndex, 'discountValue', e.target.value)}
                                            className="flex-1 p-3 bg-white rounded-xl font-bold border border-slate-200 outline-none"
                                        />
                                    </div>
                                </div>

                                {gstEnabled && (
                                    <div>
                                        <label className="text-xs font-bold uppercase text-muted-foreground">GST %</label>
                                        <div className="flex gap-2 flex-wrap mt-2">
                                            {[0, 5, 12, 18, 28].map(rate => (
                                                <button
                                                    key={rate}
                                                    onClick={() => handleUpdateItem(activeItemIndex, 'gstRate', rate)}
                                                    className={`px-4 py-2 rounded-xl font-bold border ${items[activeItemIndex].gstRate === rate ? 'bg-orange-100 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600'}`}
                                                >
                                                    {rate}%
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button onClick={() => setShowItemModal(false)} className="w-full py-4 bg-orange-600 text-white font-bold rounded-2xl shadow-lg shadow-orange-500/20 mt-4">Done</button>
                                <button onClick={() => { handleRemoveItem(activeItemIndex); setShowItemModal(false); }} className="w-full py-4 text-red-500 font-bold mt-2">Remove Item</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Product Creation Modal */}
            <AnimatePresence>
                {showProductModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl">
                            <h3 className="font-bold text-xl mb-4">Add New Product</h3>
                            <div className="space-y-3">
                                <input placeholder="Product Name" value={newProductName} onChange={e => setNewProductName(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 outline-none" />
                                <input placeholder="Purchase Price (Cost)" type="number" value={newProductPurchasePrice} onChange={e => setNewProductPurchasePrice(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 outline-none" />
                                {gstEnabled && (
                                    <input placeholder="GST Rate %" type="number" value={newProductGST} onChange={e => setNewProductGST(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 outline-none" />
                                )}
                                <button onClick={saveNewProduct} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Save Product</button>
                                <button onClick={() => setShowProductModal(false)} className="w-full py-3 text-slate-500 font-bold">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* Vendor Creation Modal */}
            <AnimatePresence>
                {showVendorModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl">
                            <h3 className="font-bold text-xl mb-4">Add New Vendor</h3>
                            <input placeholder="Vendor Name" value={newVendorName} onChange={e => setNewVendorName(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 outline-none mb-3" />
                            <button onClick={saveNewVendor} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Save Vendor</button>
                            <button onClick={() => setShowVendorModal(false)} className="w-full py-3 text-slate-500 font-bold">Cancel</button>
                        </div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default CreatePurchase;
