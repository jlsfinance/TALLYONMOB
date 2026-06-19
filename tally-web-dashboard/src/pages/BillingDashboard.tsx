import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import SafeLink from '../components/common/SafeLink';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import {
    AlertCircle,
    ArrowRight,
    Calculator,
    CheckCircle2,
    ExternalLink,
    FileText,
    Lock,
    Mail,
    Package,
    Phone,
    Play,
    Receipt,
    ShieldCheck,
    ShoppingBag,
    Sparkles,
    Store,
    Trash2,
    Users,
    Wallet,
} from 'lucide-react';
import { Card, Button, Avatar, Badge, EmptyState } from '../components/ui/GlassUI';
import { format } from 'date-fns';
import { PLAY_STORE_URL } from '../lib/jlsBridge';
import { APP_INFO } from '../config/appInfo';

const SUPPORT_EMAIL = APP_INFO.supportEmail.toUpperCase();
const SUPPORT_PHONE = APP_INFO.supportPhone;
const LISTING_UPDATED_AT = 'Jan 25, 2026';
const LISTING_COPY = 'Easy calc, GST billing, invoices, and khata bookkeeping for shopkeepers. This listing is for billing operations only, not loans or credit products.';

const listingStats = [
    {
        label: 'Category',
        value: 'Business',
        helper: 'Smart calculator + GST billing',
    },
    {
        label: 'Updated',
        value: LISTING_UPDATED_AT,
        helper: 'Play Store reference listing',
    },
    {
        label: 'Privacy',
        value: 'Deletion available',
        helper: 'Encrypted in transit',
    },
    {
        label: 'Audience',
        value: 'Shopkeepers',
        helper: 'Ledger, billing, customers',
    },
];

const listingFeatures = [
    {
        title: 'Smart Calculator',
        description: 'Calculate GST, discounts, and totals, then turn the result into a bill without leaving the flow.',
        icon: Calculator,
        tint: 'from-sky-500/20 to-sky-500/5 text-sky-500 border-sky-500/20',
    },
    {
        title: 'GST Billing & Invoicing',
        description: 'Create GST and non-GST invoices with item lines, taxes, totals, and PDF sharing.',
        icon: Receipt,
        tint: 'from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/20',
    },
    {
        title: 'Khata Book & Ledger',
        description: 'Track debit, credit, received payments, and pending balances for daily business bookkeeping.',
        icon: Wallet,
        tint: 'from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/20',
    },
    {
        title: 'Customer Management',
        description: 'Store customer details securely and keep counter billing fast with autofill-ready records.',
        icon: Users,
        tint: 'from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500 border-fuchsia-500/20',
    },
];

const safetyHighlights = [
    {
        title: 'No data shared with third parties',
        detail: 'The listing declares no third-party data sharing.',
        icon: ShieldCheck,
    },
    {
        title: 'Data is encrypted in transit',
        detail: 'Network transfer is protected while using the app.',
        icon: Lock,
    },
    {
        title: 'Data deletion is available',
        detail: 'Users can request deletion from inside the product flow.',
        icon: Trash2,
    },
];

const whatsNew = [
    'Performance improvements in the business dashboard.',
    'Scanner and payment modal UI bug fixes.',
    'Stability improvements and crash fixes.',
    'Faster load times with lower memory usage.',
];

export default function BillingDashboard() {
    const { selectedCompany } = useAuth() as any;
    const { navigate } = useSafeNavigate();
    const [loading, setLoading] = useState(true);
    const [todayStats, setTodayStats] = useState({ amount: 0, count: 0 });
    const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
    const [lowStock, setLowStock] = useState<any[]>([]);
    const [pendingQueueCount, setPendingQueueCount] = useState(0);

    useEffect(() => {
        if (selectedCompany) {
            loadStats();
        }
    }, [selectedCompany]);

    const loadStats = async () => {
        setLoading(true);
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data: sales } = await (supabase as any)
                .from('vouchers')
                .select('total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .gte('voucher_date', format(today, 'yyyy-MM-dd'));

            const total = sales?.reduce((acc: number, sale: any) => acc + Math.abs(Number(sale.grand_total) || Number(sale.total_amount) || 0), 0) || 0;
            setTodayStats({
                amount: total,
                count: sales?.length || 0,
            });

            const { data: recent } = await (supabase as any)
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(5);

            const { data: pending } = await (supabase as any)
                .from('pending_transactions')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .in('status', ['pending', 'failed'])
                .order('created_at', { ascending: false })
                .limit(5);

            setPendingQueueCount((pending || []).length);

            const combined = [
                ...(pending || []).map((p) => {
                    const { id, ...rest } = p.voucher_data || {};
                    return { ...p, ...rest, status: p.status };
                }),
                ...(recent || []).map((r) => ({ ...r, status: 'synced' })),
            ];

            setRecentInvoices(
                combined
                    .sort((a, b) => new Date(b.created_at || b.voucher_date).getTime() - new Date(a.created_at || a.voucher_date).getTime())
                    .slice(0, 5)
            );

            const { data: stock } = await (supabase as any)
                .from('stock_items')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .lt('current_stock', 10)
                .limit(4);

            setLowStock(stock || []);
        } catch (error) {
            console.error('Error loading billing stats:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const openExternal = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const liveCards = [
        {
            label: "Today's billing",
            value: formatCurrency(todayStats.amount),
            detail: `${todayStats.count} invoices issued today`,
            icon: ShoppingBag,
            tone: 'from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/15 text-emerald-500',
        },
        {
            label: 'Pending sync',
            value: String(pendingQueueCount),
            detail: pendingQueueCount > 0 ? 'Needs billing review or retry' : 'Sync queue is clear',
            icon: Sparkles,
            tone: 'from-sky-500/15 via-sky-500/5 to-transparent border-sky-500/15 text-sky-500',
        },
        {
            label: 'Low stock',
            value: String(lowStock.length),
            detail: lowStock.length > 0 ? 'Items need restock planning' : 'Inventory looks healthy',
            icon: Package,
            tone: 'from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/15 text-amber-500',
        },
    ];

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            <Card glass className="relative overflow-hidden border-none bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_26%)] shadow-[var(--shadow-xl)]">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_45%)] pointer-events-none" />
                <div className="relative z-10 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="warning" className="px-3 py-1 text-[10px] uppercase tracking-[0.25em]">Not a loan app</Badge>
                            <Badge variant="primary" className="px-3 py-1 text-[10px] uppercase tracking-[0.25em]">Play Store aligned</Badge>
                            {selectedCompany?.name && (
                                <Badge variant="outline" className="px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
                                    {selectedCompany.name}
                                </Badge>
                            )}
                        </div>

                        <div className="space-y-4 max-w-3xl">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,var(--primary),#38bdf8)] text-white shadow-[0_18px_36px_rgba(14,165,233,0.22)]">
                                    <Store size={30} />
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.35em] text-[var(--primary)]">SYNCORA</p>
                                    <h1 className="text-3xl font-black tracking-[-0.04em] text-[var(--on-surface)] sm:text-4xl">
                                        Smart Calculator & GST Billing
                                    </h1>
                                </div>
                            </div>

                            <p className="max-w-2xl text-sm leading-7 text-[var(--on-surface-variant)] sm:text-base">
                                {LISTING_COPY}
                            </p>

                            <div className="rounded-[var(--radius-lg)] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-[var(--on-surface)] shadow-[var(--shadow-sm)]">
                                <div className="flex items-start gap-3">
                                    <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
                                    <div>
                                        <p className="font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">Important clarification</p>
                                        <p className="mt-1 leading-6 text-[var(--on-surface-variant)]">
                                            Any balance, due, or credit shown in this workspace refers only to user-maintained shop records and billing entries. This flow is for bookkeeping, invoices, and GST operations only.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button icon={<Play size={16} />} onClick={() => navigate('/create-invoice')} className="px-6 py-3 font-black uppercase tracking-[0.18em]">
                                Start Billing
                            </Button>
                            <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => openExternal(PLAY_STORE_URL)} className="px-6 py-3 font-black uppercase tracking-[0.18em]">
                                View Play Store
                            </Button>
                            <Button variant="outline" icon={<FileText size={16} />} onClick={() => navigate('/create-invoice')} className="px-6 py-3 font-black uppercase tracking-[0.18em]">
                                Create Invoice
                            </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            {liveCards.map((card) => {
                                const Icon = card.icon;
                                return (
                                    <div key={card.label} className={`rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.72))] p-4 shadow-[var(--shadow-sm)] dark:bg-[linear-gradient(180deg,rgba(15,22,35,0.9),rgba(15,22,35,0.7))] ${card.tone}`}>
                                        <div className="mb-4 flex items-center justify-between">
                                            <div className="rounded-2xl bg-white/70 p-3 shadow-[var(--shadow-xs)] dark:bg-white/10">
                                                <Icon size={18} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Live</span>
                                        </div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{card.label}</p>
                                        <h3 className="mt-2 text-2xl font-black tracking-tight text-[var(--on-surface)]">{card.value}</h3>
                                        <p className="mt-2 text-xs leading-5 text-[var(--on-surface-variant)]">{card.detail}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-[28px] border border-white/10 bg-[#071523] p-5 text-white shadow-[0_24px_48px_rgba(7,21,35,0.35)]">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/70">Desktop listing panel</p>
                                    <h2 className="mt-2 text-2xl font-black tracking-tight">SYNCORA</h2>
                                    <p className="mt-1 text-sm text-slate-300">Billing, invoices, ledger, and privacy controls based on the live Play Store listing.</p>
                                </div>
                                <div className="rounded-[22px] border border-white/10 bg-white/10 p-3 text-cyan-300 backdrop-blur">
                                    <Store size={24} />
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-3">
                                {listingStats.map((stat) => (
                                    <div key={stat.label} className="rounded-[20px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{stat.label}</p>
                                        <h3 className="mt-2 text-base font-black leading-tight text-white">{stat.value}</h3>
                                        <p className="mt-2 text-xs leading-5 text-slate-300">{stat.helper}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Card className="border-[var(--border)] bg-[var(--surface)]/90">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">App support</p>
                            <div className="mt-4 space-y-3 text-sm text-[var(--on-surface)]">
                                <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                                    <span className="inline-flex items-center gap-3"><Mail size={16} className="text-[var(--primary)]" /> {SUPPORT_EMAIL}</span>
                                    <ArrowRight size={14} className="text-[var(--text-muted)]" />
                                </a>
                                <a href={`tel:${SUPPORT_PHONE.replace(/\s+/g, '')}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                                    <span className="inline-flex items-center gap-3"><Phone size={16} className="text-[var(--primary)]" /> {SUPPORT_PHONE}</span>
                                    <ArrowRight size={14} className="text-[var(--text-muted)]" />
                                </a>
                                <button type="button" onClick={() => navigate(APP_INFO.trustCenterPath)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]">
                                    <span className="inline-flex items-center gap-3"><ShieldCheck size={16} className="text-[var(--primary)]" /> Trust center</span>
                                    <ArrowRight size={14} className="text-[var(--text-muted)]" />
                                </button>
                                <button type="button" onClick={() => navigate(APP_INFO.securityPath)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]">
                                    <span className="inline-flex items-center gap-3"><Lock size={16} className="text-[var(--primary)]" /> Security center</span>
                                    <ArrowRight size={14} className="text-[var(--text-muted)]" />
                                </button>
                                <button type="button" onClick={() => navigate(APP_INFO.accountDeletionPath)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]">
                                    <span className="inline-flex items-center gap-3"><Trash2 size={16} className="text-[var(--primary)]" /> Account deletion</span>
                                    <ArrowRight size={14} className="text-[var(--text-muted)]" />
                                </button>
                            </div>
                        </Card>
                    </div>
                </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {listingFeatures.map((feature) => {
                    const Icon = feature.icon;
                    return (
                        <Card key={feature.title} className="overflow-hidden border-[var(--border)] bg-[var(--surface)]/95">
                            <div className={`inline-flex rounded-[22px] border bg-gradient-to-br p-3 ${feature.tint}`}>
                                <Icon size={20} />
                            </div>
                            <h3 className="mt-5 text-lg font-black tracking-tight text-[var(--on-surface)]">{feature.title}</h3>
                            <p className="mt-3 text-sm leading-6 text-[var(--on-surface-variant)]">{feature.description}</p>
                        </Card>
                    );
                })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card className="border-[var(--border)] bg-[var(--surface)]/95">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Data safety</p>
                            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--on-surface)]">Privacy signals from the listing</h2>
                        </div>
                        <Badge variant="info" className="px-3 py-1 text-[10px] uppercase tracking-[0.22em]">User trust</Badge>
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                        {safetyHighlights.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.title} className="rounded-[22px] border border-[var(--border)] bg-[var(--background)]/80 p-4">
                                    <div className="inline-flex rounded-2xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]">
                                        <Icon size={18} />
                                    </div>
                                    <h3 className="mt-4 text-sm font-black tracking-tight text-[var(--on-surface)]">{item.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-[var(--on-surface-variant)]">{item.detail}</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--info-bg)] p-4 text-sm text-[var(--on-surface-variant)]">
                        The Play Store listing also says the app may collect personal info and financial info for functionality, while keeping deletion controls available to the user.
                    </div>
                </Card>

                <div className="space-y-6">
                    <Card className="border-[var(--border)] bg-[var(--surface)]/95">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">What's new</p>
                        <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--on-surface)]">Version 2.4.1 notes</h2>
                        <div className="mt-5 space-y-3">
                            {whatsNew.map((item) => (
                                <div key={item} className="flex items-start gap-3 rounded-2xl border border-[var(--border)] px-4 py-3">
                                    <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-[var(--success)]" />
                                    <p className="text-sm leading-6 text-[var(--on-surface-variant)]">{item}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="border-[var(--border)] bg-[linear-gradient(135deg,rgba(14,165,233,0.08),transparent_55%)]">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Counter actions</p>
                        <div className="mt-4 grid gap-3">
                            <button type="button" onClick={() => navigate('/create-invoice')} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-sm)]">
                                <span className="inline-flex items-center gap-3 text-sm font-black text-[var(--on-surface)]"><FileText size={16} className="text-[var(--primary)]" /> New GST invoice</span>
                                <ArrowRight size={14} className="text-[var(--primary)]" />
                            </button>
                            <button type="button" onClick={() => navigate('/ledgers')} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-sm)]">
                                <span className="inline-flex items-center gap-3 text-sm font-black text-[var(--on-surface)]"><Users size={16} className="text-[var(--primary)]" /> Customer ledger</span>
                                <ArrowRight size={14} className="text-[var(--primary)]" />
                            </button>
                            <button type="button" onClick={() => navigate('/stock')} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-sm)]">
                                <span className="inline-flex items-center gap-3 text-sm font-black text-[var(--on-surface)]"><Package size={16} className="text-[var(--primary)]" /> Inventory control</span>
                                <ArrowRight size={14} className="text-[var(--primary)]" />
                            </button>
                        </div>
                    </Card>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Live workbench</p>
                            <h2 className="mt-1 text-2xl font-black tracking-tight text-[var(--on-surface)]">Recent billing activity</h2>
                        </div>
                        <SafeLink to="/sales" className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)] hover:underline underline-offset-4">
                            Open sales
                        </SafeLink>
                    </div>

                    <Card padding="none" className="overflow-hidden border-[var(--border)] bg-[var(--surface)]/95">
                        {recentInvoices.length === 0 ? (
                            <EmptyState
                                icon={<Receipt />}
                                title={loading ? 'Loading billing activity' : 'No billing activity yet'}
                                description={loading ? 'Pulling the latest billing stream for this company.' : 'Start with an invoice or launch the SYNCORA handoff to begin.'}
                            />
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {recentInvoices.map((invoice) => {
                                    const invoiceTarget = invoice.status === 'synced' && invoice.id
                                        ? `/invoice/${encodeURIComponent(invoice.id)}`
                                        : `/vouchers/${encodeURIComponent(invoice.id)}`;

                                    return (
                                    <SafeLink
                                        key={invoice.id}
                                        to={invoiceTarget}
                                        state={{ voucher: invoice, from: '/billing' }}
                                        className="block transition-colors hover:bg-[var(--surface-hover)]"
                                    >
                                        <div className="flex items-center justify-between gap-4 p-5">
                                            <div className="flex items-center gap-4">
                                                <Avatar name={invoice.party_name || invoice.customerName || 'Unknown'} size="sm" />
                                                <div>
                                                    <p className="text-sm font-black tracking-tight text-[var(--on-surface)]">
                                                        {invoice.party_name || invoice.customerName || 'Unknown party'}
                                                    </p>
                                                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                        #{invoice.voucher_number || invoice.invoiceNumber || 'NEW'} on {format(new Date(invoice.voucher_date || invoice.date || invoice.created_at), 'd MMM, yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-[var(--on-surface)]">
                                                    {formatCurrency(Math.abs(Number(invoice.grand_total) || Number(invoice.total_amount) || 0))}
                                                </p>
                                                <Badge
                                                    variant={invoice.status === 'synced' ? 'success' : invoice.status === 'failed' ? 'error' : 'info'}
                                                    className="mt-2 border-none px-2 py-1 text-[9px] uppercase tracking-[0.18em]"
                                                >
                                                    {invoice.status === 'synced' ? 'Synced' : invoice.status === 'failed' ? 'Failed sync' : 'Pending sync'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </SafeLink>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-[var(--border)] bg-[var(--error-bg)]/70 shadow-none">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--error)]">Critical alerts</p>
                                <h2 className="mt-1 text-2xl font-black tracking-tight text-[var(--on-surface)]">Inventory watchlist</h2>
                            </div>
                            <div className="rounded-2xl bg-[var(--error)]/10 p-3 text-[var(--error)]">
                                <AlertCircle size={18} />
                            </div>
                        </div>

                        {lowStock.length === 0 ? (
                            <p className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-sm leading-6 text-[var(--on-surface-variant)]">
                                Inventory is healthy right now. No items are below the low-stock threshold.
                            </p>
                        ) : (
                            <div className="mt-6 space-y-3">
                                {lowStock.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-black tracking-tight text-[var(--on-surface)]">{item.name}</p>
                                                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--error)]">
                                                    Only {item.current_stock} {item.unit} left
                                                </p>
                                            </div>
                                            <Button size="sm" variant="danger" onClick={() => navigate('/stock')} className="font-black uppercase tracking-[0.18em]">
                                                Restock
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card className="border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,23,42,0.02),rgba(14,165,233,0.08))] dark:bg-[linear-gradient(135deg,rgba(15,22,35,0.9),rgba(14,165,233,0.12))]">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Why this view exists</p>
                        <p className="mt-3 text-sm leading-7 text-[var(--on-surface-variant)]">
                            This desktop page mirrors the Play Store positioning so operators can understand the product, launch it, review privacy posture, and continue billing work without leaving the PC workflow.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}



