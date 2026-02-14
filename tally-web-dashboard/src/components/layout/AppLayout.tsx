import { useState, useEffect, memo, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import LanguageSelector from './LanguageSelector';
import {
    LayoutDashboard, FileText, Users, TrendingUp, Package, Shield,
    ChevronLeft, ChevronRight, Sun, Moon, Menu, X, Plus,
    Box, RefreshCw, Bell, ChevronDown, BarChart3, Scale, Lock,
    LineChart, Building2, Sparkles, LogOut, ArrowLeftRight,
    Bot, UserX, MessageCircle, ClipboardList, Truck, MapPin,
    Palette, CreditCard, ScanLine, Database, ShieldCheck,
    Repeat, Globe, FileSpreadsheet
} from 'lucide-react';

// Navigation Item
const NavItem = memo(({
    to, icon, label, collapsed, active
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; active: boolean }) => {
    return (
        <Link to={to}>
            <div className={`
                flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] mb-0.5
                transition-all duration-150 group text-sm
                ${active
                    ? 'bg-[var(--primary)] text-white font-semibold shadow-[var(--shadow-sm)]'
                    : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] hover:text-[var(--on-surface)] font-medium'
                }
                ${collapsed ? 'justify-center px-2' : ''}
            `}>
                <span className="flex-shrink-0">{icon}</span>
                {!collapsed && <span className="truncate">{label}</span>}
            </div>
        </Link>
    );
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, companies, selectedCompany, selectCompany, signOut, appMode } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const handleGlobalRefresh = () => {
        window.dispatchEvent(new CustomEvent('app-refresh-trigger'));
    };

    // Close mobile menu on route change
    useEffect(() => {
        setShowMobileMenu(false);
    }, [location.pathname]);

    const isAdmin = user?.email === 'lovneetrathi@gmail.com';

    const tallyNavItems = useMemo(() => {
        const items = [
            { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
            { to: '/vouchers', icon: <FileText size={18} />, label: 'Vouchers' },
            { to: '/ledgers', icon: <Users size={18} />, label: 'Parties' },
            { to: '/sales', icon: <TrendingUp size={18} />, label: 'Sales' },
            { to: '/purchases', icon: <Package size={18} />, label: 'Purchases' },
            { to: '/stock', icon: <Box size={18} />, label: 'Stock Summary' },
            { to: '/profit-loss', icon: <BarChart3 size={18} />, label: 'Profit & Loss' },
            { to: '/balance-sheet', icon: <Scale size={18} />, label: 'Balance Sheet' },
            { to: '/sales-analytics', icon: <LineChart size={18} />, label: 'Sales Analytics' },
            { to: '/bank-reconciliation', icon: <Building2 size={18} />, label: 'Bank Recon' },
            { to: '/ai-entry', icon: <Sparkles size={18} />, label: 'AI Auto Entry' },
            { to: '/gst-reports', icon: <Shield size={18} />, label: 'GST Reports' },
            { to: '/create-voucher', icon: <ClipboardList size={18} />, label: 'Create Voucher' },
            { to: '/payment-reminders', icon: <MessageCircle size={18} />, label: 'Payment Reminders' },
            { to: '/inactive-customers', icon: <UserX size={18} />, label: 'Inactive Customers' },
            { to: '/ai-assistant', icon: <Bot size={18} />, label: 'AI Assistant' },
            { to: '/eway-bill', icon: <Truck size={18} />, label: 'E-Way Bill' },
            { to: '/sales-team', icon: <MapPin size={18} />, label: 'Sales Tracking' },
            { to: '/invoice-templates', icon: <Palette size={18} />, label: 'Invoice Templates' },
            { to: '/team-management', icon: <ShieldCheck size={18} />, label: 'Team Access' },
            { to: '/backup-restore', icon: <Database size={18} />, label: 'Backup & Restore' },
            { to: '/invoice-scanner', icon: <ScanLine size={18} />, label: 'Invoice Scanner' },
            { to: '/payment-links', icon: <CreditCard size={18} />, label: 'Payment Links' },
            { to: '/recurring-invoices', icon: <Repeat size={18} />, label: 'Recurring Invoices' },
            { to: '/portal-links', icon: <Globe size={18} />, label: 'Customer Portal' },
            { to: '/report-builder', icon: <FileSpreadsheet size={18} />, label: 'Report Builder' },
        ];
        if (isAdmin) {
            items.push({ to: '/admin', icon: <Lock size={18} />, label: 'Super Admin' });
        }
        return items;
    }, [isAdmin]);

    const billingNavItems = useMemo(() => {
        const items = [
            { to: '/', icon: <LayoutDashboard size={18} />, label: 'Billing Desk' },
            { to: '/create-invoice', icon: <Plus size={18} />, label: 'Create Invoice' },
            { to: '/sales', icon: <FileText size={18} />, label: 'Recent Invoices' },
            { to: '/ledgers', icon: <Users size={18} />, label: 'Customers' },
            { to: '/stock', icon: <Box size={18} />, label: 'Inventory' },
            { to: '/profit-loss', icon: <BarChart3 size={18} />, label: 'Profit & Loss' },
            { to: '/balance-sheet', icon: <Scale size={18} />, label: 'Balance Sheet' },
            { to: '/sales-analytics', icon: <LineChart size={18} />, label: 'Sales Analytics' },
            { to: '/bank-reconciliation', icon: <Building2 size={18} />, label: 'Bank Recon' },
            { to: '/ai-entry', icon: <Sparkles size={18} />, label: 'AI Auto Entry' },
            { to: '/gst-reports', icon: <Shield size={18} />, label: 'GST Filing' },
            { to: '/payment-reminders', icon: <MessageCircle size={18} />, label: 'Payment Reminders' },
            { to: '/inactive-customers', icon: <UserX size={18} />, label: 'Inactive Customers' },
            { to: '/ai-assistant', icon: <Bot size={18} />, label: 'AI Assistant' },
            { to: '/invoice-templates', icon: <Palette size={18} />, label: 'Invoice Templates' },
            { to: '/invoice-scanner', icon: <ScanLine size={18} />, label: 'Invoice Scanner' },
            { to: '/payment-links', icon: <CreditCard size={18} />, label: 'Payment Links' },
            { to: '/recurring-invoices', icon: <Repeat size={18} />, label: 'Recurring Invoices' },
            { to: '/portal-links', icon: <Globe size={18} />, label: 'Customer Portal' },
            { to: '/report-builder', icon: <FileSpreadsheet size={18} />, label: 'Report Builder' },
            { to: '/backup-restore', icon: <Database size={18} />, label: 'Backup & Restore' },
        ];
        if (isAdmin) {
            items.push({ to: '/admin', icon: <Lock size={18} />, label: 'Super Admin' });
        }
        return items;
    }, [isAdmin]);

    const navItems = appMode === 'tally' ? tallyNavItems : billingNavItems;

    const bottomNavItems = useMemo(() => appMode === 'tally' ? [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'Home' },
        { to: '/vouchers', icon: <FileText size={20} />, label: 'Vouchers' },
        { to: '/ledgers', icon: <Users size={20} />, label: 'Parties' },
        { to: '/sales', icon: <TrendingUp size={20} />, label: 'Sales' },
    ] : [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'Home' },
        { to: '/create-invoice', icon: <Plus size={20} />, label: 'Bill' },
        { to: '/sales', icon: <FileText size={20} />, label: 'Sales' },
        { to: '/ledgers', icon: <Users size={20} />, label: 'Parties' },
    ], [appMode]);

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

                            {/* Nav Items */}
                            <nav className="flex-1 px-3 py-3 overflow-y-auto">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setShowMobileMenu(false)}
                                        className={`flex items-center gap-3 px-3 py-3 rounded-[var(--radius-md)] mb-0.5 transition-all text-sm ${location.pathname === item.to
                                            ? 'bg-[var(--primary)] text-white font-semibold'
                                            : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] font-medium'
                                            }`}
                                    >
                                        {item.icon}
                                        <span>{item.label}</span>
                                    </Link>
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
                                    onClick={() => navigate('/select-mode')}
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
                                    {appMode === 'tally' ? 'Cloud' : 'Billing'}
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

                {/* Navigation */}
                <nav className="flex-1 px-3 py-2 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavItem
                            key={item.to}
                            {...item}
                            collapsed={!sidebarOpen}
                            active={location.pathname === item.to}
                        />
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
                                        <span className="text-[var(--border)]">•</span>
                                        <button
                                            onClick={() => navigate('/select-mode')}
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
                flex-1 min-h-screen
                transition-all duration-200
                ${sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]'}
            `}>
                {/* Mobile Header */}
                <header className="md:hidden sticky top-0 z-50 h-14 flex items-center gap-3 px-4 bg-[var(--surface)] border-b border-[var(--border)]">
                    <button onClick={() => setShowMobileMenu(true)} className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors">
                        <Menu size={20} />
                    </button>

                    <div className="flex-1 min-w-0" onClick={() => setShowMobileMenu(true)}>
                        <p className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider leading-none mb-0.5">
                            {getGreeting()}
                        </p>
                        <h2 className="text-sm font-bold text-[var(--on-surface)] truncate leading-tight">
                            {selectedCompany?.name || 'Select Company'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Link to="/create-invoice" className="p-2 rounded-[var(--radius-sm)] bg-[var(--primary)] text-white shadow-[var(--shadow-sm)]">
                            <Plus size={16} />
                        </Link>
                        <button
                            onClick={handleGlobalRefresh}
                            className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </header>

                {/* Desktop Header */}
                <header className="hidden md:flex sticky top-0 z-30 h-14 items-center justify-between px-6 bg-[var(--surface)]/80 backdrop-blur-lg border-b border-[var(--border)]">
                    <div />
                    <div className="flex items-center gap-3">
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
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-4 md:p-6 pb-24 md:pb-6">
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

            {/* ===== MOBILE BOTTOM NAV ===== */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] border-t border-[var(--border)] safe-area-pb">
                <div className="flex items-center justify-around h-16 px-2">
                    {bottomNavItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                            <Link key={item.to} to={item.to} className="flex-1">
                                <div className={`
                                    flex flex-col items-center justify-center gap-1 py-1.5 transition-all duration-150
                                    ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}
                                `}>
                                    <div className={`p-1.5 rounded-[var(--radius-sm)] ${isActive ? 'bg-[var(--primary-container)]' : ''}`}>
                                        {item.icon}
                                    </div>
                                    <span className={`text-[10px] font-semibold ${isActive ? '' : 'opacity-70'}`}>{item.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
