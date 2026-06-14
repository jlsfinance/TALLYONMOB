# Pages

Component dependency trees for key pages.

## /dashboard
Entry: `src/pages/DashboardPage.tsx`
Dependencies:
- `src/contexts/AuthContext.tsx`
- `src/contexts/ThemeContext.tsx`
- `src/contexts/LanguageContext.tsx`
- `src/lib/insforge.ts`
- `src/lib/whatsapp.ts`
- `src/components/ui/GlassUI.tsx`
- `src/components/3d/index.ts`
- `src/components/layout/HeaderPortal.tsx`
- `src/pages/BillingDashboard.tsx`

## /ledgers
Entry: `src/pages/LedgersPage.tsx`
Dependencies:
- `src/contexts/AuthContext.tsx`
- `src/components/ui/GlassUI.tsx`
- `src/components/layout/HeaderPortal.tsx`
- `src/components/shared/Autocomplete.tsx`
- `src/components/shared/TransactionCard.tsx`

## /create-invoice
Entry: `src/pages/CreateInvoicePage.tsx`
Dependencies:
- `src/contexts/AuthContext.tsx`
- `src/components/ui/GlassUI.tsx`
- `src/components/layout/HeaderPortal.tsx`
- `src/components/shared/Autocomplete.tsx`
- `src/lib/tally.ts` (assumed lib)
- `src/components/shared/TransactionSlider.tsx`
- `src/utils/numberToWords.ts` (assumed utility)
