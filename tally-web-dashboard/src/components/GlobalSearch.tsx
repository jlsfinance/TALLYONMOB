import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, Package, X, ArrowRight, Command, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { format } from 'date-fns';

interface SearchResult {
    id: string;
    type: 'voucher' | 'ledger' | 'stock';
    title: string;
    subtitle: string;
    amount?: number;
    path: string;
    state?: any;
}

const SEARCH_HISTORY_KEY = 'globalSearchHistory';

function formatCurrency(val: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(val) || 0);
}

export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const [history, setHistory] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch { return []; }
    });

    useEffect(() => {
        if (open) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const search = useCallback(async (q: string) => {
        if (!q.trim() || !selectedCompany?.id) { setResults([]); return; }
        setLoading(true);
        try {
            const term = q.trim();
            const [vouchersRes, ledgersRes, stockRes] = await Promise.all([
                supabase.from('vouchers')
                    .select('id, voucher_type, voucher_number, party_name, grand_total, total_amount, voucher_date')
                    .eq('company_id', selectedCompany.id).eq('is_deleted', false)
                    .or(`party_name.ilike.%${term}%,voucher_number::text.ilike.%${term}%,voucher_type.ilike.%${term}%`)
                    .order('voucher_date', { ascending: false }).limit(5),
                supabase.from('ledgers')
                    .select('id, name, current_balance, parent')
                    .eq('company_id', selectedCompany.id)
                    .or(`name.ilike.%${term}%,parent.ilike.%${term}%`)
                    .limit(5),
                supabase.from('stock_items')
                    .select('id, name, current_stock, stock_group')
                    .eq('company_id', selectedCompany.id)
                    .or(`name.ilike.%${term}%,stock_group.ilike.%${term}%`)
                    .limit(5),
            ]);

            const results: SearchResult[] = [];

            (vouchersRes.data || []).forEach((v: any) => {
                results.push({
                    id: v.id,
                    type: 'voucher',
                    title: v.party_name || v.voucher_type,
                    subtitle: `${v.voucher_type} #${v.voucher_number || 'NA'} · ${format(new Date(v.voucher_date), 'dd MMM yy')}`,
                    amount: Number(v.grand_total) || Number(v.total_amount) || 0,
                    path: `/invoice/${v.id}`,
                    state: { voucher: v, from: '/search' },
                });
            });

            (ledgersRes.data || []).forEach((l: any) => {
                results.push({
                    id: l.id,
                    type: 'ledger',
                    title: l.name,
                    subtitle: l.parent || 'Ledger',
                    amount: Number(l.current_balance) || 0,
                    path: `/ledgers/${l.id}`,
                });
            });

            (stockRes.data || []).forEach((s: any) => {
                results.push({
                    id: s.id,
                    type: 'stock',
                    title: s.name,
                    subtitle: s.stock_group || 'Stock Item',
                    amount: Number(s.current_stock) || 0,
                    path: `/stock/${s.id}`,
                });
            });

            setResults(results);
            setSelectedIndex(0);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?.id]);

    useEffect(() => {
        const timer = setTimeout(() => search(query), 250);
        return () => clearTimeout(timer);
    }, [query, search]);

    const selectResult = (result: SearchResult) => {
        // Save to history
        const newHistory = [result.title, ...history.filter(h => h !== result.title)].slice(0, 5);
        setHistory(newHistory);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
        navigate(result.path, { state: result.state });
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && results[selectedIndex]) { selectResult(results[selectedIndex]); }
        else if (e.key === 'Escape') { onClose(); }
    };

    if (!open) return null;

    const typeIcon = (type: string) => {
        if (type === 'voucher') return <FileText size={14} className="text-emerald-500" />;
        if (type === 'ledger') return <Users size={14} className="text-blue-500" />;
        return <Package size={14} className="text-purple-500" />;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-[#1E1E2E] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                    <Search size={18} className="text-[var(--text-muted)] shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search vouchers, parties, stock..."
                        className="flex-1 bg-transparent text-sm font-medium text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                    {query && (
                        <button onClick={() => setQuery('')} className="p-1 rounded hover:bg-[var(--surface-variant)]">
                            <X size={14} className="text-[var(--text-muted)]" />
                        </button>
                    )}
                    <kbd className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-muted)] bg-[var(--surface-container)] rounded border border-[var(--border)]">
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div className="max-h-80 overflow-y-auto">
                    {loading && (
                        <div className="p-6 text-center">
                            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                    )}

                    {!loading && query && results.length === 0 && (
                        <div className="p-6 text-center">
                            <p className="text-sm text-[var(--text-muted)]">No results for "{query}"</p>
                        </div>
                    )}

                    {!loading && !query && history.length > 0 && (
                        <div>
                            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Recent</p>
                            {history.map((h, i) => (
                                <button key={i} onClick={() => { setQuery(h); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-container)] transition-all text-left">
                                    <Clock size={14} className="text-[var(--text-muted)]" />
                                    <span className="text-sm text-[var(--on-surface)]">{h}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {!loading && results.length > 0 && (
                        <div>
                            {['voucher', 'ledger', 'stock'].map(type => {
                                const typed = results.filter(r => r.type === type);
                                if (typed.length === 0) return null;
                                return (
                                    <div key={type}>
                                        <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                            {type === 'voucher' ? 'Vouchers' : type === 'ledger' ? 'Parties' : 'Stock Items'}
                                        </p>
                                        {typed.map(result => {
                                            const idx = results.indexOf(result);
                                            return (
                                                <button key={result.id}
                                                    onClick={() => selectResult(result)}
                                                    onMouseEnter={() => setSelectedIndex(idx)}
                                                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all text-left ${idx === selectedIndex ? 'bg-[var(--primary)]/5' : 'hover:bg-[var(--surface-container)]'}`}>
                                                    <div className="w-8 h-8 rounded-lg bg-[var(--surface-container)] flex items-center justify-center shrink-0">
                                                        {typeIcon(result.type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-[var(--on-surface)] truncate">{result.title}</p>
                                                        <p className="text-[10px] text-[var(--text-muted)] truncate">{result.subtitle}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        {result.amount !== undefined && result.type !== 'stock' && (
                                                            <p className="text-xs font-bold">{formatCurrency(result.amount)}</p>
                                                        )}
                                                        {result.type === 'stock' && (
                                                            <p className="text-xs font-bold">{result.amount} units</p>
                                                        )}
                                                        <ArrowRight size={12} className="text-[var(--text-muted)] ml-auto" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!loading && !query && results.length === 0 && history.length === 0 && (
                        <div className="p-8 text-center">
                            <Command size={24} className="text-[var(--text-muted)] mx-auto mb-2" />
                            <p className="text-sm text-[var(--text-muted)]">Type to search across all data</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Vouchers, Parties, Stock Items</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-4 text-[9px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-[var(--surface-container)] rounded text-[8px] font-bold">↑↓</kbd> Navigate</span>
                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-[var(--surface-container)] rounded text-[8px] font-bold">↵</kbd> Open</span>
                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-[var(--surface-container)] rounded text-[8px] font-bold">ESC</kbd> Close</span>
                </div>
            </div>
        </div>
    );
}
