# Extractable Components

UI components from the codebase that can be extracted as reusable SuperDesign DraftComponents.

## Layout Components
### AppLayout
- Source: `src/components/layout/AppLayout.tsx`
- Category: layout
- Description: Main application shell with responsive navigation.
- Extractable props: `sidebarOpen` (boolean), `showMobileMenu` (boolean), `appMode` (string).

### HeaderPortal
- Source: `src/components/layout/HeaderPortal.tsx`
- Category: layout
- Description: Portal-based header for contextual actions/titles.
- Extractable props: `type` ("title" | "filters" | "actions").

### LanguageSelector
- Source: `src/components/layout/LanguageSelector.tsx`
- Category: layout
- Description: Dropdown for switching application language.

## Basic Components (from `src/components/ui/GlassUI.tsx`)
### Button
- Category: basic
- Description: Modern rounded button with various styles.
- Extractable props: `variant`, `size`, `loading`, `fullWidth`.

### Card
- Category: basic
- Description: Surface container with optional glassmorphism.
- Extractable props: `glass`, `hover`, `padding`.

### StatCard (MetricCard)
- Category: basic
- Description: Card for displaying numeric metrics and trends.
- Extractable props: `title`, `value`, `trend` (object), `color`, `variant`.

### Input
- Category: basic
- Description: Form input field with label and icons.
- Extractable props: `label`, `error`.

### Chip
- Category: basic
- Description: Rounded category/filter chip.
- Extractable props: `selected`.

### Avatar
- Category: basic
- Description: Circular profile representation.
- Extractable props: `name`, `size`, `src`, `color`.

### Badge
- Category: basic
- Description: Small pill-shaped status indicator.
- Extractable props: `variant`.
