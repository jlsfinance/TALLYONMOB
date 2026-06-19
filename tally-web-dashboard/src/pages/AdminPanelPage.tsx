import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import toast from 'react-hot-toast';
import {
    Users, Building2, CreditCard, Tag, Activity, TrendingUp,
    Search, Plus, Ban, CheckCircle, XCircle, Clock, DollarSign,
    BarChart3, ArrowUpRight, ArrowDownLeft, RefreshCw, Eye,
    Edit, Trash2, AlertTriangle, Mail, Phone, Key, Shield, UserPlus
} from 'lucide-react';

type Tab = 'dashboard' | 'users' | 'companies' | 'plans' | 'coupons' | 'payments' | 'activity' | 'leads';

const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'companies', label: 'Companies', icon: Building2 },
    { key: 'plans', label: 'Plans', icon: CreditCard },
    { key: 'coupons', label: 'Coupons', icon: Tag },
    { key: 'payments', label: 'Payments', icon: DollarSign },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'leads', label: 'Leads', icon: TrendingUp },
];

function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function AdminPanelPage() {
    const { selectedCompany } = useAuth() as any;
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();

    // ═══ DASHBOARD ═══
    const { data: stats } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: async () => {
            try {
                const [usersRes, licensesRes, paymentsRes, trialsRes, plansRes] = await Promise.all([
                    supabase.from('user_licenses').select('id, user_id', { count: 'exact', head: true }),
                    supabase.from('user_licenses').select('id, status, expiry_date, created_at'),
                    supabase.from('payments').select('id, total_amount, status, created_at'),
                    supabase.from('trial_history').select('id', { count: 'exact', head: true }),
                    supabase.from('subscription_plans').select('*'),
                ]);

                const licenses = licensesRes.data || [];
                const payments = paymentsRes.data || [];
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

                const active = licenses.filter(l => l.status === 'active' && new Date(l.expiry_date) > now).length;
                const expired = licenses.filter(l => l.status === 'expired' || new Date(l.expiry_date) <= now).length;
                const totalRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
                const mrr = payments.filter(p => p.status === 'paid' && new Date(p.created_at) >= monthStart).reduce((s, p) => s + (Number(p.total_amount) || 0), 0);

                return {
                    totalUsers: usersRes.count || 0,
                    activeUsers: active,
                    expiredUsers: expired,
                    trialUsers: trialsRes.count || 0,
                    totalRevenue,
                    mrr,
                    arr: mrr * 12,
                    totalLicenses: licenses.length,
                    totalPayments: payments.length,
                };
            } catch (e) {
                console.error('Admin stats error:', e);
                return { totalUsers: 0, activeUsers: 0, expiredUsers: 0, trialUsers: 0, totalRevenue: 0, mrr: 0, arr: 0, totalLicenses: 0, totalPayments: 0 };
            }
        },
        enabled: activeTab === 'dashboard',
        staleTime: 30000,
    });

    // ═══ USERS ═══
    const { data: users = [] } = useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const { data } = await supabase.from('user_licenses')
                .select('*, plan:subscription_plans(name, slug)')
                .order('created_at', { ascending: false });
            return data || [];
        },
        enabled: activeTab === 'users',
    });

    // ═══ COMPANIES ═══
    const { data: companies = [] } = useQuery({
        queryKey: ['admin-companies'],
        queryFn: async () => {
            const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
            return data || [];
        },
        enabled: activeTab === 'companies',
    });

    // ═══ PLANS ═══
    const { data: plans = [] } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: async () => {
            const { data } = await supabase.from('subscription_plans').select('*').order('sort_order');
            return data || [];
        },
        enabled: activeTab === 'plans',
    });

    // ═══ COUPONS ═══
    const { data: coupons = [] } = useQuery({
        queryKey: ['admin-coupons'],
        queryFn: async () => {
            const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
            return data || [];
        },
        enabled: activeTab === 'coupons',
    });

    // ═══ PAYMENTS ═══
    const { data: payments = [] } = useQuery({
        queryKey: ['admin-payments'],
        queryFn: async () => {
            const { data } = await supabase.from('payments')
                .select('*, plan:subscription_plans(name)')
                .order('created_at', { ascending: false });
            return data || [];
        },
        enabled: activeTab === 'payments',
    });

    // ═══ ACTIVITY LOGS ═══
    const { data: logs = [] } = useQuery({
        queryKey: ['admin-logs'],
        queryFn: async () => {
            const { data } = await supabase.from('activity_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);
            return data || [];
        },
        enabled: activeTab === 'activity',
    });

    // ═══ LEADS ═══
    const { data: leads = [] } = useQuery({
        queryKey: ['admin-leads'],
        queryFn: async () => {
            const { data } = await supabase.from('sales_leads')
                .select('*')
                .order('created_at', { ascending: false });
            return data || [];
        },
        enabled: activeTab === 'leads',
    });

    // Suspend user mutation
    const suspendMutation = useMutation({
        mutationFn: async ({ licenseId, action }: { licenseId: string; action: 'suspended' | 'blocked' }) => {
            const { error } = await supabase.from('user_licenses')
                .update({ status: action, updated_at: new Date().toISOString() })
                .eq('id', licenseId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('User updated');
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
        onError: () => toast.error('Failed'),
    });

    // Extend trial mutation
    const extendMutation = useMutation({
        mutationFn: async ({ licenseId, days }: { licenseId: string; days: number }) => {
            const { data: lic } = await supabase.from('user_licenses').select('expiry_date').eq('id', licenseId).single();
            if (!lic) throw new Error('Not found');
            const newExpiry = new Date(lic.expiry_date);
            newExpiry.setDate(newExpiry.getDate() + days);
            const { error } = await supabase.from('user_licenses')
                .update({ expiry_date: newExpiry.toISOString(), updated_at: new Date().toISOString() })
                .eq('id', licenseId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Trial extended');
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
        onError: () => toast.error('Failed'),
    });

    // Create coupon mutation
    const createCouponMutation = useMutation({
        mutationFn: async (coupon: any) => {
            const { error } = await supabase.from('coupons').insert(coupon);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Coupon created');
            queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
        },
    });

    // Assign license mutation
    const assignLicenseMutation = useMutation({
        mutationFn: async ({ email, planSlug, days }: { email: string; planSlug: string; days: number }) => {
            const { data, error } = await supabase.rpc('assign_license', {
                p_email: email,
                p_plan_slug: planSlug,
                p_duration_days: days,
            });
            if (error) throw error;
            if (data && !data[0]?.success) throw new Error(data[0]?.message || 'Failed');
            return data;
        },
        onSuccess: (data) => {
            toast.success(data?.[0]?.message || 'License assigned');
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
        },
        onError: (err: any) => toast.error(err.message || 'Failed to assign license'),
    });

    // Revoke license mutation
    const revokeMutation = useMutation({
        mutationFn: async ({ licenseId }: { licenseId: string }) => {
            const { error } = await supabase.from('user_licenses')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', licenseId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('License revoked');
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
        onError: () => toast.error('Failed'),
    });

    const filteredUsers = useMemo(() => {
        if (!search) return users;
        const q = search.toLowerCase();
        return users.filter((u: any) =>
            u.license_key?.toLowerCase().includes(q) ||
            u.tally_serial?.toLowerCase().includes(q) ||
            u.company_gst?.toLowerCase().includes(q)
        );
    }, [users, search]);

    return (
        <div className="space-y-3 pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none flex items-center gap-2">
                        <Shield size={18} className="text-red-500" /> Admin Panel
                    </h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Enterprise Management</p>
                </div>
            </HeaderPortal>

            {/* Tab Bar */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar px-[2px]">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                                activeTab === tab.key
                                    ? 'bg-[var(--primary)] text-white'
                                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]'
                            }`}>
                            <Icon size={12} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ═══ DASHBOARD TAB ═══ */}
            {activeTab === 'dashboard' && (
                <div className="space-y-3 px-[2px]">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            { label: 'Total Users', value: stats?.totalUsers || 0, color: 'text-blue-500', icon: Users },
                            { label: 'Active', value: stats?.activeUsers || 0, color: 'text-emerald-500', icon: CheckCircle },
                            { label: 'Expired', value: stats?.expiredUsers || 0, color: 'text-red-500', icon: XCircle },
                            { label: 'Trial Users', value: stats?.trialUsers || 0, color: 'text-amber-500', icon: Clock },
                        ].map((s, i) => (
                            <div key={i} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <s.icon size={12} className={s.color} />
                                    <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">{s.label}</span>
                                </div>
                                <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Revenue</span>
                            <p className="text-lg font-black text-emerald-500">{formatCurrency(stats?.totalRevenue || 0)}</p>
                        </div>
                        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">MRR</span>
                            <p className="text-lg font-black text-blue-500">{formatCurrency(stats?.mrr || 0)}</p>
                        </div>
                        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">ARR</span>
                            <p className="text-lg font-black text-purple-500">{formatCurrency(stats?.arr || 0)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ USERS TAB ═══ */}
            {activeTab === 'users' && (
                <div className="space-y-2 px-[2px]">
                    <AssignLicenseForm
                        plans={plans}
                        onSubmit={(email, planSlug, days) => assignLicenseMutation.mutate({ email, planSlug, days })}
                        loading={assignLicenseMutation.isPending}
                    />
                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search by license key, serial, GST..."
                                className="w-full pl-9 pr-3 py-2 text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--on-surface)]" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        {filteredUsers.map((u: any) => {
                            const isExpired = u.status === 'expired' || new Date(u.expiry_date) < new Date();
                            const daysLeft = Math.max(0, Math.ceil((new Date(u.expiry_date).getTime() - Date.now()) / 86400000));
                            return (
                                <div key={u.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${isExpired ? 'bg-red-500' : u.status === 'suspended' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                            <span className="text-[11px] font-bold">{u.license_key}</span>
                                        </div>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                            isExpired ? 'bg-red-500/10 text-red-500' : u.status === 'suspended' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                                        }`}>{u.status.toUpperCase()}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]">
                                        {u.tally_serial && <span>SN: {u.tally_serial}</span>}
                                        {u.company_gst && <span>GST: {u.company_gst}</span>}
                                        {u.plan && <span>Plan: {u.plan.name}</span>}
                                        <span>{daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}</span>
                                    </div>
                                    <div className="flex gap-1 mt-1.5 flex-wrap">
                                        <button onClick={() => extendMutation.mutate({ licenseId: u.id, days: 7 })}
                                            className="text-[9px] font-bold px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">+7 Days</button>
                                        <button onClick={() => extendMutation.mutate({ licenseId: u.id, days: 30 })}
                                            className="text-[9px] font-bold px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">+30 Days</button>
                                        {u.status === 'active' && (
                                            <button onClick={() => suspendMutation.mutate({ licenseId: u.id, action: 'suspended' })}
                                                className="text-[9px] font-bold px-2 py-1 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20">Suspend</button>
                                        )}
                                        {u.status !== 'blocked' && (
                                            <button onClick={() => suspendMutation.mutate({ licenseId: u.id, action: 'blocked' })}
                                                className="text-[9px] font-bold px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20">Block</button>
                                        )}
                                        {u.status !== 'cancelled' && (
                                            <button onClick={() => revokeMutation.mutate({ licenseId: u.id })}
                                                className="text-[9px] font-bold px-2 py-1 rounded bg-slate-500/10 text-slate-400 hover:bg-slate-500/20">Revoke</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredUsers.length === 0 && <p className="text-center text-[var(--text-muted)] text-xs py-8">No users found</p>}
                    </div>
                </div>
            )}

            {/* ═══ COMPANIES TAB ═══ */}
            {activeTab === 'companies' && (
                <div className="space-y-1.5 px-[2px]">
                    {companies.map((c: any) => (
                        <div key={c.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">{c.name}</span>
                                <span className="text-[9px] text-[var(--text-muted)]">{new Date(c.created_at).toLocaleDateString()}</span>
                            </div>
                            {c.tally_serial && <p className="text-[9px] text-[var(--text-muted)]">Serial: {c.tally_serial}</p>}
                        </div>
                    ))}
                    {companies.length === 0 && <p className="text-center text-[var(--text-muted)] text-xs py-8">No companies</p>}
                </div>
            )}

            {/* ═══ PLANS TAB ═══ */}
            {activeTab === 'plans' && (
                <div className="space-y-1.5 px-[2px]">
                    {plans.map((p: any) => (
                        <div key={p.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-[11px] font-bold">{p.name}</span>
                                    <span className="text-[9px] text-[var(--text-muted)] ml-2">{p.duration_days} days</span>
                                </div>
                                <span className="text-[11px] font-black text-emerald-500">{formatCurrency(p.price)}</span>
                            </div>
                            <div className="flex gap-1 mt-1">
                                {(p.features || []).map((f: string) => (
                                    <span key={f} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--surface-container)] text-[var(--text-muted)]">{f}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ COUPONS TAB ═══ */}
            {activeTab === 'coupons' && (
                <div className="space-y-1.5 px-[2px]">
                    <CreateCouponForm onSubmit={(c) => createCouponMutation.mutate(c)} />
                    {coupons.map((c: any) => (
                        <div key={c.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Tag size={12} className="text-purple-500" />
                                    <span className="text-[11px] font-black font-mono">{c.code}</span>
                                </div>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${c.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {c.is_active ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[9px] text-[var(--text-muted)]">
                                <span>{c.discount_type === 'flat' ? `₹${c.discount_value}` : `${c.discount_value}%`} off</span>
                                <span>Used: {c.used_count}/{c.usage_limit || '∞'}</span>
                                {c.expiry_date && <span>Exp: {new Date(c.expiry_date).toLocaleDateString()}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ PAYMENTS TAB ═══ */}
            {activeTab === 'payments' && (
                <div className="space-y-1.5 px-[2px]">
                    {payments.map((p: any) => (
                        <div key={p.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">{p.invoice_number || 'N/A'}</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                    p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : p.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                                }`}>{p.status.toUpperCase()}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[9px] text-[var(--text-muted)]">
                                <span>{formatCurrency(p.total_amount)}</span>
                                <span>{p.user?.email || 'N/A'}</span>
                                <span>{p.plan?.name || 'N/A'}</span>
                                <span>{new Date(p.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                    {payments.length === 0 && <p className="text-center text-[var(--text-muted)] text-xs py-8">No payments</p>}
                </div>
            )}

            {/* ═══ ACTIVITY TAB ═══ */}
            {activeTab === 'activity' && (
                <div className="space-y-1 px-[2px]">
                    {logs.map((l: any) => (
                        <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <Activity size={10} className="text-[var(--text-muted)] shrink-0" />
                            <div className="flex-1 min-w-0">
                                <span className="text-[10px] font-bold">{l.action}</span>
                                {l.entity_type && <span className="text-[9px] text-[var(--text-muted)] ml-1">on {l.entity_type}</span>}
                            </div>
                            <span className="text-[8px] text-[var(--text-muted)] shrink-0">{new Date(l.created_at).toLocaleString()}</span>
                        </div>
                    ))}
                    {logs.length === 0 && <p className="text-center text-[var(--text-muted)] text-xs py-8">No activity</p>}
                </div>
            )}

            {/* ═══ LEADS TAB ═══ */}
            {activeTab === 'leads' && (
                <div className="space-y-1.5 px-[2px]">
                    {leads.map((l: any) => (
                        <div key={l.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">{l.name}</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                    l.status === 'converted' ? 'bg-emerald-500/10 text-emerald-500' :
                                    l.status === 'lost' ? 'bg-red-500/10 text-red-500' :
                                    'bg-blue-500/10 text-blue-500'
                                }`}>{l.status.replace('_', ' ').toUpperCase()}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[9px] text-[var(--text-muted)]">
                                {l.email && <span className="flex items-center gap-1"><Mail size={9} />{l.email}</span>}
                                {l.mobile && <span className="flex items-center gap-1"><Phone size={9} />{l.mobile}</span>}
                                {l.company_name && <span>{l.company_name}</span>}
                            </div>
                        </div>
                    ))}
                    {leads.length === 0 && <p className="text-center text-[var(--text-muted)] text-xs py-8">No leads</p>}
                </div>
            )}
        </div>
    );
}

// Inline create coupon form
function CreateCouponForm({ onSubmit }: { onSubmit: (c: any) => void }) {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState('');
    const [type, setType] = useState<'flat' | 'percentage'>('flat');
    const [value, setValue] = useState('');
    const [limit, setLimit] = useState('');

    if (!open) {
        return (
            <button onClick={() => setOpen(true)}
                className="w-full p-2 rounded-lg border border-dashed border-[var(--border)] text-[10px] font-bold text-[var(--primary)] hover:bg-[var(--surface)]">
                <Plus size={12} className="inline mr-1" /> Create Coupon
            </button>
        );
    }

    return (
        <div className="p-3 rounded-lg border border-[var(--primary)] bg-[var(--surface)] space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder="CODE"
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded font-mono font-bold uppercase" />
                <select value={type} onChange={e => setType(e.target.value as any)}
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded">
                    <option value="flat">Flat ₹</option>
                    <option value="percentage">Percentage %</option>
                </select>
                <input value={value} onChange={e => setValue(e.target.value)} placeholder={type === 'flat' ? 'Amount' : 'Percent'}
                    type="number" className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded" />
                <input value={limit} onChange={e => setLimit(e.target.value)} placeholder="Usage limit"
                    type="number" className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded" />
            </div>
            <div className="flex gap-1">
                <button onClick={() => {
                    if (!code || !value) return toast.error('Fill all fields');
                    onSubmit({
                        code: code.toUpperCase(),
                        discount_type: type,
                        discount_value: Number(value),
                        usage_limit: limit ? Number(limit) : null,
                        is_active: true,
                    });
                    setOpen(false);
                    setCode(''); setValue(''); setLimit('');
                }} className="text-[10px] font-bold px-3 py-1.5 rounded bg-[var(--primary)] text-white">Create</button>
                <button onClick={() => setOpen(false)} className="text-[10px] font-bold px-3 py-1.5 rounded bg-[var(--surface-container)] text-[var(--text-muted)]">Cancel</button>
            </div>
        </div>
    );
}

// Assign License Form - email-based or quick assign from list
function AssignLicenseForm({ plans, onSubmit, loading }: { plans: any[]; onSubmit: (email: string, planSlug: string, days: number) => void; loading: boolean }) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [planSlug, setPlanSlug] = useState('monthly');
    const [days, setDays] = useState(30);

    const PLAN_DAYS: Record<string, number> = {
        free: 365, monthly: 30, quarterly: 90, yearly: 365, enterprise: 3650,
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)}
                className="w-full p-2.5 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center gap-2 transition-all">
                <UserPlus size={14} /> Assign New License
            </button>
        );
    }

    return (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Assign License to User</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@email.com"
                    type="email"
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded" />
                <select value={planSlug} onChange={e => {
                    setPlanSlug(e.target.value);
                    setDays(PLAN_DAYS[e.target.value] || 30);
                }}
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded">
                    {(plans.length ? plans : [
                        { slug: 'free', name: 'Free' },
                        { slug: 'monthly', name: 'Monthly' },
                        { slug: 'quarterly', name: 'Quarterly' },
                        { slug: 'yearly', name: 'Yearly' },
                        { slug: 'enterprise', name: 'Enterprise' },
                    ]).map((p: any) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                    ))}
                </select>
                <input value={days} onChange={e => setDays(Number(e.target.value))}
                    type="number" min={1} placeholder="Days"
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded" />
            </div>
            <div className="flex gap-1">
                <button disabled={loading || !email}
                    onClick={() => { onSubmit(email, planSlug, days); setEmail(''); }}
                    className="text-[10px] font-bold px-3 py-1.5 rounded bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                    {loading ? <RefreshCw size={10} className="animate-spin" /> : <UserPlus size={10} />}
                    {loading ? 'Assigning...' : 'Assign License'}
                </button>
                <button onClick={() => setOpen(false)} className="text-[10px] font-bold px-3 py-1.5 rounded bg-[var(--surface-container)] text-[var(--text-muted)]">Cancel</button>
            </div>
        </div>
    );
}
