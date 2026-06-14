'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { useCompanyStore } from '@/stores/company-store';
import CompanySelector from '@/components/CompanySelector';
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  Receipt,
  Package,
  BarChart3,
  Smartphone,
  RefreshCw,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/ledgers', label: 'Ledgers', icon: BookOpen },
  { href: '/vouchers', label: 'Vouchers', icon: Receipt },
  { href: '/stock', label: 'Stock', icon: Package },
  {
    label: 'Reports',
    icon: BarChart3,
    children: [
      { href: '/reports/balance-sheet', label: 'Balance Sheet' },
      { href: '/reports/profit-loss', label: 'Profit & Loss' },
      { href: '/reports/trial-balance', label: 'Trial Balance' },
      { href: '/reports/gst', label: 'GST Reports' },
      { href: '/reports/outstanding', label: 'Outstanding' },
      { href: '/reports/party-statement', label: 'Party Statement' },
    ],
  },
  { href: '/devices', label: 'Devices', icon: Smartphone },
  { href: '/sync', label: 'Sync History', icon: RefreshCw },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, fetchUser, logout } = useAuthStore();
  const { fetchCompanies } = useCompanyStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCompanies();
    }
  }, [isAuthenticated, fetchCompanies]);

  useEffect(() => {
    if (pathname.startsWith('/reports')) {
      setReportsOpen(true);
    }
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href;

  return (
    <div className="min-h-screen flex bg-[var(--bg-secondary)]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[var(--bg-card)] border-r border-[var(--border)] transition-all duration-200 ${
          sidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">T</span>
            </div>
            {sidebarOpen && (
              <span className="font-semibold text-[var(--text)] whitespace-nowrap">Tally On Mobile</span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            if ('children' in item && item.children) {
              return (
                <div key={item.label}>
                  <button
                    onClick={() => setReportsOpen(!reportsOpen)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      pathname.startsWith('/reports')
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
                    }`}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${reportsOpen ? 'rotate-180' : ''}`}
                        />
                      </>
                    )}
                  </button>
                  {sidebarOpen && reportsOpen && (
                    <div className="ml-6 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive(child.href)
                              ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if ('href' in item) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
                  }`}
                  title={item.label}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            }
            return null;
          })}
        </nav>

        {/* User */}
        <div className="border-t border-[var(--border)] p-3">
          {sidebarOpen ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate">{user?.name}</p>
                <p className="text-xs text-[var(--text-secondary)] truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-[var(--bg-card)] border-b border-[var(--border)] flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <CompanySelector />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
