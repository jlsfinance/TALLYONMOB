import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { Capacitor } from '@capacitor/core';
import { ThemeProvider } from './contexts/ThemeContext';
import AppLayout from './components/layout/AppLayout';
import './App.css';
import { LanguageProvider } from './contexts/LanguageContext';

function stringifyLazyError(value: unknown): string {
    if (value instanceof Error) {
        return value.message;
    }

    try {
        return String(value);
    } catch (_) {
        try {
            return JSON.stringify(value);
        } catch (_) {
            return Object.prototype.toString.call(value);
        }
    }
}

function isRenderableComponent(candidate: unknown): boolean {
    if (typeof candidate === 'function') return true;

    if (typeof candidate === 'object' && candidate !== null) {
        const marker = (candidate as { $$typeof?: unknown }).$$typeof;
        return typeof marker === 'symbol';
    }

    return false;
}

function lazyPage<TModule extends { default: unknown }>(
    pageName: string,
    loader: () => Promise<TModule>
) {
    return lazy(async () => {
        try {
            const mod = await loader();
            if (!mod || !("default" in mod)) {
                throw new Error('Missing default export');
            }

            if (!isRenderableComponent(mod.default)) {
                throw new Error('Default export is not a valid React component');
            }

            return mod as any;
        } catch (error) {
            const detail = stringifyLazyError(error);
            throw new Error(`[LazyPage:${pageName}] ${detail}`);
        }
    });
}

const MobileLandingPage = lazyPage('MobileLandingPage', () => import('./pages/MobileLandingPage'));
const LoginPage = lazyPage('LoginPage', () => import('./pages/LoginPage'));
const ModuleSelectionPage = lazyPage('ModuleSelectionPage', () => import('./pages/ModuleSelectionPage'));
const SelectCompanyPage = lazyPage('SelectCompanyPage', () => import('./pages/SelectCompanyPage'));
const DashboardPage = lazyPage('DashboardPage', () => import('./pages/DashboardPage'));
const LedgersPage = lazyPage('LedgersPage', () => import('./pages/LedgersPage'));
const LedgerDetailPage = lazyPage('LedgerDetailPage', () => import('./pages/LedgerDetailPage'));
const SalesPage = lazyPage('SalesPage', () => import('./pages/SalesPage'));
const InvoiceDetailPage = lazyPage('InvoiceDetailPage', () => import('./pages/InvoiceDetailPage'));
const PurchasesPage = lazyPage('PurchasesPage', () => import('./pages/PurchasesPage'));
const PurchaseDetailPage = lazyPage('PurchaseDetailPage', () => import('./pages/PurchaseDetailPage'));
const VouchersPage = lazyPage('VouchersPage', () => import('./pages/VouchersPage'));
const VoucherDetailPage = lazyPage('VoucherDetailPage', () => import('./pages/VoucherDetailPage'));
const StockPage = lazyPage('StockPage', () => import('./pages/StockPage'));
const SyncHistoryPage = lazyPage('SyncHistoryPage', () => import('./pages/SyncHistoryPage'));
const GSTReportsPage = lazyPage('GSTReportsPage', () => import('./pages/GSTReportsPage'));
const LedgerStatementPage = lazyPage('LedgerStatementPage', () => import('./pages/LedgerStatementPage'));
const AgingReportPage = lazyPage('AgingReportPage', () => import('./pages/AgingReportPage'));
const SalesDashboardPage = lazyPage('SalesDashboardPage', () => import('./pages/SalesDashboardPage'));
const InvoicePDFPage = lazyPage('InvoicePDFPage', () => import('./pages/InvoicePDFPage'));
const CreateInvoicePage = lazyPage('CreateInvoicePage', () => import('./pages/CreateInvoicePage'));
const Dashboard3DPage = lazyPage('Dashboard3DPage', () => import('./pages/Dashboard3DPage'));
const LandingPage3D = lazyPage('LandingPage3D', () => import('./pages/LandingPage3D'));
const ProfitLossPage = lazyPage('ProfitLossPage', () => import('./pages/ProfitLossPage'));
const BalanceSheetPage = lazyPage('BalanceSheetPage', () => import('./pages/BalanceSheetPage'));
const AuthCallback = lazyPage('AuthCallback', () => import('./pages/AuthCallback'));
const OnboardingPage = lazyPage('OnboardingPage', () => import('./pages/OnboardingPage'));
const AdminDashboardPage = lazyPage('AdminDashboardPage', () => import('./pages/AdminDashboardPage'));
const PrivacyPolicyPage = lazyPage('PrivacyPolicyPage', () => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazyPage('TermsPage', () => import('./pages/TermsPage'));
const RefundPolicyPage = lazyPage('RefundPolicyPage', () => import('./pages/RefundPolicyPage'));
const SalesAnalyticsPage = lazyPage('SalesAnalyticsPage', () => import('./pages/SalesAnalyticsPage'));
const BankReconciliationPage = lazyPage('BankReconciliationPage', () => import('./pages/BankReconciliationPage'));
const AIEntryPage = lazyPage('AIEntryPage', () => import('./pages/AIEntryPage'));
const EditVoucherPage = lazyPage('EditVoucherPage', () => import('./pages/EditVoucherPage'));
const PaymentRemindersPage = lazyPage('PaymentRemindersPage', () => import('./pages/PaymentRemindersPage'));
const InactiveCustomersPage = lazyPage('InactiveCustomersPage', () => import('./pages/InactiveCustomersPage'));
const AIAssistantPage = lazyPage('AIAssistantPage', () => import('./pages/AIAssistantPage'));
const CreateVoucherPage = lazyPage('CreateVoucherPage', () => import('./pages/CreateVoucherPage'));
const EWayBillPage = lazyPage('EWayBillPage', () => import('./pages/EWayBillPage'));
const SalesTeamPage = lazyPage('SalesTeamPage', () => import('./pages/SalesTeamPage'));
const InvoiceTemplatePage = lazyPage('InvoiceTemplatePage', () => import('./pages/InvoiceTemplatePage'));
const TeamManagementPage = lazyPage('TeamManagementPage', () => import('./pages/TeamManagementPage'));
const BackupRestorePage = lazyPage('BackupRestorePage', () => import('./pages/BackupRestorePage'));
const InvoiceScannerPage = lazyPage('InvoiceScannerPage', () => import('./pages/InvoiceScannerPage'));
const PaymentLinksPage = lazyPage('PaymentLinksPage', () => import('./pages/PaymentLinksPage'));
const RecurringInvoicesPage = lazyPage('RecurringInvoicesPage', () => import('./pages/RecurringInvoicesPage'));
const CustomerPortalPage = lazyPage('CustomerPortalPage', () => import('./pages/CustomerPortalPage'));
const PortalLinksPage = lazyPage('PortalLinksPage', () => import('./pages/PortalLinksPage'));
const ReportBuilderPage = lazyPage('ReportBuilderPage', () => import('./pages/ReportBuilderPage'));
const InvoiceViewPage = lazyPage('InvoiceViewPage', () => import('./pages/InvoiceViewPage'));
const LegalTemplatePage = lazyPage('LegalTemplatePage', () => import('./pages/LegalTemplatePage'));
const SettingsPage = lazyPage('SettingsPage', () => import('./pages/SettingsPage'));
const StockItemDetailPage = lazyPage('StockItemDetailPage', () => import('./pages/StockItemDetailPage'));
const BankAutomationPage = lazyPage('BankAutomationPage', () => import('./pages/BankAutomationPage'));
const InvoiceImportPage = lazyPage('InvoiceImportPage', () => import('./pages/InvoiceImportPage'));
const GstAutomationPage = lazyPage('GstAutomationPage', () => import('./pages/GstAutomationPage'));
const AdminPanel = lazyPage('AdminPanel', () => import('./pages/AdminPanel'));

function RouteLoader() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
            <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin mb-4" />
                <p className="text-sm text-[var(--text-muted)]">Loading...</p>
            </div>
        </div>
    );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading, selectedCompany, appMode } = useAuth() as any;
    const location = useLocation();

    if (loading) return <RouteLoader />;
    if (!user) return <Navigate to="/login" replace />;

    if (!appMode &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        location.pathname !== '/login') {
        return <Navigate to="/select-mode" replace />;
    }

    if (appMode === 'tally' && !selectedCompany &&
        location.pathname !== '/select-company' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        !location.pathname.startsWith('/create-invoice') &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/') {
        return <Navigate to="/select-company" replace />;
    }

    return <>{children}</>;
}

function HomeRedirect() {
    const { user, loading } = useAuth() as any;

    if (loading) return null;
    if (user) return <Navigate to="/dashboard" replace />;

    return Capacitor.isNativePlatform() ? <MobileLandingPage /> : <LandingPage3D />;
}

function AppContent() {
    const navigate = useNavigate();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let listener: { remove?: () => Promise<void> } | null = null;

        const setupAppListener = async () => {
            const { App: CapApp } = await import('@capacitor/app');

            listener = await CapApp.addListener('appUrlOpen', async (data: any) => {
                const url = new URL(data.url);
                const fragment = url.hash.substring(1);

                if (!fragment) return;

                const params = new URLSearchParams(fragment);
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (!accessToken || !refreshToken) return;

                const { error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });

                if (!error) {
                    navigate('/dashboard');
                } else {
                    console.error('Error setting session from deep link:', error);
                }
            });
        };

        setupAppListener();

        return () => {
            listener?.remove?.().catch(() => { });
        };
    }, [navigate]);

    return (
        <Suspense fallback={<RouteLoader />}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
                <Route path="/admin-panel" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />

                <Route path="/select-mode" element={<ProtectedRoute><ModuleSelectionPage /></ProtectedRoute>} />
                <Route path="/select-company" element={<ProtectedRoute><SelectCompanyPage /></ProtectedRoute>} />

                <Route path="/" element={<HomeRedirect />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/refund" element={<RefundPolicyPage />} />
                <Route path="/legal/:slug" element={<LegalTemplatePage />} />

                <Route path="/portal/view" element={<CustomerPortalPage />} />
                <Route path="/portal/invoice/:id" element={<InvoiceViewPage />} />

                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <AppLayout>
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
                                    <Route path="/sales-analytics" element={<SalesAnalyticsPage />} />
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
                                    <Route path="/clients/:clientId/bank-automation" element={<BankAutomationPage />} />
                                    <Route path="/clients/:clientId/invoice-import" element={<InvoiceImportPage />} />
                                    <Route path="/clients/:clientId/gst" element={<GstAutomationPage />} />
                                    <Route path="/settings" element={<SettingsPage />} />
                                </Routes>
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
                <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
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
                        <AppContent />
                    </AuthProvider>
                </Router>
            </LanguageProvider>
        </ThemeProvider>
    );
}

export default App;




