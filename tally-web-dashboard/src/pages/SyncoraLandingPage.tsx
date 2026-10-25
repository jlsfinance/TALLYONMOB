import { useState } from 'react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';
import {
    ArrowRight, Menu, X, Rocket, RefreshCw, BarChart3, Lightbulb,
    ThumbsUp, Megaphone, Sparkles, BookOpen, HelpCircle, Bell,
    MessageCircle, ChevronRight, Building2
} from 'lucide-react';

// SYNCORA — community landing page (sections only, no backend features):
// hero, explore categories, discussions preview, footer. Static by design.

const NAV_LINKS = [
    { label: 'Community', href: '#community' },
    { label: 'Discussions', href: '#discussions' },
    { label: 'Product Updates', href: '#community' },
    { label: 'Feature Requests', href: '#community' },
    { label: 'Learn', href: '#community' },
    { label: 'Events', href: '#community' },
];

const CATEGORIES = [
    { icon: Rocket, name: 'Getting Started', desc: 'Setup, installation and onboarding — get Tally on Mobile running in minutes.', accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', glow: 'group-hover:border-emerald-500/40' },
    { icon: RefreshCw, name: 'Tally Sync & Connectivity', desc: 'Sync status, connection troubleshooting and keeping your data flowing.', accent: 'text-sky-400 bg-sky-500/10 border-sky-500/25', glow: 'group-hover:border-sky-500/40' },
    { icon: BarChart3, name: 'Accounting & Reports', desc: 'Ledgers, vouchers, outstanding balances, sales and financial reports.', accent: 'text-violet-400 bg-violet-500/10 border-violet-500/25', glow: 'group-hover:border-violet-500/40' },
    { icon: Lightbulb, name: 'Tips & Tutorials', desc: 'Practical guides, workflows and best practices from real users.', accent: 'text-amber-400 bg-amber-500/10 border-amber-500/25', glow: 'group-hover:border-amber-500/40' },
    { icon: ThumbsUp, name: 'Feature Requests', desc: 'Suggest improvements, vote on ideas and shape what gets built.', accent: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/25', glow: 'group-hover:border-fuchsia-500/40' },
    { icon: Megaphone, name: 'Announcements', desc: 'Product releases, maintenance updates and important news.', accent: 'text-rose-400 bg-rose-500/10 border-rose-500/25', glow: 'group-hover:border-rose-500/40' },
];

const SAMPLE_POSTS = [
    { author: 'Ramesh', initial: 'R', role: 'Business Owner', category: 'Tally Sync', categoryColor: 'bg-sky-500/15 text-sky-400 border-sky-500/25', title: 'How do I keep my idle PC syncing when Tally is minimised?', excerpt: 'The sync stops after a while if I keep Tally in the background. Any tips to keep it running?', time: '2 hours ago', icon: HelpCircle },
    { author: 'Ankit', initial: 'A', role: 'Accountant', category: 'Accounting', categoryColor: 'bg-violet-500/15 text-violet-400 border-violet-500/25', title: 'Checking outstanding balances of a party from the phone', excerpt: 'Need a quick workflow while travelling — without touching the office PC.', time: '5 hours ago', icon: MessageCircle },
    { author: 'Priya', initial: 'P', role: 'Member', category: 'Announcement', categoryColor: 'bg-rose-500/15 text-rose-400 border-rose-500/25', title: 'Favourite feature of the latest release?', excerpt: 'Share what improved your workflow this month — curious what everyone uses most.', time: '1 day ago', icon: Bell },
    { author: 'Dev', initial: 'D', role: 'Business Owner', category: 'Tips', categoryColor: 'bg-amber-500/15 text-amber-400 border-amber-500/25', title: 'End-of-day routine that keeps my books clean', excerpt: 'Three quick checks I run before closing shop — syncing ledgers and invoices.', time: '2 days ago', icon: BookOpen },
];

function SyncoraLogo({ size = 30 }: { size?: number }) {
    return (
        <span className="flex items-center gap-2.5" aria-label="SYNCORA">
            <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="16" cy="6" r="3.4" fill="#8B5CF6" />
                <circle cx="6" cy="24" r="3.4" fill="#38BDF8" />
                <circle cx="26" cy="24" r="3.4" fill="#8B5CF6" />
                <path d="M16 9.5V15M16 15l-7.6 6.4M16 15l7.6 6.4" stroke="url(#sncg)" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="16" cy="16.4" r="2" fill="#E2E8F0" />
                <defs>
                    <linearGradient id="sncg" x1="6" y1="6" x2="26" y2="26">
                        <stop stopColor="#38BDF8" /><stop offset="1" stopColor="#8B5CF6" />
                    </linearGradient>
                </defs>
            </svg>
            <span className="text-[15px] font-black tracking-[0.28em] text-white">SYNCORA</span>
        </span>
    );
}

function SyncoraLandingPage() {
    const [menuOpen, setMenuOpen] = useState(false);
    const goLogin = () => { window.location.href = '/login'; };

    const schema = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                name: 'SYNCORA',
                alternateName: 'SYNCORA Community',
                url: 'https://tallyonmob.vercel.app/',
                description: 'SYNCORA is the official community for Tally on Mobile (TallyLink) — free Tally cloud sync, help, discussions and product updates.',
                inLanguage: 'en',
            },
            {
                '@type': 'Organization',
                name: 'SYNCORA',
                url: 'https://tallyonmob.vercel.app/',
                slogan: 'Your Tally. Connected. Everywhere.',
                description: 'Community hub for Tally on Mobile: discussions, feature requests, learning guides and announcements for Tally users.',
            },
        ],
    };

    return (
        <div className="min-h-screen bg-[#070D1A] text-slate-300 antialiased">
            <SEO
                title="SYNCORA — Free Tally Community for Tally on Mobile (TallyLink)"
                description="SYNCORA is the official community for Tally on Mobile. Get free Tally help, sync tips, product updates, feature requests and learning guides. Your Tally, connected everywhere — free forever."
                keywords="free tally, free tally software, free tallyonmobile, free tally on mobile, tallyonmob, tallylink community, syncora, tally community help, tally mobile app free, tally cloud sync free, tallyprime mobile access, tally help forum, tally discussions, tally feature requests, tally tutorials, free gst reports tally"
                ogTitle="SYNCORA — Your Tally Community. All Connected."
                ogDescription="The community for Tally on Mobile users: get help, share ideas, request features and learn — free forever."
                schema={schema}
            />
            {/* NAV */}
            <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070D1A]/85 backdrop-blur-xl">
                <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Primary">
                    <a href="#top" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"><SyncoraLogo /></a>
                    <ul className="hidden items-center gap-7 lg:flex">
                        {NAV_LINKS.map(l => (
                            <li key={l.label}>
                                <a href={l.href} className="text-[13px] font-semibold text-slate-400 transition-colors hover:text-white rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">{l.label}</a>
                            </li>
                        ))}
                    </ul>
                    <div className="hidden items-center gap-3 lg:flex">
                        <button onClick={goLogin} className="rounded-lg px-3 py-2 text-[13px] font-bold text-slate-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">Log In</button>
                        <button onClick={goLogin} className="group flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 px-4 py-2 text-[13px] font-bold text-white shadow-lg shadow-violet-950/40 transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                            Join Community <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                        </button>
                    </div>
                    <button className="rounded-lg border border-white/10 p-2 text-slate-300 lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                        {menuOpen ? <X size={19} /> : <Menu size={19} />}
                    </button>
                </nav>
                {/* mobile drawer */}
                {menuOpen && (
                    <div className="border-t border-white/5 bg-[#0A1120] px-4 py-4 lg:hidden">
                        <ul className="space-y-1">
                            {NAV_LINKS.map(l => (
                                <li key={l.label}>
                                    <a href={l.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">{l.label}</a>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button onClick={goLogin} className="rounded-lg border border-white/10 py-2.5 text-sm font-bold text-slate-200">Log In</button>
                            <button onClick={goLogin} className="rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 py-2.5 text-sm font-bold text-white">Join Community</button>
                        </div>
                    </div>
                )}
            </header>

            <main id="top">
                {/* HERO */}
                <section className="relative overflow-hidden">
                    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                        <div className="absolute -top-32 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[130px]" />
                        <div className="absolute top-40 -right-40 h-[380px] w-[500px] rounded-full bg-sky-600/10 blur-[120px]" />
                    </div>

                    <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pb-24 lg:pt-20">
                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-300">
                                <Sparkles size={12} /> Community for Tally on Mobile
                            </span>
                            <h1 className="mt-5 text-4xl font-black leading-tight text-white sm:text-5xl">
                                Your Tally Community.<br />
                                All <span className="bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">Connected.</span>
                            </h1>
                            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-400">
                                Welcome to SYNCORA — the community for Tally on Mobile users. Discover insights, get help,
                                share ideas and stay connected with your business data from anywhere.
                            </p>
                            <div className="mt-7 flex flex-wrap items-center gap-3">
                                <button onClick={goLogin} className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-950/50 transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                                    Join the Community <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <a href="#discussions" className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-slate-200 transition-colors hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                                    Explore Discussions
                                </a>
                            </div>
                            <p className="mt-6 flex items-center gap-2 text-[12px] text-slate-500">
                                <Building2 size={14} className="text-slate-500" /> Built for business owners, accountants and Tally professionals.
                            </p>
                        </motion.div>

                        {/* hero visual: desktop dashboard + phone, connected */}
                        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.15 }} className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
                            <svg className="absolute left-6 top-10 z-0 h-[70%] w-[75%]" viewBox="0 0 300 200" fill="none">
                                <path d="M40 20 C 80 80, 140 60, 150 100" stroke="#8B5CF6" strokeOpacity=".35" strokeWidth="1.4" strokeDasharray="4 5" />
                                <path d="M250 60 C 210 110, 180 90, 160 110" stroke="#38BDF8" strokeOpacity=".35" strokeWidth="1.4" strokeDasharray="4 5" />
                            </svg>

                            {/* desktop dashboard mock */}
                            <div className="relative z-10 rounded-2xl border border-white/10 bg-[#0B1424] shadow-2xl shadow-black/50">
                                <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" /><span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                                    <span className="ml-3 h-1.5 w-32 rounded-full bg-white/10" />
                                </div>
                                <div className="p-4">
                                    <div className="flex gap-4">
                                        <div className="hidden w-24 shrink-0 space-y-2 sm:block">
                                            {['Ledgers', 'Vouchers', 'Reports'].map(t => (
                                                <div key={t} className="rounded-md bg-white/5 px-2 py-1.5 text-[9px] font-bold text-slate-400">{t}</div>
                                            ))}
                                            <div className="rounded-md bg-violet-500/15 px-2 py-1.5 text-[9px] font-bold text-violet-300">Dashboard</div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="grid grid-cols-3 gap-2">
                                                {[['Sales', 'emerald'], ['Receipts', 'sky'], ['Balance', 'violet']].map(([t, c]) => (
                                                    <div key={t} className="rounded-lg border border-white/5 bg-white/5 p-2">
                                                        <p className={`text-[8px] font-bold ${c === 'Sales' ? 'text-emerald-400' : c === 'Receipts' ? 'text-sky-400' : 'text-violet-400'}`}>{t}</p>
                                                        <div className="mt-1.5 h-2 w-3/4 rounded-full bg-white/15" />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex h-16 items-end gap-1.5 rounded-lg border border-white/5 bg-white/5 p-2">
                                                {[38, 55, 30, 70, 45, 62, 80, 52, 68, 42, 76, 58].map((h, i) => (
                                                    <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-violet-600/50 to-sky-500/60" style={{ height: `${h}%` }} />
                                                ))}
                                            </div>
                                            <div className="mt-2 space-y-1.5">
                                                <div className="h-2 w-full rounded-full bg-white/8" />
                                                <div className="h-2 w-5/6 rounded-full bg-white/5" />
                                                <div className="h-2 w-2/3 rounded-full bg-white/5" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* phone mock */}
                            <div className="absolute -bottom-8 right-0 z-20 w-28 rounded-[20px] border border-white/15 bg-[#0B1424] p-2 shadow-2xl shadow-black/60 sm:-right-4 sm:w-32">
                                <div className="mx-auto mb-1.5 h-1 w-8 rounded-full bg-white/20" />
                                <div className="rounded-xl bg-white/5 p-2">
                                    <p className="text-[8px] font-bold text-slate-400">Today</p>
                                    <p className="text-[10px] font-black text-white">₹ 1,84,200</p>
                                    <div className="mt-1.5 flex h-10 items-end gap-1">
                                        {[40, 70, 50, 85, 60].map((h, i) => (
                                            <div key={i} className="flex-1 rounded-sm bg-sky-500/50" style={{ height: `${h}%` }} />
                                        ))}
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        <div className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-400" /> <span className="h-1.5 flex-1 rounded-full bg-white/10" /></div>
                                        <div className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-400" /> <span className="h-1.5 flex-1 rounded-full bg-white/5" /></div>
                                        <div className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-amber-400" /> <span className="h-1.5 w-1/2 rounded-full bg-white/5" /></div>
                                    </div>
                                </div>
                            </div>

                            {/* floating chips */}
                            <motion.div animate={{ y: [0, -7, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} className="absolute left-0 top-2 z-20 rounded-lg border border-emerald-500/25 bg-[#0B1424]/95 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 shadow-lg">
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sync complete
                            </motion.div>
                            <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }} className="absolute right-2 top-24 z-20 rounded-lg border border-sky-500/25 bg-[#0B1424]/95 px-2.5 py-1.5 text-[10px] font-bold text-sky-400 shadow-lg">
                                Connected everywhere
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                {/* EXPLORE THE COMMUNITY */}
                <section id="community" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-white sm:text-3xl">Explore the Community</h2>
                        <p className="mt-2 max-w-xl text-sm text-slate-400">Six spaces to set up, sync, learn and help shape Tally on Mobile.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {CATEGORIES.map((c, i) => (
                            <motion.button
                                key={c.name}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.4, delay: i * 0.06 }}
                                className={`group rounded-2xl border border-white/10 bg-[#0B1424] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${c.glow.replace('border', '') ? '' : ''}`}
                                style={{ borderImage: 'none' }}
                                onClick={goLogin}
                            >
                                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${c.accent} ${c.glow} transition-colors`}>
                                    <c.icon size={18} />
                                </div>
                                <h3 className="mt-3.5 text-[15px] font-black text-white">{c.name}</h3>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{c.desc}</p>
                                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 transition-colors group-hover:text-violet-300">
                                    Browse category <ChevronRight size={12} />
                                </span>
                            </motion.button>
                        ))}
                    </div>
                </section>

                {/* DISCUSSIONS PREVIEW */}
                <section id="discussions" className="border-y border-white/5 bg-[#081020] scroll-mt-20">
                    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
                        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h2 className="text-2xl font-black text-white sm:text-3xl">Latest Discussions</h2>
                                <p className="mt-2 text-sm text-slate-400">A taste of what's being talked about.
                                    <span className="ml-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 align-middle">preview sample</span>
                                </p>
                            </div>
                            <button onClick={goLogin} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-bold text-slate-200 transition-colors hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                                Open Community <ArrowRight size={14} />
                            </button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {SAMPLE_POSTS.map((p, i) => (
                                <motion.div
                                    key={p.title}
                                    initial={{ opacity: 0, y: 14 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-60px' }}
                                    transition={{ duration: 0.4, delay: i * 0.07 }}
                                    className="rounded-2xl border border-white/10 bg-[#0B1424] p-5 transition-colors hover:border-white/20"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-sky-600 text-[11px] font-black text-white">{p.initial}</span>
                                        <div className="min-w-0">
                                            <p className="truncate text-[12px] font-bold text-slate-200">{p.author} <span className="font-medium text-slate-500">· {p.role}</span></p>
                                            <p className="text-[10px] text-slate-500">{p.time}</p>
                                        </div>
                                        <span className={`ml-auto whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${p.categoryColor}`}>{p.category}</span>
                                    </div>
                                    <h3 className="mt-3 text-[14px] font-black leading-snug text-white">{p.title}</h3>
                                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">{p.excerpt}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
                    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
                        <h2 className="text-2xl font-black text-white sm:text-3xl">Join SYNCORA today</h2>
                        <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">Ask questions, share what works and stay in the loop — your Tally, connected everywhere.</p>
                        <button onClick={goLogin} className="group mx-auto mt-7 flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-950/50 transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                            Join the Community <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                        </button>
                    </motion.div>
                </section>
            </main>

            {/* FOOTER */}
            <footer className="border-t border-white/5 bg-[#081020]">
                <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
                    <div>
                        <SyncoraLogo />
                        <p className="mt-3 max-w-xs text-[12.5px] leading-relaxed text-slate-500">Your Tally. Connected. Everywhere. The community hub for the Tally on Mobile ecosystem.</p>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Community</h4>
                        <ul className="mt-3 space-y-2 text-[13px]">
                            {['About SYNCORA', 'Community Guidelines', 'Events'].map(t => (
                                <li key={t}><a href="#top" className="text-slate-500 transition-colors hover:text-white">{t}</a></li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Support</h4>
                        <ul className="mt-3 space-y-2 text-[13px]">
                            {['Help Center', 'Contact Support'].map(t => (
                                <li key={t}><a href="#top" className="text-slate-500 transition-colors hover:text-white">{t}</a></li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Legal</h4>
                        <ul className="mt-3 space-y-2 text-[13px]">
                            {['Privacy Policy', 'Terms of Service'].map(t => (
                                <li key={t}><a href="/privacy" className="text-slate-500 transition-colors hover:text-white">{t}</a></li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="border-t border-white/5 px-4 py-5 text-center sm:px-6">
                    <p className="text-[11px] text-slate-600">© {new Date().getFullYear()} SYNCORA · Community for Tally on Mobile · Not a replacement for Tally accounting software.</p>
                </div>
            </footer>
        </div>
    );
}

export default SyncoraLandingPage;
