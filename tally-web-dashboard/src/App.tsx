import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import AppLayout from './components/layout/AppLayout';
import './App.css';
import { AuthContextType } from './contexts/types';

// Pages - Using new Bento Dark Theme TypeScript pages where available
import LoginPage from './pages/LoginPage';
import ModuleSelectionPage from './pages/ModuleSelectionPage';
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
import LandingPage3D from './pages/LandingPage3D';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading, selectedCompany, appMode } = useAuth() as any;
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

    // First force mode selection if not set
    if (!appMode && location.pathname !== '/select-mode') {
        return <Navigate to="/select-mode" replace />;
    }

    // If in Tally mode, force company selection
    if (appMode === 'tally' && !selectedCompany && location.pathname !== '/select-company') {
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
                        <Route path="/select-mode" element={<ProtectedRoute><ModuleSelectionPage /></ProtectedRoute>} />
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
