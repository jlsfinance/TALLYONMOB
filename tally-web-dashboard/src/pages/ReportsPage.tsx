import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { BarChart3, BookOpen, Boxes, ChevronRight, FileText, Heart, ListChecks, Search, ShoppingCart, Star, TrendingUp } from 'lucide-react';
import './ReportsPage.css';

type Category = { id: string; name: string; icon: typeof Star; reports: { name: string; path?: string; note?: string }[] };
const categories: Category[] = [
  { id: 'accounting', name: 'Accounting Reports', icon: BookOpen, reports: [
    { name: 'Day Book', path: '/day-book' }, { name: 'Expenses' }, { name: 'Inactive Customers' }, { name: 'Inactive Items' }, { name: 'Ledger Report', path: '/ledgers' },
  ] },
  { id: 'entries', name: 'My Entries', icon: FileText, reports: ['My Vouchers', 'My Quotation', 'My Parties', 'My Stock Items', 'My eWay Bills', 'My eInvoices', 'Tracking Report'].map(name => ({ name })) },
  { id: 'financial', name: 'Financial Reports', icon: TrendingUp, reports: [{ name: 'Balance Sheet' }, { name: 'Profit & Loss' }, { name: 'Trial Balance' }] },
  { id: 'top', name: 'Top Reports', icon: ListChecks, reports: ['Top Customer', 'Top Suppliers', 'Items Sold By Value', 'Items Purchased By Value', 'Items Sold By Qty', 'Items Purchased By Qty'].map(name => ({ name })) },
  { id: 'sales', name: 'Sales Overview', icon: ShoppingCart, reports: ['By Month', 'By Bills', 'By Ledger', 'By Stock Item', 'By Voucher Type', 'By Ledger Group', 'By Stock Group', 'By Stock Category'].map(name => ({ name })) },
  { id: 'stock', name: 'Stock Reports', icon: Boxes, reports: [{ name: 'In Stock', path: '/reports/stock/in-stock' }, { name: 'Not In Stock', path: '/reports/stock/not-in-stock' }, { name: 'Negative Stock', path: '/reports/stock/negative-stock' }, { name: 'Stock Groups', path: '/reports/stock-summary/groups' }, { name: 'Stock Category', path: '/reports/stock-summary/categories' }] },
];
export default function ReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const queryClient = useQueryClient();
  const favouritesQuery = useQuery({
    queryKey: ['report-favourites', user?.id], enabled: !!user?.id, staleTime: 300000, refetchOnWindowFocus: false,
    queryFn: async () => { const { data, error } = await supabase.from('report_favourites').select('report_key').eq('user_id', user.id); if (error) throw error; return (data || []).map((r: any) => r.report_key as string); },
  });
  const favourites = favouritesQuery.data || [];
  const toggleFavourite = async (key: string) => {
    if (!user?.id) return;
    const result = favourites.includes(key)
      ? await supabase.from('report_favourites').delete().eq('user_id', user.id).eq('report_key', key)
      : await supabase.from('report_favourites').insert({ user_id: user.id, report_key: key });
    if (result.error) { setMessage('Could not save favourite. Please try again.'); return; }
    await queryClient.invalidateQueries({ queryKey: ['report-favourites', user.id] });
  };
  const [category, setCategory] = useState('accounting');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [message, setMessage] = useState('');
  const active = categories.find(c => c.id === category);
  const results = useMemo(() => {
    const all = categories.flatMap(c => c.reports.map(r => ({ ...r, category: c.name, key: c.id + ':' + r.name })));
    if (query.trim()) return all.filter(r => r.name.toLowerCase().includes(query.trim().toLowerCase()));
    if (category === 'favourites') return all.filter(r => favourites.includes(r.key));
    return all.filter(r => r.category === active?.name);
  }, [active, category, query, favourites]);
  return <div className="reports-hub">
    <header className="reports-heading"><h1>Reports</h1><div><button onClick={() => setMessage('Analysis is not available until the underlying accounting data and period calculations are verified.')}><BarChart3 size={17}/> Analysis</button><button className="reports-search-toggle" aria-label="Search reports" onClick={() => { setSearchOpen(v => !v); setQuery(''); }}><Search size={20}/></button></div></header>
    {searchOpen && <div className="reports-search"><Search size={17}/><input autoFocus aria-label="Search reports" placeholder="Search reports" value={query} onChange={e => setQuery(e.target.value)} /></div>}
    <div className="reports-layout"><aside className="reports-categories" aria-label="Report categories"><button onClick={() => { setCategory('favourites'); setQuery(''); }} className={category === 'favourites' ? 'selected' : ''}><span><Heart size={21}/></span>Favourites</button>{categories.map(c => <button key={c.id} className={category === c.id ? 'selected' : ''} onClick={() => { setCategory(c.id); setQuery(''); setMessage(''); }}><span><c.icon size={21}/></span>{c.name}</button>)}</aside>
      <section className="reports-content" aria-label="Reports list">{message && <div className="reports-notice" role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}{favouritesQuery.isError && <div className="reports-notice" role="alert">Favourites could not be loaded. Check the connection and try again.<button onClick={() => favouritesQuery.refetch()}>Retry</button></div>}{results.length ? <div className="reports-list">{results.map(r => <div className="reports-row" key={r.key}><button className="reports-star" aria-label={favourites.includes(r.key) ? 'Remove ' + r.name + ' from favourites' : 'Add ' + r.name + ' to favourites'} disabled={favouritesQuery.isError || favouritesQuery.isLoading} onClick={() => void toggleFavourite(r.key)}><Star size={17} fill={favourites.includes(r.key) ? 'currentColor' : 'none'}/></button><button className="reports-row-main" onClick={() => r.path ? navigate(r.path) : setMessage(r.name + ' is not available yet. Its source data and calculations need to be verified.')}><span>{r.name}{query && <small>{r.category}</small>}</span>{!r.path && <small className="reports-soon">Not available</small>}<ChevronRight size={18}/></button></div>)}</div> : <div className="reports-empty">{category === 'favourites' && !query ? 'No favourites yet. Tap the star beside a report to save it.' : 'No matching reports.'}</div>}</section></div>
  </div>;
}
