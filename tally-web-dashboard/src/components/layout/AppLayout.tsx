import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import LanguageSelector from './LanguageSelector';
import AIFloatingButton from '../AIFloatingButton';
import { CommandPalette } from '../ui/CommandPalette';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import {
    Activity, LayoutDashboard, FileText, Users, TrendingUp, Package, Shield,
    ChevronLeft, ChevronRight, Sun, Moon, Menu, X, Plus,
    Box, RefreshCw, Bell, ChevronDown, BarChart3, Scale, Lock,
    LineChart, Building2, Sparkles, LogOut, ArrowLeftRight,
    Bot, UserX, MessageCircle, ClipboardList, Truck, MapPin,
    Palette, CreditCard, ScanLine, Database, ShieldCheck,
    Repeat, Globe, FileSpreadsheet, Settings
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import SafeLink from '../common/SafeLink';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { hasAdminAccess, isAdminConsoleEnabled } from '@/lib/adminAccess';

const NavItem = memo(({
    to, icon, label, collapsed, active
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; active: boolean }) => {
    return (
        <SafeLink to={to}>
            <div className={`
                flex items-center gap-3 px-3 py-3 rounded-[14px] mb-1.5
                transition-all duration-300 group text-[13px]
                ${active
                    ? 'bg-gradient-to-r from-sky-500/10 to-blue-600/10 text-sky-500 font-bold border border-sky-400/20 shadow-[0_0_15px_rgba(14,165,233,0.15)] relative overflow-hidden'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-variant)] hover:text-[var(--on-surface)] font-medium active:scale-95 border border-transparent'
                }
                ${collapsed ? 'justify-center px-0 w-11 h-11 mx-auto' : ''}
            `}>
                {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-sky-400 rounded-r-full shadow-[0_0_10px_rgba(56,189,248,1)]" />}
                <span className={`flex-shrink-0 transition-colors ${active ? 'text-sky-400' : 'group-hover:text-[var(--primary)]'}`}>{icon}</span>
                {!collapsed && <span className="truncate tracking-wide">{label}</span>}
            </div>
        </SafeLink>
    );
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, companies, selectedCompany, selectCompany, signOut, appMode } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const { navigate: safeNavigate } = useSafeNavigate();
    const location = useLocation();
    const lastRefreshRef = useRef(0);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const handleGlobalRefresh = () => {
        const now = Date.now();
        if (now - lastRefreshRef.current < 900) return;
        lastRefreshRef.current = now;
        window.dispatchEvent(new CustomEvent('app-refresh-trigger'));
    };

    // Close mobile menu on route change
    useEffect(() => {
        setShowMobileMenu(false);
    }, [location.pathname]);

    const isAdmin = isAdminConsoleEnabled() && hasAdminAccess(user);

    const { t } = useLanguage();
    const homePath = appMode === 'billing' ? '/billing' : '/dashboard';
    const automationBasePath = selectedCompany?.id ? `/clients/${selectedCompany.id}` : '/select-company';
    // ... (rest of code)

    const tallyNavGroups = useMemo(() => {
        const groups = [
            {
                label: t('nav.dashboard'), // Main
                items: [
                    { to: homePath, icon: <LayoutDashboard size={18} />, label: t('nav.dashboard') },
                    { to: '/sync-history', icon: <RefreshCw size={18} />, label: 'Sync Status' },
                    { to: '/vouchers', icon: <FileText size={18} />, label: t('nav.vouchers') },
                    { to: '/ledgers', icon: <Users size={18} />, label: t('nav.parties') },
                ]
            },
            {
                label: t('nav.sales'), // Financials
                items: [
                    { to: '/sales', icon: <TrendingUp size={18} />, label: t('nav.sales') },
                    { to: '/purchases', icon: <Package size={18} />, label: t('nav.purchases') },
                    { to: '/profit-loss', icon: <BarChart3 size={18} />, label: t('reports.profit_loss') },
                    { to: '/balance-sheet', icon: <Scale size={18} />, label: t('reports.balance_sheet') },
                    { to: '/business-health', icon: <Activity size={18} />, label: 'Business Health' },
                    { to: '/business-insights', icon: <TrendingUp size={18} />, label: 'AI Business Insights' },
                    { to: '/gst-reports', icon: <Shield size={18} />, label: t('nav.gst_reports') },
                ]
            },
            {
                label: t('stock.title'), // Inventory
                items: [
                    { to: '/stock', icon: <Box size={18} />, label: t('nav.stock') },
                    { to: '/eway-bill', icon: <Truck size={18} />, label: 'E-Way Bill' },
                ]
            },
            {
                label: t('ai.title'), // Intelligence
                items: [
                    { to: '/ai-assistant', icon: <Bot size={18} />, label: t('nav.ai_assistant') },
                    { to: '/ai-entry', icon: <Sparkles size={18} />, label: t('dashboard.recent_vouchers') },
                    { to: '/invoice-scanner', icon: <ScanLine size={18} />, label: 'Scanner' },
                    { to: `${automationBasePath}/bank-automation`, icon: <FileSpreadsheet size={18} />, label: 'Bank Automation' },
                    { to: `${automationBasePath}/invoice-import`, icon: <ClipboardList size={18} />, label: 'Invoice Import' },
                    { to: `${automationBasePath}/gst`, icon: <ShieldCheck size={18} />, label: 'GST Automation' },
                ]
            },
            {
                label: t('nav.settings'), // Settings & Misc
                items: [
                    { to: '/settings', icon: <Settings size={18} />, label: t('nav.settings') },
                    { to: '/recurring-invoices', icon: <Repeat size={18} />, label: t('nav.recurring') },
                ]
            }
        ];
        if (isAdmin) {
            groups.push({
                label: 'Admin',
                items: [{ to: '/admin', icon: <Lock size={18} />, label: 'Super Admin' }]
            });
        }
        return groups;
    }, [homePath, isAdmin, t, selectedCompany?.id]);

    const navGroups = tallyNavGroups;

    const bottomNavItems = useMemo(() => [
        { to: homePath, icon: <LayoutDashboard size={20} />, label: 'Home' },
        { to: '/vouchers', icon: <FileText size={20} />, label: 'Vouchers' },
        { to: '/ledgers', icon: <Users size={20} />, label: 'Parties' },
        { to: '/sales', icon: <TrendingUp size={20} />, label: 'Sales' },
    ], [homePath]);

    return (
        <div className="flex min-h-screen relative overflow-x-hidden bg-[var(--background)]">

            {/* ===== MOBILE SIDEBAR OVERLAY ===== */}
            <AnimatePresence>
                {showMobileMenu && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMobileMenu(false)}
                            className="fixed inset-0 z-[60] bg-black/40 md:hidden"
                        />
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                            className="fixed top-0 left-0 h-full w-[280px] z-[70] bg-[var(--surface)] border-r border-[var(--border)] md:hidden flex flex-col"
                        >
                            {/* Mobile Sidebar Header */}
                            <div className="flex items-center justify-between px-5 h-16 border-b border-[var(--border)]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--primary)] flex items-center justify-center text-white">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
                                        </svg>
                                    </div>
                                    <span className="font-bold text-base text-[var(--on-surface)]">TallyLink</span>
                                </div>
                                <button onClick={() => setShowMobileMenu(false)} className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Company Selector */}
                            {selectedCompany && (
                                <div className="mx-4 mt-4 p-3 rounded-[var(--radius-md)] bg-[var(--surface-container)] border border-[var(--border)]">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Company</p>
                                    <select
                                        value={selectedCompany.id}
                                        onChange={(e) => {
                                            const company = companies.find((c: any) => c.id === e.target.value);
                                            if (company) selectCompany(company);
                                        }}
                                        className="w-full appearance-none px-0 py-0.5 bg-transparent text-sm font-semibold text-[var(--on-surface)] cursor-pointer focus:outline-none"
                                    >
                                        {companies.map((c: any) => (
                                            <option key={c.id} value={c.id} className="bg-[var(--surface)] text-[var(--on-surface)]">{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <nav className="flex-1 px-4 py-4 overflow-y-auto custom-scrollbar">
                                {navGroups.map((group, idx) => (
                                    <div key={idx} className="mb-6 last:mb-0">
                                        <div className="flex items-center gap-2 mb-2 px-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">
                                                {group.label}
                                            </span>
                                            <div className="flex-1 h-px bg-[var(--border)] opacity-30" />
                                        </div>
                                        <div className="grid grid-cols-1 gap-1">
                                            {group.items.map((item) => (
                                                <SafeLink
                                                    key={item.to}
                                                    to={item.to}
                                                    onClick={() => setShowMobileMenu(false)}
                                                    className={`flex items-center gap-3.5 px-3 py-3 rounded-xl transition-all duration-200 ${location.pathname === item.to
                                                        ? 'bg-[var(--primary)] text-white font-bold shadow-md'
                                                        : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] font-medium'
                                                        }`}
                                                >
                                                    <span className={`${location.pathname === item.to ? 'text-white' : 'text-[var(--primary)]'}`}>
                                                        {item.icon}
                                                    </span>
                                                    <span className="text-sm">{item.label}</span>
                                                </SafeLink>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </nav>

                            {/* Bottom Actions */}
                            <div className="p-4 border-t border-[var(--border)] space-y-2">
                                <button
                                    onClick={toggleTheme}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface-container)] text-[var(--on-surface)] text-sm font-medium"
                                >
                                    <span className="flex items-center gap-2.5">
                                        {isDark ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-slate-500" />}
                                        {isDark ? 'Light Mode' : 'Dark Mode'}
                                    </span>
                                </button>

                                <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface-container)]">
                                    <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] flex items-center justify-center text-white font-bold text-sm">
                                        {user?.email?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-[var(--on-surface)] truncate">{user?.email?.split('@')[0]}</p>
                                        <button onClick={() => signOut()} className="text-xs text-[var(--error)] font-medium mt-0.5">Sign Out</button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => safeNavigate('/select-mode')}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--on-surface-variant)] text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors"
                                >
                                    <ArrowLeftRight size={14} />
                                    Switch Mode
                                </button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* ===== DESKTOP SIDEBAR ===== */}
            <aside
                className={`
                    fixed top-0 left-0 h-full z-40 hidden md:flex flex-col
                    bg-[var(--surface)] border-r border-[var(--border)]
                    transition-all duration-200
                    ${sidebarOpen ? 'w-60' : 'w-[68px]'}
                `}
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--primary)] flex items-center justify-center text-white flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                        </div>
                        {sidebarOpen && (
                            <div>
                                <h1 className="font-bold text-sm text-[var(--on-surface)] leading-none">TallyLink</h1>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)] mt-0.5">
                                    Cloud
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--text-muted)] transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>
                </div>

                {/* Company Selector (Desktop) */}
                {sidebarOpen && selectedCompany && (
                    <div className="px-3 py-3">
                        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface-container)] border border-[var(--border)]">
                            <div className="relative">
                                <select
                                    value={selectedCompany.id}
                                    onChange={(e) => {
                                        const company = companies.find((c: any) => c.id === e.target.value);
                                        if (company) selectCompany(company);
                                    }}
                                    className="w-full appearance-none pr-6 bg-transparent text-sm font-semibold text-[var(--on-surface)] cursor-pointer focus:outline-none"
                                >
                                    {companies.map((c: any) => (
                                        <option key={c.id} value={c.id} className="bg-[var(--surface)] text-[var(--on-surface)]">{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
                            </div>
                        </div>
                    </div>
                )}

                <nav className="flex-1 px-3 py-2 overflow-y-auto custom-scrollbar">
                    {navGroups.map((group, idx) => (
                        <div key={idx} className="mb-4 last:mb-0">
                            {sidebarOpen && (
                                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-60">
                                    {group.label}
                                </div>
                            )}
                            {!sidebarOpen && <div className="h-px bg-[var(--border)] mx-2 mb-2 opacity-50" />}
                            {group.items.map((item) => (
                                <NavItem
                                    key={item.to}
                                    {...item}
                                    collapsed={!sidebarOpen}
                                    active={location.pathname === item.to}
                                />
                            ))}
                        </div>
                    ))}
                </nav>

                {/* Bottom */}
                <div className="px-3 py-3 border-t border-[var(--border)] space-y-1.5">
                    <button
                        onClick={toggleTheme}
                        className={`
                            w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                            text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] text-sm font-medium
                            transition-all ${sidebarOpen ? '' : 'justify-center'}
                        `}
                    >
                        {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-500" />}
                        {sidebarOpen && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
                    </button>

                    {user && sidebarOpen && (
                        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface-container)] border border-[var(--border)]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--primary)] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                                    {user.email?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[var(--on-surface)] truncate">{user.email?.split('@')[0]}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <button
                                            onClick={() => signOut()}
                                            className="text-[10px] font-medium text-[var(--error)] hover:underline"
                                        >
                                            Sign Out
                                        </button>
                                        <span className="text-[var(--border)]">?</span>
                                        <button
                                            onClick={() => safeNavigate('/select-mode')}
                                            className="text-[10px] font-medium text-[var(--primary)] hover:underline"
                                        >
                                            Switch
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* ===== MAIN CONTENT ===== */}
            <main className={`
                flex-1 min-h-screen w-full max-w-full overflow-x-hidden
                transition-all duration-200
                ${sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]'}
            `}>
                {/* Mobile Header - Ultra Premium Glass */}
                <header className="md:hidden sticky top-0 z-50 h-[68px] flex items-center gap-3 px-4 bg-[var(--surface)]/80 backdrop-blur-2xl border-b border-white/[0.05] shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
                    <button onClick={() => setShowMobileMenu(true)} className="p-2.5 rounded-[12px] hover:bg-white/5 active:bg-white/10 text-[var(--on-surface)] transition-all">
                        <Menu size={22} />
                    </button>

                    <div className="flex-1 min-w-0" onClick={() => setShowMobileMenu(true)}>
                        <div id="header-title-mobile" className="flex items-center" />
                        <div className="default-header-content contents">
                            <p className="text-[9px] font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500 uppercase tracking-widest leading-none mb-1">
                                {getGreeting()}
                            </p>
                            <h2 className="text-[15px] font-bold text-[var(--on-surface)] truncate leading-tight tracking-tight">
                                {selectedCompany?.name || 'Select Company'}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <div id="header-search-mobile" className="flex items-center" />
                        <div id="header-filters-mobile" className="flex items-center" />
                        <div id="header-actions-mobile" className="flex items-center gap-1.5" />
                        <div className="default-header-actions flex items-center gap-2">
                            <SafeLink to="/create-invoice" className="p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.3)] active:scale-95 transition-all">
                                <Plus size={18} strokeWidth={2.5} />
                            </SafeLink>
                            <button
                                onClick={handleGlobalRefresh}
                                className="p-2.5 rounded-xl hover:bg-white/5 active:bg-white/10 text-[var(--text-muted)] transition-all"
                            >
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>
                </header>

                {/* Desktop Header */}
                <header className="hidden md:flex sticky top-0 z-30 h-14 items-center justify-between px-6 bg-[var(--surface)]/80 backdrop-blur-lg border-b border-[var(--border)]">
                    <div className="flex items-center gap-4 flex-1">
                        <div id="header-title" className="flex items-center" />
                        <div id="header-search" className="flex-1 max-w-sm" />
                    </div>

                    <div className="flex items-center gap-3">
                        <div id="header-filters" className="flex items-center gap-2" />
                        <div id="header-actions" className="flex items-center gap-2" />

                        {location.pathname === '/' && (
                            <>
                                <LanguageSelector />
                                <div className="h-6 w-px bg-[var(--border)]" />
                                <button
                                    onClick={toggleTheme}
                                    className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors"
                                >
                                    {isDark ? <Sun size={16} /> : <Moon size={16} />}
                                </button>
                                <button className="relative p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors">
                                    <Bell size={16} />
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[var(--error)] rounded-full" />
                                </button>
                            </>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-4 md:p-6 pb-24 md:pb-6">
                    <Breadcrumbs />
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>

            {/* ===== PREMIUM MOBILE BOTTOM NAV ===== */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)]/90 backdrop-blur-3xl border-t border-white/[0.05] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] safe-area-pb pb-1">
                <div className="flex items-center justify-around h-[68px] px-2 relative">
                    {bottomNavItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                            <SafeLink key={item.to} to={item.to} className="flex-1 relative group">
                                <div className={`
                                    flex flex-col items-center justify-center gap-1 py-1 transition-all duration-300
                                    ${isActive ? 'text-sky-400' : 'text-[var(--text-muted)] hover:text-[var(--on-surface)]'}
                                `}>
                                    <div className={`p-2 rounded-2xl transition-all relative ${isActive ? 'bg-sky-500/10 scale-110 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'group-active:scale-90'}`}>
                                        {isActive && <div className="absolute inset-0 bg-sky-400/20 blur-md rounded-full -z-10" />}
                                        {item.icon}
                                    </div>
                                    <span className={`text-[10.5px] tracking-wide transition-all ${isActive ? 'font-black' : 'font-medium'}`}>{item.label}</span>
                                </div>
                            </SafeLink>
                        );
                    })}
                </div>
            </nav>

            <AIFloatingButton />
            <CommandPalette />
        </div>
    );


}
