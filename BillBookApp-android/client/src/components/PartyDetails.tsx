import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    ChevronLeft, Edit2, MoreVertical, Phone, Send, Search, Filter,
    Printer, Share2, Plus
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { HapticService } from '@/services/hapticService';
import { Invoice, Customer } from '../types';

interface PartyDetailsProps {
    customerId: string;
    onBack: () => void;
    onEditInvoice?: (invoice: Invoice) => void;
    onViewInvoice?: (invoice: Invoice) => void;
    onAddSale?: (customerId: string) => void;
    onAddPayment?: (customerId: string) => void;
}

const PartyDetails: React.FC<PartyDetailsProps> = ({
    customerId,
    onBack,
    onViewInvoice,
    onAddSale,
    onAddPayment
}) => {
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showOptions, setShowOptions] = useState(false);
    const [balance, setBalance] = useState(0);

    useEffect(() => {
        const customers = StorageService.getCustomers();
        const cust = customers.find(c => c.id === customerId);
        setCustomer(cust || null);

        if (cust) {
            // Get all invoices for this customer
            const invoices = StorageService.getInvoices().filter(i => i.customerId === customerId);
            const payments = StorageService.getPayments().filter(p => p.customerId === customerId);

            // Calculate balance
            const totalInvoiced = invoices.filter(i => i.type !== 'CREDIT_NOTE').reduce((sum, i) => sum + i.total, 0);
            const totalReturns = invoices.filter(i => i.type === 'CREDIT_NOTE').reduce((sum, i) => sum + i.total, 0);
            const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
            setBalance(totalInvoiced - totalReturns - totalPaid);

            // Combine transactions
            const txList = invoices.map(inv => ({
                id: inv.id,
                type: inv.type === 'CREDIT_NOTE' ? 'Sale Return' : 'Sale',
                invoiceNumber: inv.invoiceNumber,
                date: inv.date,
                dueDate: inv.dueDate || inv.date,
                total: inv.total,
                balance: inv.total - (inv.paidAmount || 0),
                invoice: inv
            }));

            // Sort by date descending
            txList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setTransactions(txList);
        }
    }, [customerId]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const year = date.getFullYear().toString().slice(-2);
        return `${day} ${month}, ${year}`;
    };

    const filteredTransactions = transactions.filter(tx =>
        tx.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.type.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!customer) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <p className="text-slate-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* Header */}
            <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                        >
                            <ChevronLeft className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                        </button>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Party Details</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="p-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800">
                            <Edit2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </button>
                        <button
                            onClick={() => setShowOptions(!showOptions)}
                            className="p-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                        >
                            <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Customer Info Card */}
            <div className="mx-4 mt-3 bg-gradient-to-b from-blue-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl p-4 border border-blue-100 dark:border-slate-700">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase">
                            {customer.company || customer.name}
                        </h2>
                        <button className="text-sm text-blue-500 font-medium flex items-center gap-1 mt-1">
                            <Phone className="w-3.5 h-3.5" />
                            {customer.phone || 'Add Phone'}
                        </button>
                    </div>
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-emerald-500">
                            <span className="text-xs font-medium">Receivable:</span>
                            <span className="text-sm font-bold">₹ {balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">No Credit Limit Set</p>
                    </div>
                </div>

                {/* Send Reminder Button */}
                <button className="w-full mt-3 py-2.5 border border-blue-200 dark:border-slate-600 rounded-xl flex items-center justify-center gap-2 text-blue-500 font-medium text-sm bg-white dark:bg-slate-800">
                    <Send className="w-4 h-4" />
                    Send Reminder
                </button>
            </div>

            {/* Search Bar */}
            <div className="mx-4 mt-3 flex items-center gap-2">
                <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search transactions"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                    />
                </div>
                <button className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Filter className="w-4 h-4 text-slate-500" />
                </button>
            </div>

            {/* Transaction List */}
            <div className="mt-3">
                {filteredTransactions.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                        <p className="text-slate-400 dark:text-slate-500 text-sm">No transactions found</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredTransactions.map((tx, idx) => (
                            <motion.div
                                key={tx.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                onClick={() => onViewInvoice?.(tx.invoice)}
                                className="bg-white dark:bg-slate-950 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-900"
                            >
                                {/* Row 1: Type & Invoice Details */}
                                <div className="flex items-start justify-between mb-2">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                        {tx.type}
                                    </span>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{tx.invoiceNumber}</p>
                                        <p className="text-[10px] text-slate-400">{formatDate(tx.date)}</p>
                                        <p className="text-[10px] text-slate-400">Due : {formatDate(tx.dueDate)}</p>
                                    </div>
                                </div>

                                {/* Row 2: Total, Balance & Actions */}
                                <div className="flex items-end justify-between">
                                    <div className="flex gap-6">
                                        <div>
                                            <p className="text-[10px] text-slate-400 mb-0.5">Total</p>
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">₹ {tx.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400 mb-0.5">Balance</p>
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">₹ {tx.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); HapticService.light(); }}
                                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                        >
                                            <Printer className="w-4 h-4 text-slate-400" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); HapticService.light(); }}
                                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                        >
                                            <Share2 className="w-4 h-4 text-slate-400" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); HapticService.light(); }}
                                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded"
                                        >
                                            Pdf
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Action Buttons */}
            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3 z-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
                <button
                    onClick={() => onAddPayment?.(customerId)}
                    className="flex-1 py-3 bg-blue-500 text-white font-bold text-sm rounded-full"
                >
                    Take Payment
                </button>
                <button
                    className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center border border-slate-200 dark:border-slate-700"
                >
                    <Plus className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
                <button
                    onClick={() => onAddSale?.(customerId)}
                    className="flex-1 py-3 bg-red-500 text-white font-bold text-sm rounded-full"
                >
                    Add Sale
                </button>
            </div>

            {/* Bottom Safe Area Padding */}
            <div className="h-28" />
        </div>
    );
};

export default PartyDetails;
