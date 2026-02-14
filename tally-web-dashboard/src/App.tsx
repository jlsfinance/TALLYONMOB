import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
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
import ProfitLossPage from './pages/ProfitLossPage';
import BalanceSheetPage from './pages/BalanceSheetPage';
import AuthCallback from './pages/AuthCallback';
import OnboardingPage from './pages/OnboardingPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import RefundPolicyPage from './pages/RefundPolicyPage';
import SalesAnalyticsPage from './pages/SalesAnalyticsPage';
import BankReconciliationPage from './pages/BankReconciliationPage';
import AIEntryPage from './pages/AIEntryPage';
import EditVoucherPage from './pages/EditVoucherPage';
import PaymentRemindersPage from './pages/PaymentRemindersPage';
import InactiveCustomersPage from './pages/InactiveCustomersPage';
import AIAssistantPage from './pages/AIAssistantPage';
import CreateVoucherPage from './pages/CreateVoucherPage';


// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading, selectedCompany, appMode, companies } = useAuth() as any;
    const location = useLocation();

    if (loading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
                <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin mb-4" />
                    <p className="text-sm text-[var(--text-muted)]">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // First force mode selection if not set (allow onboarding and admin pages)
    // Only redirect if we are strictly on the root path or trying to access protected areas without mode
    if (!appMode &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        location.pathname !== '/login') {
        return <Navigate to="/select-mode" replace />;
    }

    // If in Tally mode and no company selected, redirect to select-company
    // This allows users to land on Select Company page even if they have 0 companies
    if (appMode === 'tally' && !selectedCompany &&
        location.pathname !== '/select-company' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        !location.pathname.startsWith('/create-invoice') &&
        location.pathname !== '/select-mode' &&  // Added: prevent redirect loop when trying to switch mode
        location.pathname !== '/') {
        return <Navigate to="/select-company" replace />;
    }

    return <>{children}</>;
}

function App() {
    useEffect(() => {
        // Handle Capacitor deep links (for social login/magic links)
        const handleDeepLink = async (data: any) => {
            const url = new URL(data.url);
            const fragment = url.hash.substring(1); // remove #

            if (fragment) {
                const params = new URLSearchParams(fragment);
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    });

                    if (error) console.error('Error setting session from deep link:', error);
                }
            }
        };

        const setupAppListeners = async () => {
            CapApp.addListener('appUrlOpen', handleDeepLink);
        };

        setupAppListeners();

        return () => {
            CapApp.removeAllListeners();
        };
    }, []);

    return (
        <ThemeProvider>
            <Router>
                <AuthProvider>
                    <Toaster
                        position="top-center"
                        toastOptions={{
                            style: {
                                background: 'var(--surface)',
                                color: 'var(--on-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '10px',
                                boxShadow: 'var(--shadow-lg)',
                                fontSize: '14px',
                                fontWeight: 500,
                            },
                            success: {
                                iconTheme: {
                                    primary: '#16A34A',
                                    secondary: '#fff',
                                },
                            },
                            error: {
                                iconTheme: {
                                    primary: '#DC2626',
                                    secondary: '#fff',
                                },
                            },
                        }}
                    />
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
                        <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />

                        {/* Protected Routes */}
                        <Route path="/select-mode" element={<ProtectedRoute><ModuleSelectionPage /></ProtectedRoute>} />
                        <Route path="/select-company" element={<ProtectedRoute><SelectCompanyPage /></ProtectedRoute>} />

                        {/* Landing & Legal Pages (Public) */}
                        <Route path="/" element={<LandingPage3D />} />
                        <Route path="/privacy" element={<PrivacyPolicyPage />} />
                        <Route path="/terms" element={<TermsPage />} />
                        <Route path="/refund" element={<RefundPolicyPage />} />

                        <Route
                            path="/*"
                            element={
                                <ProtectedRoute>
                                    <AppLayout>
                                        <Routes>
                                            <Route path="/dashboard" element={<DashboardPage />} />
                                            {/* Legacy redirect */}
                                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                            <Route path="/dashboard-3d" element={<Dashboard3DPage />} />
                                            <Route path="/ledgers" element={<LedgersPage />} />
                                            <Route path="/ledgers/:id" element={<LedgerDetailPage />} />
                                            <Route path="/vouchers" element={<VouchersPage />} />
                                            <Route path="/vouchers/:voucherId" element={<VoucherDetailPage />} />
                                            <Route path="/sales" element={<SalesPage />} />
                                            <Route path="/create-invoice" element={<CreateInvoicePage />} />
                                            <Route path="/edit-invoice/:id" element={<EditVoucherPage />} />
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
                                            <Route path="/profit-loss" element={<ProfitLossPage />} />
                                            <Route path="/balance-sheet" element={<BalanceSheetPage />} />
                                            <Route path="/sales-analytics" element={<SalesAnalyticsPage />} />
                                            <Route path="/bank-reconciliation" element={<BankReconciliationPage />} />
                                            <Route path="/ai-entry" element={<AIEntryPage />} />
                                            <Route path="/payment-reminders" element={<PaymentRemindersPage />} />
                                            <Route path="/inactive-customers" element={<InactiveCustomersPage />} />
                                            <Route path="/ai-assistant" element={<AIAssistantPage />} />
                                            <Route path="/create-voucher" element={<CreateVoucherPage />} />
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
