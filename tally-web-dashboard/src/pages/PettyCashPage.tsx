import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
    Receipt, Plus, Trash2, Search, Calendar, IndianRupee,
    Filter, Download, CheckCircle, Clock, AlertTriangle, X
} from 'lucide-react';

interface PettyCashEntry {
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string;
    paid_to: string;
    receipt_no?: string;
    created_at: string;
}

const CATEGORIES = ['Office Supplies', 'Transport', 'Meals', 'Utilities', 'Maintenance', 'Postage', 'Printing', 'Miscellaneous'];

export default function PettyCashPage() {
    const { selectedCompany } = useAuth() as any;
    const [entries, setEntries] = useState<PettyCashEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: '', category: 'Office Supplies', paid_to: '', receipt_no: '' });
    const [balance, setBalance] = useState(0);
    const [todayTotal, setTodayTotal] = useState(0);
    const [monthTotal, setMonthTotal] = useState(0);

    useEffect(() => { if (selectedCompany?.id) loadEntries(); }, [selectedCompany]);

    const loadEntries = async () => {
        setLoading(true);
        try {
            const { data } = await supabase.from('petty_cash_entries')
                .select('*').eq('company_id', selectedCompany.id)
                .order('date', { ascending: false }).limit(500);
            const rows = (data || []) as PettyCashEntry[];
            setEntries(rows);
            const total = rows.reduce((s, e) => s + (e.amount || 0), 0);
            setBalance(total);
            const today = format(new Date(), 'yyyy-MM-dd');
            setTodayTotal(rows.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0));
            const monthStart = format(new Date(), 'yyyy-MM-01');
            setMonthTotal(rows.filter(e => e.date >= monthStart).reduce((s, e) => s + e.amount, 0));
        } catch { }
        setLoading(false);
    };

    const addEntry = async () => {
        if (!form.description || !form.amount) { toast.error('Fill required fields'); return; }
        try {
            const { error } = await supabase.from('petty_cash_entries').insert({
                company_id: selectedCompany.id, date: form.date, description: form.description,
                amount: parseFloat(form.amount), category: form.category, paid_to: form.paid_to, receipt_no: form.receipt_no,
            });
            if (error) throw error;
            toast.success('Entry added!');
            setForm({ date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: '', category: 'Office Supplies', paid_to: '', receipt_no: '' });
            setShowForm(false);
            loadEntries();
        } catch (e: any) { toast.error(e.message); }
    };

    const deleteEntry = async (id: string) => {
        if (!confirm('Delete this entry?')) return;
        try {
            await supabase.from('petty_cash_entries').delete().eq('id', id);
            toast.success('Deleted');
            loadEntries();
        } catch { toast.error('Failed'); }
    };

    const filtered = entries.filter(e => {
        const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase()) || e.paid_to?.toLowerCase().includes(search.toLowerCase());
        const matchCat = filterCategory === 'all' || e.category === filterCategory;
        return matchSearch && matchCat;
    });

    const formatCurrency = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)]">Petty Cash</h1>
                    <p className="text-xs text-[var(--text-muted)]">Track small daily expenses</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold">
                    <Plus size={14} /> {showForm ? 'Cancel' : 'Add Entry'}
                </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Total Spent</p>
                    <p className="text-xl font-black text-[var(--on-surface)]">{formatCurrency(balance)}</p>
                </div>
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Today</p>
                    <p className="text-xl font-black text-blue-500">{formatCurrency(todayTotal)}</p>
                </div>
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">This Month</p>
                    <p className="text-xl font-black text-amber-500">{formatCurrency(monthTotal)}</p>
                </div>
            </div>

            {showForm && (
                <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                    <h3 className="text-sm font-bold">New Petty Cash Entry</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Date *</label>
                            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Amount *</label>
                            <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="₹0" className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Category</label>
                            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs">
                                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2 md:col-span-3">
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Description *</label>
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Paid To</label>
                            <input value={form.paid_to} onChange={e => setForm({ ...form, paid_to: e.target.value })} placeholder="Vendor/Person" className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Receipt #</label>
                            <input value={form.receipt_no} onChange={e => setForm({ ...form, receipt_no: e.target.value })} placeholder="Optional" className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                        </div>
                    </div>
                    <button onClick={addEntry} className="px-6 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold">Save Entry</button>
                </div>
            )}

            <div className="flex gap-3">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                </div>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold">
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <table className="w-full text-xs">
                    <thead><tr className="bg-[var(--surface-variant)]">
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Date</th>
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Description</th>
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Category</th>
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Paid To</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">Amount</th>
                        <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-[var(--text-muted)]">Action</th>
                    </tr></thead>
                    <tbody>
                        {filtered.map(e => (
                            <tr key={e.id} className="border-t border-[var(--border)]/30 hover:bg-[var(--surface-variant)]/50">
                                <td className="px-4 py-3">{e.date}</td>
                                <td className="px-4 py-3 font-bold truncate max-w-[200px]">{e.description}</td>
                                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-lg bg-[var(--surface-variant)] text-[9px] font-bold">{e.category}</span></td>
                                <td className="px-4 py-3 text-[var(--text-muted)]">{e.paid_to || '-'}</td>
                                <td className="px-4 py-3 text-right font-black text-red-500">{formatCurrency(e.amount)}</td>
                                <td className="px-4 py-3 text-center">
                                    <button onClick={() => deleteEntry(e.id)} className="text-red-400 hover:text-red-500"><Trash2 size={12} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && !loading && (
                    <div className="py-12 text-center text-[var(--text-muted)] text-xs">No entries found</div>
                )}
            </div>
        </div>
    );
}
