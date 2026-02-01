import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';

// Pages
import LoginPage from './pages/LoginPage';
import SelectCompanyPage from './pages/SelectCompanyPage';
import DashboardPage from './pages/DashboardPage';
import LedgersPage from './pages/LedgersPage';
import LedgerDetailPage from './pages/LedgerDetailPage';
import SalesPage from './pages/SalesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import PurchasesPage from './pages/PurchasesPage';
import PurchaseDetailPage from './pages/PurchaseDetailPage';
import VouchersPage from './pages/VouchersPage';
import VoucherDetailPage from './pages/VoucherDetailPage';
import StockPage from './pages/StockPage';
import SyncHistoryPage from './pages/SyncHistoryPage';
import GSTReportsPage from './pages/GSTReportsPage';
import LedgerStatementPage from './pages/LedgerStatementPage';
import AgingReportPage from './pages/AgingReportPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import InvoicePDFPage from './pages/InvoicePDFPage';
import CreateInvoicePage from './pages/CreateInvoicePage';
import Dashboard3DPage from './pages/Dashboard3DPage';

// Protected Route Wrapper
function ProtectedRoute({ children }) {
    const { user, loading, selectedCompany } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-screen__content">
                    <div className="loading-screen__spinner" />
                    <p className="loading-screen__text">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!selectedCompany && location.pathname !== '/select-company') {
        return <Navigate to="/select-company" replace />;
    }

    return children;
}

// 3D Navigation Item
function NavItem3D({ to, icon, label, collapsed }) {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));

    return (
        <Link
            to={to}
            className={`nav-item-3d ${isActive ? 'active' : ''}`}
        >
            <span className="nav-item-3d__icon">{icon}</span>
            {!collapsed && <span className="nav-item-3d__label">{label}</span>}
            {isActive && <span className="nav-item-3d__glow" />}
        </Link>
    );
}

// Bottom Navigation (Mobile)
function BottomNav3D() {
    const location = useLocation();
    const navItems = [
        { to: '/', icon: '🏠', label: 'Home' },
        { to: '/vouchers', icon: '📝', label: 'Vouchers' },
        { to: '/ledgers', icon: '👥', label: 'Parties' },
        { to: '/stock', icon: '📦', label: 'Items' },
    ];

    return (
        <nav className="bottom-nav-3d">
            {navItems.map(item => {
                const isActive = location.pathname === item.to ||
                    (item.to !== '/' && location.pathname.startsWith(item.to));
                return (
                    <Link key={item.to} to={item.to} className={`bottom-nav-3d__item ${isActive ? 'active' : ''}`}>
                        <span className="bottom-nav-3d__icon">{item.icon}</span>
                        <span className="bottom-nav-3d__label">{item.label}</span>
                        {isActive && <span className="bottom-nav-3d__indicator" />}
                    </Link>
                );
            })}
        </nav>
    );
}

// Main 3D Layout
function Layout3D({ children }) {
    const { user, companies, selectedCompany, selectCompany, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const navItems = [
        { to: '/', icon: '🏠', label: 'Dashboard' },
        { to: '/dashboard-3d', icon: '✨', label: '3D Dashboard' },
        { to: '/sales-dashboard', icon: '📊', label: 'Sales Analytics' },
        { to: '/ledgers', icon: '📒', label: 'Ledgers' },
        { to: '/vouchers', icon: '📝', label: 'Vouchers' },
        { to: '/sales', icon: '📈', label: 'Sales' },
        { to: '/purchases', icon: '📉', label: 'Purchases' },
        { to: '/stock', icon: '📦', label: 'Stock' },
        { to: '/aging-report', icon: '⏰', label: 'Aging Report' },
        { to: '/gst-reports', icon: '🧾', label: 'GST Reports' },
        { to: '/sync-history', icon: '🔄', label: 'Sync History' },
    ];

    return (
        <div className="layout-3d">
            {/* Background */}
            <div className="layout-3d__bg" />
            <div className="layout-3d__bg-grid" />

            {/* Mobile Header */}
            <header className="header-3d-mobile">
                <div className="header-3d-mobile__left">
                    <div className="header-3d-mobile__logo">
                        {selectedCompany?.name?.charAt(0) || 'L'}
                    </div>
                    <div className="header-3d-mobile__info">
                        <h1 className="header-3d-mobile__title">{selectedCompany?.name || 'LiveKeeping'}</h1>
                        <Link to="/select-company" className="header-3d-mobile__switch">
                            Switch <span>↓</span>
                        </Link>
                    </div>
                </div>
                <div className="header-3d-mobile__avatar">
                    {user?.email?.charAt(0)?.toUpperCase()}
                </div>
            </header>

            {/* Desktop Sidebar */}
            <aside className={`sidebar-3d ${sidebarOpen ? 'expanded' : 'collapsed'}`}>
                {/* Logo */}
                <div className="sidebar-3d__header">
                    <div className="sidebar-3d__logo">
                        <span className="sidebar-3d__logo-icon">📊</span>
                        {sidebarOpen && <span className="sidebar-3d__logo-text">LiveKeeping</span>}
                    </div>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="sidebar-3d__toggle"
                    >
                        {sidebarOpen ? '◀' : '▶'}
                    </button>
                </div>

                {/* Company Selector */}
                {sidebarOpen && companies.length > 0 && (
                    <div className="sidebar-3d__company">
                        <select
                            value={selectedCompany?.id || ''}
                            onChange={(e) => {
                                const c = companies.find(c => c.id === e.target.value);
                                if (c) selectCompany(c);
                            }}
                            className="sidebar-3d__select"
                        >
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Navigation */}
                <nav className="sidebar-3d__nav">
                    {navItems.map(item => (
                        <NavItem3D key={item.to} {...item} collapsed={!sidebarOpen} />
                    ))}
                </nav>

                {/* User Section */}
                <div className="sidebar-3d__user">
                    <div className="sidebar-3d__avatar">
                        {user?.email?.charAt(0)?.toUpperCase()}
                    </div>
                    {sidebarOpen && (
                        <div className="sidebar-3d__user-info">
                            <p className="sidebar-3d__email">{user?.email}</p>
                            <button
                                className="sidebar-3d__signout"
                                onClick={() => { signOut(); window.location.href = '/login'; }}
                            >
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Bottom Nav Mobile */}
            <BottomNav3D />

            {/* Main Content */}
            <main className={`main-3d ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
                {children}
            </main>
        </div>
    );
}

// App Component
function App() {
    return (
        <Router>
            <AuthProvider>
                <Toaster
                    position="top-center"
                    toastOptions={{
                        style: {
                            background: 'rgba(15, 15, 35, 0.95)',
                            color: '#fff',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            backdropFilter: 'blur(16px)',
                            borderRadius: '12px',
                        },
                        success: {
                            iconTheme: {
                                primary: '#10b981',
                                secondary: '#fff',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#ef4444',
                                secondary: '#fff',
                            },
                        },
                    }}
                />
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/select-company" element={<ProtectedRoute><SelectCompanyPage /></ProtectedRoute>} />

                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <Layout3D>
                                    <Routes>
                                        <Route path="/" element={<DashboardPage />} />
                                        <Route path="/dashboard-3d" element={<Dashboard3DPage />} />
                                        <Route path="/ledgers" element={<LedgersPage />} />
                                        <Route path="/ledgers/:id" element={<LedgerDetailPage />} />
                                        <Route path="/vouchers" element={<VouchersPage />} />
                                        <Route path="/vouchers/:voucherId" element={<VoucherDetailPage />} />
                                        <Route path="/sales" element={<SalesPage />} />
                                        <Route path="/create-invoice" element={<CreateInvoicePage />} />
                                        <Route path="/sales/:id" element={<InvoiceDetailPage />} />
                                        <Route path="/purchases" element={<PurchasesPage />} />
                                        <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
                                        <Route path="/stock" element={<StockPage />} />
                                        <Route path="/sync-history" element={<SyncHistoryPage />} />
                                        <Route path="/gst-reports" element={<GSTReportsPage />} />
                                        <Route path="/ledger-statement/:id" element={<LedgerStatementPage />} />
                                        <Route path="/aging-report" element={<AgingReportPage />} />
                                        <Route path="/sales-dashboard" element={<SalesDashboardPage />} />
                                        <Route path="/invoice/:id" element={<InvoicePDFPage />} />
                                    </Routes>
                                </Layout3D>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </AuthProvider>
        </Router>
    );
}

export default App;
