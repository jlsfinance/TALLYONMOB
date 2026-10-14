import { useState } from 'react';
import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    BookOpen,
    Check,
    ChevronDown,
    Cloud,
    FileText,
    Lock,
    Menu,
    MessageCircle,
    Monitor,
    Package,
    RefreshCw,
    Receipt,
    ShieldCheck,
    Smartphone,
    Users,
    X,
} from 'lucide-react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import SEO from '../components/common/SEO';

const NAV_LINKS = [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#workflow' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'FAQs', href: '#faq' },
];

const FEATURES = [
    {
        icon: BarChart3,
        eyebrow: 'BUSINESS OVERVIEW',
        title: 'See the numbers that matter',
        description: 'Review sales, purchases, balances and business reports using company data synced from Tally.',
        route: '/dashboard',
        link: 'Explore dashboard',
        accent: 'emerald',
    },
    {
        icon: BookOpen,
        eyebrow: 'LEDGERS & OUTSTANDING',
        title: 'Follow balances and ledgers',
        description: 'Open ledger statements, review party balances and find receivables that need attention.',
        route: '/ledgers',
        link: 'View ledgers',
        accent: 'blue',
    },
    {
        icon: Receipt,
        eyebrow: 'VOUCHERS',
        title: 'Work with day-to-day entries',
        description: 'Review synced vouchers and use the existing web workspace to create or edit supported entries.',
        route: '/vouchers',
        link: 'Browse vouchers',
        accent: 'violet',
    },
    {
        icon: MessageCircle,
        eyebrow: 'COLLECTIONS',
        title: 'Prepare payment follow-ups',
        description: 'Select outstanding parties, preview a message and share it using WhatsApp, email or your device’s share sheet.',
        route: '/payment-reminders',
        link: 'Open reminders',
        accent: 'amber',
    },
    {
        icon: Package,
        eyebrow: 'INVENTORY',
        title: 'Keep stock in view',
        description: 'Review synced stock items and inventory summaries alongside your accounting records.',
        route: '/stock',
        link: 'View inventory',
        accent: 'cyan',
    },
    {
        icon: RefreshCw,
        eyebrow: 'TALLY CONNECTION',
        title: 'Move selected entries back to Tally',
        description: 'Use the Tally Sync workspace to check the local connection and export selected vouchers when Tally is reachable.',
        route: '/tally-sync',
        link: 'See sync workspace',
        accent: 'rose',
    },
];

const FLOW_STEPS = [
    {
        number: '01',
        icon: Monitor,
        title: 'Connect your Tally computer',
        description: 'Run the Windows sync client beside Tally and configure the company connection.',
    },
    {
        number: '02',
        icon: Cloud,
        title: 'Sync company records',
        description: 'The existing sync service transfers accounting records to the configured cloud database.',
    },
    {
        number: '03',
        icon: Smartphone,
        title: 'Sign in where you work',
        description: 'Use your account to access the web dashboard and supported mobile experience.',
    },
];

const FAQS = [
    {
        question: 'Which Tally versions does SYNCORA work with?',
        answer: 'The project documents compatibility with TallyPrime and Tally.ERP 9. Your local Tally installation and sync client need to be configured before synced data appears.',
    },
    {
        question: 'Does this landing page change my account or accounting data?',
        answer: 'No. This page only explains the product and links to existing screens. Sign-in, company access, the database and the sync API continue to use the current application flows.',
    },
    {
        question: 'Can I send a payment reminder automatically?',
        answer: 'The current reminders workspace lets you select parties, preview a message and open a share action such as WhatsApp or email. Scheduled, unattended delivery is not advertised here.',
    },
    {
        question: 'Can I create official GST e-invoices or e-way bills here?',
        answer: 'The app includes GST and e-way bill screens, but a live government gateway/IRN issuance flow is not confirmed by the current implementation. Please verify the workflow before relying on it for statutory filing.',
    },
];

const ACCENT_STYLES: Record<string, { icon: string; label: string }> = {
    emerald: { icon: 'bg-emerald-50 text-emerald-700', label: 'text-emerald-700' },
    blue: { icon: 'bg-blue-50 text-blue-700', label: 'text-blue-700' },
    violet: { icon: 'bg-violet-50 text-violet-700', label: 'text-violet-700' },
    amber: { icon: 'bg-amber-50 text-amber-700', label: 'text-amber-700' },
    cyan: { icon: 'bg-cyan-50 text-cyan-700', label: 'text-cyan-700' },
    rose: { icon: 'bg-rose-50 text-rose-700', label: 'text-rose-700' },
};

function DashboardPreview() {
    return (
        <div className="relative mx-auto w-full max-w-[560px]">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-emerald-200/70 via-cyan-100/50 to-lime-100/60 blur-2xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-[0_28px_90px_-36px_rgba(15,23,42,0.28)] sm:p-5">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black tracking-tight text-white">TL</div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">Company overview</p>
                            <p className="text-xs text-slate-500">Illustrative workspace</p>
                        </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 sm:px-3 sm:text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sync status
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 py-4 sm:gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>Sales</span><BarChart3 size={15} className="text-emerald-700" /></div>
                        <p className="mt-2 text-lg font-black tracking-tight text-slate-900 sm:text-2xl">₹12.8L</p>
                        <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Example figure</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>Receivables</span><Activity size={15} className="text-amber-600" /></div>
                        <p className="mt-2 text-lg font-black tracking-tight text-slate-900 sm:text-2xl">₹4.2L</p>
                        <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Example figure</p>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 p-3 sm:p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold text-slate-900 sm:text-sm">Sales at a glance</p>
                            <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">Illustrative chart, not live company data</p>
                        </div>
                        <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600">Overview</span>
                    </div>
                    <div className="flex h-24 items-end gap-2 sm:h-28 sm:gap-3" aria-hidden="true">
                        {[34, 49, 42, 69, 57, 82, 65, 93, 74, 100, 82, 90].map((height, index) => (
                            <div key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-600 to-lime-400" style={{ height: `${height}%`, opacity: 0.62 + (index % 3) * 0.12 }} />
                        ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[9px] text-slate-400 sm:text-[10px]">
                        <span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50/70 p-3">
                        <ShieldCheck size={16} className="shrink-0 text-emerald-700" />
                        <span className="text-[10px] font-semibold text-slate-700 sm:text-xs">Company access controls</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-blue-50/70 p-3">
                        <Users size={16} className="shrink-0 text-blue-700" />
                        <span className="text-[10px] font-semibold text-slate-700 sm:text-xs">Team-ready workspace</span>
                    </div>
                </div>
            </div>
            <div className="relative mt-2 text-center text-[10px] text-slate-500 sm:absolute sm:-bottom-7 sm:right-1 sm:mt-0 sm:text-right">
                Example values shown for illustration only.
            </div>
        </div>
    );
}

export default function LandingPage() {
    const { navigate } = useSafeNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const followNav = (href: string) => {
        setMobileMenuOpen(false);
        if (href.startsWith('#')) {
            document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            navigate(href);
        }
    };

    return (
        <div id="top" className="min-h-screen overflow-x-hidden bg-[#f7f9f6] font-sans text-slate-900 selection:bg-emerald-200 selection:text-emerald-950">
            <SEO
                title="SYNCORA | Your Tally business, in view"
                description="Access Tally ledgers, vouchers, reports and outstanding balances through SYNCORA's web and mobile workspace."
            />
            <a href="#main-content" className="sr-only z-[100] rounded-lg bg-white px-4 py-2 text-slate-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
                Skip to content
            </a>

            <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
                <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                    <a href="#top" aria-label="SYNCORA home" className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm">SY</span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-black tracking-tight text-slate-950 sm:text-base">SYNCORA</span>
                            <span className="hidden text-[9px] font-bold uppercase tracking-[0.19em] text-slate-500 sm:block">Business, in view</span>
                        </span>
                    </a>

                    <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
                        {NAV_LINKS.map(link => (
                            <button key={link.label} type="button" onClick={() => followNav(link.href)} className="text-sm font-semibold text-slate-600 transition-colors hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
                                {link.label}
                            </button>
                        ))}
                    </nav>

                    <div className="hidden items-center gap-3 md:flex">
                        <button type="button" onClick={() => navigate('/login')} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">Log in</button>
                        <button type="button" onClick={() => navigate('/login')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                            Get started <ArrowRight size={16} />
                        </button>
                    </div>

                    <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden"
                        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                        aria-expanded={mobileMenuOpen}
                        aria-controls="mobile-navigation"
                        onClick={() => setMobileMenuOpen(open => !open)}
                    >
                        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
                {mobileMenuOpen && (
                    <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-slate-100 bg-white px-4 py-3 md:hidden">
                        <div className="mx-auto flex max-w-7xl flex-col gap-1">
                            {NAV_LINKS.map(link => (
                                <button key={link.label} type="button" onClick={() => followNav(link.href)} className="rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    {link.label}
                                </button>
                            ))}
                            <button type="button" onClick={() => { setMobileMenuOpen(false); navigate('/login'); }} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">
                                Log in / Get started <ArrowRight size={16} />
                            </button>
                        </div>
                    </nav>
                )}
            </header>

            <main id="main-content">
                <section className="relative isolate overflow-hidden border-b border-slate-200/70 bg-gradient-to-br from-[#f5fbf5] via-white to-[#eef8f5]">
                    <div className="pointer-events-none absolute -right-28 -top-32 -z-10 h-96 w-96 rounded-full bg-emerald-200/30 blur-3xl" aria-hidden="true" />
                    <div className="pointer-events-none absolute -bottom-44 left-0 -z-10 h-96 w-96 rounded-full bg-cyan-100/60 blur-3xl" aria-hidden="true" />
                    <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
                        <div className="max-w-2xl">
                            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3.5 py-2 text-xs font-bold text-emerald-900 shadow-sm">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100"><Check size={12} /></span>
                                Made for businesses using Tally
                            </div>
                            <h1 className="max-w-[12ch] text-[2.8rem] font-black leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[4.25rem]">
                                Your Tally business, <span className="text-emerald-700">in view.</span>
                            </h1>
                            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                                Check ledgers, vouchers, reports and outstanding balances from the web dashboard and supported mobile app, using records synced from your Tally company.
                            </p>
                            <p className="mt-3 text-xs font-semibold text-slate-500">For TallyPrime and Tally.ERP 9 workflows</p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <button type="button" onClick={() => navigate('/login')} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(4,120,87,0.75)] transition hover:-translate-y-0.5 hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                                    Sign in or create an account <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <button type="button" onClick={() => followNav('#workflow')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                                    See how it works <ChevronDown size={16} />
                                </button>
                            </div>
                            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-semibold text-slate-600">
                                <span className="inline-flex items-center gap-2"><Monitor size={15} className="text-emerald-700" /> Web dashboard</span>
                                <span className="inline-flex items-center gap-2"><Smartphone size={15} className="text-emerald-700" /> Mobile access</span>
                                <span className="inline-flex items-center gap-2"><Lock size={15} className="text-emerald-700" /> Account-based access</span>
                            </div>
                        </div>
                        <DashboardPreview />
                    </div>
                </section>

                <section id="features" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="mx-auto max-w-7xl">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">A connected view of your books</p>
                            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">The everyday details, easier to reach</h2>
                            <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">Explore the workspaces already available in SYNCORA. Sign-in and company permissions still apply.</p>
                        </div>
                        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map(feature => {
                                const Icon = feature.icon;
                                const styles = ACCENT_STYLES[feature.accent];
                                return (
                                    <article key={feature.title} className="group flex min-h-[248px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_-24px_rgba(15,23,42,0.55)] transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_48px_-34px_rgba(15,23,42,0.45)] sm:p-6">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${styles.icon}`}><Icon size={20} /></span>
                                            <span className={`pt-1 text-[9px] font-black tracking-[0.15em] ${styles.label}`}>{feature.eyebrow}</span>
                                        </div>
                                        <h3 className="mt-5 text-lg font-extrabold tracking-tight text-slate-950">{feature.title}</h3>
                                        <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{feature.description}</p>
                                        <button type="button" onClick={() => navigate(feature.route)} className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-bold text-slate-900 transition group-hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                                            {feature.link}<ArrowUpRight size={15} />
                                        </button>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section id="workflow" className="scroll-mt-24 border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="mx-auto max-w-7xl">
                        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">A straightforward setup</p>
                                <h2 className="mt-3 max-w-lg text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">From your Tally computer to your day-to-day view</h2>
                            </div>
                            <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">SYNCORA uses its existing sync client, cloud services and signed-in app experience. Sync timing depends on your configured client and connection.</p>
                        </div>
                        <div className="mt-10 grid gap-4 md:grid-cols-3">
                            {FLOW_STEPS.map((step, index) => {
                                const Icon = step.icon;
                                return (
                                    <article key={step.number} className="relative rounded-2xl border border-slate-200 bg-[#fbfcfa] p-5 sm:p-6">
                                        {index < FLOW_STEPS.length - 1 && <div className="absolute right-[-17px] top-10 z-10 hidden h-px w-8 bg-emerald-300 md:block" aria-hidden="true" />}
                                        <div className="flex items-center justify-between">
                                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><Icon size={20} /></span>
                                            <span className="text-xs font-black tracking-[0.18em] text-slate-400">{step.number}</span>
                                        </div>
                                        <h3 className="mt-5 text-base font-extrabold text-slate-950">{step.title}</h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                                    </article>
                                );
                            })}
                        </div>
                        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl bg-slate-950 px-5 py-5 text-white sm:flex-row sm:items-center sm:px-7">
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10"><RefreshCw size={17} className="text-emerald-300" /></span>
                                <div>
                                    <p className="text-sm font-bold">Already have an account?</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-300">Check the existing sync workspace and company setup after signing in.</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => navigate('/login')} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-50">
                                Go to sign in <ArrowRight size={15} />
                            </button>
                        </div>
                    </div>
                </section>

                <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[2rem] bg-emerald-900 px-6 py-8 text-white sm:px-10 sm:py-10 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14">
                        <div className="max-w-2xl">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Choose at your pace</p>
                            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Want to compare plans?</h2>
                            <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/85">The existing pricing page is the source of truth for current plans and subscription actions.</p>
                        </div>
                        <button type="button" onClick={() => navigate('/pricing')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                            See plans <ArrowRight size={16} />
                        </button>
                    </div>
                </section>

                <section id="faq" className="scroll-mt-24 border-t border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">Helpful to know</p>
                            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Questions, answered plainly</h2>
                            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">We keep product information aligned with what the current application actually supports.</p>
                        </div>
                        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-[#fbfcfa] px-5 sm:px-6">
                            {FAQS.map(item => (
                                <details key={item.question} className="group py-4">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 text-sm font-bold text-slate-900 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 sm:text-base">
                                        {item.question}
                                        <ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                                    </summary>
                                    <p className="max-w-3xl pb-2 pr-8 pt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <footer className="bg-slate-950 px-4 py-10 text-white sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
                    <div className="max-w-sm">
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-xs font-black text-slate-950">SY</span>
                            <span className="text-sm font-black tracking-tight">SYNCORA</span>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">A connected view of your Tally business records, with your existing account and company access controls.</p>
                    </div>
                    <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-slate-300">
                        <button type="button" onClick={() => navigate('/pricing')} className="hover:text-white">Pricing</button>
                        <button type="button" onClick={() => navigate('/support')} className="hover:text-white">Support</button>
                        <button type="button" onClick={() => navigate('/privacy')} className="hover:text-white">Privacy</button>
                        <button type="button" onClick={() => navigate('/terms')} className="hover:text-white">Terms</button>
                    </nav>
                </div>
                <div className="mx-auto mt-8 max-w-7xl border-t border-white/10 pt-5 text-[10px] text-slate-500">Tally and TallyPrime are trademarks of their respective owners. SYNCORA is an independent product experience.</div>
            </footer>
        </div>
    );
}
