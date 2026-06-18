import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    PieChart, Target, TrendingUp, TrendingDown, Plus, Edit2, Trash2, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Budget {
    id: string;
    category: string;
    budget_amount: number;
    period_type: string;
    fiscal_year: string;
    notes: string;
    actual_amount?: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(Math.abs(amount) || 0);
}

const categories = [
    'Raw Materials', 'Salaries', 'Rent', 'Utilities', 'Marketing',
    'Travel', 'Office Supplies', 'Repairs', 'Insurance', 'Other'
];

export default function BudgetVsActualPage() {
    const { selectedCompany } = useAuth() as any;
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newCategory, setNewCategory] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const currentYear = new Date().getFullYear().toString();

    useEffect(() => {
        if (selectedCompany?.id) loadBudgets();
    }, [selectedCompany]);

    const loadBudgets = async () => {
        setLoading(true);
        try {
            const { data: budgetData, error } = await supabase
                .from('budgets')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('fiscal_year', currentYear)
                .order('category');

            if (error) throw error;

            const enriched = await Promise.all(
                (budgetData || []).map(async (b) => {
                    const { data: vouchers } = await supabase
                        .from('vouchers')
                        .select('grand_total')
                        .eq('company_id', selectedCompany.id)
                        .eq('voucher_type', 'Payment')
                        .eq('is_deleted', false)
                        .gte('voucher_date', `${currentYear}-04-01`)
                        .lte('voucher_date', `${currentYear}-03-31`);

                    const total = (vouchers || []).reduce((s, v) => s + Math.abs(Number(v.grand_total) || 0), 0);
                    return { ...b, actual_amount: total };
                })
            );

            setBudgets(enriched);
        } catch (err) {
            console.error('Budget load error:', err);
        } finally {
            setLoading(false);
        }
    };

    const saveBudget = async () => {
        if (!newCategory || !newAmount) {
            toast.error('Category and amount required');
            return;
        }

        try {
            const { error } = await supabase.from('budgets').upsert({
                company_id: selectedCompany.id,
                category: newCategory,
                budget_amount: parseFloat(newAmount),
                fiscal_year: currentYear,
                notes: newNotes,
            }, { onConflict: 'company_id,category,fiscal_year' });

            if (error) throw error;
            toast.success('Budget saved');
            setNewCategory('');
            setNewAmount('');
            setNewNotes('');
            loadBudgets();
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        }
    };

    const deleteBudget = async (id: string) => {
        try {
            await supabase.from('budgets').delete().eq('id', id);
            toast.success('Deleted');
            loadBudgets();
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete');
        }
    };

    const totalBudget = budgets.reduce((s, b) => s + (Number(b.budget_amount) || 0), 0);
    const totalActual = budgets.reduce((s, b) => s + (Number(b.actual_amount) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Target size={20} className="text-[var(--primary)]" />
                <h2 className="text-lg font-bold text-[var(--on-surface)]">Budget vs Actual — FY {currentYear}</h2>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total Budget</p>
                    <p className="mt-1 text-lg font-bold text-[var(--on-surface)]">{formatCurrency(totalBudget)}</p>
                </div>
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total Actual</p>
                    <p className="mt-1 text-lg font-bold text-[var(--on-surface)]">{formatCurrency(totalActual)}</p>
                </div>
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Variance</p>
                    <p className={`mt-1 text-lg font-bold ${totalActual <= totalBudget ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(totalBudget - totalActual)}
                    </p>
                </div>
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Utilization</p>
                    <p className="mt-1 text-lg font-bold text-[var(--on-surface)]">
                        {totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0}%
                    </p>
                </div>
            </div>

            {/* Add Budget */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                <p className="text-sm font-bold text-[var(--on-surface)]">Add / Update Budget</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] px-3 py-2 text-sm font-bold text-[var(--on-surface)] outline-none"
                    >
                        <option value="">Select Category</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                        type="number"
                        placeholder="Budget Amount"
                        value={newAmount}
                        onChange={e => setNewAmount(e.target.value)}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] px-3 py-2 text-sm font-bold text-[var(--on-surface)] outline-none"
                    />
                    <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={newNotes}
                        onChange={e => setNewNotes(e.target.value)}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] px-3 py-2 text-sm font-bold text-[var(--on-surface)] outline-none"
                    />
                    <button
                        onClick={saveBudget}
                        className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
                    >
                        Save Budget
                    </button>
                </div>
            </div>

            {/* Budget List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
                </div>
            ) : budgets.length === 0 ? (
                <div className="text-center py-12 text-sm text-[var(--text-muted)]">No budgets set. Add one above!</div>
            ) : (
                <div className="space-y-2">
                    {budgets.map(b => {
                        const pct = b.budget_amount > 0 ? Math.round(((b.actual_amount || 0) / b.budget_amount) * 100) : 0;
                        const overBudget = (b.actual_amount || 0) > b.budget_amount;

                        return (
                            <div key={b.id} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-[var(--on-surface)]">{b.category}</p>
                                        {b.notes && <p className="text-[10px] text-[var(--text-muted)]">{b.notes}</p>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {formatCurrency(b.actual_amount || 0)} / {formatCurrency(b.budget_amount)}
                                            </p>
                                            <p className={`text-xs font-bold ${overBudget ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {pct}% used
                                            </p>
                                        </div>
                                        <button onClick={() => deleteBudget(b.id)} className="p-1.5 rounded-lg hover:bg-[var(--surface-variant)] text-rose-500">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-[var(--surface-variant)]">
                                    <div
                                        className={`h-2 rounded-full transition-all ${overBudget ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
