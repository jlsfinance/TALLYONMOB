import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { useFY, getFYDates } from '../contexts/FYContext';
import { ArrowLeft, BarChart3, BookOpen, Boxes, CalendarDays, ChevronRight, FileText, Heart, ListChecks, Search, ShoppingCart, Star, TrendingUp, Users, Wallet } from 'lucide-react';
import './ReportsPage.css';

type Category = { id: string; name: string; icon: typeof Star; reports: { name: string; path?: string; note?: string }[] };
const categories: Category[] = [
  { id: 'accounting', name: 'Accounting Reports', icon: BookOpen, reports: [
    { name: 'Day Book', path: '/day-book' }, { name: 'Expenses', path: '/reports/view/expenses' }, { name: 'Inactive Customers', path: '/inactive-customers' }, { name: 'Inactive Items', path: '/reports/view/inactive-items' }, { name: 'Ledger Report', path: '/ledgers' },
  ] },
  { id: 'entries', name: 'My Entries', icon: FileText, reports: [
    { name: 'My Vouchers', path: '/vouchers' }, { name: 'My Quotation' }, { name: 'My Parties', path: '/ledgers' }, { name: 'My Stock Items', path: '/stock' }, { name: 'My eWay Bills', path: '/eway-bill' }, { name: 'My eInvoices' }, { name: 'Tracking Report', path: '/sync-history' },
  ] },
  { id: 'financial', name: 'Financial Reports', icon: TrendingUp, reports: [{ name: 'Balance Sheet', path: '/balance-sheet' }, { name: 'Profit & Loss', path: '/profit-loss' }, { name: 'Trial Balance', path: '/reports/view/trial-balance' }] },
  { id: 'top', name: 'Top Reports', icon: ListChecks, reports: [
    { name: 'Top Customer', path: '/reports/view/top-customer' }, { name: 'Top Suppliers', path: '/reports/view/top-supplier' },
    { name: 'Items Sold By Value', path: '/reports/view/items-sold-value' }, { name: 'Items Purchased By Value', path: '/reports/view/items-purchased-value' },
    { name: 'Items Sold By Qty', path: '/reports/view/items-sold-qty' }, { name: 'Items Purchased By Qty', path: '/reports/view/items-purchased-qty' },
  ] },
  { id: 'sales', name: 'Sales Overview', icon: ShoppingCart, reports: [
    { name: 'By Month', path: '/reports/view/sales-month' }, { name: 'By Bills', path: '/reports/view/sales-bills' }, { name: 'By Ledger', path: '/reports/view/sales-ledger' },
    { name: 'By Stock Item', path: '/reports/view/sales-item' }, { name: 'By Voucher Type', path: '/reports/view/sales-vtype' }, { name: 'By Ledger Group', path: '/reports/view/sales-lg' },
    { name: 'By Stock Group', path: '/reports/stock-summary/groups' }, { name: 'By Stock Category', path: '/reports/stock-summary/categories' },
  ] },
  { id: 'stock', name: 'Stock Reports', icon: Boxes, reports: [{ name: 'In Stock', path: '/reports/stock/in-stock' }, { name: 'Not In Stock', path: '/reports/stock/not-in-stock' }, { name: 'Negative Stock', path: '/reports/stock/negative-stock' }, { name: 'Stock Groups', path: '/reports/stock-summary/groups' }, { name: 'Stock Category', path: '/reports/stock-summary/categories' }] },
];
export default function ReportsPage() {
  const navigate = useNavigate();
  const { user, selectedCompany } = useAuth() as any;
  const { selectedFY } = useFY();
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
  const [category, setCategoryState] = useState(() => { try { return sessionStorage.getItem('reports-category') || 'accounting'; } catch { return 'accounting'; } });
  const setCategory = (value: string) => { setCategoryState(value); try { sessionStorage.setItem('reports-category', value); } catch { /* storage unavailable */ } };
  const warmReport = (path?: string) => {
    const match = path?.match(/^\/reports\/view\/([^/]+)$/);
    if (!match || !user?.id || !selectedCompany?.id) return;
    const { from, to } = getFYDates(selectedFY);
    void import('./ReportViewPage').then(module => module.prefetchReport(match[1], selectedCompany.id, user.id, from, to)).catch(() => {});
  };
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
    <HeaderPortal type="title"><div className="reports-detail-title"><button type="button" aria-label="Back to dashboard" onClick={() => navigate('/dashboard')}><ArrowLeft size={18}/></button><h1 className="reports-header-title">Reports</h1></div></HeaderPortal>
    <HeaderPortal type="actions"><div className="reports-header-actions"><button className="reports-analysis-button" onClick={() => setMessage('Analysis is not available until the underlying accounting data and period calculations are verified.')}><BarChart3 size={16}/><span>Analysis</span></button><button className="reports-header-search" aria-label="Search reports" aria-expanded={searchOpen} onClick={() => { setSearchOpen(v => !v); setQuery(''); }}><Search size={19}/></button></div></HeaderPortal>
    {searchOpen && <div className="reports-search"><Search size={17}/><input autoFocus aria-label="Search reports" placeholder="Search reports" value={query} onChange={e => setQuery(e.target.value)} /></div>}
    <div className="reports-home">
      <div className="reports-welcome"><div><span>YOUR BUSINESS, AT A GLANCE</span><h2>Reports</h2><p>Explore your business reports in one place</p></div><BarChart3 size={42}/></div>
      <nav className="reports-tabs" aria-label="Report categories"><button onClick={() => { setCategory('favourites'); setQuery(''); setMessage(''); }} className={category === 'favourites' ? 'selected' : ''} aria-pressed={category === 'favourites'}><Heart size={16}/> Favourites</button>{categories.map(c => <button key={c.id} className={category === c.id ? 'selected' : ''} aria-pressed={category === c.id} onClick={() => { setCategory(c.id); setQuery(''); setMessage(''); }}><c.icon size={16}/>{c.name}</button>)}</nav>
      <section className="reports-content" aria-label="Reports list"><div className="reports-section-label"><div><span>REPORT LIBRARY</span><h2>{query.trim() ? 'Search results' : category === 'favourites' ? 'Favourites' : active?.name}</h2></div><span className="reports-section-count">{results.length} reports</span></div>
      {message && <div className="reports-notice" role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}{favouritesQuery.isError && <div className="reports-notice" role="alert">Favourites could not be loaded. Check the connection and try again.<button onClick={() => favouritesQuery.refetch()}>Retry</button></div>}
      {results.length ? <div className="reports-card-grid">{results.map((r, index) => { const Icon = r.name === 'Day Book' ? CalendarDays : r.name === 'Expenses' ? Wallet : r.name.includes('Customer') || r.name.includes('Supplier') || r.name.includes('Parties') ? Users : r.name.includes('Ledger') ? BookOpen : r.name.includes('Item') || r.name.includes('Stock') ? Boxes : FileText; return <article className="reports-card" key={r.key}><button className="reports-card-star" aria-label={favourites.includes(r.key) ? 'Remove ' + r.name + ' from favourites' : 'Add ' + r.name + ' to favourites'} disabled={favouritesQuery.isError || favouritesQuery.isLoading} onClick={() => void toggleFavourite(r.key)}><Star size={19} fill={favourites.includes(r.key) ? 'currentColor' : 'none'}/></button><button className="reports-card-link" onMouseEnter={() => warmReport(r.path)} onFocus={() => warmReport(r.path)} onTouchStart={() => warmReport(r.path)} onClick={() => r.path ? navigate(r.path) : setMessage(r.name + ' is not available yet. Its source data and calculations need to be verified.')}><span className={`reports-card-icon tone-${index % 4}`}><Icon size={20}/></span><span className="reports-card-text"><strong>{r.name}</strong><small>{!r.path ? 'Not available yet' : query || category === 'favourites' ? r.category : 'View report'}</small></span><ChevronRight className="reports-card-arrow" size={18}/></button></article>; })}</div> : <div className="reports-empty">{category === 'favourites' && !query ? 'No favourites yet. Tap the star beside a report to save it.' : 'No matching reports.'}</div>}</section>
    </div>
  </div>;
}
