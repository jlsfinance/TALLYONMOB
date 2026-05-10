import { useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LedgersPage from './pages/LedgersPage';
import LedgerDetailPage from './pages/LedgerDetailPage';
import SalesPage from './pages/SalesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import PurchasesPage from './pages/PurchasesPage';
import VouchersPage from './pages/VouchersPage';
import StockPage from './pages/StockPage';

// Protected Route Wrapper
function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

// Navigation Item
function NavItem({ to, icon, label, collapsed, onClick }) {
    const location = useLocation();
    const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
        <Link
            to={to}
            onClick={onClick}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl ${isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
                }`}
        >
            <span className="text-xl">{icon}</span>
            {!collapsed && <span className="font-medium">{label}</span>}
        </Link>
    );
}

// Main Layout
function Layout({ children }) {
    const { user, selectedCompany, companies, selectCompany, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

    const navItems = [
        { to: '/', icon: '🏠', label: 'Dashboard' },
        { to: '/ledgers', icon: '📒', label: 'Ledgers' },
        { to: '/vouchers', icon: '📝', label: 'Vouchers' },
        { to: '/sales', icon: '📈', label: 'Sales' },
        { to: '/purchases', icon: '📉', label: 'Purchases' },
        { to: '/stock', icon: '📦', label: 'Stock' },
    ];

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Mobile Header - Fixed */}
            <div className="lg:hidden bg-white shadow-sm fixed top-0 left-0 right-0 z-50 safe-bottom">
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 -ml-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
                        aria-label="Toggle menu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <h1 className="font-bold text-lg text-blue-600">LiveKeeping</h1>
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {user?.email?.charAt(0)?.toUpperCase()}
                    </div>
                </div>
                {/* Mobile Company Selector - Shows below header when multiple companies */}
                {companies.length > 1 && selectedCompany && (
                    <div className="px-4 pb-2 border-t border-gray-100">
                        <select
                            value={selectedCompany?.id || ''}
                            onChange={(e) => {
                                const c = companies.find(c => c.id === e.target.value);
                                if (c) selectCompany(c);
                            }}
                            className="w-full px-3 py-2 mt-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-[60] mobile-overlay-enter" onClick={closeMobileMenu}>
                    <div className="absolute inset-0 bg-black/50" />
                    <div
                        className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl mobile-sidebar-enter flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b flex-shrink-0">
                            <h1 className="text-xl font-bold text-blue-600">LiveKeeping</h1>
                            <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                        </div>

                        {/* Company selector in mobile menu */}
                        {companies.length > 0 && (
                            <div className="px-4 py-3 border-b flex-shrink-0">
                                <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Company</p>
                                <select
                                    value={selectedCompany?.id || ''}
                                    onChange={(e) => {
                                        const c = companies.find(c => c.id === e.target.value);
                                        if (c) selectCompany(c);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                >
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
                            {navItems.map(item => (
                                <NavItem key={item.to} {...item} collapsed={false} onClick={closeMobileMenu} />
                            ))}
                        </nav>
                        <div className="p-4 border-t flex-shrink-0">
                            <button
                                onClick={() => { signOut(); closeMobileMenu(); }}
                                className="w-full px-4 py-3 text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg font-medium"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-white shadow-xl ${sidebarOpen ? 'w-64' : 'w-20'
                }`} style={{ transition: 'width 0.2s ease' }}>
                {/* Logo */}
                <div className="flex items-center justify-between p-4 border-b">
                    {sidebarOpen ? (
                        <h1 className="text-xl font-bold text-blue-600">LiveKeeping</h1>
                    ) : (
                        <span className="text-2xl">📊</span>
                    )}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 rounded-lg hover:bg-gray-100"
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? "M11 19l-7-7 7-7" : "M13 5l7 7-7 7"} />
                        </svg>
                    </button>
                </div>

                {/* Company Selector */}
                {sidebarOpen && companies.length > 0 && (
                    <div className="p-4 border-b">
                        <select
                            value={selectedCompany?.id || ''}
                            onChange={(e) => {
                                const c = companies.find(c => c.id === e.target.value);
                                if (c) selectCompany(c);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navItems.map(item => (
                        <NavItem key={item.to} {...item} collapsed={!sidebarOpen} />
                    ))}
                </nav>

                {/* User Section */}
                <div className="p-4 border-t">
                    <div className={`flex items-center gap-3 ${sidebarOpen ? '' : 'justify-center'}`}>
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                            {user?.email?.charAt(0)?.toUpperCase()}
                        </div>
                        {sidebarOpen && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{user?.email}</p>
                                <button
                                    onClick={signOut}
                                    className="text-xs text-red-600 hover:text-red-800"
                                >
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`min-h-screen ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`} style={{ transition: 'margin-left 0.2s ease' }}>
                {/* Top padding: mobile header ~56px + optional company selector */}
                <div className={`pt-14 lg:pt-0 ${companies.length > 1 ? 'pt-24' : 'pt-14'} lg:pt-0`}>
                    <div className="p-3 sm:p-4 lg:p-8 page-transition">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}

// App Component
function App() {
    return (
        <Router>
            <AuthProvider>
                <Toaster position="top-center" />
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <Routes>
                                        <Route path="/" element={<DashboardPage />} />
                                        <Route path="/ledgers" element={<LedgersPage />} />
                                        <Route path="/ledgers/:id" element={<LedgerDetailPage />} />
                                        <Route path="/vouchers" element={<VouchersPage />} />
                                        <Route path="/sales" element={<SalesPage />} />
                                        <Route path="/sales/:id" element={<InvoiceDetailPage />} />
                                        <Route path="/purchases" element={<PurchasesPage />} />
                                        <Route path="/stock" element={<StockPage />} />
                                    </Routes>
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </AuthProvider>
        </Router>
    );
}

export default App;
