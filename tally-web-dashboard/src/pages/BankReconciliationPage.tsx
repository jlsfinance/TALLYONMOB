import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import {
    Building2, Search, Filter, CheckCircle2, XCircle, Clock, RefreshCw,
    ArrowUpRight, ArrowDownRight, IndianRupee, Calendar, FileText, AlertCircle,
    Upload, Download, Link2, Unlink
} from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';

const formatCurrency = (amount: number) => {
    const absAmount = Math.abs(amount || 0);
    if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)} Cr`;
    if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
};

export default function BankReconciliationPage() {
    const { selectedCompany } = useAuth() as any;
    const [loading, setLoading] = useState(true);
    const [bankLedgers, setBankLedgers] = useState<any[]>([]);
    const [selectedBank, setSelectedBank] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'receipt' | 'payment'>('all');
    const [dateRange, setDateRange] = useState({
        from: format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd')
    });
    const [stats, setStats] = useState({ totalReceipts: 0, totalPayments: 0, balance: 0, count: 0 });
    const [csvData, setCsvData] = useState<any[]>([]);
    const [csvMatched, setCsvMatched] = useState<{ matched: number; unmatched: number }>({ matched: 0, unmatched: 0 });
    const [importing, setImporting] = useState(false);
    const [showImport, setShowImport] = useState(false);

    useEffect(() => {
        if (selectedCompany?.id) loadBankLedgers();
    }, [selectedCompany]);

    useEffect(() => {
        if (selectedBank) loadTransactions();
    }, [selectedBank, dateRange, filterType]);

    const loadBankLedgers = async () => {
        setLoading(true);
        try {
            const { data: ledgers } = await supabase
                .from('ledgers')
                .select('id, name, parent, current_balance, opening_balance')
                .eq('company_id', selectedCompany.id)
                .in('parent', ['Bank Accounts', 'Bank OD A/c', 'Bank OCC A/c'])
                .order('name');

            setBankLedgers(ledgers || []);
            if (ledgers && ledgers.length > 0 && !selectedBank) {
                setSelectedBank(ledgers[0]);
            }
        } catch (error) {
            console.error('Error loading bank ledgers:', error);
        }
        setLoading(false);
    };

    const loadTransactions = async () => {
        if (!selectedBank) return;
        setLoading(true);
        try {
            // Get Receipt vouchers for this bank
            let query = supabase
                .from('vouchers')
                .select('id, voucher_type, voucher_number, voucher_date, party_name, total_amount, grand_total, narration')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .gte('voucher_date', dateRange.from)
                .lte('voucher_date', dateRange.to)
                .in('voucher_type', ['Receipt', 'Payment', 'Contra', 'Journal'])
                .order('voucher_date', { ascending: false })
                .limit(5000);

            const { data: vouchers } = await query;

            // Also try to get ledger entries to find entries involving this bank
            const { data: ledgerEntries } = await supabase
                .from('voucher_ledger_entries')
                .select('voucher_id, ledger_name, amount, is_debit')
                .eq('company_id', selectedCompany.id)
                .eq('ledger_name', selectedBank.name)
                .limit(5000);

            // Match vouchers with ledger entries for this bank
            const entryMap = new Map<string, any>();
            (ledgerEntries || []).forEach(e => {
                entryMap.set(e.voucher_id, e);
            });

            // Filter vouchers that have entries for this bank
            let bankTxns = (vouchers || []).map(v => {
                const entry = entryMap.get(v.id);
                const amount = Number(v.grand_total) || Number(v.total_amount) || 0;
                return {
                    ...v,
                    bankAmount: entry ? Math.abs(Number(entry.amount)) : Math.abs(amount),
                    isDebit: entry ? entry.is_debit : v.voucher_type === 'Receipt',
                    txnType: v.voucher_type === 'Receipt' ? 'credit' : 'debit'
                };
            });

            // If no ledger entries found, use all receipts/payments as bank transactions
            if (ledgerEntries?.length === 0) {
                bankTxns = (vouchers || []).map(v => ({
                    ...v,
                    bankAmount: Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0),
                    isDebit: v.voucher_type === 'Payment',
                    txnType: v.voucher_type === 'Receipt' ? 'credit' : 'debit'
                }));
            }

            // Apply type filter
            if (filterType === 'receipt') {
                bankTxns = bankTxns.filter(t => t.voucher_type === 'Receipt');
            } else if (filterType === 'payment') {
                bankTxns = bankTxns.filter(t => t.voucher_type === 'Payment');
            }

            setTransactions(bankTxns);

            // Calculate stats
            const totalReceipts = bankTxns.filter(t => t.voucher_type === 'Receipt').reduce((s, t) => s + t.bankAmount, 0);
            const totalPayments = bankTxns.filter(t => t.voucher_type === 'Payment').reduce((s, t) => s + t.bankAmount, 0);

            setStats({
                totalReceipts,
                totalPayments,
                balance: Number(selectedBank.current_balance) || 0,
                count: bankTxns.length
            });
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
        setLoading(false);
    };

    const parseBankFile = (file: File) => {
        setImporting(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            let parsed: any[] = [];

            if (ext === 'ofx' || ext === 'qfx') {
                // Parse OFX/QFX format
                const txns = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g) || [];
                parsed = txns.map(txn => {
                    const get = (tag: string) => {
                        const m = txn.match(new RegExp(`<${tag}>([^<]*)`));
                        return m ? m[1].trim() : '';
                    };
                    const date = get('DTPOSTED').replace(/[^0-9]/g, '').slice(0, 8);
                    const amount = parseFloat(get('TRNAMT')) || 0;
                    return {
                        date: date ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : '',
                        description: get('NAME') || get('MEMO') || '',
                        reference: get('FITID') || '',
                        debit: amount < 0 ? Math.abs(amount) : 0,
                        credit: amount > 0 ? amount : 0,
                        raw: {}
                    };
                });
            } else if (ext === 'qif') {
                // Parse QIF format
                const lines = text.split('\n');
                let current: any = {};
                parsed = [];
                for (const line of lines) {
                    const l = line.trim();
                    if (l === '^') {
                        if (current.date) parsed.push(current);
                        current = {};
                    } else if (l.startsWith('D')) current.date = l.slice(1);
                    else if (l.startsWith('T') || l.startsWith('U')) current.amount = parseFloat(l.slice(1)) || 0;
                    else if (l.startsWith('P')) current.description = l.slice(1);
                    else if (l.startsWith('N')) current.reference = l.slice(1);
                    else if (l.startsWith('M')) current.memo = l.slice(1);
                }
                if (current.date) parsed.push(current);
                parsed = parsed.map(r => {
                    const dateStr = r.date?.replace(/[^0-9/]/g, '') || '';
                    const parts = dateStr.split('/');
                    const date = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` : dateStr;
                    const amount = r.amount || 0;
                    return {
                        date,
                        description: r.description || r.memo || '',
                        reference: r.reference || '',
                        debit: amount < 0 ? Math.abs(amount) : 0,
                        credit: amount > 0 ? amount : 0,
                        raw: r
                    };
                });
            } else {
                // Parse CSV format
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) { setImporting(false); return; }
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
                parsed = lines.slice(1).map(line => {
                    const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
                    const row: any = {};
                    headers.forEach((h, i) => { row[h] = values[i] || ''; });
                    return row;
                }).filter(r => {
                    const dateVal = r.date || r.transaction_date || r.txn_date || r.value_date || '';
                    return dateVal && (r.debit || r.credit || r.amount || r.deposit || r.withdrawal);
                }).map(r => {
                    const dateStr = r.date || r.transaction_date || r.txn_date || r.value_date || '';
                    const debit = parseFloat((r.debit || r.withdrawal || '0').replace(/[,₹]/g, '')) || 0;
                    const credit = parseFloat((r.credit || r.deposit || '0').replace(/[,₹]/g, '')) || 0;
                    const amount = parseFloat((r.amount || '0').replace(/[,₹]/g, '')) || 0;
                    return {
                        date: dateStr,
                        description: r.description || r.narration || r.remarks || r.particulars || r.memo || '',
                        reference: r.reference || r.cheque || r.utr || r.ref_no || '',
                        debit: debit || (amount < 0 ? Math.abs(amount) : 0),
                        credit: credit || (amount > 0 ? amount : 0),
                        raw: r
                    };
                });
            }
            setCsvData(parsed);

            // Match with existing transactions
            let matched = 0;
            const matchedIds = new Set<number>();
            parsed.forEach(csvRow => {
                const csvDate = csvRow.date;
                const csvAmount = csvRow.credit || csvRow.debit;
                const found = transactions.findIndex((t, idx) => {
                    if (matchedIds.has(idx)) return false;
                    const tDate = t.voucher_date?.slice(0, 10) || '';
                    const tAmount = Math.abs(Number(t.grand_total) || Number(t.total_amount) || 0);
                    return tDate === csvDate && Math.abs(tAmount - csvAmount) < 1;
                });
                if (found >= 0) { matched++; matchedIds.add(found); }
            });
            setCsvMatched({ matched, unmatched: parsed.length - matched });
            setImporting(false);
            toast.success(`Imported ${parsed.length} bank transactions`);
        };
        reader.readAsText(file);
    };

    const filteredTxns = useMemo(() => {
        if (!searchTerm) return transactions;
        return transactions.filter(t =>
            t.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.narration?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [transactions, searchTerm]);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-[var(--on-surface)] tracking-tighter">Bank Reconciliation</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{selectedCompany.name} ? Bank-wise transaction analysis</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 bg-[var(--surface-variant)] rounded-xl border border-[var(--border)] px-3 py-2">
                        <Calendar size={14} className="text-[var(--text-muted)]" />
                        <input
                            type="date"
                            value={dateRange.from}
                            onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            className="bg-transparent text-xs text-[var(--on-surface)] outline-none w-28"
                        />
                        <span className="text-[var(--text-muted)] text-xs">to</span>
                        <input
                            type="date"
                            value={dateRange.to}
                            onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            className="bg-transparent text-xs text-[var(--on-surface)] outline-none w-28"
                        />
                    </div>
                </div>
            </div>

            {/* Bank Selector */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {bankLedgers.map(bank => (
                    <button
                        key={bank.id}
                        onClick={() => setSelectedBank(bank)}
                        className={`flex-shrink-0 px-5 py-4 rounded-2xl border transition-all ${selectedBank?.id === bank.id
                                ? 'bg-gradient-to-br from-blue-600 to-blue-800 text-white border-blue-500 shadow-xl'
                                : 'bg-[var(--surface-variant)] text-[var(--on-surface)] border-[var(--border)] hover:border-[var(--primary)]'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <Building2 size={18} />
                            <div className="text-left">
                                <p className="text-xs font-bold truncate max-w-[200px]">{bank.name}</p>
                                <p className={`text-lg font-black mt-0.5 ${selectedBank?.id === bank.id ? 'text-white' : (Number(bank.current_balance) >= 0 ? 'text-emerald-500' : 'text-red-500')
                                    }`}>
                                    {formatCurrency(bank.current_balance)}
                                </p>
                            </div>
                        </div>
                    </button>
                ))}
                {bankLedgers.length === 0 && !loading && (
                    <div className="w-full flex flex-col items-center justify-center py-12 text-center">
                        <Building2 size={40} className="text-[var(--text-muted)] mb-3" />
                        <p className="text-sm font-bold text-[var(--text-muted)]">No bank accounts found</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Sync your Tally data to see bank accounts here</p>
                    </div>
                )}
            </div>

            {selectedBank && (
                <>
                    {/* CSV Import Section */}
                    <div className="bg-[var(--surface-variant)] rounded-2xl border border-[var(--border)] p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Upload size={16} className="text-blue-500" />
                                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--on-surface)]">Bank Statement Import</h3>
                            </div>
                            <button onClick={() => setShowImport(!showImport)} className="text-xs font-bold text-[var(--primary)]">
                                {showImport ? 'Hide' : 'Import CSV'}
                            </button>
                        </div>
                        {showImport && (
                            <div className="space-y-3">
                                <p className="text-[10px] text-[var(--text-muted)]">Upload a CSV, OFX, or QIF file. Auto-matches with existing vouchers by date and amount.</p>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-700 transition-all">
                                        <Upload size={14} />
                                        {importing ? 'Importing...' : 'Choose CSV File'}
                                        <input type="file" accept=".csv,.ofx,.qfx,.qif" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) parseBankFile(file);
                                            e.target.value = '';
                                        }} />
                                    </label>
                                    {csvData.length > 0 && (
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="flex items-center gap-1 text-emerald-500 font-bold">
                                                <CheckCircle2 size={14} /> {csvMatched.matched} matched
                                            </span>
                                            {csvMatched.unmatched > 0 && (
                                                <span className="flex items-center gap-1 text-amber-500 font-bold">
                                                    <Link2 size={14} /> {csvMatched.unmatched} unmatched
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {csvData.length > 0 && (
                                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                        <table className="w-full text-xs">
                                            <thead><tr className="bg-[var(--surface)]">
                                                <th className="px-3 py-2 text-left text-[9px] font-black text-[var(--text-muted)] uppercase">Date</th>
                                                <th className="px-3 py-2 text-left text-[9px] font-black text-[var(--text-muted)] uppercase">Description</th>
                                                <th className="px-3 py-2 text-right text-[9px] font-black text-[var(--text-muted)] uppercase">Debit</th>
                                                <th className="px-3 py-2 text-right text-[9px] font-black text-[var(--text-muted)] uppercase">Credit</th>
                                                <th className="px-3 py-2 text-center text-[9px] font-black text-[var(--text-muted)] uppercase">Status</th>
                                            </tr></thead>
                                            <tbody>
                                                {csvData.slice(0, 20).map((row, idx) => {
                                                    const matched = transactions.some(t => {
                                                        const tDate = t.voucher_date?.slice(0, 10) || '';
                                                        const tAmount = Math.abs(Number(t.grand_total) || Number(t.total_amount) || 0);
                                                        const csvAmount = row.credit || row.debit;
                                                        return tDate === row.date && Math.abs(tAmount - csvAmount) < 1;
                                                    });
                                                    return (
                                                        <tr key={idx} className="border-b border-[var(--border)]/30">
                                                            <td className="px-3 py-2">{row.date}</td>
                                                            <td className="px-3 py-2 truncate max-w-[200px]">{row.description}</td>
                                                            <td className="px-3 py-2 text-right text-red-500 font-bold">{row.debit ? formatCurrency(row.debit) : '-'}</td>
                                                            <td className="px-3 py-2 text-right text-emerald-500 font-bold">{row.credit ? formatCurrency(row.credit) : '-'}</td>
                                                            <td className="px-3 py-2 text-center">
                                                                {matched ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto" /> : <Unlink size={14} className="text-amber-500 mx-auto" />}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <ArrowDownRight size={16} className="text-emerald-500" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Receipts</span>
                            </div>
                            <p className="text-xl font-black text-emerald-500">{formatCurrency(stats.totalReceipts)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <ArrowUpRight size={16} className="text-red-500" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Payments</span>
                            </div>
                            <p className="text-xl font-black text-red-500">{formatCurrency(stats.totalPayments)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <IndianRupee size={16} className="text-blue-500" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Balance</span>
                            </div>
                            <p className={`text-xl font-black ${stats.balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(stats.balance)}</p>
                        </div>
                        <div className="bg-[var(--surface-variant)] rounded-2xl p-5 border border-[var(--border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <FileText size={16} className="text-[var(--primary)]" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Entries</span>
                            </div>
                            <p className="text-xl font-black text-[var(--on-surface)]">{stats.count}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1 relative">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                placeholder="Search by party, voucher number, narration..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {(['all', 'receipt', 'payment'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilterType(f)}
                                    className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${filterType === f
                                            ? f === 'receipt' ? 'bg-emerald-600 text-white' : f === 'payment' ? 'bg-red-600 text-white' : 'bg-[var(--primary)] text-white'
                                            : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                        }`}
                                >
                                    {f === 'all' ? 'All' : f === 'receipt' ? 'Receipts' : 'Payments'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Transactions Table */}
                    <GlassCard className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-[var(--surface-variant)]">
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Date</th>
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Type</th>
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Vch #</th>
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Party</th>
                                        <th className="text-left px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest hidden md:table-cell">Narration</th>
                                        <th className="text-right px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Debit</th>
                                        <th className="text-right px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Credit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTxns.map((t, idx) => {
                                        const isReceipt = t.voucher_type === 'Receipt';
                                        return (
                                            <motion.tr
                                                key={idx}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: idx * 0.02 }}
                                                className="border-b border-[var(--border)]/30 hover:bg-[var(--surface-variant)]/50 transition-colors"
                                            >
                                                <td className="px-5 py-3 text-xs text-[var(--on-surface)]">
                                                    {t.voucher_date ? format(new Date(t.voucher_date), 'dd MMM yy') : '-'}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${isReceipt ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                                        }`}>
                                                        {isReceipt ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
                                                        {t.voucher_type}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{t.voucher_number || '-'}</td>
                                                <td className="px-5 py-3 text-xs text-[var(--on-surface)] font-semibold truncate max-w-[200px]">{t.party_name || '-'}</td>
                                                <td className="px-5 py-3 text-xs text-[var(--text-muted)] truncate max-w-[200px] hidden md:table-cell">{t.narration || '-'}</td>
                                                <td className="px-5 py-3 text-xs text-right font-black text-red-500">
                                                    {!isReceipt ? formatCurrency(t.bankAmount) : ''}
                                                </td>
                                                <td className="px-5 py-3 text-xs text-right font-black text-emerald-500">
                                                    {isReceipt ? formatCurrency(t.bankAmount) : ''}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {filteredTxns.length === 0 && !loading && (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <AlertCircle size={40} className="text-[var(--text-muted)] mb-3" />
                                    <p className="text-sm font-bold text-[var(--text-muted)]">No transactions found</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Try adjusting your date range or filters</p>
                                </div>
                            )}
                            {loading && (
                                <div className="flex items-center justify-center py-16">
                                    <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </>
            )}
        </div>
    );
}
