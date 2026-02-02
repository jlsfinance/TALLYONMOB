import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import AppLayout from './components/layout/AppLayout';
import './App.css';
import { AuthContextType } from './contexts/types';

// Pages - Using new Bento Dark Theme TypeScript pages where available
import LoginPage from './pages/LoginPage.tsx';
import SelectCompanyPage from './pages/SelectCompanyPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import LedgersPage from './pages/LedgersPage.tsx';
import LedgerDetailPage from './pages/LedgerDetailPage.tsx';
import SalesPage from './pages/SalesPage.tsx';
import InvoiceDetailPage from './pages/InvoiceDetailPage.tsx';
import PurchasesPage from './pages/PurchasesPage.tsx';
import PurchaseDetailPage from './pages/PurchaseDetailPage.tsx';
import VouchersPage from './pages/VouchersPage.tsx';
import VoucherDetailPage from './pages/VoucherDetailPage.tsx';
import StockPage from './pages/StockPage.tsx';
import SyncHistoryPage from './pages/SyncHistoryPage.tsx';
import GSTReportsPage from './pages/GSTReportsPage.tsx';
import LedgerStatementPage from './pages/LedgerStatementPage.tsx';
import AgingReportPage from './pages/AgingReportPage.tsx';
import SalesDashboardPage from './pages/SalesDashboardPage.tsx';
import InvoicePDFPage from './pages/InvoicePDFPage.jsx';
import CreateInvoicePage from './pages/CreateInvoicePage.jsx';
import Dashboard3DPage from './pages/Dashboard3DPage.jsx';
import LandingPage3D from './pages/LandingPage3D.tsx';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading, selectedCompany } = useAuth() as AuthContextType;
    const location = useLocation();

    if (loading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-[#050510] text-white">
                <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-sm text-gray-400">Loading...</p>
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

    return <>{children}</>;
}

function App() {
    return (
        <ThemeProvider>
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

                        {/* Protected Routes */}
                        <Route path="/select-company" element={<ProtectedRoute><SelectCompanyPage /></ProtectedRoute>} />

                        {/* Landing Page (Fullscreen, No Layout) */}
                        <Route path="/landing" element={<ProtectedRoute><LandingPage3D /></ProtectedRoute>} />

                        <Route
                            path="/*"
                            element={
                                <ProtectedRoute>
                                    <AppLayout>
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
                                    </AppLayout>
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </AuthProvider>
            </Router>
        </ThemeProvider>
    );
}

export default App;
