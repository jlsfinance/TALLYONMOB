import { useState } from 'react';
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
function NavItem({ to, icon, label, collapsed }) {
    const location = useLocation();
    const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
        <Link
            to={to}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100'
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
            {/* Mobile Header */}
            <div className="lg:hidden bg-white shadow-sm fixed top-0 left-0 right-0 z-50">
                <div className="flex items-center justify-between p-4">
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 rounded-lg hover:bg-gray-100"
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
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)}>
                    <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b">
                            <h1 className="text-xl font-bold text-blue-600">LiveKeeping</h1>
                            <p className="text-sm text-gray-500">{user?.email}</p>
                        </div>
                        <nav className="p-4 space-y-2">
                            {navItems.map(item => (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100"
                                >
                                    <span className="text-xl">{item.icon}</span>
                                    <span className="font-medium">{item.label}</span>
                                </Link>
                            ))}
                        </nav>
                        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
                            <button
                                onClick={signOut}
                                className="w-full px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-white shadow-xl transition-all ${sidebarOpen ? 'w-64' : 'w-20'
                }`}>
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
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
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
            <main className={`min-h-screen transition-all pt-16 lg:pt-0 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
                <div className="p-4 lg:p-8">
                    {children}
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
