import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { Capacitor } from '@capacitor/core';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AnnouncerProvider } from './components/ui/SrAnnouncer';
import './App.css';

/* ── Critical Path (eager) ── */
import MobileLandingPage from './pages/MobileLandingPage';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';

/* ── Lazy-loaded pages ── */
const ModuleSelectionPage = lazy(() => import('./pages/ModuleSelectionPage'));
const SelectCompanyPage = lazy(() => import('./pages/SelectCompanyPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LedgersPage = lazy(() => import('./pages/LedgersPage'));
const LedgerDetailPage = lazy(() => import('./pages/LedgerDetailPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage'));
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'));
const PurchaseDetailPage = lazy(() => import('./pages/PurchaseDetailPage'));
const VouchersPage = lazy(() => import('./pages/VouchersPage'));
const VoucherDetailPage = lazy(() => import('./pages/VoucherDetailPage'));
const StockPage = lazy(() => import('./pages/StockPage'));
const SyncHistoryPage = lazy(() => import('./pages/SyncHistoryPage'));
const GSTReportsPage = lazy(() => import('./pages/GSTReportsPage'));
const LedgerStatementPage = lazy(() => import('./pages/LedgerStatementPage'));
const AgingReportPage = lazy(() => import('./pages/AgingReportPage'));
const SalesDashboardPage = lazy(() => import('./pages/SalesDashboardPage'));
const InvoicePDFPage = lazy(() => import('./pages/InvoicePDFPage'));
const CreateInvoicePage = lazy(() => import('./pages/CreateInvoicePage'));
const Dashboard3DPage = lazy(() => import('./pages/Dashboard3DPage'));
const LandingPage3D = lazy(() => import('./pages/LandingPage3D'));
const ProfitLossPage = lazy(() => import('./pages/ProfitLossPage'));
const BalanceSheetPage = lazy(() => import('./pages/BalanceSheetPage'));
const TrialBalancePage = lazy(() => import('./pages/TrialBalancePage'));
const DayBookPage = lazy(() => import('./pages/DayBookPage'));
const CashFlowPage = lazy(() => import('./pages/CashFlowPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'));
const SalesAnalyticsPage = lazy(() => import('./pages/SalesAnalyticsPage'));
const AnalyticsDashboardPage = lazy(() => import('./pages/AnalyticsDashboardPage'));
const BankReconciliationPage = lazy(() => import('./pages/BankReconciliationPage'));
const AIEntryPage = lazy(() => import('./pages/AIEntryPage'));
const EditVoucherPage = lazy(() => import('./pages/EditVoucherPage'));
const PaymentRemindersPage = lazy(() => import('./pages/PaymentRemindersPage'));
const InactiveCustomersPage = lazy(() => import('./pages/InactiveCustomersPage'));
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));
const CreateVoucherPage = lazy(() => import('./pages/CreateVoucherPage'));
const EWayBillPage = lazy(() => import('./pages/EWayBillPage'));
const SalesTeamPage = lazy(() => import('./pages/SalesTeamPage'));
const InvoiceTemplatePage = lazy(() => import('./pages/InvoiceTemplatePage'));
const TeamManagementPage = lazy(() => import('./pages/TeamManagementPage'));
const BackupRestorePage = lazy(() => import('./pages/BackupRestorePage'));
const InvoiceScannerPage = lazy(() => import('./pages/InvoiceScannerPage'));
const PaymentLinksPage = lazy(() => import('./pages/PaymentLinksPage'));
const RecurringInvoicesPage = lazy(() => import('./pages/RecurringInvoicesPage'));
const CustomerPortalPage = lazy(() => import('./pages/CustomerPortalPage'));
const PortalLinksPage = lazy(() => import('./pages/PortalLinksPage'));
const ReportBuilderPage = lazy(() => import('./pages/ReportBuilderPage'));
const InvoiceViewPage = lazy(() => import('./pages/InvoiceViewPage'));
const LegalTemplatePage = lazy(() => import('./pages/LegalTemplatePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StockItemDetailPage = lazy(() => import('./pages/StockItemDetailPage'));

/* ── Loading Fallback ── */
function PageLoader() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
            <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                <p className="text-sm text-[var(--text-muted)]">Loading...</p>
            </div>
        </div>
    );
}

/* ── Auth Loading (for ProtectedRoute) ── */
function AuthLoader() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
            <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
                <p className="text-sm text-[var(--text-muted)]">Loading...</p>
            </div>
        </div>
    );
}

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading, selectedCompany, appMode } = useAuth() as any;
    const location = useLocation();

    if (loading) {
        return <AuthLoader />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // First force mode selection if not set (allow onboarding and admin pages)
    if (!appMode &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        location.pathname !== '/login') {
        return <Navigate to="/select-mode" replace />;
    }

    // If in Tally mode and no company selected, redirect to select-company
    if (appMode === 'tally' && !selectedCompany &&
        location.pathname !== '/select-company' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        !location.pathname.startsWith('/create-invoice') &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/') {
        return <Navigate to="/select-company" replace />;
    }

    return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// Redirects home based on auth state
function HomeRedirect() {
    const { user, loading } = useAuth() as any;

    if (loading) return null;

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    return Capacitor.isNativePlatform() ? <MobileLandingPage /> : <LandingPage3D />;
}

// Sub-component to handle hooks that require Router/Auth context
function AppContent() {
    const navigate = useNavigate();

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

                    if (!error) {
                        navigate('/dashboard');
                    } else {
                        console.error('Error setting session from deep link:', error);
                    }
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
    }, [navigate]);

    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                <Route path="/login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
                <Route path="/auth/callback" element={<Suspense fallback={<PageLoader />}><AuthCallback /></Suspense>} />
                <Route path="/onboarding" element={<Suspense fallback={<PageLoader />}><ProtectedRoute><OnboardingPage /></ProtectedRoute></Suspense>} />
                <Route path="/admin" element={<Suspense fallback={<PageLoader />}><ProtectedRoute><AdminDashboardPage /></ProtectedRoute></Suspense>} />

                {/* Protected Routes */}
                <Route path="/select-mode" element={<Suspense fallback={<PageLoader />}><ProtectedRoute><ModuleSelectionPage /></ProtectedRoute></Suspense>} />
                <Route path="/select-company" element={<Suspense fallback={<PageLoader />}><ProtectedRoute><SelectCompanyPage /></ProtectedRoute></Suspense>} />

                {/* Landing & Legal Pages (Public) */}
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicyPage /></Suspense>} />
                <Route path="/terms" element={<Suspense fallback={<PageLoader />}><TermsPage /></Suspense>} />
                <Route path="/refund" element={<Suspense fallback={<PageLoader />}><RefundPolicyPage /></Suspense>} />
                <Route path="/legal/:slug" element={<Suspense fallback={<PageLoader />}><LegalTemplatePage /></Suspense>} />

                {/* Public Customer Portal */}
                <Route path="/portal/view" element={<Suspense fallback={<PageLoader />}><CustomerPortalPage /></Suspense>} />
                <Route path="/portal/invoice/:id" element={<Suspense fallback={<PageLoader />}><InvoiceViewPage /></Suspense>} />

                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <AppLayout>
                                <Suspense fallback={<PageLoader />}>
                                    <Routes>
                                        <Route path="/dashboard" element={<DashboardPage />} />
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
                                        <Route path="/stock/:id" element={<StockItemDetailPage />} />
                                        <Route path="/sync-history" element={<SyncHistoryPage />} />
                                        <Route path="/gst-reports" element={<GSTReportsPage />} />
                                        <Route path="/ledger-statement/:id" element={<LedgerStatementPage />} />
                                        <Route path="/aging-report" element={<AgingReportPage />} />
                                        <Route path="/sales-dashboard" element={<SalesDashboardPage />} />
                                        <Route path="/invoice/:id" element={<InvoicePDFPage />} />
                                        <Route path="/profit-loss" element={<ProfitLossPage />} />
                                        <Route path="/balance-sheet" element={<BalanceSheetPage />} />
                                        <Route path="/trial-balance" element={<TrialBalancePage />} />
                                        <Route path="/day-book" element={<DayBookPage />} />
                                        <Route path="/cash-flow" element={<CashFlowPage />} />
                                        <Route path="/sales-analytics" element={<SalesAnalyticsPage />} />
                                        <Route path="/analytics-dashboard" element={<AnalyticsDashboardPage />} />
                                        <Route path="/bank-reconciliation" element={<BankReconciliationPage />} />
                                        <Route path="/ai-entry" element={<AIEntryPage />} />
                                        <Route path="/payment-reminders" element={<PaymentRemindersPage />} />
                                        <Route path="/inactive-customers" element={<InactiveCustomersPage />} />
                                        <Route path="/ai-assistant" element={<AIAssistantPage />} />
                                        <Route path="/create-voucher" element={<CreateVoucherPage />} />
                                        <Route path="/eway-bill" element={<EWayBillPage />} />
                                        <Route path="/sales-team" element={<SalesTeamPage />} />
                                        <Route path="/invoice-templates" element={<InvoiceTemplatePage />} />
                                        <Route path="/team-management" element={<TeamManagementPage />} />
                                        <Route path="/backup-restore" element={<BackupRestorePage />} />
                                        <Route path="/invoice-scanner" element={<InvoiceScannerPage />} />
                                        <Route path="/payment-links" element={<PaymentLinksPage />} />
                                        <Route path="/recurring-invoices" element={<RecurringInvoicesPage />} />
                                        <Route path="/portal-links" element={<PortalLinksPage />} />
                                        <Route path="/report-builder" element={<ReportBuilderPage />} />
                                        <Route path="/settings" element={<SettingsPage />} />
                                    </Routes>
                                </Suspense>
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </Suspense>
    );
}

function App() {
    return (
        <ThemeProvider>
            <LanguageProvider>
                <Router>
                    <AuthProvider>
                        <AnnouncerProvider>
                            {/* Skip-to-content link for keyboard/screen reader users */}
                            <a href="#main-content" className="skip-to-content">
                                Skip to main content
                            </a>
                            <div id="main-content">
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
                            <AppContent />
                            </div>
                        </AnnouncerProvider>
                    </AuthProvider>
                </Router>
            </LanguageProvider>
        </ThemeProvider>
    );
}

export default App;

// ADDITIVE LiveKeeping toggle (feature/livekeeping-parity-upgrade) — original routes untouched
export const AppToggleWrapper = () => { const [lk,setLk]=useState(false); return (<div><LiveKeepingToggle/><button onClick={()=>setLk(!lk)} style={{marginLeft:8}}>{lk?"Normal":"LiveKeeping"} Mode</button>{lk?<div style={{background:"#fdf8e6",padding:24,borderRadius:12,marginTop:12}}><h2>LiveKeeping View Active</h2><p>35+ reports • Tally connector • Backup • WhatsApp support path ready</p></div>:null}</div>); };
