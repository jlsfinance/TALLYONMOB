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

type Tab = 'dashboard' | 'users' | 'companies' | 'plans' | 'coupons' | 'payments' | 'activity' | 'leads' | 'user-detail' | 'company-detail' | 'reports';

const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'companies', label: 'Companies', icon: Building2 },
    { key: 'plans', label: 'Plans', icon: CreditCard },
    { key: 'coupons', label: 'Coupons', icon: Tag },
    { key: 'payments', label: 'Payments', icon: DollarSign },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'leads', label: 'Leads', icon: TrendingUp },
    { key: 'reports', label: 'Reports', icon: BarChart3 },
];

function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function AdminPanelPage() {
    const { selectedCompany } = useAuth() as any;
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [search, setSearch] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // ═══ DASHBOARD ═══
    const { data: stats } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: async () => {
            try {
                const [usersRes, licensesRes, paymentsRes, trialsRes, plansRes] = await Promise.all([
                    supabase.from('user_licenses').select('id, user_id', { count: 'exact', head: true }),
                    supabase.from('user_licenses').select('id, status, expires_at, expiry_date, created_at'),
                    supabase.from('payments').select('id, total_amount, status, created_at'),
                    supabase.from('trial_history').select('id', { count: 'exact', head: true }),
                    supabase.from('subscription_plans').select('*'),
                ]);

                const licenses = licensesRes.data || [];
                const payments = paymentsRes.data || [];
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

                const active = licenses.filter(l => l.status === 'active' && new Date(l.expires_at || l.expiry_date) > now).length;
                const expired = licenses.filter(l => l.status === 'expired' || new Date(l.expires_at || l.expiry_date) <= now).length;
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
            const { data: licenses, error: licErr } = await supabase.from('user_licenses')
                .select('id, user_id, email, license_key, status, expiry_date, tally_serial, company_gst, plan_id, created_at')
                .order('created_at', { ascending: false });
            if (licErr) console.error('License query error:', licErr);

            const { data: companyList } = await supabase.from('companies')
                .select('id, name, owner_id')
                .order('created_at', { ascending: false });

            const { data: plansList } = await supabase.from('subscription_plans')
                .select('id, name, slug');

            const plansMap = new Map((plansList || []).map((p: any) => [p.id, p]));
            const companiesByOwner = new Map<string, any[]>();
            (companyList || []).forEach((c: any) => {
                if (c.owner_id) {
                    const existing = companiesByOwner.get(c.owner_id) || [];
                    existing.push(c);
                    companiesByOwner.set(c.owner_id, existing);
                }
            });

            return (licenses || []).map((lic: any) => ({
                ...lic,
                plan: lic.plan_id ? plansMap.get(lic.plan_id) : null,
                userCompanies: companiesByOwner.get(lic.user_id) || [],
            }));
        },
        enabled: activeTab === 'users' || activeTab === 'user-detail',
    });

    // ═══ COMPANIES ═══
    const { data: companies = [] } = useQuery({
        queryKey: ['admin-companies'],
        queryFn: async () => {
            const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
            if (error) console.error('Companies query error:', error);

            const ownerIds = [...new Set((data || []).map((c: any) => c.owner_id).filter(Boolean))];
            let emailMap = new Map<string, string>();
            if (ownerIds.length > 0) {
                const { data: licenses } = await supabase.from('user_licenses').select('user_id, email').in('user_id', ownerIds);
                (licenses || []).forEach((l: any) => { if (l.email) emailMap.set(l.user_id, l.email); });
            }

            return (data || []).map((c: any) => ({
                ...c,
                _ownerEmail: emailMap.get(c.owner_id) || c.owner_id?.slice(0, 8) || 'Unknown',
            }));
        },
        enabled: activeTab === 'companies' || activeTab === 'company-detail',
    });

    // ═══ PLANS ═══
    const { data: plans = [] } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: async () => {
            const { data, error } = await supabase.from('subscription_plans').select('*').order('sort_order');
            if (error) console.error('Plans query error:', error);
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
            const { data, error } = await supabase.from('payments')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) console.error('Payments query error:', error);

            const userIds = [...new Set((data || []).map((p: any) => p.user_id).filter(Boolean))];
            let emailMap = new Map<string, string>();
            if (userIds.length > 0) {
                const { data: licenses } = await supabase.from('user_licenses').select('user_id, email').in('user_id', userIds);
                (licenses || []).forEach((l: any) => { if (l.email) emailMap.set(l.user_id, l.email); });
            }

            const planSlugs = [...new Set((data || []).map((p: any) => p.plan_slug).filter(Boolean))];
            let planMap = new Map<string, string>();
            if (planSlugs.length > 0) {
                const { data: plansList } = await supabase.from('subscription_plans').select('slug, name');
                (plansList || []).forEach((pl: any) => { if (pl.name) planMap.set(pl.slug, pl.name); });
            }

            return (data || []).map((p: any) => ({
                ...p,
                _email: emailMap.get(p.user_id) || p.user_id?.slice(0, 8) || 'N/A',
                _planName: planMap.get(p.plan_slug) || p.plan_slug?.replace(/_/g, ' ') || 'N/A',
            }));
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
            const { data: lic } = await supabase.from('user_licenses').select('expires_at, expiry_date').eq('id', licenseId).single();
            if (!lic) throw new Error('Not found');
            const baseDate = lic.expires_at || lic.expiry_date;
            if (!baseDate) throw new Error('No expiry date found');
            const newExpiry = new Date(baseDate);
            newExpiry.setDate(newExpiry.getDate() + days);
            const { error } = await supabase.from('user_licenses')
                .update({ expires_at: newExpiry.toISOString(), expiry_date: newExpiry.toISOString(), updated_at: new Date().toISOString() })
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
        mutationFn: async ({ email, planSlug, days, mobile, tallySerial }: { email: string; planSlug: string; days: number; mobile?: string; tallySerial?: string }) => {
            const { data, error } = await supabase.rpc('assign_license', {
                p_email: email,
                p_plan_slug: planSlug,
                p_duration_days: days,
                p_mobile: mobile || null,
                p_tally_serial: tallySerial || null,
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
            u.email?.toLowerCase().includes(q) ||
            u.license_key?.toLowerCase().includes(q) ||
            u.tally_serial?.toLowerCase().includes(q) ||
            u.company_gst?.toLowerCase().includes(q) ||
            u.user_id?.toLowerCase().includes(q) ||
            u.userCompanies?.some((c: any) => c.name?.toLowerCase().includes(q))
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
                        loading={assignLicenseMutation.isLoading}
                    />
                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search by license key, serial, GST, company..."
                                className="w-full pl-9 pr-3 py-2 text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--on-surface)]" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        {filteredUsers.map((u: any) => {
                            const expiryDate = u.expires_at || u.expiry_date;
                            const isExpired = u.status === 'expired' || (expiryDate && new Date(expiryDate) < new Date());
                            const daysLeft = expiryDate ? Math.max(0, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)) : 0;
                            const companyName = u.userCompanies?.[0]?.name || '';
                            return (
                                <div key={u.id} onClick={() => { setSelectedUserId(u.user_id); setActiveTab('user-detail'); }}
                                    className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:border-[var(--primary)]/50 transition-all">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${isExpired ? 'bg-red-500' : u.status === 'suspended' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                            <div>
                                                <span className="text-[11px] font-bold">{u.email || u.user_id?.slice(0, 8) || 'Unknown'}</span>
                                                {companyName && <span className="text-[9px] text-[var(--text-muted)] ml-2">{companyName}</span>}
                                            </div>
                                        </div>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                            isExpired ? 'bg-red-500/10 text-red-500' : u.status === 'suspended' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                                        }`}>{u.status.toUpperCase()}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]">
                                        <span className="font-mono">{u.license_key}</span>
                                        {u.tally_serial && <span>SN: {u.tally_serial}</span>}
                                        {u.company_gst && <span>GST: {u.company_gst}</span>}
                                        {u.plan && <span>Plan: {u.plan.name}</span>}
                                        <span>{daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}</span>
                                    </div>
                                    <div className="flex gap-1 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
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
                <div className="space-y-3 px-[2px]">
                    {(() => {
                        const grouped = new Map<string, any[]>();
                        companies.forEach((c: any) => {
                            const key = c._ownerEmail || 'Unknown';
                            const existing = grouped.get(key) || [];
                            existing.push(c);
                            grouped.set(key, existing);
                        });
                        return Array.from(grouped.entries()).map(([email, comps]) => (
                            <div key={email} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                                <div className="px-3 py-2 bg-[var(--surface-container)] flex items-center gap-2 border-b border-[var(--border)]">
                                    <Mail size={11} className="text-[var(--primary)]" />
                                    <span className="text-[11px] font-bold">{email}</span>
                                    <span className="text-[9px] text-[var(--text-muted)]">({comps.length} companies)</span>
                                </div>
                                <div className="divide-y divide-[var(--border)]">
                                    {comps.map((c: any) => (
                                        <div key={c.id} onClick={() => { setSelectedCompanyId(c.id); setActiveTab('company-detail'); }}
                                            className="px-3 py-2 cursor-pointer hover:bg-[var(--primary)]/5 transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${c.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    <span className="text-[11px] font-bold">{c.name}</span>
                                                    {c.tally_serial && <span className="text-[9px] text-[var(--text-muted)]">SN: {c.tally_serial}</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {c.last_sync_at && <span className="text-[8px] text-[var(--text-muted)]">Last: {new Date(c.last_sync_at).toLocaleDateString('en-IN')}</span>}
                                                    <ArrowUpRight size={10} className="text-[var(--text-muted)]" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ));
                    })()}
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
                                    <span className="text-[9px] text-[var(--text-muted)] ml-2">{p.duration_days ? `${p.duration_days} days` : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-black">
                                    {p.price_monthly > 0 && <span className="text-emerald-500">₹{p.price_monthly}/mo</span>}
                                    {p.price_yearly > 0 && <span className="text-blue-500">₹{p.price_yearly}/yr</span>}
                                    {p.price_monthly === 0 && p.price_yearly === 0 && <span className="text-slate-400">Free</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[9px] text-[var(--text-muted)]">
                                <span>Users: {p.max_users || '∞'}</span>
                                <span>Vouchers: {p.max_vouchers === -1 ? '∞' : p.max_vouchers}</span>
                                <span>GST: {p.gst_percent || 0}%</span>
                                <span className={p.is_active ? 'text-emerald-500' : 'text-red-500'}>{p.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div className="flex gap-1 mt-1">
                                {(p.features || []).map((f: string) => (
                                    <span key={f} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--surface-container)] text-[var(--text-muted)]">{f}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {plans.length === 0 && <p className="text-center text-[var(--text-muted)] text-xs py-8">No plans</p>}
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
                    <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3 text-[9px] font-bold text-[var(--text-muted)]">
                        <span className="flex-1">User</span>
                        <span className="w-20">Amount</span>
                        <span className="w-20">Plan</span>
                        <span className="w-16">Status</span>
                        <span className="w-20">Method</span>
                        <span className="w-20">Date</span>
                    </div>
                    {payments.map((p: any) => (
                        <div key={p.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[11px] font-bold truncate block">{p._email}</span>
                                        {p.razorpay_payment_id && <span className="text-[8px] text-[var(--text-muted)] font-mono block">{p.razorpay_payment_id}</span>}
                                    </div>
                                    <span className="w-20 text-[11px] font-bold text-emerald-500">{formatCurrency(p.final_amount || p.amount || 0)}</span>
                                    <span className="w-20 text-[9px] text-[var(--text-muted)] capitalize">{p._planName}</span>
                                    <span className={`w-16 text-[9px] font-bold px-2 py-0.5 rounded ${
                                        p.status === 'completed' || p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' :
                                        p.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                                    }`}>{(p.status || 'unknown').toUpperCase()}</span>
                                    <span className="w-20 text-[9px] text-[var(--text-muted)]">{p.payment_method || 'N/A'}</span>
                                    <span className="w-20 text-[9px] text-[var(--text-muted)]">{new Date(p.created_at).toLocaleDateString('en-IN')}</span>
                                </div>
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

            {/* ═══ USER DETAIL TAB ═══ */}
            {activeTab === 'user-detail' && selectedUserId && (
                <UserDetailPanel
                    userId={selectedUserId}
                    onBack={() => { setActiveTab('users'); setSelectedUserId(null); }}
                />
            )}

            {/* ═══ COMPANY DETAIL TAB ═══ */}
            {activeTab === 'company-detail' && selectedCompanyId && (
                <CompanyDetailPanel
                    companyId={selectedCompanyId}
                    onBack={() => { setActiveTab('companies'); setSelectedCompanyId(null); }}
                />
            )}

            {/* ═══ REPORTS TAB ═══ */}
            {activeTab === 'reports' && (
                <AdminReportsPanel />
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
function AssignLicenseForm({ plans, onSubmit, loading }: { plans: any[]; onSubmit: (email: string, planSlug: string, days: number, mobile?: string, tallySerial?: string) => void; loading: boolean }) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [tallySerial, setTallySerial] = useState('');
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
            <p className="text-[8px] text-emerald-400/60">One license = One Email + One Tally Serial + Unlimited Companies</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@email.com"
                    type="email"
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded" />
                <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number (optional)"
                    type="tel"
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded" />
                <input value={tallySerial} onChange={e => setTallySerial(e.target.value)} placeholder="Tally Serial Number (optional)"
                    className="px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded font-mono" />
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
                    onClick={() => { onSubmit(email, planSlug, days, mobile, tallySerial); setEmail(''); setMobile(''); setTallySerial(''); }}
                    className="text-[10px] font-bold px-3 py-1.5 rounded bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                    {loading ? <RefreshCw size={10} className="animate-spin" /> : <UserPlus size={10} />}
                    {loading ? 'Assigning...' : 'Assign License'}
                </button>
                <button onClick={() => setOpen(false)} className="text-[10px] font-bold px-3 py-1.5 rounded bg-[var(--surface-container)] text-[var(--text-muted)]">Cancel</button>
            </div>
        </div>
    );
}

// User Detail Panel - shows user's data as they see it
function UserDetailPanel({ userId, onBack }: { userId: string; onBack: () => void }) {
    const [license, setLicense] = useState<any>(null);
    const [companies, setCompanies] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [transferSerial, setTransferSerial] = useState('');
    const [transferring, setTransferring] = useState(false);

    const handleTransferSerial = async () => {
        if (!transferSerial || !license) return;
        setTransferring(true);
        try {
            const { data, error } = await supabase.rpc('transfer_tally_serial', {
                p_license_id: license.id,
                p_new_tally_serial: transferSerial,
                p_admin_id: (await supabase.auth.getUser()).data.user?.id,
                p_reason: 'Admin transfer'
            });
            if (error) throw error;
            if (data && !data.success) throw new Error(data.message);
            toast.success(data?.message || 'Serial transferred');
            setTransferSerial('');
            // Refresh
            const { data: lic } = await supabase.from('user_licenses').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
            setLicense(lic);
        } catch (err: any) {
            toast.error(err.message || 'Transfer failed');
        } finally {
            setTransferring(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const { data: lic } = await supabase.from('user_licenses').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
            setLicense(lic);

            const { data: comps } = await supabase.from('companies').select('id, name, tally_serial, is_active, created_at, last_sync_at, owner_id').eq('owner_id', userId);
            setCompanies(comps || []);

            const { data: pays } = await supabase.from('payments').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            setPayments(pays || []);

            if (comps && comps.length > 0) {
                let allVchs: any[] = [];
                for (const comp of comps) {
                    const { data: vchs } = await supabase.from('vouchers').select('id, voucher_type, party_ledger_name, amount, vch_date, company_id').eq('company_id', comp.id).order('vch_date', { ascending: false }).limit(20);
                    if (vchs) allVchs.push(...vchs);
                }
                setVouchers(allVchs.sort((a: any, b: any) => new Date(b.vch_date).getTime() - new Date(a.vch_date).getTime()).slice(0, 20));
            }
            setLoading(false);
        };
        load();
    }, [userId]);

    if (loading) return <div className="p-4 text-center text-[var(--text-muted)] text-xs">Loading user data...</div>;
    if (!license) return <div className="p-4 text-center text-[var(--text-muted)] text-xs">No license found</div>;

    const expiryDate = license.expires_at || license.expiry_date;
    const isExpired = license.status === 'expired' || (expiryDate && new Date(expiryDate) < new Date());
    const daysLeft = expiryDate ? Math.max(0, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)) : 0;

    const filteredPayments = paymentFilter === 'all' ? payments : payments.filter((p: any) => p.status === paymentFilter);
    const paidCount = payments.filter((p: any) => p.status === 'paid' || p.status === 'completed').length;
    const pendingCount = payments.filter((p: any) => p.status === 'pending').length;
    const failedCount = payments.filter((p: any) => p.status === 'failed' || p.status === 'cancelled').length;

    return (
        <div className="space-y-3 px-[2px]">
            <button onClick={onBack} className="flex items-center gap-1 text-[10px] font-bold text-[var(--primary)] hover:underline">
                ← Back to Users
            </button>

            {/* License Info */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-black">License Details</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                        isExpired ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                    }`}>{license.status.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div><span className="text-[var(--text-muted)]">Email:</span> <span className="font-bold">{license.email || 'N/A'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Plan:</span> <span className="font-bold">{license.plan_slug || license.plan_id || 'N/A'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Key:</span> <span className="font-bold font-mono">{license.license_key || 'N/A'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Status:</span> <span className={`font-bold ${isExpired ? 'text-red-500' : 'text-emerald-500'}`}>{license.status}</span></div>
                    <div><span className="text-[var(--text-muted)]">Expiry:</span> <span className="font-bold">{expiryDate ? new Date(expiryDate).toLocaleDateString('en-IN') : 'N/A'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Days Left:</span> <span className="font-bold">{daysLeft > 0 ? daysLeft : 'Expired'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Tally Serial:</span> <span className={`font-bold font-mono ${license.tally_serial ? 'text-emerald-500' : 'text-amber-500'}`}>{license.tally_serial || 'Not bound yet'}</span></div>
                    {license.mobile && <div><span className="text-[var(--text-muted)]">Mobile:</span> <span className="font-bold">{license.mobile}</span></div>}
                    {license.tally_serial && <div className="col-span-2"><span className="text-[var(--text-muted)]">Companies:</span> <span className="font-bold text-blue-500">Unlimited (same Tally Serial)</span></div>}
                    <div><span className="text-[var(--text-muted)]">User ID:</span> <span className="font-mono text-[8px]">{license.user_id}</span></div>
                    <div><span className="text-[var(--text-muted)]">Created:</span> {new Date(license.created_at).toLocaleDateString('en-IN')}</div>
                </div>
            </div>

            {/* Transfer Tally Serial */}
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <span className="text-[11px] font-black text-amber-500">Transfer Tally Serial</span>
                <p className="text-[8px] text-[var(--text-muted)] mb-2">Move this license to a different Tally installation</p>
                <div className="flex gap-2">
                    <input value={transferSerial} onChange={e => setTransferSerial(e.target.value)}
                        placeholder="New Tally Serial Number"
                        className="flex-1 px-2 py-1.5 text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded font-mono" />
                    <button disabled={transferring || !transferSerial}
                        onClick={handleTransferSerial}
                        className="text-[10px] font-bold px-3 py-1.5 rounded bg-amber-500 text-white disabled:opacity-50 flex items-center gap-1">
                        {transferring ? <RefreshCw size={10} className="animate-spin" /> : null}
                        {transferring ? 'Transferring...' : 'Transfer'}
                    </button>
                </div>
                {license.tally_serial && (
                    <p className="text-[8px] text-[var(--text-muted)] mt-1">
                        Current: <span className="font-mono font-bold text-amber-500">{license.tally_serial}</span>
                    </p>
                )}
            </div>

            {/* Companies */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[12px] font-black">Companies ({companies.length})</span>
                {companies.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">No companies linked</p>
                ) : (
                    <div className="mt-2 space-y-1.5">
                        {companies.map((c: any) => (
                            <div key={c.id} className="flex items-center justify-between p-2 rounded bg-[var(--bg)]">
                                <div>
                                    <span className="text-[10px] font-bold">{c.name}</span>
                                    {c.tally_serial && <span className="text-[9px] text-[var(--text-muted)] ml-2">SN: {c.tally_serial}</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
                                    {c.last_sync_at && <span>Last sync: {new Date(c.last_sync_at).toLocaleDateString('en-IN')}</span>}
                                    <span className={c.is_active ? 'text-emerald-500' : 'text-red-500'}>{c.is_active ? 'Active' : 'Inactive'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Vouchers */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[12px] font-black">Recent Vouchers ({vouchers.length})</span>
                {vouchers.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">No vouchers synced</p>
                ) : (
                    <div className="mt-2 space-y-1">
                        {vouchers.slice(0, 10).map((v: any) => (
                            <div key={v.id} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg)] text-[9px]">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">{v.voucher_type}</span>
                                    <span className="text-[var(--text-muted)]">{v.party_ledger_name || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">₹{Number(v.amount || 0).toLocaleString('en-IN')}</span>
                                    <span className="text-[var(--text-muted)]">{v.vch_date ? new Date(v.vch_date).toLocaleDateString('en-IN') : '-'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Payments with filters */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-black">Payments ({payments.length})</span>
                </div>
                {/* Status filter chips */}
                <div className="flex gap-1.5 mb-2 flex-wrap">
                    <button onClick={() => setPaymentFilter('all')}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${paymentFilter === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]'}`}>
                        All ({payments.length})
                    </button>
                    <button onClick={() => setPaymentFilter('pending')}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${paymentFilter === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-500/10 text-amber-500'}`}>
                        Pending ({pendingCount})
                    </button>
                    <button onClick={() => setPaymentFilter('paid')}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${paymentFilter === 'paid' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        Paid ({paidCount})
                    </button>
                    {failedCount > 0 && (
                        <button onClick={() => setPaymentFilter('failed')}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${paymentFilter === 'failed' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500'}`}>
                            Failed ({failedCount})
                        </button>
                    )}
                </div>
                {filteredPayments.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)]">No {paymentFilter === 'all' ? '' : paymentFilter} payments</p>
                ) : (
                    <div className="space-y-1">
                        {filteredPayments.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg)] text-[9px]">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">{formatCurrency(Number(p.total_amount || p.amount || 0))}</span>
                                    <span className="text-[var(--text-muted)]">{p.plan_slug || '-'}</span>
                                    {p.payment_method && (
                                        <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--text-muted)] text-[8px]">
                                            {p.payment_method === 'admin' ? '👤 By Admin' : p.payment_method === 'razorpay' ? '💳 Razorpay' : `📋 ${p.payment_method}`}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold px-1.5 py-0.5 rounded ${
                                        p.status === 'completed' || p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' :
                                        p.status === 'failed' || p.status === 'cancelled' ? 'bg-red-500/10 text-red-500' :
                                        'bg-amber-500/10 text-amber-500'
                                    }`}>{p.status}</span>
                                        <span className="text-[var(--text-muted)]">{new Date(p.created_at).toLocaleDateString('en-IN')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Company Detail Panel - dashboard-like view
function CompanyDetailPanel({ companyId, onBack }: { companyId: string; onBack: () => void }) {
    const [company, setCompany] = useState<any>(null);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [voucherFilter, setVoucherFilter] = useState<string>('all');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const { data: comp } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
            setCompany(comp);
            const { data: vchs } = await supabase.from('vouchers').select('*').eq('company_id', companyId).order('vch_date', { ascending: false }).limit(100);
            setVouchers(vchs || []);
            const { data: lgrs } = await supabase.from('ledgers').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100);
            setLedgers(lgrs || []);
            setLoading(false);
        };
        load();
    }, [companyId]);

    if (loading) return <div className="p-4 text-center text-[var(--text-muted)] text-xs">Loading company data...</div>;
    if (!company) return <div className="p-4 text-center text-[var(--text-muted)] text-xs">Company not found</div>;

    const totalAmount = vouchers.reduce((s: number, v: any) => s + Number(v.amount || 0), 0);
    const typeBreakdown = vouchers.reduce((acc: Record<string, { count: number; amount: number }>, v: any) => {
        const t = v.voucher_type || 'Other';
        if (!acc[t]) acc[t] = { count: 0, amount: 0 };
        acc[t].count += 1;
        acc[t].amount += Number(v.amount || 0);
        return acc;
    }, {});

    const filteredVouchers = voucherFilter === 'all' ? vouchers : vouchers.filter((v: any) => v.voucher_type === voucherFilter);
    const totalLedgerBalance = ledgers.reduce((s: number, l: any) => s + Math.abs(Number(l.closing_balance || l.amount || 0)), 0);

    return (
        <div className="space-y-3 px-[2px]">
            <button onClick={onBack} className="flex items-center gap-1 text-[10px] font-bold text-[var(--primary)] hover:underline">← Back to Companies</button>

            {/* Company Header */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-[var(--primary)]" />
                        <span className="text-[13px] font-black">{company.name}</span>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${company.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{company.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {company.tally_serial && <div><span className="text-[var(--text-muted)]">Tally SN:</span> <span className="font-bold">{company.tally_serial}</span></div>}
                    {company.formal_name && <div><span className="text-[var(--text-muted)]">Formal:</span> <span className="font-bold">{company.formal_name}</span></div>}
                    {company.phone && <div><span className="text-[var(--text-muted)]">Phone:</span> <span className="font-bold">{company.phone}</span></div>}
                    {company.gst_number && <div><span className="text-[var(--text-muted)]">GST:</span> <span className="font-bold font-mono">{company.gst_number}</span></div>}
                    {company.address && <div className="col-span-2"><span className="text-[var(--text-muted)]">Address:</span> <span className="font-bold">{company.address}</span></div>}
                    {company.owner_id && <div><span className="text-[var(--text-muted)]">Owner:</span> <span className="font-mono text-[8px]">{company.owner_id}</span></div>}
                    <div><span className="text-[var(--text-muted)]">Created:</span> {new Date(company.created_at).toLocaleDateString('en-IN')}</div>
                    {company.last_sync_at && <div><span className="text-[var(--text-muted)]">Last Sync:</span> {new Date(company.last_sync_at).toLocaleString('en-IN')}</div>}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Vouchers</span>
                    <p className="text-lg font-black text-blue-500">{vouchers.length}</p>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Total Amount</span>
                    <p className="text-lg font-black text-emerald-500">₹{totalAmount.toLocaleString('en-IN')}</p>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Ledgers</span>
                    <p className="text-lg font-black text-purple-500">{ledgers.length}</p>
                </div>
            </div>

            {/* Voucher Type Breakdown */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-[12px] font-black">Voucher Types</span>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                    {Object.entries(typeBreakdown).map(([type, data]: [string, { count: number; amount: number }]) => (
                        <span key={type} className="text-[8px] px-2 py-1 rounded bg-[var(--surface-container)] text-[var(--text-muted)]">
                            {type}: {data.count} (₹{data.amount.toLocaleString('en-IN')})
                        </span>
                    ))}
                </div>
            </div>

            {/* Vouchers with filter */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-black">Vouchers ({vouchers.length})</span>
                    <span className="text-[9px] font-bold text-emerald-500">Total: ₹{totalAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex gap-1 mb-2 flex-wrap">
                    <button onClick={() => setVoucherFilter('all')}
                        className={`text-[8px] font-bold px-2 py-0.5 rounded-full transition-all ${voucherFilter === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]'}`}>
                        All ({vouchers.length})
                    </button>
                    {Object.entries(typeBreakdown).map(([type, data]: [string, { count: number; amount: number }]) => (
                        <button key={type} onClick={() => setVoucherFilter(type)}
                            className={`text-[8px] font-bold px-2 py-0.5 rounded-full transition-all ${voucherFilter === type ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]'}`}>
                            {type} ({data.count})
                        </button>
                    ))}
                </div>
                {filteredVouchers.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)]">No vouchers{voucherFilter !== 'all' ? ` of type "${voucherFilter}"` : ''}</p>
                ) : (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                        {filteredVouchers.map((v: any) => (
                            <div key={v.id} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg)] text-[9px]">
                                <div className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-[8px] font-bold">{v.voucher_type}</span>
                                    <span className="text-[var(--text-muted)]">{v.party_ledger_name || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">₹{Number(v.amount || 0).toLocaleString('en-IN')}</span>
                                    <span className="text-[var(--text-muted)]">{v.vch_date ? new Date(v.vch_date).toLocaleDateString('en-IN') : '-'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ledgers */}
            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-black">Ledgers ({ledgers.length})</span>
                    <span className="text-[9px] font-bold text-purple-500">Total: ₹{totalLedgerBalance.toLocaleString('en-IN')}</span>
                </div>
                {ledgers.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)]">No ledgers</p>
                ) : (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                        {ledgers.map((l: any) => (
                            <div key={l.id} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg)] text-[9px]">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">{l.name || '-'}</span>
                                    {l.parent_group && <span className="text-[var(--text-muted)]">({l.parent_group})</span>}
                                </div>
                                <span className={`font-bold ${Number(l.closing_balance || l.amount || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    ₹{Number(l.closing_balance || l.amount || 0).toLocaleString('en-IN')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Admin Reports Panel
function AdminReportsPanel() {
    const [loading, setLoading] = useState(true);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [topCustomersSale, setTopCustomersSale] = useState<any[]>([]);
    const [topCustomersPayment, setTopCustomersPayment] = useState<any[]>([]);
    const [inactiveCompanies, setInactiveCompanies] = useState<any[]>([]);
    const [companyPerformance, setCompanyPerformance] = useState<any[]>([]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);

            const { data: allCompanies } = await supabase.from('companies').select('id, name, is_active, last_sync_at, owner_id');
            const companies = allCompanies || [];
            const companyIds = companies.map((c: any) => c.id);

            let allVouchers: any[] = [];
            let allStockItems: any[] = [];
            if (companyIds.length > 0) {
                for (const cid of companyIds) {
                    const [vRes, sRes] = await Promise.all([
                        supabase.from('vouchers').select('id, company_id, voucher_type, party_ledger_name, amount, vch_date').eq('company_id', cid).order('vch_date', { ascending: false }).limit(500),
                        supabase.from('stock_items').select('id, company_id, name, rate, current_stock').eq('company_id', cid),
                    ]);
                    if (vRes.data) allVouchers.push(...vRes.data);
                    if (sRes.data) allStockItems.push(...sRes.data);
                }
            }

            const { data: allPayments } = await supabase.from('payments').select('*');
            const payments = allPayments || [];

            // Top Products
            const prodMap = new Map<string, { name: string; totalAmount: number; totalQty: number; count: number }>();
            allStockItems.forEach((s: any) => {
                const name = s.name || 'Unknown';
                const ex = prodMap.get(name) || { name, totalAmount: 0, totalQty: 0, count: 0 };
                ex.totalAmount += Number(s.rate || 0);
                ex.totalQty += Number(s.current_stock || 0);
                ex.count += 1;
                prodMap.set(name, ex);
            });
            setTopProducts(Array.from(prodMap.values()).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10));

            // Top Customers by Sale
            const custSaleMap = new Map<string, { name: string; totalAmount: number; count: number; company: string }>();
            allVouchers.forEach((v: any) => {
                const name = v.party_ledger_name;
                if (!name) return;
                const comp = companies.find((c: any) => c.id === v.company_id);
                const ex = custSaleMap.get(name) || { name, totalAmount: 0, count: 0, company: comp?.name || '' };
                ex.totalAmount += Number(v.amount || 0);
                ex.count += 1;
                custSaleMap.set(name, ex);
            });
            setTopCustomersSale(Array.from(custSaleMap.values()).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10));

            // Top Customers by Payment
            const custPayMap = new Map<string, { userId: string; totalPaid: number; count: number }>();
            payments.filter((p: any) => p.status === 'paid' || p.status === 'completed').forEach((p: any) => {
                const ex = custPayMap.get(p.user_id) || { userId: p.user_id, totalPaid: 0, count: 0 };
                ex.totalPaid += Number(p.total_amount || p.amount || 0);
                ex.count += 1;
                custPayMap.set(p.user_id, ex);
            });
            const { data: allLicenses } = await supabase.from('user_licenses').select('user_id, email');
            const emailMap = new Map((allLicenses || []).map((l: any) => [l.user_id, l.email]));
            setTopCustomersPayment(Array.from(custPayMap.values()).map(c => ({ ...c, email: emailMap.get(c.userId) || c.userId })).sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 10));

            // Inactive Companies
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
            setInactiveCompanies(companies.filter((c: any) => !c.last_sync_at || new Date(c.last_sync_at) < thirtyDaysAgo));

            // Company Performance
            const perfMap = new Map<string, { name: string; vouchers: number; totalAmount: number; active: boolean }>();
            companies.forEach((c: any) => perfMap.set(c.name, { name: c.name, vouchers: 0, totalAmount: 0, active: c.is_active }));
            allVouchers.forEach((v: any) => {
                const comp = companies.find((c: any) => c.id === v.company_id);
                if (!comp) return;
                const ex = perfMap.get(comp.name)!;
                ex.vouchers += 1;
                ex.totalAmount += Number(v.amount || 0);
            });
            setCompanyPerformance(Array.from(perfMap.values()).sort((a, b) => b.totalAmount - a.totalAmount));

            setLoading(false);
        };
        load();
    }, []);

    if (loading) return <div className="p-4 text-center text-[var(--text-muted)] text-xs">Generating reports...</div>;

    return (
        <div className="space-y-3 px-[2px]">
            <span className="text-[14px] font-black text-[var(--on-surface)]">Admin Analytics Reports</span>

            <ReportCard title="Top Selling Products" emptyMsg="No product data" items={topProducts.map((p, i) => ({
                rank: i + 1, label: p.name, sub: `Qty: ${p.totalQty.toLocaleString('en-IN')}`, value: `₹${p.totalAmount.toLocaleString('en-IN')}`, valueColor: 'text-emerald-500'
            }))} />

            <ReportCard title="Top Customers (by Sale)" emptyMsg="No customer data" items={topCustomersSale.map((c, i) => ({
                rank: i + 1, label: c.name, sub: c.company ? `${c.company} · ${c.count} vouchers` : `${c.count} vouchers`, value: `₹${c.totalAmount.toLocaleString('en-IN')}`, valueColor: 'text-blue-500'
            }))} />

            <ReportCard title="Top Customers (by Payment)" emptyMsg="No payment data" items={topCustomersPayment.map((c, i) => ({
                rank: i + 1, label: c.email || c.userId?.slice(0, 8), sub: `${c.count} payments`, value: `₹${c.totalPaid.toLocaleString('en-IN')}`, valueColor: 'text-emerald-500'
            }))} />

            <ReportCard title={`Inactive Companies (${inactiveCompanies.length})`} emptyMsg="All companies active!" subtitle="No sync in 30+ days" items={inactiveCompanies.map((c: any) => ({
                rank: 0, label: c.name, sub: c.last_sync_at ? `Last: ${new Date(c.last_sync_at).toLocaleDateString('en-IN')}` : 'Never synced', value: '', valueColor: ''
            }))} />

            <ReportCard title="Company Performance" emptyMsg="No data" items={companyPerformance.map((c, i) => ({
                rank: i + 1, label: c.name, sub: `${c.vouchers} vouchers`, value: `₹${c.totalAmount.toLocaleString('en-IN')}`, valueColor: 'text-[var(--on-surface)]'
            }))} />
        </div>
    );
}

function ReportCard({ title, emptyMsg, subtitle, items }: { title: string; emptyMsg: string; subtitle?: string; items: { rank: number; label: string; sub: string; value: string; valueColor: string }[] }) {
    return (
        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <span className="text-[12px] font-black">{title}</span>
            {subtitle && <span className="text-[9px] text-[var(--text-muted)] ml-2">{subtitle}</span>}
            {items.length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{emptyMsg}</p>
            ) : (
                <div className="mt-2 space-y-1">
                    {items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg)] text-[9px]">
                            <div className="flex items-center gap-2">
                                {item.rank > 0 && <span className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black ${item.rank <= 3 ? 'bg-amber-500/20 text-amber-500' : 'bg-[var(--surface)] text-[var(--text-muted)]'}`}>{item.rank}</span>}
                                <div>
                                    <span className="font-bold">{item.label}</span>
                                    {item.sub && <span className="text-[var(--text-muted)] ml-1">{item.sub}</span>}
                                </div>
                            </div>
                            {item.value && <span className={`font-bold ${item.valueColor}`}>{item.value}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
