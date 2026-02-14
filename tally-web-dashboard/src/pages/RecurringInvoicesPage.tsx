import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
    RefreshCw, Plus, Calendar, Clock, Pause, Play, Trash2,
    ChevronDown, X, IndianRupee, Users, FileText, AlertCircle
} from 'lucide-react';

type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
type RecurringStatus = 'active' | 'paused' | 'completed';

interface RecurringInvoice {
    id: string;
    party_name: string;
    party_id: string;
    amount: number;
    frequency: Frequency;
    next_invoice_date: string;
    start_date: string;
    end_date?: string;
    status: RecurringStatus;
    items: any[];
    total_generated: number;
    last_generated?: string;
    notes?: string;
}

const FREQUENCY_OPTIONS: { value: Frequency; label: string; days: number }[] = [
    { value: 'weekly', label: 'Weekly', days: 7 },
    { value: 'monthly', label: 'Monthly', days: 30 },
    { value: 'quarterly', label: 'Quarterly', days: 90 },
    { value: 'yearly', label: 'Yearly', days: 365 },
];

import { useLanguage } from '../contexts/LanguageContext';

export default function RecurringInvoicesPage() {
    const { t, formatCurrency } = useLanguage();
    const [companyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
    const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [parties, setParties] = useState<any[]>([]);
    const [filter, setFilter] = useState<RecurringStatus | 'all'>('all');

    // Form state
    const [form, setForm] = useState({
        party_id: '',
        party_name: '',
        amount: 0,
        frequency: 'monthly' as Frequency,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        notes: '',
        items: [{ name: '', qty: 1, rate: 0, amount: 0 }],
    });

    const loadRecurring = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('recurring_invoices')
                .select('*')
                .eq('company_id', companyId)
                .order('next_invoice_date', { ascending: true });

            if (error) throw error;
            setInvoices(data || []);
        } catch (err: any) {
            // If table doesn't exist yet, use mock data
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    const loadParties = useCallback(async () => {
        if (!companyId) return;
        const { data } = await supabase
            .from('ledgers')
            .select('id, name, closing_balance')
            .eq('company_id', companyId)
            .in('parent_group', ['Sundry Debtors'])
            .order('name');
        setParties(data || []);
    }, [companyId]);

    useEffect(() => {
        loadRecurring();
        loadParties();
    }, [loadRecurring, loadParties]);

    const calculateNextDate = (startDate: string, frequency: Frequency): string => {
        const d = new Date(startDate);
        switch (frequency) {
            case 'weekly': d.setDate(d.getDate() + 7); break;
            case 'monthly': d.setMonth(d.getMonth() + 1); break;
            case 'quarterly': d.setMonth(d.getMonth() + 3); break;
            case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
        }
        return d.toISOString().split('T')[0];
    };

    const handleCreate = async () => {
        if (!form.party_name || !form.amount) {
            toast.error('Party and amount are required');
            return;
        }

        try {
            const newInvoice: any = {
                company_id: companyId,
                party_name: form.party_name,
                party_id: form.party_id,
                amount: form.amount,
                frequency: form.frequency,
                start_date: form.start_date,
                next_invoice_date: calculateNextDate(form.start_date, form.frequency),
                end_date: form.end_date || null,
                status: 'active',
                items: form.items.filter(i => i.name),
                total_generated: 0,
                notes: form.notes,
            };

            const { error } = await supabase
                .from('recurring_invoices')
                .insert(newInvoice);

            if (error) throw error;

            toast.success('Recurring invoice created!');
            setShowCreate(false);
            setForm({
                party_id: '', party_name: '', amount: 0,
                frequency: 'monthly', start_date: new Date().toISOString().split('T')[0],
                end_date: '', notes: '', items: [{ name: '', qty: 1, rate: 0, amount: 0 }],
            });
            loadRecurring();
        } catch (err: any) {
            toast.error(err.message || 'Failed to create');
        }
    };

    const toggleStatus = async (id: string, current: RecurringStatus) => {
        const newStatus = current === 'active' ? 'paused' : 'active';
        try {
            await supabase.from('recurring_invoices').update({ status: newStatus }).eq('id', id);
            toast.success(`Invoice ${newStatus === 'active' ? 'resumed' : 'paused'}`);
            loadRecurring();
        } catch { toast.error('Failed to update'); }
    };

    const deleteRecurring = async (id: string) => {
        if (!confirm('Delete this recurring invoice?')) return;
        try {
            await supabase.from('recurring_invoices').delete().eq('id', id);
            toast.success('Deleted');
            loadRecurring();
        } catch { toast.error('Failed to delete'); }
    };

    const updateItem = (idx: number, field: string, value: any) => {
        const items = [...form.items];
        (items[idx] as any)[field] = value;
        if (field === 'qty' || field === 'rate') {
            items[idx].amount = items[idx].qty * items[idx].rate;
        }
        const total = items.reduce((s, i) => s + i.amount, 0);
        setForm(f => ({ ...f, items, amount: total }));
    };

    const filteredInvoices = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

    const getDaysUntilNext = (dateStr: string): number => {
        const diff = new Date(dateStr).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };



    const recurringRevenue = invoices.filter(i => i.status === 'active')
        .reduce((sum, i) => {
            const multiplier = i.frequency === 'weekly' ? 4.33 : i.frequency === 'monthly' ? 1 : i.frequency === 'quarterly' ? 0.33 : 0.083;
            return sum + (i.amount * multiplier);
        }, 0);

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #1a1a2e)', margin: 0 }}>
                        ♻️ {t('recurring.title')}
                    </h1>
                    <p style={{ color: 'var(--text-secondary, #666)', margin: '4px 0 0' }}>
                        {t('nav.recurring')} - Automate invoice generation
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 20px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
                    }}
                >
                    <Plus size={18} /> {t('recurring.create')}
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Active Recurring', value: invoices.filter(i => i.status === 'active').length, icon: <RefreshCw size={20} />, color: '#10b981' },
                    { label: 'Monthly Revenue', value: formatCurrency(recurringRevenue), icon: <IndianRupee size={20} />, color: '#667eea' },
                    { label: 'Total Clients', value: new Set(invoices.map(i => i.party_name)).size, icon: <Users size={20} />, color: '#f59e0b' },
                    { label: 'Invoices Generated', value: invoices.reduce((s, i) => s + i.total_generated, 0), icon: <FileText size={20} />, color: '#ef4444' },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        style={{
                            padding: '20px', borderRadius: '16px',
                            background: 'var(--card-bg, #fff)',
                            border: '1px solid var(--border-color, #e5e7eb)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '12px', background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>
                                {stat.icon}
                            </div>
                            <div>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted, #999)', margin: 0 }}>{stat.label}</p>
                                <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary, #1a1a2e)', margin: 0 }}>{stat.value}</p>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {(['all', 'active', 'paused', 'completed'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: filter === f ? '#667eea' : 'var(--card-bg, #f3f4f6)',
                            color: filter === f ? '#fff' : 'var(--text-secondary, #666)',
                            fontWeight: 600, fontSize: '13px', textTransform: 'capitalize',
                        }}
                    >
                        {f} {f !== 'all' && `(${invoices.filter(i => i.status === (f as RecurringStatus)).length})`}
                    </button>
                ))}
            </div>

            {/* Invoice List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
                    <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Loading recurring invoices...</p>
                </div>
            ) : filteredInvoices.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                        textAlign: 'center', padding: '60px',
                        background: 'var(--card-bg, #fff)', borderRadius: '16px',
                        border: '1px solid var(--border-color, #e5e7eb)',
                    }}
                >
                    <RefreshCw size={48} style={{ color: '#ccc', marginBottom: '16px' }} />
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px' }}>No Recurring Invoices</h3>
                    <p style={{ color: '#999' }}>Create your first recurring invoice for retainer clients</p>
                    <button
                        onClick={() => setShowCreate(true)}
                        style={{
                            marginTop: '16px', padding: '10px 24px', borderRadius: '10px',
                            background: '#667eea', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
                        }}
                    >
                        <Plus size={16} style={{ marginRight: '6px' }} /> Create First Recurring Invoice
                    </button>
                </motion.div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <AnimatePresence>
                        {filteredInvoices.map((inv, i) => {
                            const daysUntil = getDaysUntilNext(inv.next_invoice_date);
                            const isUpcoming = daysUntil <= 3 && daysUntil >= 0;
                            return (
                                <motion.div
                                    key={inv.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ delay: i * 0.05 }}
                                    style={{
                                        padding: '20px', borderRadius: '16px',
                                        background: 'var(--card-bg, #fff)',
                                        border: `1px solid ${isUpcoming ? '#f59e0b40' : 'var(--border-color, #e5e7eb)'}`,
                                        boxShadow: isUpcoming ? '0 0 0 2px #f59e0b20' : '0 1px 3px rgba(0,0,0,0.06)',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #1a1a2e)' }}>
                                                    {inv.party_name}
                                                </h3>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                                    background: inv.status === 'active' ? '#10b98115' : inv.status === 'paused' ? '#f59e0b15' : '#6b728015',
                                                    color: inv.status === 'active' ? '#10b981' : inv.status === 'paused' ? '#f59e0b' : '#6b7280',
                                                }}>
                                                    {inv.status === 'active' ? '● Active' : inv.status === 'paused' ? '⏸ Paused' : '✓ Completed'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-muted, #999)' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <IndianRupee size={14} /> {formatCurrency(inv.amount)}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={14} /> {FREQUENCY_OPTIONS.find(f => f.value === inv.frequency)?.label}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Calendar size={14} /> Next: {new Date(inv.next_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={14} /> Generated: {inv.total_generated}
                                                </span>
                                            </div>
                                            {isUpcoming && inv.status === 'active' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>
                                                    <AlertCircle size={14} />
                                                    {daysUntil === 0 ? 'Invoice due today!' : `Invoice due in ${daysUntil} day(s)`}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => toggleStatus(inv.id, inv.status)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                                    background: inv.status === 'active' ? '#f59e0b15' : '#10b98115',
                                                    color: inv.status === 'active' ? '#f59e0b' : '#10b981',
                                                    fontSize: '13px', fontWeight: 600,
                                                }}
                                            >
                                                {inv.status === 'active' ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
                                            </button>
                                            <button
                                                onClick={() => deleteRecurring(inv.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', padding: '8px',
                                                    borderRadius: '10px', border: 'none', cursor: 'pointer',
                                                    background: '#ef444415', color: '#ef4444',
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Create Modal */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1000, padding: '20px',
                        }}
                        onClick={() => setShowCreate(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'var(--card-bg, #fff)', borderRadius: '20px',
                                padding: '28px', width: '100%', maxWidth: '600px',
                                maxHeight: '80vh', overflowY: 'auto',
                                boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    ♻️ Create Recurring Invoice
                                </h2>
                                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                    <X size={20} color="#999" />
                                </button>
                            </div>

                            {/* Party Select */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Party / Client *</label>
                                <select
                                    value={form.party_id}
                                    onChange={e => {
                                        const p = parties.find(p => p.id === e.target.value);
                                        setForm(f => ({ ...f, party_id: e.target.value, party_name: p?.name || '' }));
                                    }}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                                        border: '1px solid var(--border-color, #e5e7eb)',
                                        background: 'var(--input-bg, #f9fafb)', fontSize: '14px',
                                    }}
                                >
                                    <option value="">Select Party</option>
                                    {parties.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Frequency */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Frequency *</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {FREQUENCY_OPTIONS.map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setForm(prev => ({ ...prev, frequency: f.value }))}
                                            style={{
                                                padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                                background: form.frequency === f.value ? '#667eea' : 'var(--card-bg, #f3f4f6)',
                                                color: form.frequency === f.value ? '#fff' : 'var(--text-secondary)',
                                                fontWeight: 600, fontSize: '13px',
                                            }}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dates */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Start Date *</label>
                                    <input
                                        type="date"
                                        value={form.start_date}
                                        onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: '10px',
                                            border: '1px solid var(--border-color, #e5e7eb)',
                                            background: 'var(--input-bg, #f9fafb)', fontSize: '14px',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>End Date (Optional)</label>
                                    <input
                                        type="date"
                                        value={form.end_date}
                                        onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: '10px',
                                            border: '1px solid var(--border-color, #e5e7eb)',
                                            background: 'var(--input-bg, #f9fafb)', fontSize: '14px',
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Line Items */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Invoice Items</label>
                                {form.items.map((item, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <input placeholder="Item name" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', fontSize: '13px' }} />
                                        <input type="number" placeholder="Qty" value={item.qty || ''} onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', fontSize: '13px' }} />
                                        <input type="number" placeholder="Rate" value={item.rate || ''} onChange={e => updateItem(idx, 'rate', Number(e.target.value))}
                                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', fontSize: '13px' }} />
                                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {formatCurrency(item.amount)}
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1, rate: 0, amount: 0 }] }))}
                                    style={{ fontSize: '12px', color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    + Add Item
                                </button>
                            </div>

                            {/* Total */}
                            <div style={{
                                padding: '16px', borderRadius: '12px', background: '#667eea10',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px',
                            }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Total Amount</span>
                                <span style={{ fontSize: '22px', fontWeight: 700, color: '#667eea' }}>{formatCurrency(form.amount)}</span>
                            </div>

                            {/* Notes */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Notes</label>
                                <textarea
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="e.g. Monthly retainer for IT services"
                                    rows={2}
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                                        border: '1px solid var(--border-color, #e5e7eb)',
                                        background: 'var(--input-bg, #f9fafb)', fontSize: '14px', resize: 'vertical',
                                    }}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowCreate(false)}
                                    style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                                    Cancel
                                </button>
                                <button onClick={handleCreate}
                                    style={{
                                        padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                        background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontWeight: 600,
                                    }}>
                                    Create Recurring Invoice
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
