
import React, { useState, useEffect } from 'react';
import { Expense } from '../types';
import { StorageService } from '../services/storageService';
import { Plus, Trash2, Calendar, IndianRupee, Tag, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExpensesProps {
    onBack?: () => void;
}

const EXPENSE_CATEGORIES = [
    'Rent',
    'Electricity',
    'Salary',
    'Tea/Snacks',
    'Transportation',
    'Marketing',
    'Maintenance',
    'Other'
];

const Expenses: React.FC<ExpensesProps> = ({ onBack }) => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newExpense, setNewExpense] = useState<Partial<Expense>>({
        date: new Date().toISOString().split('T')[0],
        category: 'Other',
        paymentMode: 'CASH'
    });

    useEffect(() => {
        setExpenses(StorageService.getExpenses());
    }, []);

    const handleSave = () => {
        if (!newExpense.amount || !newExpense.category || !newExpense.date) {
            alert("Please fill all required fields");
            return;
        }

        const expense: Expense = {
            id: crypto.randomUUID(),
            category: newExpense.category,
            description: newExpense.description || '',
            amount: Number(newExpense.amount),
            date: newExpense.date,
            paymentMode: newExpense.paymentMode as 'CASH' | 'UPI' | 'BANK_TRANSFER'
        };

        StorageService.saveExpense(expense);
        setExpenses(StorageService.getExpenses());
        setShowAddModal(false);
        setNewExpense({
            date: new Date().toISOString().split('T')[0],
            category: 'Other',
            paymentMode: 'CASH'
        });
    };

    const handleDelete = (id: string) => {
        if (confirm("Are you sure you want to delete this expense?")) {
            StorageService.deleteExpense(id);
            setExpenses(StorageService.getExpenses());
        }
    };

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="pt-safe px-4 md:px-6 pb-24 md:pb-6 relative min-h-full">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button onClick={onBack} className="md:hidden p-2 -ml-2 text-slate-500">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Expenses</h2>
                        <p className="text-sm text-slate-500">Track business costs</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden md:inline">Add Expense</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <p className="text-slate-500 text-sm font-medium">Total Expenses</p>
                    <h3 className="text-3xl font-bold text-red-600 mt-1">₹{totalExpenses.toFixed(2)}</h3>
                </div>
                {/* We can add more stats like "This Month" vs "Last Month" later */}
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                {expenses.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {expenses.map((expense) => (
                            <div key={expense.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center flex-shrink-0">
                                        <Tag className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-800 dark:text-slate-200">{expense.category}</h4>
                                        <p className="text-sm text-slate-500">{expense.description || 'No description'}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {expense.date}</span>
                                            <span className="uppercase border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 rounded text-[10px]">{expense.paymentMode}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <p className="font-bold text-slate-800 dark:text-slate-200">₹{expense.amount.toFixed(2)}</p>
                                    <button
                                        onClick={() => handleDelete(expense.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center text-slate-400">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <IndianRupee className="w-8 h-8 text-slate-300" />
                        </div>
                        <p>No expenses recorded yet.</p>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Add New Expense</h3>
                                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">Close</button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={newExpense.date}
                                        onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                                        className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                                    <select
                                        value={newExpense.category}
                                        onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                                        className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                    >
                                        {EXPENSE_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (₹)</label>
                                    <input
                                        type="number"
                                        value={newExpense.amount}
                                        onChange={e => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                                        placeholder="0.00"
                                        className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
                                    <input
                                        type="text"
                                        value={newExpense.description}
                                        onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                        placeholder="Details..."
                                        className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
                                    <div className="flex gap-2">
                                        {['CASH', 'UPI', 'BANK_TRANSFER'].map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => setNewExpense({ ...newExpense, paymentMode: mode as any })}
                                                className={`flex-1 py-2 text-xs font-medium rounded-lg border ${newExpense.paymentMode === mode
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {mode.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleSave}
                                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                                    >
                                        Save Expense
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Expenses;
