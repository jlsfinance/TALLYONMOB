/**
 * Calculator Mode Toggle Component
 * Provides both Smart Calculator and Normal Calculator in one interface
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calculator, Zap, X, Check, Delete, Plus,
    Save, Package, ChevronDown, ChevronUp
} from 'lucide-react';
import { StorageService } from '@/services/storageService';
import { Invoice, InvoiceItem, InvoiceFormat } from '@/types';
import { HapticService } from '@/services/hapticService';
import { useCompany } from '@/contexts/CompanyContext';

interface NormalCalculatorProps {
    onBack: () => void;
    onSaveSuccess: (invoice: Invoice) => void;
    onSwitchToSmart: () => void;
}

const NormalCalculator: React.FC<NormalCalculatorProps> = ({ onBack, onSaveSuccess, onSwitchToSmart }) => {
    const { company } = useCompany();

    // Calculator State
    const [display, setDisplay] = useState('0');
    const [previousValue, setPreviousValue] = useState<number | null>(null);
    const [operation, setOperation] = useState<string | null>(null);
    const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);

    // Bill Items
    const [billItems, setBillItems] = useState<{ amount: number; description: string }[]>([]);
    const [showBillModal, setShowBillModal] = useState(false);
    const [currentDescription, setCurrentDescription] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showItemsList, setShowItemsList] = useState(true);

    // Input digit
    const inputDigit = (digit: string) => {
        HapticService.light();

        if (waitingForSecondOperand) {
            setDisplay(digit);
            setWaitingForSecondOperand(false);
        } else {
            // Prevent multiple decimals
            if (digit === '.' && display.includes('.')) return;
            // Limit decimal places
            if (display.includes('.') && display.split('.')[1]?.length >= 2) return;

            setDisplay(display === '0' ? digit : display + digit);
        }
    };

    // Perform operation
    const performOperation = (nextOperation: string) => {
        HapticService.light();
        const inputValue = parseFloat(display);

        if (previousValue === null) {
            setPreviousValue(inputValue);
        } else if (operation) {
            const currentValue = previousValue || 0;
            let result: number;

            switch (operation) {
                case '+':
                    result = currentValue + inputValue;
                    break;
                case '-':
                    result = currentValue - inputValue;
                    break;
                case '×':
                    result = currentValue * inputValue;
                    break;
                case '÷':
                    result = inputValue !== 0 ? currentValue / inputValue : 0;
                    break;
                default:
                    result = inputValue;
            }

            result = Math.round(result * 100) / 100; // Round to 2 decimals
            setDisplay(String(result));
            setPreviousValue(result);
        }

        setWaitingForSecondOperand(true);
        setOperation(nextOperation);
    };

    // Calculate result
    const calculate = () => {
        HapticService.medium();

        if (!operation || previousValue === null) return;

        const inputValue = parseFloat(display);
        let result: number;

        switch (operation) {
            case '+':
                result = previousValue + inputValue;
                break;
            case '-':
                result = previousValue - inputValue;
                break;
            case '×':
                result = previousValue * inputValue;
                break;
            case '÷':
                result = inputValue !== 0 ? previousValue / inputValue : 0;
                break;
            default:
                result = inputValue;
        }

        result = Math.round(result * 100) / 100;
        setDisplay(String(result));
        setPreviousValue(null);
        setOperation(null);
        setWaitingForSecondOperand(false);
    };

    // Clear
    const clear = () => {
        HapticService.light();
        setDisplay('0');
        setPreviousValue(null);
        setOperation(null);
        setWaitingForSecondOperand(false);
    };

    // Clear all
    const clearAll = () => {
        HapticService.heavy();
        clear();
        setBillItems([]);
    };

    // Backspace
    const backspace = () => {
        HapticService.light();
        if (display.length > 1) {
            setDisplay(display.slice(0, -1));
        } else {
            setDisplay('0');
        }
    };

    // Add to bill
    const addToBill = () => {
        const amount = parseFloat(display);
        if (amount <= 0 || isNaN(amount)) {
            HapticService.heavy();
            return;
        }

        HapticService.success();
        setShowBillModal(true);
    };

    // Confirm add to bill
    const confirmAddToBill = () => {
        const amount = parseFloat(display);
        setBillItems(prev => [...prev, {
            amount,
            description: currentDescription || `Item ${prev.length + 1}`
        }]);
        setCurrentDescription('');
        setShowBillModal(false);
        clear();
    };

    // Remove item from bill
    const removeFromBill = (index: number) => {
        HapticService.medium();
        setBillItems(prev => prev.filter((_, i) => i !== index));
    };

    // Calculate total
    const calculateTotal = () => {
        return billItems.reduce((sum, item) => sum + item.amount, 0);
    };

    // Save as invoice
    const handleSave = () => {
        if (billItems.length === 0) {
            HapticService.heavy();
            return;
        }
        HapticService.success();
        setShowSaveModal(true);
    };

    // Create invoice
    const createInvoice = (paid: boolean) => {
        const items: InvoiceItem[] = billItems.map((item, idx) => ({
            productId: `calc-${idx}`,
            description: item.description,
            quantity: 1,
            rate: item.amount,
            baseAmount: item.amount,
            hsn: '',
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: item.amount,
            discountType: 'AMOUNT' as const,
            discountValue: 0,
            discountAmount: 0
        }));

        const total = calculateTotal();
        const invNumber = StorageService.generateInvoiceNumber('calc', new Date().toISOString());

        const invoice: Invoice = {
            id: crypto.randomUUID(),
            invoiceNumber: invNumber,
            customerId: 'CASH_SALE',
            customerName: paid ? 'CASH SALES' : 'Calculator Bill',
            customerAddress: '',
            customerState: '',
            customerGstin: '',
            supplierGstin: company?.gstin || '',
            taxType: 'INTRA_STATE',
            date: new Date().toISOString().split('T')[0],
            dueDate: new Date().toISOString().split('T')[0],
            items,
            discountType: 'AMOUNT',
            discountValue: 0,
            discountAmount: 0,
            subtotal: total,
            totalCgst: 0,
            totalSgst: 0,
            totalIgst: 0,
            gstEnabled: false,
            roundUpTo: 0,
            roundUpAmount: 0,
            total: total,
            status: paid ? 'PAID' : 'PENDING',
            paymentMode: paid ? 'CASH' : 'CREDIT',
            notes: 'Created from Normal Calculator',
            templateFormat: (company?.invoiceSettings?.format as InvoiceFormat) || InvoiceFormat.DEFAULT
        };

        StorageService.saveInvoice(invoice);
        onSaveSuccess(invoice);
        setShowSaveModal(false);
        setBillItems([]);
        clear();
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
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                        <Calculator className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold font-heading text-foreground">Normal Calculator</h2>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Basic calculations with bill</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Switch Button */}
                    <button
                        onClick={onSwitchToSmart}
                        className="flex items-center gap-1.5 px-3 py-2 bg-google-blue/10 text-google-blue rounded-xl text-xs font-bold hover:bg-google-blue/20 transition-colors"
                    >
                        <Zap className="w-4 h-4" />
                        Smart
                    </button>
                    <button
                        onClick={onBack}
                        className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors"
                    >
                        <X className="w-5 h-5 text-foreground" />
                    </button>
                </div>
            </div>

            {/* Bill Items List */}
            {billItems.length > 0 && (
                <div className="bg-surface-container-low border-b border-border">
                    <button
                        onClick={() => setShowItemsList(!showItemsList)}
                        className="w-full p-3 flex items-center justify-between"
                    >
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Bill Items ({billItems.length})
                        </span>
                        {showItemsList ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                    </button>

                    <AnimatePresence>
                        {showItemsList && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="px-4 pb-3 space-y-2 max-h-40 overflow-y-auto">
                                    {billItems.map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex items-center justify-between bg-surface-container p-3 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-google-green/10 flex items-center justify-center text-google-green text-xs font-black">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-foreground">{item.description}</p>
                                                    <p className="text-xs text-muted-foreground">₹{item.amount.toLocaleString('en-IN')}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeFromBill(idx)}
                                                className="p-2 rounded-lg text-google-red hover:bg-google-red/10 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Calculator Display */}
            <div className="flex-1 flex flex-col justify-end p-4 bg-surface-container-low">
                {/* Operation Display */}
                {(previousValue !== null || operation) && (
                    <div className="text-right mb-2">
                        <span className="text-lg text-muted-foreground font-bold">
                            {previousValue} {operation}
                        </span>
                    </div>
                )}

                {/* Main Display */}
                <div className="text-right">
                    <span className="text-5xl font-black text-foreground tracking-tight">
                        {parseFloat(display).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Calculator Keypad */}
            <div className="bg-surface-container p-4 rounded-t-[32px] border-t border-border">
                <div className="grid grid-cols-4 gap-2">
                    {/* Row 1 */}
                    <button onClick={clearAll} className="h-14 rounded-2xl bg-google-red/10 text-google-red font-black text-sm hover:bg-google-red/20 active:scale-95 transition-all">AC</button>
                    <button onClick={clear} className="h-14 rounded-2xl bg-orange-500/10 text-orange-600 font-black text-sm hover:bg-orange-500/20 active:scale-95 transition-all">C</button>
                    <button onClick={backspace} className="h-14 rounded-2xl bg-surface-container-high text-foreground hover:bg-surface-container-highest active:scale-95 transition-all flex items-center justify-center"><Delete className="w-5 h-5" /></button>
                    <button onClick={() => performOperation('÷')} className={`h-14 rounded-2xl font-black text-xl active:scale-95 transition-all ${operation === '÷' ? 'bg-google-blue text-white' : 'bg-google-blue/10 text-google-blue hover:bg-google-blue/20'}`}>÷</button>

                    {/* Row 2 */}
                    {[7, 8, 9].map(n => (
                        <button key={n} onClick={() => inputDigit(n.toString())} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">{n}</button>
                    ))}
                    <button onClick={() => performOperation('×')} className={`h-14 rounded-2xl font-black text-xl active:scale-95 transition-all ${operation === '×' ? 'bg-google-blue text-white' : 'bg-google-blue/10 text-google-blue hover:bg-google-blue/20'}`}>×</button>

                    {/* Row 3 */}
                    {[4, 5, 6].map(n => (
                        <button key={n} onClick={() => inputDigit(n.toString())} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">{n}</button>
                    ))}
                    <button onClick={() => performOperation('-')} className={`h-14 rounded-2xl font-black text-xl active:scale-95 transition-all ${operation === '-' ? 'bg-google-blue text-white' : 'bg-google-blue/10 text-google-blue hover:bg-google-blue/20'}`}>−</button>

                    {/* Row 4 */}
                    {[1, 2, 3].map(n => (
                        <button key={n} onClick={() => inputDigit(n.toString())} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">{n}</button>
                    ))}
                    <button onClick={() => performOperation('+')} className={`h-14 rounded-2xl font-black text-xl active:scale-95 transition-all ${operation === '+' ? 'bg-google-blue text-white' : 'bg-google-blue/10 text-google-blue hover:bg-google-blue/20'}`}>+</button>

                    {/* Row 5 */}
                    <button onClick={() => inputDigit('0')} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">0</button>
                    <button onClick={() => inputDigit('00')} className="h-14 rounded-2xl bg-surface-container-low text-lg font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">00</button>
                    <button onClick={() => inputDigit('.')} className="h-14 rounded-2xl bg-surface-container-low text-xl font-bold text-foreground hover:bg-surface-container-highest active:scale-95 transition-all shadow-sm border border-border">.</button>
                    <button onClick={calculate} className="h-14 rounded-2xl bg-google-green text-white font-black text-xl hover:bg-google-green/90 active:scale-95 transition-all shadow-google shadow-google-green/30">=</button>
                </div>

                {/* Add to Bill Button */}
                <button
                    onClick={addToBill}
                    disabled={parseFloat(display) <= 0}
                    className="w-full mt-3 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                    <Plus className="w-5 h-5" />
                    Add to Bill
                </button>
            </div>

            {/* Bottom Bar */}
            <div className="bg-surface-container border-t border-border p-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">BILL TOTAL ({billItems.length} items)</p>
                        <p className="text-2xl font-black text-foreground">₹{calculateTotal().toLocaleString('en-IN')}</p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={billItems.length === 0}
                        className="py-3 px-6 rounded-2xl bg-google-green text-white font-bold uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-google shadow-google-green/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-5 h-5" />
                        Save
                    </button>
                </div>
            </div>

            {/* Add Item Modal */}
            <AnimatePresence>
                {showBillModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowBillModal(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-surface-container w-full max-w-sm rounded-3xl p-6 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                                    <Package className="w-8 h-8 text-indigo-500" />
                                </div>
                                <h3 className="text-xl font-black text-foreground">Add Item</h3>
                                <p className="text-3xl font-black text-google-green mt-2">₹{parseFloat(display).toLocaleString('en-IN')}</p>
                            </div>

                            <div className="mb-6">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Description (Optional)</label>
                                <input
                                    type="text"
                                    value={currentDescription}
                                    onChange={e => setCurrentDescription(e.target.value)}
                                    placeholder="Enter item name..."
                                    className="w-full p-4 bg-surface-container-high rounded-xl border border-border focus:border-google-blue outline-none font-bold text-foreground"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowBillModal(false)}
                                    className="flex-1 py-3 bg-surface-container-high text-muted-foreground rounded-xl font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmAddToBill}
                                    className="flex-1 py-3 bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                                >
                                    <Check className="w-4 h-4" />
                                    Add
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Save Modal */}
            <AnimatePresence>
                {showSaveModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSaveModal(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-surface-container w-full max-w-sm rounded-3xl p-6 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-google-green/10 flex items-center justify-center">
                                    <Save className="w-8 h-8 text-google-green" />
                                </div>
                                <h3 className="text-xl font-black text-foreground">Save Bill</h3>
                                <p className="text-3xl font-black text-google-green mt-2">₹{calculateTotal().toLocaleString('en-IN')}</p>
                                <p className="text-sm text-muted-foreground mt-1">{billItems.length} items</p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => createInvoice(true)}
                                    className="w-full py-4 bg-gradient-to-r from-google-green to-emerald-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-google-green/30"
                                >
                                    <Check className="w-5 h-5" />
                                    Payment Received (Cash)
                                </button>
                                <button
                                    onClick={() => createInvoice(false)}
                                    className="w-full py-4 bg-google-red text-white rounded-2xl font-bold"
                                >
                                    Save as Due
                                </button>
                                <button
                                    onClick={() => setShowSaveModal(false)}
                                    className="w-full py-3 bg-surface-container-high text-muted-foreground rounded-xl font-bold"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NormalCalculator;
