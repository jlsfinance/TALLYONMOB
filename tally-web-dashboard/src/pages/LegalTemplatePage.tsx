import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mail, Phone, ExternalLink, Menu, X, ChevronRight, BookOpen, Scale } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { LEGAL_CONTENT } from '../data/legalContent';
import SEO from '../components/common/SEO';

export default function LegalTemplatePage() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const page = slug ? LEGAL_CONTENT[slug] : null;
    const [activeArticle, setActiveArticle] = useState(0);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        window.scrollTo(0, 0);
        if (slug && !LEGAL_CONTENT[slug]) {
            navigate('/');
        }
    }, [slug, navigate]);

    if (!page) return null;

    return (
        <div className="min-h-screen bg-[#030712] text-slate-300 selection:bg-cyan-500/30 font-sans selection:text-white">
            <SEO
                title={`${page.title} | TallyLink Legal Portal`}
                description={page.executiveSummary}
                canonical={`https://tallyonmob.vercel.app/legal/${slug}`}
                schema={{
                    "@context": "https://schema.org",
                    "@type": "Article",
                    "headline": page.title,
                    "description": page.executiveSummary,
                    "dateModified": page.lastUpdated,
                    "author": {
                        "@type": "Organization",
                        "name": "TallyLink Technologies"
                    }
                }}
            />
            {/* Ultra-Premium Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-white/5 bg-black/40 backdrop-blur-2xl">
                <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4 cursor-pointer group" onClick={() => navigate('/')}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-110 transition-transform duration-500">
                            <div className="text-white transform group-hover:rotate-12 transition-transform">{page.icon}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-xl tracking-tighter uppercase italic text-white leading-none">TallyLink</span>
                            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-cyan-500/80">Legal Portal</span>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-3">
                        <button
                            onClick={() => navigate('/login')}
                            className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                        >
                            Client Login
                        </button>
                    </div>

                    <button className="md:hidden p-2 text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                        {isMobileMenuOpen ? <X /> : <Menu />}
                    </button>
                </div>
            </nav>

            {/* Layout Grid */}
            <div className="max-w-[1400px] mx-auto px-6 pt-32 pb-20 flex flex-col md:flex-row gap-12">

                {/* Table of Contents - Sidebar */}
                <aside className="w-full md:w-80 shrink-0">
                    <div className="sticky top-32 space-y-8">
                        <div>
                            <div className="flex items-center gap-2 mb-6 text-white px-4">
                                <BookOpen size={16} className="text-cyan-500" />
                                <span className="text-xs font-black uppercase tracking-widest">Table of Contents</span>
                            </div>
                            <nav className="space-y-1">
                                {page.articles.map((article, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setActiveArticle(idx);
                                            const element = document.getElementById(`article-${idx}`);
                                            element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }}
                                        className={`w-full text-left px-5 py-4 rounded-2xl text-sm font-bold transition-all duration-300 flex items-center justify-between group ${activeArticle === idx
                                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-500/5'
                                            : 'hover:bg-white/5 border border-transparent text-slate-500'
                                            }`}
                                    >
                                        <span className="truncate pr-4">{article.title}</span>
                                        <ChevronRight size={14} className={`shrink-0 transition-transform ${activeArticle === idx ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-white/5">
                            <h4 className="text-white font-bold text-sm mb-2">Legal Support</h4>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4">Dedicated desk for Indian statutory compliance queries.</p>
                            <a href="mailto:lovneetrathi@gmail.com" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-2">
                                Contact Officer <ExternalLink size={12} />
                            </a>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        {/* Hero Header */}
                        <header className="mb-20">
                            <button
                                onClick={() => navigate(-1)}
                                className="flex items-center gap-2 text-cyan-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8 hover:text-cyan-400 transition-colors bg-cyan-500/5 px-4 py-2 rounded-full border border-cyan-500/10"
                            >
                                <ArrowLeft size={12} /> Return to Dashboard
                            </button>

                            <div className="relative">
                                <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 text-white uppercase italic leading-[0.9]">
                                    {page.title}
                                </h1>
                                <div className="absolute -top-10 -left-10 text-[12vw] font-black text-white/[0.02] pointer-events-none select-none italic uppercase">
                                    STATUTORY
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-6">
                                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ver. 2.4.0 (Live)</span>
                                </div>
                                <span className="text-slate-600 font-bold uppercase tracking-widest text-[10px]">Effective from: {page.lastUpdated}</span>
                            </div>
                        </header>

                        {/* Executive Summary Section */}
                        <section className="mb-24 relative p-10 rounded-[40px] bg-white/[0.02] border border-white/5 overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[100px] group-hover:bg-indigo-500/10 transition-colors duration-1000" />
                            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-cyan-500 mb-6 flex items-center gap-3">
                                <div className="w-10 h-[2px] bg-cyan-500/30" /> Executive Summary
                            </h3>
                            <p className="text-xl md:text-2xl text-white font-medium leading-relaxed italic tracking-tight opacity-90">
                                "{page.executiveSummary}"
                            </p>
                        </section>

                        {/* Detailed Articles */}
                        <div className="space-y-32">
                            {page.articles.map((article, idx) => (
                                <section
                                    key={idx}
                                    id={`article-${idx}`}
                                    className="relative scroll-mt-32"
                                >
                                    <div className="flex flex-col gap-10">
                                        <div className="space-y-4">
                                            <span className="text-cyan-500 font-black text-xs uppercase tracking-[0.4em] opacity-40">Section 0{idx + 1}</span>
                                            <h2 className="text-4xl md:text-5xl font-black tracking-tight uppercase text-white">
                                                {article.title}
                                            </h2>
                                        </div>

                                        <div className="space-y-12">
                                            <p className="text-lg md:text-xl text-slate-400 leading-relaxed font-normal">
                                                {article.content}
                                            </p>

                                            {article.subsections && article.subsections.length > 0 && (
                                                <div className="grid grid-cols-1 gap-8 mt-12">
                                                    {article.subsections.map((sub, sIdx) => (
                                                        <div key={sIdx} className="p-8 rounded-3xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-colors group">
                                                            <h4 className="text-white font-black uppercase tracking-wider text-sm mb-4 flex items-center gap-3">
                                                                <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] border border-cyan-500/20">
                                                                    {sIdx + 1}
                                                                </span>
                                                                {sub.subtitle}
                                                            </h4>
                                                            <p className="text-slate-500 leading-relaxed text-base font-medium group-hover:text-slate-400 transition-colors">
                                                                {sub.body}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Separation Line */}
                                    <div className="mt-32 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                </section>
                            ))}
                        </div>

                        {/* Professional Footer / Compliance Contact */}
                        <section className="mt-40">
                            <div className="relative p-12 md:p-20 rounded-[60px] bg-gradient-to-br from-[#0a0f1e] to-[#030712] border border-white/5 overflow-hidden">
                                <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-cyan-600/10 blur-[100px]" />
                                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                                    <div>
                                        <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-6">Need statutory assistance?</h3>
                                        <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-md">Our compliance desk stands ready to assist in jurisdictional audits, data access requests, or regulatory clarifications.</p>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-center gap-4 group">
                                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                                                    <Mail size={20} className="text-cyan-500" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Official Correspondent</p>
                                                    <p className="text-white font-bold">{import.meta.env.VITE_SUPPORT_EMAIL || 'lovneetrathi@gmail.com'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 group">
                                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                                                    <Phone size={20} className="text-cyan-500" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legal Hotline</p>
                                                    <p className="text-white font-bold">{import.meta.env.VITE_SUPPORT_PHONE || '+91 9413821007'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-10 rounded-3xl bg-white/5 border border-white/10 text-center">
                                        <div className="w-20 h-20 bg-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto mb-8">
                                            <Scale size={40} className="text-cyan-500" />
                                        </div>
                                        <p className="text-sm text-slate-400 mb-8 leading-relaxed italic">"Trust is built on transparency and precision. We synchronize your data, but we preserve your sovereignty."</p>
                                        <button className="w-full py-5 rounded-2xl bg-cyan-500 text-white font-black uppercase tracking-widest text-xs hover:bg-cyan-400 shadow-xl shadow-cyan-500/20 transition-all active:scale-95 flex items-center justify-center gap-3">
                                            Download Policy PDF <ExternalLink size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <footer className="mt-32 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
                            <div className="flex items-center gap-6">
                                <button onClick={() => navigate('/')} className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 hover:text-white transition-colors">Home</button>
                                <button className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 hover:text-white transition-colors">Infrastructure status</button>
                                <button className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 hover:text-white transition-colors">Bug Bounty</button>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-700">© 2026 TallySync Technologies Inc.</p>
                        </footer>
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
