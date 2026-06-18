import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LicenseGateProvider } from './contexts/LicenseGateContext';
import ReadOnlyBanner from './components/ReadOnlyBanner';
import SubscriptionGate from './components/SubscriptionGate';
import { supabase } from './lib/supabase';
import { Capacitor } from '@capacitor/core';
import { initActivityTracker, destroyActivityTracker } from './lib/activityTracker';
import { ThemeProvider } from './contexts/ThemeContext';
import AppLayout from './components/layout/AppLayout';
import { hasAdminAccess, isAdminConsoleEnabled } from './lib/adminAccess';
import './App.css';
import { LanguageProvider } from './contexts/LanguageContext';
import { queryClient } from './lib/queryClient';

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
const BillingLaunchPage = lazyPage('BillingLaunchPage', () => import('./pages/BillingLaunchPage'));
const BillingDashboard = lazyPage('BillingDashboard', () => import('./pages/BillingDashboard'));
const DashboardPage = lazyPage('DashboardPage', () => import('./pages/DashboardPage'));
const TallyDataViewerPage = lazyPage('TallyDataViewerPage', () => import('./pages/TallyDataViewerPage'));
const LiveKeepingsDashboard = lazyPage('LiveKeepingsDashboard', () => import('./pages/LiveKeepingsDashboard'));
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
const LandingPage = lazyPage('LandingPage', () => import('./pages/LandingPage'));
const ProfitLossPage = lazyPage('ProfitLossPage', () => import('./pages/ProfitLossPage'));
const BalanceSheetPage = lazyPage('BalanceSheetPage', () => import('./pages/BalanceSheetPage'));
const BusinessHealthPage = lazyPage('BusinessHealthPage', () => import('./pages/BusinessHealthPage'));
const AuthCallback = lazyPage('AuthCallback', () => import('./pages/AuthCallback'));
const OnboardingPage = lazyPage('OnboardingPage', () => import('./pages/OnboardingPage'));
const AdminDashboardPage = lazyPage('AdminDashboardPage', () => import('./pages/AdminDashboardPage'));
const PrivacyPolicyPage = lazyPage('PrivacyPolicyPage', () => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazyPage('TermsPage', () => import('./pages/TermsPage'));
const RefundPolicyPage = lazyPage('RefundPolicyPage', () => import('./pages/RefundPolicyPage'));
const SupportPage = lazyPage('SupportPage', () => import('./pages/SupportPage'));
const SecurityPage = lazyPage('SecurityPage', () => import('./pages/SecurityPage'));
const AccountDeletionPage = lazyPage('AccountDeletionPage', () => import('./pages/AccountDeletionPage'));
const TrustCenterPage = lazyPage('TrustCenterPage', () => import('./pages/TrustCenterPage'));
const SalesAnalyticsPage = lazyPage('SalesAnalyticsPage', () => import('./pages/SalesAnalyticsPage'));
const BankReconciliationPage = lazyPage('BankReconciliationPage', () => import('./pages/BankReconciliationPage'));
const AIEntryPage = lazyPage('AIEntryPage', () => import('./pages/AIEntryPage'));
const EditVoucherPage = lazyPage('EditVoucherPage', () => import('./pages/EditVoucherPage'));
const PaymentRemindersPage = lazyPage('PaymentRemindersPage', () => import('./pages/PaymentRemindersPage'));
const InactiveCustomersPage = lazyPage('InactiveCustomersPage', () => import('./pages/InactiveCustomersPage'));
const AIAssistantPage = lazyPage('AIAssistantPage', () => import('./pages/AIAssistantPage'));
const BusinessInsightsPage = lazyPage('BusinessInsightsPage', () => import('./pages/BusinessInsightsPage'));
const CreateVoucherPage = lazyPage('CreateVoucherPage', () => import('./pages/CreateVoucherPage'));
const EWayBillPage = lazyPage('EWayBillPage', () => import('./pages/EWayBillPage'));
const SalesTeamPage = lazyPage('SalesTeamPage', () => import('./pages/SalesTeamPage'));
const InvoiceTemplatePage = lazyPage('InvoiceTemplatePage', () => import('./pages/InvoiceTemplatePage'));
const CustomDashboardBuilderPage = lazyPage('CustomDashboardBuilderPage', () => import('./pages/CustomDashboardBuilderPage'));
const PettyCashPage = lazyPage('PettyCashPage', () => import('./pages/PettyCashPage'));
const PayrollPage = lazyPage('PayrollPage', () => import('./pages/PayrollPage'));
const WhatsAppInvoicePage = lazyPage('WhatsAppInvoicePage', () => import('./pages/WhatsAppInvoicePage'));
const DocumentScannerPage = lazyPage('DocumentScannerPage', () => import('./pages/DocumentScannerPage'));
const UserAnalyticsPage = lazyPage('UserAnalyticsPage', () => import('./pages/UserAnalyticsPage'));
const ContactUsPage = lazyPage('ContactUsPage', () => import('./pages/ContactUsPage'));
const AboutUsPage = lazyPage('AboutUsPage', () => import('./pages/AboutUsPage'));
const PricingPage = lazyPage('PricingPage', () => import('./pages/PricingPage'));
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
const MappingMasterPage = lazyPage('MappingMasterPage', () => import('./pages/MappingMasterPage'));
const StockItemDetailPage = lazyPage('StockItemDetailPage', () => import('./pages/StockItemDetailPage'));
const BankAutomationPage = lazyPage('BankAutomationPage', () => import('./pages/BankAutomationPage'));
const InvoiceImportPage = lazyPage('InvoiceImportPage', () => import('./pages/InvoiceImportPage'));
const GstAutomationPage = lazyPage('GstAutomationPage', () => import('./pages/GstAutomationPage'));
const AdminPanel = lazyPage('AdminPanel', () => import('./pages/AdminPanel'));
const AdminPanelPage = lazyPage('AdminPanelPage', () => import('./pages/AdminPanelPage'));
const ActivityLogsPage = lazyPage('ActivityLogsPage', () => import('./pages/ActivityLogsPage'));
const BudgetVsActualPage = lazyPage('BudgetVsActualPage', () => import('./pages/BudgetVsActualPage'));
const TallySyncPage = lazyPage('TallySyncPage', () => import('./pages/TallySyncPage'));
const IncrementalSyncPage = lazyPage('IncrementalSyncPage', () => import('./pages/IncrementalSyncPage'));
const TDSTCSPage = lazyPage('TDSTCSPage', () => import('./pages/TDSTCSPage'));
const ApprovalWorkflowPage = lazyPage('ApprovalWorkflowPage', () => import('./pages/ApprovalWorkflowPage'));
const InventoryValuationPage = lazyPage('InventoryValuationPage', () => import('./pages/InventoryValuationPage'));
const EmailInvoicePage = lazyPage('EmailInvoicePage', () => import('./pages/EmailInvoicePage'));
const UPIPaymentPage = lazyPage('UPIPaymentPage', () => import('./pages/UPIPaymentPage'));
const RBACPage = lazyPage('RBACPage', () => import('./pages/RBACPage'));
const AuditLogPage = lazyPage('AuditLogPage', () => import('./pages/AuditLogPage'));
const DataBackupRestorePage = lazyPage('DataBackupRestorePage', () => import('./pages/DataBackupRestorePage'));
const PushNotificationsPage = lazyPage('PushNotificationsPage', () => import('./pages/PushNotificationsPage'));
const BiometricLoginPage = lazyPage('BiometricLoginPage', () => import('./pages/BiometricLoginPage'));
const DayBookPage = lazyPage('DayBookPage', () => import('./pages/DayBookPage'));
const SubscriptionPage = lazyPage('SubscriptionPage', () => import('./pages/SubscriptionPage'));
if (Capacitor.isNativePlatform()) {
    void import('./pages/MobileLandingPage');
}
let mobileRouteChunksWarm = false;

function warmCommonRouteChunks() {
    if (mobileRouteChunksWarm) return;
    mobileRouteChunksWarm = true;

    void Promise.allSettled([
        import('./pages/MobileLandingPage'),
        import('./pages/LoginPage'),
        import('./pages/ModuleSelectionPage'),
        import('./pages/SelectCompanyPage'),
        import('./pages/TallyDataViewerPage'),
        import('./pages/DashboardPage'),
        import('./pages/BillingDashboard'),
    ]);
}

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

    if (appMode === 'billing' && (
        location.pathname === '/dashboard'
        || location.pathname === '/billing-launch'
    )) {
        return <Navigate to="/billing" replace />;
    }

    if (!appMode &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/billing-launch' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        location.pathname !== '/login') {
        return <Navigate to="/select-mode" replace />;
    }

    if ((appMode === 'tally' || appMode === 'billing') && !selectedCompany &&
        location.pathname !== '/select-company' &&
        location.pathname !== '/billing-launch' &&
        location.pathname !== '/onboarding' &&
        location.pathname !== '/admin' &&
        location.pathname !== '/select-mode' &&
        location.pathname !== '/') {
        return <Navigate to="/select-company" replace />;
    }

    return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth() as any;

    if (loading) return <RouteLoader />;
    if (!user) return <Navigate to="/login" replace />;
    if (!isAdminConsoleEnabled() || !hasAdminAccess(user)) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

function HomeRedirect() {
    const { user, loading, appMode, selectedCompany } = useAuth() as any;

    if (loading) return <RouteLoader />;

    if (user) {
        if (!appMode) return <Navigate to="/select-mode" replace />;
        if ((appMode === 'tally' || appMode === 'billing') && !selectedCompany) {
            return <Navigate to="/select-company" replace />;
        }

        return <Navigate to={appMode === 'billing' ? '/billing' : '/dashboard'} replace />;
    }

    return Capacitor.isNativePlatform() ? <MobileLandingPage /> : <LandingPage />;
}

function AppContent() {
    const navigate = useNavigate();
    const { user, selectedCompany } = useAuth() as any;

    // Initialize activity tracker when user + company are available
    useEffect(() => {
        if (user?.id && selectedCompany?.id) {
            initActivityTracker(user.id, selectedCompany.id);
            return () => destroyActivityTracker();
        }
    }, [user?.id, selectedCompany?.id]);

    useEffect(() => {
        warmCommonRouteChunks();

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
                <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
                <Route path="/admin-panel" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                <Route path="/saas-admin" element={<AdminRoute><AdminPanelPage /></AdminRoute>} />
                <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />

                <Route path="/select-mode" element={<ProtectedRoute><ModuleSelectionPage /></ProtectedRoute>} />
                <Route path="/select-company" element={<ProtectedRoute><SelectCompanyPage /></ProtectedRoute>} />
                <Route path="/billing-launch" element={<ProtectedRoute><Navigate to="/billing" replace /></ProtectedRoute>} />

                <Route path="/" element={<HomeRedirect />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/refund" element={<RefundPolicyPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/account-deletion" element={<AccountDeletionPage />} />
                <Route path="/trust-center" element={<TrustCenterPage />} />
                <Route path="/contact" element={<ContactUsPage />} />
                <Route path="/about" element={<AboutUsPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/legal/:slug" element={<LegalTemplatePage />} />

                <Route path="/portal/view" element={<CustomerPortalPage />} />
                <Route path="/portal/invoice/:id" element={<InvoiceViewPage />} />

                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <AppLayout>
                                <ReadOnlyBanner />
                                <Routes>
                                    <Route path="/dashboard" element={<LiveKeepingsDashboard />} />
                                    <Route path="/legacy-dashboard" element={<DashboardPage />} />
                                    <Route path="/tally-dashboard" element={<TallyDataViewerPage />} />
                                    <Route path="/billing" element={<BillingDashboard />} />
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
                                    <Route path="/business-health" element={<BusinessHealthPage />} />
                                    <Route path="/business-insights" element={<BusinessInsightsPage />} />
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
                                    <Route path="/custom-dashboard" element={<CustomDashboardBuilderPage />} />
                                    <Route path="/petty-cash" element={<PettyCashPage />} />
                                    <Route path="/payroll" element={<PayrollPage />} />
                                    <Route path="/whatsapp-invoices" element={<WhatsAppInvoicePage />} />
                                    <Route path="/document-scanner" element={<DocumentScannerPage />} />
                                    <Route path="/user-analytics" element={<UserAnalyticsPage />} />
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
                                    <Route path="/mapping-master" element={<MappingMasterPage />} />
                                    <Route path="/activity-logs" element={<ActivityLogsPage />} />
                                    <Route path="/budget-vs-actual" element={<BudgetVsActualPage />} />
                                    <Route path="/tally-sync" element={<TallySyncPage />} />
                                    <Route path="/incremental-sync" element={<IncrementalSyncPage />} />
                                    <Route path="/tds-tcs" element={<TDSTCSPage />} />
                                    <Route path="/approval-workflow" element={<ApprovalWorkflowPage />} />
                                    <Route path="/inventory-valuation" element={<InventoryValuationPage />} />
                                    <Route path="/email-invoice" element={<EmailInvoicePage />} />
                                    <Route path="/upi-payments" element={<UPIPaymentPage />} />
                                    <Route path="/rbac" element={<RBACPage />} />
                                    <Route path="/audit-log" element={<AuditLogPage />} />
                                    <Route path="/data-backup" element={<DataBackupRestorePage />} />
                                    <Route path="/push-notifications" element={<PushNotificationsPage />} />
                                    <Route path="/biometric-login" element={<BiometricLoginPage />} />
                                    <Route path="/day-book" element={<DayBookPage />} />
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
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <LanguageProvider>
                    <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
                        <AuthProvider>
                            <LicenseGateProvider>
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
                            </LicenseGateProvider>
                        </AuthProvider>
                    </Router>
                </LanguageProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;












