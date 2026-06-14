# TallyLink Design System

## Product Context
TallyLink is a finance and accounting operations dashboard for Indian businesses. The Tally Data Viewer is a dense, mobile-first workspace for viewing live Tally ERP data: sales, purchases, ledgers, invoices, vouchers, and statutory accounting reports.

## Visual Direction
- Quiet fintech interface inspired by Razorpay and Zoho Books.
- Prioritize scanning, comparison, and repeated accountant workflows over marketing visuals.
- Use the existing CSS variables from `tally-web-dashboard/src/index.css` and Tailwind utility patterns.
- Font: Inter/system sans-serif.
- Surfaces: white/dark elevated panels, subtle borders, small shadows.
- Accent colors: primary blue for navigation, emerald for income/assets, rose for expenses/liabilities, amber for warnings.

## Layout
- Mobile first, single-column content with sticky app header and bottom navigation from `AppLayout`.
- Desktop uses a sidebar shell and max-width content.
- Tables must overflow horizontally instead of squeezing text.
- Summary cards use compact metrics and short labels.
- Keep controls icon-led where practical.

## Components
- Reuse existing `GlassUI` primitives where possible: `Card`, `Button`, `Badge`, `EmptyState`, `Spinner`.
- Cards may use the app's established rounded-xl/radius tokens.
- Chips are compact segmented controls.
- Drawers are used for voucher drill-down on mobile and desktop.

## Interaction
- Manual refresh plus 30-second auto-sync.
- Offline state should be visible but non-blocking when cached data exists.
- Filters should be sticky on mobile.
- Export actions should remain close to report tabs.
