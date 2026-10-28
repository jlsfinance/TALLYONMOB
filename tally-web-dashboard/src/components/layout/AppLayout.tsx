import { ReminderBell } from '@/components/reminders/ReminderBell';
import { useDueReminders } from '@/components/reminders/useDueReminders';
import { useState, useEffect, useRef, memo, useMemo, useCallback, useLayoutEffect } from 'react';
import './AppPolish.css';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import LanguageSelector from './LanguageSelector';
import AIFloatingButton from '../AIFloatingButton';
import { CommandPalette } from '../ui/CommandPalette';
import GlobalSearch from '../GlobalSearch';
import { prefetchVouchers, prefetchLedgers, prefetchStock, prefetchSales, invalidateDashboard } from '@/lib/prefetch';
import { useFY, getFYDates, getFYStartYear } from '@/contexts/FYContext';
import { useRealtimeSubscription } from '@/hooks/useRealtime';

import {
    Activity, LayoutDashboard, FileText, Users, TrendingUp, Package, Shield,
    ChevronLeft, ChevronRight, Sun, Moon, Menu, X, Plus,
    Box, RefreshCw, Bell, ChevronDown, BarChart3, Scale, Lock,
    LineChart, Building2, Sparkles, LogOut, ArrowLeftRight,
    Bot, UserX, MessageCircle, ClipboardList, Truck, MapPin,
    Palette, CreditCard, ScanLine, Database, ShieldCheck,
    Repeat, Globe, FileSpreadsheet, Settings, Search, Crown,
    Mail, Link, CheckCircle, Command, Clock, Receipt, Briefcase
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import SafeLink from '../common/SafeLink';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { hasAdminAccess, isAdminConsoleEnabled } from '@/lib/adminAccess';
import { getPendingCount } from '@/lib/offlineQueue';

const routePrefetchMap: Record<string, () => Promise<any>> = {
    '/dashboard': () => import('../../pages/LiveKeepingsDashboard'),
    '/vouchers': () => import('../../pages/VouchersPage'),
    '/ledgers': () => import('../../pages/LedgersPage'),
    '/sales': () => import('../../pages/SalesPage'),
    '/purchases': () => import('../../pages/PurchasesPage'),
    '/stock': () => import('../../pages/StockPage'),
    '/profit-loss': () => import('../../pages/ProfitLossPage'),
    '/balance-sheet': () => import('../../pages/BalanceSheetPage'),
    '/gst-reports': () => import('../../pages/GSTReportsPage'),
    '/settings': () => import('../../pages/SettingsPage'),
    '/ai-assistant': () => import('../../pages/AIAssistantPage'),
    '/ai-entry': () => import('../../pages/AIEntryPage'),
    '/aging-report': () => import('../../pages/AgingReportPage'),
    '/payment-reminders': () => import('../../pages/PaymentRemindersPage'),
    '/sync-history': () => import('../../pages/SyncHistoryPage'),
    '/tally-sync': () => import('../../pages/TallySyncPage'),
    '/eway-bill': () => import('../../pages/EWayBillPage'),
    '/activity-logs': () => import('../../pages/ActivityLogsPage'),
    '/invoice-scanner': () => import('../../pages/InvoiceScannerPage'),
    '/email-invoice': () => import('../../pages/EmailInvoicePage'),
    '/upi-payments': () => import('../../pages/UPIPaymentPage'),
    '/payment-links': () => import('../../pages/PaymentLinksPage'),
    '/rbac': () => import('../../pages/RBACPage'),
    '/audit-log': () => import('../../pages/AuditLogPage'),
    '/saas-admin': () => import('../../pages/AdminPanelPage'),
    '/day-book': () => import('../../pages/DayBookPage'),
    '/payroll': () => import('../../pages/PayrollPage'),
    '/document-scanner': () => import('../../pages/DocumentScannerPage'),
    '/user-analytics': () => import('../../pages/UserAnalyticsPage'),
};

const NavItem = memo(({
    to, icon, label, collapsed, active, companyId
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; active: boolean; companyId?: string }) => {
    const { selectedFY } = useFY();
    const prefetchOnHover = useCallback(() => {
        // 1. Prefetch route chunk
        const importer = routePrefetchMap[to.split('?')[0]];
        if (importer) importer().catch(() => {});

        // 2. Prefetch data (only if companyId available)
        if (!companyId) return;
        const fy = selectedFY;
        const fyDates = getFYDates(fy);
        const path = to.split('?')[0];

        if (path === '/vouchers') prefetchVouchers(companyId, 'all', String(getFYStartYear(fy)));
        else if (path === '/ledgers') prefetchLedgers(companyId);
        else if (path === '/stock') prefetchStock(companyId);
        else if (path === '/sales') {
            prefetchSales(companyId, fyDates.from, fyDates.to);
        }
    }, [to, companyId, selectedFY]);
    return (
        <SafeLink to={to} onMouseEnter={prefetchOnHover} onFocus={prefetchOnHover} onTouchStart={prefetchOnHover}>
            <div className={`
                flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] mb-1
                transition-all duration-150 group text-[13px]
                ${active
                    ? 'bg-[var(--primary)] text-white font-bold shadow-sm'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)] font-medium'
                }
                ${collapsed ? 'justify-center px-0 w-10 h-10 mx-auto' : ''}
            `}>
                <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-[var(--primary)]'}`}>{icon}</span>
                {!collapsed && <span className="truncate">{label}</span>}
            </div>
        </SafeLink>
    );
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, companies, selectedCompany, selectCompany, signOut, appMode } = useAuth() as any;
    useDueReminders(user?.id, selectedCompany?.id);
    const { selectedFY, setSelectedFY, stepFY } = useFY();
    const { isDark, toggleTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [pendingOffline, setPendingOffline] = useState(0);
    const { navigate: safeNavigate } = useSafeNavigate();
    const location = useLocation();
    const lastRefreshRef = useRef(0);

    // Refresh visible lists when a synced voucher is soft-deleted.
    useRealtimeSubscription('vouchers', selectedCompany?.id, 'UPDATE', (payload: any) => {
        if (payload?.new?.is_deleted !== true || !selectedCompany?.id) return;
        invalidateDashboard(selectedCompany.id);
        window.dispatchEvent(new CustomEvent('voucher-soft-deleted', { detail: { companyId: selectedCompany.id, id: payload.new.id } }));
    });

    // Cmd+K / Ctrl+K global search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setShowSearch(s => !s);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

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
        if (selectedCompany?.id) invalidateDashboard(selectedCompany.id);
        window.dispatchEvent(new CustomEvent('app-refresh-trigger'));
    };

    // Warm the main tabs after the current page has had time to render.
    useEffect(() => {
        if (!selectedCompany?.id) return;
        const companyId = selectedCompany.id;
        const fy = selectedFY;
        const dates = getFYDates(fy);
        const timer = window.setTimeout(() => {
            ['/dashboard', '/vouchers', '/ledgers', '/sales'].forEach(path => routePrefetchMap[path]().catch(() => {}));
            prefetchLedgers(companyId);
            prefetchVouchers(companyId, 'all', String(getFYStartYear(fy)));
            prefetchSales(companyId, dates.from, dates.to);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [selectedCompany?.id, selectedFY]);

    // Keep each main tab at its previous position when switching between tabs.
    const tabScrollPositions = useRef<Record<string, number>>({});
    useLayoutEffect(() => {
        const mainTabs = ['/dashboard', '/ledgers', '/sales', '/vouchers'];
        if (!mainTabs.includes(location.pathname)) return;
        const key = `${selectedCompany?.id || ''}:${selectedFY}:${location.pathname}`;
        window.scrollTo({ top: tabScrollPositions.current[key] || 0, behavior: 'instant' as ScrollBehavior });
        return () => { tabScrollPositions.current[key] = window.scrollY; };
    }, [location.pathname, selectedCompany?.id, selectedFY]);

    // Close mobile menu on route change
    useEffect(() => {
        setShowMobileMenu(false);
    }, [location.pathname]);

    // Track offline queue
    useEffect(() => {
        const update = () => setPendingOffline(getPendingCount());
        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        const timer = setInterval(update, 10000);
        return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); clearInterval(timer); };
    }, []);

    // Super admin ya env enabled dono pe admin panel dikhao
    const isAdmin = (user?.email === 'lovneetrathi@gmail.com') || (isAdminConsoleEnabled() && hasAdminAccess(user));

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
                    { to: '/day-book', icon: <Clock size={18} />, label: 'Day Book' },
                    { to: '/reports', icon: <BarChart3 size={18} />, label: 'Reports' },
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
                label: 'Compliance & Tax', // Tax
                items: [
                    { to: '/gst-reports', icon: <Shield size={18} />, label: t('nav.gst_reports') },
                ]
            },
            {
                label: 'Payments & Email', // UPI + Email
                items: [
                    { to: '/upi-payments', icon: <CreditCard size={18} />, label: 'UPI Payments' },
                    { to: '/email-invoice', icon: <Mail size={18} />, label: 'Email Invoices' },
                    { to: '/payment-links', icon: <Link size={18} />, label: 'Payment Links' },
                    { to: '/payment-reminders', icon: <Bell size={18} />, label: 'Payment Reminders' },
                ]
            },
            {
                label: t('ai.title'), // Intelligence
                items: [
                    { to: '/ai-assistant', icon: <Bot size={18} />, label: t('nav.ai_assistant') },
                    { to: '/ai-entry', icon: <Sparkles size={18} />, label: t('dashboard.recent_vouchers') },
                    { to: '/invoice-scanner', icon: <ScanLine size={18} />, label: 'Scanner' },
                    { to: '/document-scanner', icon: <ScanLine size={18} />, label: 'Doc Scanner' },
                    { to: '/user-analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
                    { to: '/tally-sync', icon: <ArrowLeftRight size={18} />, label: 'Tally Sync' },
                    { to: '/payroll', icon: <Briefcase size={18} />, label: 'Payroll' },
                    { to: `${automationBasePath}/bank-automation`, icon: <FileSpreadsheet size={18} />, label: 'Bank Automation' },
                ]
            },
            {
                label: t('nav.settings'), // Settings
                items: [
                    { to: '/settings', icon: <Settings size={18} />, label: t('nav.settings') },
                    { to: '/subscription', icon: <Crown size={18} />, label: 'Subscription' },
                ]
            }
        ];

        // Admin-only section — visible to super_admin and admin
        if (isAdmin) {
            groups.push({
                label: 'ADMIN PANEL',
                items: [
                    { to: '/saas-admin', icon: <Shield size={18} />, label: 'Admin Panel' },
                    { to: '/rbac', icon: <Users size={18} />, label: 'Users & Roles' },
                    { to: '/audit-log', icon: <Activity size={18} />, label: 'Audit Log' },
                ]
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
        { to: '/reports', icon: <BarChart3 size={20} />, label: 'Reports' },
    ], [homePath]);

    return (
        <div className={`app-shell ${['/ledgers', '/sales', '/vouchers'].includes(location.pathname) ? 'ledger-layout' : ''} flex min-h-screen relative overflow-x-hidden bg-[var(--background)]`}>

            {/* ===== MOBILE SIDEBAR OVERLAY ===== */}
            <AnimatePresence>
                {showMobileMenu && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMobileMenu(false)}
                            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
                        />
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="fixed top-0 left-0 h-full w-[280px] z-[70] bg-white dark:bg-[#1E1E2E] border-r border-[var(--border)] md:hidden flex flex-col"
                        >
                            {/* Header — Branding + Close */}
                            <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border)]">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-[var(--primary)] flex items-center justify-center text-white">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
                                        </svg>
                                    </div>
                                    <span className="font-bold text-base text-[var(--on-surface)]">TallyLink</span>
                                </div>
                                <button onClick={() => setShowMobileMenu(false)} className="p-2 rounded-xl hover:bg-[var(--surface-container)] text-[var(--on-surface-variant)] transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* User Profile Card */}
                            {user && (
                                <div className="mx-3 mt-3 p-3 rounded-2xl bg-gradient-to-br from-[var(--primary)]/10 to-[var(--primary)]/5 border border-[var(--primary)]/20">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                                            {user.email?.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-[var(--on-surface)] truncate">{user.email?.split('@')[0]}</p>
                                            <p className="text-[10px] text-[var(--text-muted)] truncate">{user.email}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Company Selector */}
                            {selectedCompany && (
                                <div className="mx-3 mt-2">
                                    <select
                                        value={selectedCompany.id}
                                        onChange={(e) => {
                                            const company = companies.find((c: any) => c.id === e.target.value);
                                            if (company) selectCompany(company);
                                        }}
                                        className="w-full appearance-none px-3 py-2 rounded-xl bg-[var(--surface-container)] border border-[var(--border)] text-xs font-semibold text-[var(--on-surface)] cursor-pointer focus:outline-none focus:border-[var(--primary)]"
                                    >
                                        {companies.map((c: any) => (
                                            <option key={c.id} value={c.id} className="bg-[var(--surface)] text-[var(--on-surface)]">{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Navigation */}
                            <nav className="flex-1 px-3 py-3 overflow-y-auto custom-scrollbar">
                                {navGroups.map((group, idx) => (
                                    <div key={idx} className="mb-4 last:mb-0">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-50 px-2 mb-1.5">
                                            {group.label}
                                        </p>
                                        <div className="space-y-0.5">
                                            {group.items.map((item) => (
                                                <SafeLink
                                                    key={item.to}
                                                    to={item.to}
                                                    onClick={() => setShowMobileMenu(false)}
                                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 ${
                                                        location.pathname === item.to
                                                            ? 'bg-[var(--primary)] text-white font-bold shadow-sm'
                                                            : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] font-medium'
                                                    }`}
                                                >
                                                    <span className={`${location.pathname === item.to ? 'text-white' : 'text-[var(--primary)]'}`}>
                                                        {item.icon}
                                                    </span>
                                                    <span className="text-[13px]">{item.label}</span>
                                                </SafeLink>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </nav>

                            {/* Bottom Actions */}
                            <div className="px-3 py-3 border-t border-[var(--border)] space-y-1.5">
                                <button
                                    onClick={toggleTheme}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] text-sm font-medium transition-all"
                                >
                                    {isDark ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-slate-500" />}
                                    {isDark ? 'Light Mode' : 'Dark Mode'}
                                </button>
                                <button
                                    onClick={() => { signOut(); setShowMobileMenu(false); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 text-sm font-medium transition-all"
                                >
                                    <LogOut size={16} />
                                    Sign Out
                                </button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* ===== DESKTOP SIDEBAR — LiveKeepings Style ===== */}
            <aside
                className={`
                    fixed top-0 left-0 h-full z-40 hidden md:flex flex-col
                    bg-white dark:bg-[#1E1E2E] border-r border-[var(--border)]
                    transition-all duration-200
                    ${sidebarOpen ? 'w-60' : 'w-[68px]'}
                `}
            >
                {/* Logo */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--primary)] flex items-center justify-center text-white flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                        </div>
                        {sidebarOpen && (
                            <>
                                <div>
                                    <h1 className="font-bold text-sm text-[var(--on-surface)] leading-none">TallyLink</h1>
                                    <p className="text-[9px] font-bold text-[var(--primary)] uppercase tracking-wider mt-0.5">Cloud</p>
                                </div>
                                {user && (
                                    <>
                                        <div className="w-px h-6 bg-[var(--border)] mx-1" />
                                        <div className="flex items-center gap-2 ml-auto">
                                            <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                                {user.email?.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-semibold text-[var(--on-surface)] truncate leading-none">{user.email?.split('@')[0]}</p>
                                                <button onClick={() => signOut()} className="text-[8px] font-medium text-red-500 hover:underline leading-none mt-0.5">Sign Out</button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface-container)] text-[var(--text-muted)] transition-colors"
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
                                    companyId={selectedCompany?.id}
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
                            text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] text-sm font-medium
                            transition-all ${sidebarOpen ? '' : 'justify-center'}
                        `}
                    >
                        {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-500" />}
                        {sidebarOpen && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
                    </button>

                    <button
                        onClick={() => safeNavigate('/select-mode')}
                        className={`
                            w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                            text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] text-sm font-medium
                            transition-all ${sidebarOpen ? '' : 'justify-center'}
                        `}
                    >
                        <ArrowLeftRight size={16} />
                        {sidebarOpen && <span>Switch Mode</span>}
                    </button>
                </div>
            </aside>

            {/* ===== MAIN CONTENT ===== */}
            <main className={`
                flex-1 min-h-screen w-full max-w-full overflow-x-hidden
                transition-all duration-200
                ${sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]'}
            `}>
                {/* Mobile Header — Pinned Company Card on Dashboard & Standard on other pages (Hidden on detail pages like /ledgers/:id and /create-invoice) */}
                {(location.pathname === '/create-invoice' || (location.pathname.startsWith('/ledgers/') && location.pathname !== '/ledgers')) ? null : (location.pathname === '/' || location.pathname === '/dashboard') ? (
                    <header className="dashboard-mobile-header md:hidden sticky top-0 z-50">
                        <div className="dashboard-header-main">
                            <button onClick={() => setShowMobileMenu(true)} className="dashboard-menu-button" aria-label="Open menu"><Menu size={20} /></button>
                            <div className="dashboard-company-details">
                                <h2 style={{ fontSize: (selectedCompany?.name || '').length > 32 ? '10px' : (selectedCompany?.name || '').length > 18 ? '12px' : '14px' }}>{selectedCompany?.name || 'Arun Enterprises'}</h2>
                            </div>
                        </div>
                        <ReminderBell userId={user?.id} companyId={selectedCompany?.id} variant="mobile" />
                        <div className="dashboard-header-meta">
                            <span className="dashboard-gst-badge">GST: {selectedCompany?.gstin || 'Not available'}</span>
                            <div className="dashboard-fy-selector" aria-label="Financial year">
                                <button type="button" onClick={() => stepFY(-1)} aria-label="Previous Financial Year">‹</button>
                                <select aria-label="Select financial year" value={selectedFY} onChange={(event) => setSelectedFY(event.target.value)}>
                                    {Array.from({ length: 21 }, (_, index) => {
                                        const year = getFYStartYear(selectedFY) + 5 - index;
                                        const fy = `FY ${year}-${String(year + 1).slice(2)}`;
                                        return <option key={fy} value={fy}>{fy}</option>;
                                    })}
                                </select>
                                <button type="button" onClick={() => stepFY(1)} aria-label="Next Financial Year">›</button>
                            </div>
                        </div>
                    </header>
                ) : (
                    <header className={`standard-mobile-header ${location.pathname === '/vouchers' ? 'voucher-mobile-header' : ''} md:hidden sticky top-0 z-50 h-14 flex items-center gap-1.5 px-2 bg-white dark:bg-[#1E1E2E] border-b border-[var(--border)]`}>
                        <button onClick={() => setShowMobileMenu(true)} className="p-1.5 rounded-lg hover:bg-[var(--surface-container)] text-[var(--on-surface)] transition-colors shrink-0">
                            <Menu size={18} />
                        </button>

                        {/* Title — left of center, truncatable */}
                        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                            <div id="header-title-mobile" className="flex items-center min-w-0 shrink" />
                            <div className="default-header-content contents">
                                <h2 className="text-[13px] font-bold text-[var(--on-surface)] truncate leading-none whitespace-nowrap">
                                    {selectedCompany?.name || 'Dashboard'}
                                </h2>
                            </div>
                            <div id="header-filters-mobile" className="flex items-center shrink-0" />
                        </div>

                        {/* Actions — right, no shrink */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            <div id="header-search-mobile" className="flex items-center" />
                            {pendingOffline > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold animate-pulse">
                                    {pendingOffline}
                                </span>
                            )}
                            <div id="header-actions-mobile" className="flex items-center gap-0.5" />
                            <div className="default-header-actions flex items-center gap-0.5">
                                <SafeLink to="/create-invoice" className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#00E599] text-[#0B1118] font-black text-xs shadow-sm active:scale-95 transition-all">
                                    <Plus size={14} strokeWidth={3} />
                                    <span className="text-[11px] font-black">Invoice</span>
                                </SafeLink>
                            </div>
                        </div>
                    </header>
                )}

                {/* Desktop Header — LiveKeepings Style */}
                <header className="hidden md:flex sticky top-0 z-30 h-14 items-center justify-between px-6 bg-white dark:bg-[#1E1E2E] border-b border-[var(--border)]">
                    <div className="flex items-center gap-4 flex-1">
                        <div id="header-title" className="flex items-center" />
                        <div id="header-search" className="flex-1 max-w-sm" />
                    </div>

                    <div className="flex items-center gap-3">
                        {pendingOffline > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {pendingOffline} offline
                            </span>
                        )}
                        <button onClick={() => setShowSearch(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-container)] text-[var(--text-muted)] text-xs transition-all">
                            <Search size={14} />
                            <span className="hidden lg:inline">Search...</span>
                            <kbd className="hidden lg:flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold bg-[var(--surface-container)] rounded border border-[var(--border)]">
                                <Command size={8} />K
                            </kbd>
                        </button>
                        <div id="header-filters" className="flex items-center gap-2" />
                        <div id="header-actions" className="flex items-center gap-2" />
                        <ReminderBell userId={user?.id} companyId={selectedCompany?.id} />
                        <SafeLink to="/create-invoice" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00E599] hover:bg-[#00c985] text-[#0B1118] font-black text-xs shadow-sm active:scale-95 transition-all">
                            <Plus size={14} strokeWidth={3} />
                            <span>Create Invoice</span>
                        </SafeLink>

                        {location.pathname === '/' && (
                            <>
                                <LanguageSelector />
                                <div className="h-6 w-px bg-[var(--border)]" />
                                <button
                                    onClick={toggleTheme}
                                    className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-container)] text-[var(--on-surface-variant)] transition-colors"
                                >
                                    {isDark ? <Sun size={16} /> : <Moon size={16} />}
                                </button>

                            </>
                        )}
                    </div>
                </header>

                {/* Page Content — NO AnimatePresence to prevent remount */}
                <div className={`app-content ${location.pathname === '/dashboard' || location.pathname === '/' || location.pathname.startsWith('/invoice/') || location.pathname === '/create-invoice' ? 'app-content-special' : 'app-content-standard'} px-[2px] py-1 pb-24 md:pb-6`}>
                    {children}
                </div>
            </main>

            {/* ===== MOBILE BOTTOM NAV — LiveKeepings Style (Hidden on full-screen create-invoice flow) ===== */}
            {location.pathname !== '/create-invoice' && (
                <nav className="app-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#1E1E2E] border-t border-[var(--border)] safe-area-pb pb-1">
                    <div className="flex items-center justify-around h-[60px] px-2">
                        {bottomNavItems.map((item) => {
                            const isActive = location.pathname === item.to || (item.to === '/reports' && location.pathname.startsWith('/reports/')) || (item.to === '/ledgers' && location.pathname.startsWith('/ledgers/')) || (item.to === homePath && (location.pathname === '/' || location.pathname === '/dashboard'));
                            const prefetchOnHover = () => {
                                const importer = routePrefetchMap[item.to.split('?')[0]];
                                if (importer) importer().catch(() => {});

                                // Prefetch data
                                if (!selectedCompany?.id) return;
                                const fy = selectedFY;
                                const fyDates = getFYDates(fy);
                                const path = item.to.split('?')[0];

                                if (path === '/vouchers') prefetchVouchers(selectedCompany.id, 'all', String(getFYStartYear(fy)));
                                else if (path === '/ledgers') prefetchLedgers(selectedCompany.id);
                                else if (path === '/stock') prefetchStock(selectedCompany.id);
                                else if (path === '/sales') prefetchSales(selectedCompany.id, fyDates.from, fyDates.to);
                            };
                            return (
                                <SafeLink key={item.to} to={item.to} onMouseEnter={prefetchOnHover} onFocus={prefetchOnHover} onTouchStart={prefetchOnHover} className="flex-1 relative group">
                                    <div className={`
                                        flex flex-col items-center justify-center gap-0.5 py-1 transition-all duration-150
                                        ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}
                                    `}>
                                        <div className={`p-1.5 rounded-[var(--radius-md)] transition-all ${isActive ? 'bg-[var(--primary)]/10' : ''}`}>
                                            {item.icon}
                                        </div>
                                        <span className={`text-[10px] transition-all ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                                    </div>
                                </SafeLink>
                            );
                        })}
                    </div>
                </nav>
            )}

            {location.pathname !== '/create-invoice' && <AIFloatingButton />}
            <CommandPalette />
            <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} />
        </div>
    );


}
