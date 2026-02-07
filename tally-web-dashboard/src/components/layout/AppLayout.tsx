import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
    LayoutDashboard, FileText, Users, TrendingUp, Package, Shield,
    ChevronLeft, ChevronRight, Sun, Moon, Menu, X, Plus,
    Box, RefreshCw, Bell, ChevronDown, BarChart3, Scale
} from 'lucide-react';
import { Button } from '@/components/ui/GlassUI';

// Navigation Item
const NavItem = ({
    to, icon, label, collapsed, active
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; active: boolean }) => {
    return (
        <Link to={to}>
            <div className={`
                flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] mb-1.5
                transition-all duration-300 group
                ${active
                    ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary-glow)] ring-1 ring-white/10'
                    : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)] hover:text-[var(--on-surface)]'
                }
                ${collapsed ? 'justify-center px-0' : ''}
            `}>
                <span className={`flex-shrink-0 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</span>
                {!collapsed && <span className="font-bold text-xs uppercase tracking-[1px]">{label}</span>}
            </div>
        </Link>
    );
};

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
        // Dispatch a custom event that pages can listen to
        window.dispatchEvent(new CustomEvent('app-refresh-trigger'));
    };

    const tallyNavItems = [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
        { to: '/vouchers', icon: <FileText size={20} />, label: 'Vouchers' },
        { to: '/ledgers', icon: <Users size={20} />, label: 'Parties' },
        { to: '/sales', icon: <TrendingUp size={20} />, label: 'Sales' },
        { to: '/purchases', icon: <Package size={20} />, label: 'Purchases' },
        { to: '/stock', icon: <Box size={20} />, label: 'Stock Summary' },
        { to: '/profit-loss', icon: <BarChart3 size={20} />, label: 'Profit & Loss' },
        { to: '/balance-sheet', icon: <Scale size={20} />, label: 'Balance Sheet' },
        { to: '/gst-reports', icon: <Shield size={20} />, label: 'GST Reports' },
    ];

    const billingNavItems = [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'Billing Desk' },
        { to: '/create-invoice', icon: <Plus size={20} />, label: 'Create Invoice' },
        { to: '/sales', icon: <FileText size={20} />, label: 'Recent Invoices' },
        { to: '/ledgers', icon: <Users size={20} />, label: 'Customers' },
        { to: '/stock', icon: <Box size={20} />, label: 'Inventory' },
        { to: '/profit-loss', icon: <BarChart3 size={20} />, label: 'Profit & Loss' },
        { to: '/balance-sheet', icon: <Scale size={20} />, label: 'Balance Sheet' },
        { to: '/gst-reports', icon: <Shield size={20} />, label: 'GST Filing' },
    ];

    const navItems = appMode === 'tally' ? tallyNavItems : billingNavItems;

    const bottomNavItems = appMode === 'tally' ? [
        { to: '/', icon: <LayoutDashboard size={22} />, label: 'Home' },
        { to: '/vouchers', icon: <FileText size={22} />, label: 'Vouchers' },
        { to: '/ledgers', icon: <Users size={22} />, label: 'Parties' },
        { to: '/sales', icon: <TrendingUp size={22} />, label: 'Sales' },
    ] : [
        { to: '/', icon: <LayoutDashboard size={22} />, label: 'Home' },
        { to: '/create-invoice', icon: <Plus size={22} />, label: 'Bill' },
        { to: '/sales', icon: <FileText size={22} />, label: 'Sales' },
        { to: '/ledgers', icon: <Users size={22} />, label: 'Parties' },
    ];

    return (
        <div className="flex min-h-screen relative overflow-x-hidden">
            {/* Nebula Mesh Background */}
            <div className="nebula-mesh" />

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {showMobileMenu && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMobileMenu(false)}
                            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
                        />
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 left-0 h-full w-[280px] z-[70] bg-[var(--surface)] border-r border-[var(--border)] md:hidden p-6 flex flex-col pt-safe"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center text-white font-black shadow-lg">L</div>
                                    <span className="font-black text-xl tracking-tight text-[var(--on-surface)]">BillBook</span>
                                </div>
                                <button onClick={() => setShowMobileMenu(false)} className="p-2 rounded-xl bg-[var(--surface-variant)] text-[var(--on-surface)]">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Company Selector */}
                            {selectedCompany && (
                                <div className="mb-6 p-4 rounded-3xl bg-[var(--surface-variant)] border border-[var(--glass-border)]">
                                    <p className="text-[9px] font-black text-[var(--primary)] uppercase tracking-widest mb-2 opacity-70">Active Company</p>
                                    <div className="relative">
                                        <select
                                            value={selectedCompany.id}
                                            onChange={(e) => {
                                                const company = companies.find((c: any) => c.id === e.target.value);
                                                if (company) selectCompany(company);
                                                setShowMobileMenu(false);
                                            }}
                                            className="w-full appearance-none px-0 py-1 bg-transparent text-sm font-black text-[var(--on-surface)] cursor-pointer focus:outline-none"
                                        >
                                            {companies.map((c: any) => (
                                                <option key={c.id} value={c.id} className="bg-[var(--surface)] text-[var(--on-surface)]">{c.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--primary)]" />
                                    </div>
                                </div>
                            )}

                            <nav className="flex-1 space-y-2 overflow-y-auto">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setShowMobileMenu(false)}
                                        className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${location.pathname === item.to ? 'bg-[var(--primary)] text-white shadow-lg' : 'text-[var(--on-surface-variant)] active:bg-[var(--surface-active)]'}`}
                                    >
                                        {item.icon}
                                        <span className="font-bold text-[11px] uppercase tracking-widest">{item.label}</span>
                                    </Link>
                                ))}
                            </nav>

                            <div className="pt-6 border-t border-[var(--border)] mt-6 space-y-3">
                                {/* Theme Toggle (Moved from Header) */}
                                <button
                                    onClick={toggleTheme}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--surface-active)] text-[var(--on-surface)] font-black text-[10px] uppercase tracking-widest"
                                >
                                    <span className="flex items-center gap-3">
                                        {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-400" />}
                                        {isDark ? 'Light Mode' : 'Dark Mode'}
                                    </span>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${isDark ? 'bg-amber-400/20' : 'bg-slate-400/20'}`}>
                                        <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${isDark ? 'right-1 bg-amber-400' : 'left-1 bg-slate-400'}`} />
                                    </div>
                                </button>

                                <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface-variant)]">
                                    <div className="w-10 h-10 rounded-full bg-[var(--primary-glow)] flex items-center justify-center text-[var(--primary)] font-black uppercase">
                                        {user?.email?.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-[var(--on-surface)] uppercase truncate">{user?.email?.split('@')[0]}</p>
                                        <button onClick={() => signOut()} className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-0.5">Logout Session</button>
                                    </div>
                                </div>
                                <Button className="w-full justify-center gap-2 py-4 rounded-2xl" variant="primary" onClick={() => navigate('/select-mode')}>
                                    <RefreshCw size={16} />
                                    Switch Mode
                                </Button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Desktop Sidebar */}
            <aside
                className={`
                    fixed top-0 left-0 h-full z-40 hidden md:flex flex-col
                    bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] border-r border-[var(--glass-border)]
                    transition-all duration-300
                    ${sidebarOpen ? 'w-64' : 'w-20'}
                `}
            >
                {/* Logo Section */}
                <div className="h-20 flex items-center justify-between px-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center text-white font-black shadow-lg shadow-[var(--primary-glow)]">
                            L
                        </div>
                        {sidebarOpen && (
                            <div>
                                <h1 className="font-black text-lg tracking-tight text-[var(--on-surface)]">BillBook</h1>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)] -mt-1 opacity-70">
                                    {appMode === 'tally' ? 'Fin-OS' : 'Billing'}
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--text-muted)] transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                </div>

                {/* Company Selector (Desktop) */}
                {sidebarOpen && selectedCompany && (
                    <div className="p-4 mx-3 mb-2 rounded-[var(--radius-lg)] bg-[var(--surface-variant)] border border-[var(--glass-border)]">
                        <div className="relative">
                            <select
                                value={selectedCompany.id}
                                onChange={(e) => {
                                    const company = companies.find((c: any) => c.id === e.target.value);
                                    if (company) selectCompany(company);
                                }}
                                className="w-full appearance-none px-3 py-2 pr-8 bg-transparent text-sm font-black text-[var(--on-surface)] cursor-pointer focus:outline-none"
                            >
                                {companies.map((c: any) => (
                                    <option key={c.id} value={c.id} className="bg-[var(--surface)] text-[var(--on-surface)]">{c.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--primary)]" />
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav className="flex-1 p-3 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavItem
                            key={item.to}
                            {...item}
                            collapsed={!sidebarOpen}
                            active={location.pathname === item.to}
                        />
                    ))}
                </nav>

                {/* Bottom Section */}
                <div className="p-3 border-t border-[var(--border)] space-y-2">
                    <button
                        onClick={toggleTheme}
                        className={`
                            w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)]
                            text-[var(--on-surface-variant)] hover:bg-[var(--surface-active)] hover:text-[var(--on-surface)]
                            transition-all ${sidebarOpen ? '' : 'justify-center'}
                        `}
                    >
                        {isDark ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-indigo-400" />}
                        {sidebarOpen && <span className="text-[10px] font-black uppercase tracking-widest">{isDark ? 'Solar Mode' : 'Lunar Mode'}</span>}
                    </button>

                    {user && sidebarOpen && (
                        <div className="mt-4 p-4 rounded-2xl bg-[var(--surface-variant)] border border-[var(--border)] overflow-hidden relative group">
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] opacity-0 group-hover:opacity-5 transition-opacity" />
                            <div className="relative z-10 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center font-black text-sm shadow-lg shadow-[var(--primary-glow)]">
                                    {user.email?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-[var(--on-surface)] truncate uppercase tracking-tight">{user.email?.split('@')[0]}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <button
                                            onClick={() => signOut()}
                                            className="text-[9px] font-bold text-[var(--error)] hover:underline uppercase tracking-widest"
                                        >
                                            Logout
                                        </button>
                                        <div className="w-1 h-1 rounded-full bg-[var(--border)]" />
                                        <button
                                            onClick={() => navigate('/select-mode')}
                                            className="text-[9px] font-bold text-[var(--primary)] hover:underline uppercase tracking-widest"
                                        >
                                            Swap
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`
                flex-1 min-h-screen
                transition-all duration-300
                ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'}
            `}>
                {/* Mobile Header (Optimized) */}
                <header className="md:hidden sticky top-0 z-50 h-16 flex items-center gap-3 px-4 bg-[var(--surface)]/95 backdrop-blur-2xl border-b border-[var(--border)] shadow-sm">
                    {/* Left: Menu Handle */}
                    <button onClick={() => setShowMobileMenu(true)} className="p-2.5 rounded-xl bg-[var(--surface-variant)] text-[var(--on-surface-variant)] active:scale-90 transition-all">
                        <Menu size={20} />
                    </button>

                    {/* Center: Greeting & Company Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center py-1" onClick={() => setShowMobileMenu(true)}>
                        <p className="text-[clamp(8px,2.5vw,9.5px)] font-black text-[var(--primary)] uppercase tracking-[1px] leading-none mb-1 opacity-90 truncate">
                            {getGreeting()}, {user?.email?.split('@')[0]}
                        </p>
                        <h2 className="text-[clamp(11px,3.8vw,14px)] font-extrabold text-[var(--on-surface)] uppercase leading-none line-clamp-2 tracking-tighter">
                            {selectedCompany?.name || 'Select Company'}
                        </h2>
                    </div>

                    {/* Right: Plus Icon + Refresh (Replacing Theme) */}
                    <div className="flex items-center gap-1.5 ml-auto">
                        <Link to="/create-invoice" className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] text-white shadow-lg active:scale-95 transition-all">
                            <Plus size={18} />
                        </Link>
                        <button
                            onClick={handleGlobalRefresh}
                            className="p-2.5 rounded-xl bg-[var(--surface-active)] text-[var(--primary)] active:scale-95 transition-all shadow-sm ring-1 ring-[#0ea5e9]/10"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </header>

                {/* Desktop Header */}
                <header className="hidden md:flex sticky top-0 z-30 h-14 items-center justify-end px-6 bg-[var(--glass-bg)]/50 backdrop-blur-[var(--glass-blur)] border-b border-[var(--glass-border)]">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors"
                        >
                            {isDark ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button className="relative p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)] transition-colors">
                            <Bell size={18} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--primary)] rounded-full ring-2 ring-[var(--surface)]" />
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-4 md:p-6 pb-24 md:pb-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--glass-bg)] backdrop-blur-xl border-t border-[var(--glass-border)] safe-area-pb rounded-t-[32px] overflow-hidden shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
                <div className="flex items-center justify-around h-20 px-4">
                    {bottomNavItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                            <Link key={item.to} to={item.to} className="flex-1">
                                <div className={`
                                    flex flex-col items-center justify-center gap-1.5 py-2 transition-all duration-300
                                    ${isActive ? 'text-[var(--primary)] scale-110' : 'text-[var(--text-muted)] opacity-60'}
                                `}>
                                    <div className={`${isActive ? 'bg-[var(--primary-glow)] p-2 rounded-xl shadow-lg ring-1 ring-[#0ea5e9]/20' : ''}`}>
                                        {item.icon}
                                    </div>
                                    <span className={`text-[8px] font-black uppercase tracking-[2px] ${isActive ? 'opacity-100' : 'opacity-80'}`}>{item.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
