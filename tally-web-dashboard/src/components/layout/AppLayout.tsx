import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
    LayoutDashboard, FileText, Users, TrendingUp, Package, Shield,
    ChevronLeft, ChevronRight, Sun, Moon, LogOut, Menu, X,
    Box, RefreshCw, PieChart, Bell, Settings, ChevronDown
} from 'lucide-react';

// Navigation Item
const NavItem = ({
    to, icon, label, collapsed, active
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; active: boolean }) => {
    return (
        <Link to={to}>
            <div className={`
                flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] mb-1
                transition-all duration-200
                ${active
                    ? 'bg-[var(--primary)] text-[var(--on-primary)] shadow-sm'
                    : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)] hover:text-[var(--on-surface)]'
                }
                ${collapsed ? 'justify-center' : ''}
            `}>
                <span className="flex-shrink-0">{icon}</span>
                {!collapsed && <span className="font-medium text-sm">{label}</span>}
            </div>
        </Link>
    );
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, companies, selectedCompany, selectCompany, signOut } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
        { to: '/vouchers', icon: <FileText size={20} />, label: 'Vouchers' },
        { to: '/ledgers', icon: <Users size={20} />, label: 'Parties' },
        { to: '/sales', icon: <TrendingUp size={20} />, label: 'Sales' },
        { to: '/purchases', icon: <Package size={20} />, label: 'Purchases' },
        { to: '/sales-analytics', icon: <PieChart size={20} />, label: 'Analytics' },
        { to: '/gst-reports', icon: <Shield size={20} />, label: 'GST Reports' },
    ];

    const bottomNavItems = [
        { to: '/', icon: <LayoutDashboard size={22} />, label: 'Home' },
        { to: '/vouchers', icon: <FileText size={22} />, label: 'Vouchers' },
        { to: '/ledgers', icon: <Users size={22} />, label: 'Parties' },
        { to: '/sales', icon: <TrendingUp size={22} />, label: 'Sales' },
    ];

    return (
        <div className="flex min-h-screen bg-[var(--background)]">
            {/* Desktop Sidebar */}
            <aside
                className={`
                    fixed top-0 left-0 h-full z-40 hidden md:flex flex-col
                    bg-[var(--surface)] border-r border-[var(--border)]
                    transition-all duration-300
                    ${sidebarOpen ? 'w-64' : 'w-20'}
                `}
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--primary)] flex items-center justify-center text-white font-bold">
                            L
                        </div>
                        {sidebarOpen && (
                            <div>
                                <h1 className="font-bold text-[var(--on-surface)]">LiveKeeping</h1>
                                <p className="text-xs text-[var(--text-muted)]">Tally on Mobile</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface-variant)] text-[var(--text-muted)]"
                    >
                        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                </div>

                {/* Company Selector */}
                {sidebarOpen && selectedCompany && (
                    <div className="p-4 border-b border-[var(--border)]">
                        <div className="relative">
                            <select
                                value={selectedCompany.id}
                                onChange={(e) => {
                                    const company = companies.find((c: any) => c.id === e.target.value);
                                    if (company) selectCompany(company);
                                }}
                                className="w-full appearance-none px-3 py-2.5 pr-8 rounded-[var(--radius-md)] bg-[var(--surface-variant)] text-sm font-medium text-[var(--on-surface)] cursor-pointer focus:outline-none"
                            >
                                {companies.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
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
                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className={`
                            w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                            text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)]
                            transition-colors ${sidebarOpen ? '' : 'justify-center'}
                        `}
                    >
                        {isDark ? <Sun size={20} /> : <Moon size={20} />}
                        {sidebarOpen && <span className="text-sm font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
                    </button>

                    {/* User */}
                    {user && sidebarOpen && (
                        <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface-variant)]">
                            <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center font-semibold text-sm">
                                {user.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--on-surface)] truncate">{user.email}</p>
                                <button
                                    onClick={() => signOut()}
                                    className="text-xs text-[var(--error)] hover:underline"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className={`
                flex-1 min-h-screen
                transition-all duration-300
                ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'}
            `}>
                {/* Mobile Header */}
                <header className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-[var(--surface)] border-b border-[var(--border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-white font-bold text-sm">
                            L
                        </div>
                        <span className="font-bold text-[var(--on-surface)]">LiveKeeping</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)]"
                        >
                            {isDark ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button className="p-2 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)]">
                            <Bell size={20} />
                        </button>
                    </div>
                </header>

                {/* Desktop Header */}
                <header className="hidden md:flex sticky top-0 z-30 h-14 items-center justify-between px-6 bg-[var(--surface)]/80 backdrop-blur-md border-b border-[var(--border)]">
                    <div></div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)]"
                        >
                            {isDark ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button className="relative p-2 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--on-surface-variant)]">
                            <Bell size={20} />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[var(--error)] rounded-full" />
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
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] border-t border-[var(--border)] safe-area-pb">
                <div className="flex items-center justify-around h-16">
                    {bottomNavItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                            <Link key={item.to} to={item.to} className="flex-1">
                                <div className={`
                                    flex flex-col items-center justify-center gap-1 py-2
                                    ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}
                                `}>
                                    {item.icon}
                                    <span className="text-xs font-medium">{item.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
