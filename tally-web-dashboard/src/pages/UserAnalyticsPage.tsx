import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { motion } from 'framer-motion';
import {
  Users, Eye, Clock, MousePointerClick, TrendingUp, Calendar,
  Smartphone, Monitor, Globe, ArrowLeft, Download, RefreshCw
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts';
import toast from 'react-hot-toast';

interface ActivityLog {
  id: string;
  user_id: string;
  event_type: string;
  event_category: string;
  page: string;
  element: string;
  metadata: any;
  device_info: any;
  duration_ms: number;
  created_at: string;
}

const EVENT_COLORS: Record<string, string> = {
  page_view: '#6366f1',
  click: '#f59e0b',
  search: '#10b981',
  create: '#3b82f6',
  update: '#8b5cf6',
  delete: '#ef4444',
  export: '#06b6d4',
  error: '#ef4444',
  time_spent: '#64748b',
  feature_use: '#ec4899',
};

const TIME_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
];

export default function UserAnalyticsPage() {
  const { selectedCompany } = useAuth() as any;
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [refreshing, setRefreshing] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (timeRange) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case '7d': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case '30d': return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case '90d': return { start: startOfDay(subDays(now, 90)), end: endOfDay(now) };
      default: return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    }
  }, [timeRange]);

  const loadLogs = async () => {
    if (!selectedCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_activity_logs')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false })
        .range(0, 49999);

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, [selectedCompany?.id, timeRange]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
    toast.success('Refreshed!');
  };

  // ── Computed Stats ──
  const stats = useMemo(() => {
    const uniqueUsers = new Set(logs.map(l => l.user_id)).size;
    const totalEvents = logs.length;
    const pageViews = logs.filter(l => l.event_type === 'page_view').length;
    const clicks = logs.filter(l => l.event_type === 'click').length;
    const avgDuration = logs
      .filter(l => l.duration_ms && l.duration_ms > 0)
      .reduce((s, l, _, a) => s + l.duration_ms / a.length, 0);
    const uniqueSessions = new Set(logs.map(l => l.session_id).filter(Boolean)).size;
    return { uniqueUsers, totalEvents, pageViews, clicks, avgDuration, uniqueSessions };
  }, [logs]);

  // ── Charts Data ──
  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => {
      const day = format(new Date(l.created_at), 'MMM dd');
      map.set(day, (map.get(day) || 0) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({ date, events: count })).reverse();
  }, [logs]);

  const eventsByType = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => map.set(l.event_type, (map.get(l.event_type) || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [logs]);

  const topPages = useMemo(() => {
    const map = new Map<string, number>();
    logs.filter(l => l.page).forEach(l => map.set(l.page, (map.get(l.page) || 0) + 1));
    return Array.from(map.entries()).map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [logs]);

  const hourlyActivity = useMemo(() => {
    const hours = new Array(24).fill(0);
    logs.forEach(l => {
      const h = new Date(l.created_at).getHours();
      hours[h]++;
    });
    return hours.map((count, hour) => ({ hour: `${hour}:00`, activity: count }));
  }, [logs]);

  const deviceStats = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => {
      const platform = l.device_info?.platform || 'Unknown';
      const isMobile = /Mobile|Android|iPhone/i.test(platform);
      const key = isMobile ? 'Mobile' : 'Desktop';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [logs]);

  const recentActivity = useMemo(() => logs.slice(0, 50), [logs]);

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'User', 'Event', 'Page', 'Element', 'Category', 'Duration(ms)'].join(','),
      ...logs.map(l => [
        l.created_at, l.user_id.slice(0, 8), l.event_type, l.page, l.element, l.event_category, l.duration_ms || 0
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported!');
  };

  return (
    <div className="space-y-4 pb-24 max-w-7xl mx-auto">
      <HeaderPortal>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="p-2 rounded-lg hover:bg-[var(--surface-variant)]" disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleExport} className="p-2 rounded-lg hover:bg-[var(--surface-variant)]">
            <Download size={16} />
          </button>
        </div>
      </HeaderPortal>

      <div>
        <h1 className="text-xl font-black text-[var(--on-surface)]">User Analytics</h1>
        <p className="text-xs text-[var(--text-muted)]">God-level tracking — every click, page, action</p>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {TIME_RANGES.map(tr => (
          <button key={tr.key} onClick={() => setTimeRange(tr.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeRange === tr.key ? 'bg-indigo-500 text-white' : 'bg-[var(--surface-variant)] text-[var(--text-muted)]'}`}>
            {tr.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: <Users size={16} />, label: 'Unique Users', value: stats.uniqueUsers, color: 'text-indigo-400' },
          { icon: <Eye size={16} />, label: 'Page Views', value: stats.pageViews, color: 'text-blue-400' },
          { icon: <MousePointerClick size={16} />, label: 'Total Clicks', value: stats.clicks, color: 'text-amber-400' },
          { icon: <TrendingUp size={16} />, label: 'Total Events', value: stats.totalEvents, color: 'text-emerald-400' },
          { icon: <Clock size={16} />, label: 'Avg Session', value: `${(stats.avgDuration / 1000).toFixed(1)}s`, color: 'text-purple-400' },
          { icon: <Globe size={16} />, label: 'Sessions', value: stats.uniqueSessions, color: 'text-cyan-400' },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-[var(--surface)] rounded-xl p-3 border border-[var(--border)]">
            <div className={`${kpi.color} mb-1`}>{kpi.icon}</div>
            <div className="text-lg font-black text-[var(--on-surface)]">{kpi.value}</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Events Over Time */}
        <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--on-surface)] mb-3">Events Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={eventsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="events" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Event Distribution */}
        <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--on-surface)] mb-3">Event Types</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={eventsByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                {eventsByType.map((entry, i) => (
                  <Cell key={i} fill={EVENT_COLORS[entry.name] || '#64748b'} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {eventsByType.slice(0, 6).map((e, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <div className="w-2 h-2 rounded-full" style={{ background: EVENT_COLORS[e.name] || '#64748b' }} />
                {e.name} ({e.value})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly Activity + Top Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--on-surface)] mb-3">Hourly Activity</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="activity" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--on-surface)] mb-3">Top Pages</h3>
          <div className="space-y-2">
            {topPages.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-[var(--on-surface)] font-mono truncate max-w-[60%]">/{p.page}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-[var(--surface-variant)] rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(p.count / (topPages[0]?.count || 1)) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] w-8 text-right">{p.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device Stats + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--on-surface)] mb-3">Device Split</h3>
          <div className="flex items-center justify-center gap-8">
            {deviceStats.map((d, i) => (
              <div key={i} className="text-center">
                {d.name === 'Mobile' ? <Smartphone size={24} className="text-blue-400 mx-auto mb-1" /> : <Monitor size={24} className="text-purple-400 mx-auto mb-1" />}
                <div className="text-lg font-black text-[var(--on-surface)]">{d.value}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{d.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--on-surface)] mb-3">Recent Activity</h3>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {recentActivity.slice(0, 15).map((log, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: EVENT_COLORS[log.event_type] || '#64748b' }} />
                <span className="text-[var(--text-muted)]">{format(new Date(log.created_at), 'HH:mm:ss')}</span>
                <span className="font-bold text-[var(--on-surface)]">{log.event_type}</span>
                {log.page && <span className="text-[var(--text-muted)]">/{log.page}</span>}
                {log.element && <span className="text-indigo-400">{log.element}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
