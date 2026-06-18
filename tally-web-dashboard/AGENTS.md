# TallyLink Cloud - Project Knowledge Base

## Project Overview
- **Stack**: React + Vite + Supabase + Capacitor (Android)
- **Database**: Supabase PostgreSQL (2 companies, 21 vouchers, 2 ledgers)
- **Auth**: `9c198011-a538-4ef1-91d1-ba29e20bf585` = `lovneetrathi@gmail.com` (Super Admin)
- **Supabase Project**: `pfqmqpboomwtxgyfqnsn`
- **Android APK**: `android\app\build\outputs\apk\debug\app-debug.apk`
- **Indian Financial Year**: Apr 1 - Mar 31

## Completed Work (Phase 1-5 + Features)

### Database Schema
- `tds_tcs_entries` table: columns `tax_rate`, `entry_date`, `certificate_generated`, `is_non_resident`, `nationality`, `tax_treaty_country`, `article_number`
- Missing tables SQL created in `supabase/migrations/`:
  - `20250617_real_data_tables.sql` — approval_rules, approval_items, payment_links, email_queue, reminder_logs, tds_tcs_entries
  - `20250617_saas_licensing_system.sql` — user_roles, subscription_plans, user_licenses, trial_history, coupons, payments, etc.
  - `20250617_incremental_sync_engine.sql` — sync_state, sync_queue, sync_checkpoint, sync_history, deleted_records
  - `20250618_missing_feature_tables.sql` — **17 new tables**: employees, payslips, petty_cash_entries, company_settings, approval_delegations, bank_ledger_mappings, budgets, eway_bills, gst_automation_runs, imported_invoices, notification_logs, notification_templates, notification_settings, user_devices, recurring_invoices, sales_visits, team_members
  - `20250618_fix_rls_policies.sql` — RLS fix for vouchers/ledgers/stock_items (drop bad policies, create auth-only policies)
- **All SQL NOT applied via MCP yet** — must run in Supabase dashboard

### Speed Optimizations
- **Lazy-loaded jsPDF + xlsx + autoTable** (~1287 kB removed from initial bundle) — StockPage.tsx, TallyDataViewerPage.tsx
- **Manual chunk splitting** — main chunk 789 kB → 222 kB (58 kB gzip)
  - `vendor-react` (163 kB), `vendor-supabase` (212 kB), `vendor-charts` (413 kB), `vendor-motion` (123 kB), `vendor-ui` (lucide+toast), `vendor-utils` (date-fns+react-query)
  - Heavy libs (recharts, jsPDF, xlsx, html2canvas) lazy-loaded separately
- **Prefetch on nav hover** — AppLayout.tsx:78 with `routePrefetchMap`
- **All pages code-split** via `lazyPage()` wrapper in App.tsx
- **Service Worker (PWA)** — workbox-based, 213 precache entries

### Pages Fixed / Redesigned
| Page | Changes |
|---|---|
| **VouchersPage.tsx** | Smart Filter System (6 combined filters), Voucher Type Row, Month Row with FY dropdown, Advanced Filters, CSV Export, `cycleFy` dead code removed |
| **DayBookPage.tsx** | Fixed wrong columns (`vch_date`→`voucher_date`, `vch_type`→`voucher_type`), field normalization, null guards for all `parseISO` calls |
| **TDSTCSPage.tsx** | Mobile-optimized: compact 2-line card views for Form 26Q/27Q/TCS, responsive Compliance Calendar, 2-col summary cards on mobile |
| **DashboardPage.tsx** | Receipt/Payment KPI click navigates to `/vouchers` with `state.type` filter, white border removed |
| **TallySyncPage.tsx** | Real-time TallySyncIndicator integrated, live connection check |

### Features Built
| Feature | File | Description |
|---|---|---|
| **Bank Statement CSV Import** | `BankReconciliationPage.tsx` | Upload CSV, auto-parse, match with vouchers by date+amount, show matched/unmatched |
| **Offline Mode** | `lib/offlineQueue.ts` | localStorage queue for vouchers when offline, auto-sync on reconnect |
| **Offline Queue Hook** | `hooks/useOfflineVoucher.ts` | `useOfflineVoucher()` — save to queue when offline, auto-restore |
| **Offline Indicator** | `AppLayout.tsx` | Amber badge in mobile/desktop header showing pending offline vouchers |
| **Real-time Tally Sync Status** | `components/common/TallySyncIndicator.tsx` | Live connection check every 30s, compact/full modes |
| **WhatsApp Payment Reminders** | `PaymentRemindersPage.tsx` | Party selection, templates, bulk send, history |
| **Multi-user Approval Workflow** | `ApprovalWorkflowPage.tsx` | Rules, items, delegations, approve/reject/escalate |
| **OCR Receipt Scanner** | `InvoiceScannerPage.tsx` | Camera → Gemini AI → extract data → create voucher |
| **Custom Report Builder** | `ReportBuilderPage.tsx` | Drag-and-drop fields, save/load reports, export CSV/PDF |
| **Bank Reconciliation** | `BankReconciliationPage.tsx` | Bank-wise transaction analysis, filters, stats |
| **Invoice PDF Generation** | `InvoicePDFPage.tsx` | jsPDF + autoTable (lazy-loaded) |
| **AI Business Insights** | `BusinessInsightsPage.tsx` | 15-20 real financial ratios from actual data |
| **Tally Sync** | `TallySyncPage.tsx` | Export vouchers to Tally via XML, connection check |
| **Tally Data Viewer** | `TallyDataViewerPage.tsx` | View Tally data, export PDF/Excel (lazy-loaded) |
| **GST Reports** | `GSTReportsPage.tsx` | GSTR-1, GSTR-3B, HSN-wise summaries |
| **E-Way Bill** | `EWayBillPage.tsx` | Generate E-Way bills |
| **Inventory Valuation** | `InventoryValuationPage.tsx` | Stock valuation reports |
| **Budget vs Actual** | `BudgetVsActualPage.tsx` | Budget tracking |
| **Recurring Invoices** | `RecurringInvoicesPage.tsx` | Auto-create recurring invoices |
| **Sales Analytics** | `SalesAnalyticsPage.tsx` | Sales dashboards, trends |
| **Aging Report** | `AgingReportPage.tsx` | Receivable/payable aging |
| **Ledger Statement** | `LedgerStatementPage.tsx` | Party-wise statements |
| **Invoice Import** | `InvoiceImportPage.tsx` | Bulk invoice import |
| **Bank Automation** | `BankAutomationPage.tsx` | Automated bank reconciliation |
| **GST Automation** | `GstAutomationPage.tsx` | Automated GST filing |
| **UPI Payments** | `UPIPaymentPage.tsx` | UPI payment collection |
| **Email Invoices** | `EmailInvoicePage.tsx` | Send invoices via email |
| **Payment Links** | `PaymentLinksPage.tsx` | Generate payment links |
| **Push Notifications** | `PushNotificationsPage.tsx` | Browser push notifications |
| **Biometric Login** | `BiometricLoginPage.tsx` | Fingerprint/face auth |
| **RBAC** | `RBACPage.tsx` | Role-based access control |
| **Audit Log** | `AuditLogPage.tsx` | Activity logging |
| **Data Backup** | `DataBackupRestorePage.tsx` | Backup/restore data |
| **Team Management** | `TeamManagementPage.tsx` | User/team management |
| **Sales Team** | `SalesTeamPage.tsx` | Sales team tracking |
| **Inactive Customers** | `InactiveCustomersPage.tsx` | Customer retention |
| **AI Assistant** | `AIAssistantPage.tsx` | AI chat for business queries |
| **AI Entry** | `AIEntryPage.tsx` | AI-powered voucher creation |
| **Invoice Template** | `InvoiceTemplatePage.tsx` | Custom invoice templates |
| **Admin Dashboard** | `AdminDashboardPage.tsx` | Admin analytics |
| **Admin Panel** | `AdminPanelPage.tsx` | SaaS admin panel |
| **Legal Templates** | `LegalTemplatePage.tsx` | Legal document templates |
| **Subscription** | `SubscriptionPage.tsx` | Subscription management |
| **Customer Portal** | `CustomerPortalPage.tsx` | Customer self-service |
| **Landing Page** | `LandingPage.tsx` | Full data journey, features, pricing, FAQ |
| **OFX/QIF Bank Import** | `BankReconciliationPage.tsx` | CSV/OFX/QIF auto-parsing, voucher matching |
| **Custom Dashboard Builder** | `CustomDashboardBuilderPage.tsx` | Drag-and-drop widgets, save layout |
| **Petty Cash** | `PettyCashPage.tsx` | Category-based expense tracking |
| **Payroll** | `PayrollPage.tsx` | Employee/salary/payslip management |
| **WhatsApp Invoices** | `WhatsAppInvoicePage.tsx` | Send invoices via WhatsApp |
| **Document Scanner** | `DocumentScannerPage.tsx` | Gemini AI OCR → voucher creation |
| **Dark Mode (System)** | `ThemeContext.tsx` | 3-mode: light/dark/system with live listener |
| **Offline Queue** | `lib/offlineQueue.ts` | localStorage queue, auto-sync on reconnect |

### Infrastructure
- **Query Client**: `lib/queryClient.ts` — TanStack React Query
- **Prefetch**: `lib/prefetch.ts` — Route-level prefetch utilities
- **Performance**: `lib/performance.ts` — Performance monitoring
- **Export CSV**: `lib/exportToCSV.ts` — Reusable CSV export utility
- **Gemini AI**: `lib/GeminiService.ts` — AI integration
- **WhatsApp**: `lib/whatsapp.ts` — WhatsApp integration
- **Firebase**: `lib/firebase.js` — Push notifications
- **Licensing**: `lib/licensing.ts` — License management
- **Admin Access**: `lib/adminAccess.ts` — Super Admin check
- **Incremental Sync**: `lib/incrementalSync.ts` — Incremental data sync
- **Tally Export**: `services/tallyExportService.ts` — XML generation for Tally

### UI Components
- `components/ui/GlassUI.tsx` — Glass morphism UI components
- `components/ui/Skeleton.tsx` — Loading skeletons
- `components/layout/HeaderPortal.tsx` — Header injection system
- `components/layout/AppLayout.tsx` — Main layout with nav, sidebar, offline indicator
- `components/common/SafeLink.tsx` — Safe navigation links
- `components/common/TallySyncIndicator.tsx` — Real-time sync status
- `components/AIFloatingButton.tsx` — Floating AI button
- `components/GlobalSearch.tsx` — Global search
- `components/ui/CommandPalette.tsx` — Cmd+K command palette
- `components/3d/` — 3D components (BarChart3D, KPICard, ProgressRing, GlassCard)

### Hooks
- `hooks/useSafeNavigate.ts` — Safe navigation with error handling
- `hooks/useOfflineVoucher.ts` — Offline voucher queue management

### Config & Build
- **Vite config**: Manual chunk splitting (react, supabase, charts, motion, ui, utils), chunkSizeWarningLimit 800
- **Capacitor**: 9 plugins (App, Device, Filesystem, Haptics, Keyboard, Preferences, Share, SplashScreen, StatusBar)
- **Build**: `npx vite build` clean (main chunk 222 kB / 58 kB gzip), `npx cap sync android` 9 plugins, `gradlew assembleDebug` success

## Supabase Tables
- `companies` — 2 companies
- `vouchers` — 21 vouchers (min date: 2025-04-01, max: 2026-03-01)
- `ledgers` — 2 ledgers (Sundry Debtors ₹10,962)
- `stock_items` — stock items
- `voucher_ledger_entries` — ledger entries per voucher

## Voucher Table Columns
`id, voucher_type, voucher_number, party_name, grand_total, voucher_date, narration, total_amount, is_deleted, company_id, sync_status`

**Does NOT have**: `items`, `ledger_entries`, `vch_date`, `vch_type`

## Ledger Table Columns
`id, name, parent, current_balance, opening_balance, company_id`

**Does NOT have**: `is_deleted`, `group_name` — use `parent` for group filtering

## Routes
| Route | Page | Lazy-loaded |
|---|---|---|
| `/dashboard` | DashboardPage | Yes |
| `/vouchers` | VouchersPage | Yes |
| `/day-book` | DayBookPage | Yes |
| `/ledgers` | LedgersPage | Yes |
| `/ledger/:id` | LedgerDetailPage | Yes |
| `/sales` | SalesPage | Yes |
| `/purchases` | PurchasesPage | Yes |
| `/stock` | StockPage | Yes |
| `/stock/:id` | StockItemDetailPage | Yes |
| `/profit-loss` | ProfitLossPage | Yes |
| `/balance-sheet` | BalanceSheetPage | Yes |
| `/gst-reports` | GSTReportsPage | Yes |
| `/tds-tcs` | TDSTCSPage | Yes |
| `/approval-workflow` | ApprovalWorkflowPage | Yes |
| `/upi-payments` | UPIPaymentPage | Yes |
| `/email-invoice` | EmailInvoicePage | Yes |
| `/payment-links` | PaymentLinksPage | Yes |
| `/payment-reminders` | PaymentRemindersPage | Yes |
| `/ai-assistant` | AIAssistantPage | Yes |
| `/ai-entry` | AIEntryPage | Yes |
| `/invoice-scanner` | InvoiceScannerPage | Yes |
| `/tally-sync` | TallySyncPage | Yes |
| `/bank-reconciliation` | BankReconciliationPage | Yes |
| `/bank-automation` | BankAutomationPage | Yes |
| `/invoice-import` | InvoiceImportPage | Yes |
| `/gst-automation` | GstAutomationPage | Yes |
| `/recurring-invoices` | RecurringInvoicesPage | Yes |
| `/budget-vs-actual` | BudgetVsActualPage | Yes |
| `/settings` | SettingsPage | Yes |
| `/subscription` | SubscriptionPage | Yes |
| `/saas-admin` | AdminPanelPage | Yes |
| `/rbac` | RBACPage | Yes |
| `/audit-log` | AuditLogPage | Yes |
| `/data-backup` | DataBackupRestorePage | Yes |
| `/push-notifications` | PushNotificationsPage | Yes |
| `/biometric-login` | BiometricLoginPage | Yes |
| `/activity-logs` | ActivityLogsPage | Yes |
| `/sales-analytics` | SalesAnalyticsPage | Yes |
| `/sales-dashboard` | SalesDashboardPage | Yes |
| `/sales-team` | SalesTeamPage | Yes |
| `/aging-report` | AgingReportPage | Yes |
| `/ledger-statement` | LedgerStatementPage | Yes |
| `/inventory-valuation` | InventoryValuationPage | Yes |
| `/invoice-template` | InvoiceTemplatePage | Yes |
| `/eway-bill` | EWayBillPage | Yes |
| `/inactive-customers` | InactiveCustomersPage | Yes |
| `/business-health` | BusinessHealthPage | Yes |
| `/business-insights` | BusinessInsightsPage | Yes |
| `/report-builder` | ReportBuilderPage | Yes |
| `/admin-dashboard` | AdminDashboardPage | Yes |
| `/create-invoice` | CreateInvoicePage | Yes |
| `/create-voucher` | CreateVoucherPage | Yes |
| `/edit-voucher/:id` | EditVoucherPage | Yes |
| `/invoice/:id` | InvoiceDetailPage | Yes |
| `/invoice-pdf/:id` | InvoicePDFPage | Yes |
| `/invoice-view/:id` | InvoiceViewPage | Yes |
| `/purchase/:id` | PurchaseDetailPage | Yes |
| `/voucher/:id` | VoucherDetailPage | Yes |
| `/legal-templates` | LegalTemplatePage | Yes |
| `/incremental-sync` | IncrementalSyncPage | Yes |
| `/mapping-master` | MappingMasterPage | Yes |
| `/portal-links` | PortalLinksPage | Yes |
| `/customer-portal` | CustomerPortalPage | Yes |
| `/3d-dashboard` | Dashboard3DPage | Yes |
| `/3d-landing` | LandingPage3D | Yes |
| `/landing` | LandingPage | Yes |
| `/custom-dashboard` | CustomDashboardBuilderPage | Yes |
| `/petty-cash` | PettyCashPage | Yes |
| `/payroll` | PayrollPage | Yes |
| `/whatsapp-invoices` | WhatsAppInvoicePage | Yes |
| `/document-scanner` | DocumentScannerPage | Yes |
| `/mobile` | MobileLandingPage | Yes |
| `/login` | LoginPage | Yes |
| `/auth/callback` | AuthCallback | Yes |
| `/onboarding` | OnboardingPage | Yes |
| `/module-selection` | ModuleSelectionPage | Yes |
| `/select-company` | SelectCompanyPage | Yes |
| `/billing` | BillingLaunchPage | Yes |
| `/billing-dashboard` | BillingDashboard | Yes |
| `/privacy` | PrivacyPolicyPage | Yes |
| `/terms` | TermsPage | Yes |
| `/refund` | RefundPolicyPage | Yes |
| `/support` | SupportPage | Yes |
| `/security` | SecurityPage | Yes |
| `/account-deletion` | AccountDeletionPage | Yes |
| `/trust-center` | TrustCenterPage | Yes |

## Potential Next Features (Not Yet Built)
1. **Multi-company Consolidated Reports** — P&L, Balance Sheet across all companies
2. **Real-time Collaboration** — Multi-user editing same voucher
3. **Barcode Scanner for Inventory** — Scan barcode → auto-fill stock entry
4. **Automated Bank Reconciliation** — AI-powered matching (partially done)
5. **SMS Payment Reminders** — Send reminders via SMS
6. **Multi-currency Support** — Foreign currency transactions
7. **TDS/TCS Auto-calculation** — Auto-deduct TDS/TCS on transactions
8. **Expense Approval Chain** — Multi-level expense approvals
9. **Fixed Asset Register** — Track depreciation
10. **GST Return Filing** — Direct filing from app
11. **E-Invoice Integration** — Auto-generate e-invoices
12. **Multi-language Support** — Hindi, Tamil, Telugu, etc.
13. **Voice Commands** — "Create voucher for ₹5000 Sales"

### Completed (Previously on this list)
- ✅ Bank Statement CSV/OFX Import
- ✅ Custom Dashboard Builder
- ✅ WhatsApp Invoice Sending
- ✅ Petty Cash Management
- ✅ Payroll Integration
- ✅ Dark Mode Auto-switch
- ✅ Document Scanner
