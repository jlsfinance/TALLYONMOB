import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import './ReportsPage.css';

const types: Record<string, string> = { 'in-stock': 'In Stock', 'not-in-stock': 'Not In Stock', 'negative-stock': 'Negative Stock' };
const pageSize = 50;
export default function StockSnapshotReport() {
  const { kind = '' } = useParams();
  const title = types[kind];
  const { selectedCompany, user } = useAuth() as any;
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['stock-snapshot-report', user?.id, selectedCompany?.id, kind, search, page],
    enabled: !!user?.id && !!selectedCompany?.id && !!title, staleTime: 300000, cacheTime: 1800000, refetchOnWindowFocus: false,
    queryFn: async () => {
      let request = supabase.from('stock_items').select('id,name,stock_group,unit,base_unit,opening_stock,inward_quantity,outward_quantity,current_stock,closing_value', { count: 'exact' }).eq('company_id', selectedCompany.id).eq('is_deleted', false);
      if (kind === 'in-stock') request = request.gt('current_stock', 0);
      else if (kind === 'not-in-stock') request = request.eq('current_stock', 0);
      else request = request.lt('current_stock', 0);
      if (search.trim()) request = request.ilike('name', `%${search.trim().replace(/[%_\\]/g, '\\$&')}%`);
      const { data, error, count } = await request.order('name').order('id').range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      return { rows: data || [], count: count ?? null };
    },
  });
  if (!title) return <div className="reports-empty">Report not found.</div>;
  const display = (value: unknown) => value == null ? 'Not synced' : String(value);
  return <div className="reports-hub stock-report"><HeaderPortal type="title"><div className="reports-detail-title"><button aria-label="Back to reports" onClick={() => navigate('/reports')}><ArrowLeft size={18}/></button><h1>{title}</h1></div></HeaderPortal><HeaderPortal type="actions"><button className="reports-header-search" aria-label="Refresh report" onClick={() => query.refetch()}><RefreshCw size={18}/></button></HeaderPortal>
    <div className="stock-report-body"><p className="stock-report-company">{selectedCompany?.name || 'Select a company'}</p><p className="stock-report-note">Current synced stock snapshot. Historical stock and completeness have not been verified against Tally.{selectedCompany?.last_sync_at ? ` Last sync: ${new Date(selectedCompany.last_sync_at).toLocaleString()}.` : ' Last successful sync time is unavailable.'}</p>
    <label className="reports-search"><Search size={17}/><input placeholder="Search stock items" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}/></label>
    {query.isLoading ? <p className="reports-empty">Loading stock...</p> : query.isError ? <div className="reports-empty">Unable to load stock. <button onClick={() => query.refetch()}>Retry</button></div> : <><p className="stock-report-count">{query.data?.count == null ? 'Results' : `${query.data.count} items`} {query.isFetching ? ' · Updating…' : ''}</p><div className="reports-list">{query.data?.rows.map((item: any) => <button key={item.id} className="stock-report-item" onClick={() => navigate('/stock/' + encodeURIComponent(item.id))}><span><strong>{item.name}</strong><small>{item.stock_group || 'Group not synced'}</small><small>Opening {display(item.opening_stock)} · In {display(item.inward_quantity)} · Out {display(item.outward_quantity)}</small></span><span className="stock-report-amount"><strong>{display(item.current_stock)} {item.unit || item.base_unit || ''}</strong><small>Value: {item.closing_value == null ? 'Not synced' : `₹${Number(item.closing_value).toLocaleString('en-IN')}`}</small></span></button>)}{!query.data?.rows.length && <p className="reports-empty">No matching synced items.</p>}</div><div className="stock-report-pages"><button disabled={page === 0} onClick={() => setPage(p => Math.max(0,p - 1))}>Previous</button><span>Page {page + 1}</span><button disabled={(query.data?.rows.length || 0) < pageSize || (query.data?.count != null && (page + 1) * pageSize >= query.data.count)} onClick={() => setPage(p => p + 1)}>Next</button></div></>}
    </div></div>;
}
