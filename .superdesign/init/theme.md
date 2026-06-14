# Theme

Design tokens, CSS variables, and Tailwind configuration.

## Tailwind Config
```javascript
/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#4A90D9',
                secondary: '#1F2937',
                success: '#10B981',
                warning: '#F59E0B',
                danger: '#EF4444',
                surface: '#FFFFFF',
                bg: '#F3F4F6'
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
```

## CSS Variables (index.css)
```css
:root {
  /* Brand — Deep Trust Blue */
  --primary: #1A56DB;
  --primary-hover: #1648B7;
  --primary-container: #DBEAFE;
  --on-primary: #FFFFFF;
  --on-primary-container: #1E3A5F;
  --primary-glow: rgba(26, 86, 219, 0.12);

  /* Secondary — Slate Teal */
  --secondary: #0F766E;
  --secondary-container: #CCFBF1;
  --on-secondary: #FFFFFF;

  /* Tertiary — Forest Green (Success accent) */
  --tertiary: #15803D;
  --tertiary-container: #DCFCE7;

  /* Neutral Palette — Warm Paper */
  --background: #F7F8FA;
  --surface: #FFFFFF;
  --surface-container: #F1F3F5;
  --surface-variant: #E8EBF0;
  --surface-active: #EDF0F7;
  --surface-hover: #F0F2F8;
  --surface-elevated: rgba(255, 255, 255, 0.98);

  /* Outline */
  --outline: #9CA3AF;
  --outline-variant: #D1D5DB;

  /* Text */
  --on-background: #111827;
  --on-surface: #1F2937;
  --on-surface-variant: #4B5563;
  --text-muted: #6B7280;

  /* Semantic */
  --success: #16A34A;
  --success-bg: #F0FDF4;
  --error: #DC2626;
  --error-bg: #FEF2F2;
  --warning: #D97706;
  --warning-bg: #FFFBEB;
  --info: #2563EB;
  --info-bg: #EFF6FF;

  /* Elevation (Realistic shadows, no glow) */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);

  /* Radius — Rounded but not bubbly */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Glass (very subtle in light mode) */
  --glass-bg: rgba(255, 255, 255, 0.92);
  --glass-border: rgba(0, 0, 0, 0.06);
  --glass-blur: 20px;

  /* Borders */
  --border: #E5E7EB;
}

.dark {
  --primary: #60A5FA;
  --primary-hover: #93C5FD;
  --primary-container: #1E3A5F;
  --on-primary: #0F172A;
  --on-primary-container: #BFDBFE;
  --primary-glow: rgba(96, 165, 250, 0.15);

  --secondary: #5EEAD4;
  --secondary-container: #134E4A;
  --on-secondary: #0F172A;

  --tertiary: #4ADE80;
  --tertiary-container: #14532D;

  --background: #0F1117;
  --surface: #1A1D27;
  --surface-container: #22262F;
  --surface-variant: #2A2E3A;
  --surface-active: #252A36;
  --surface-hover: #2E3340;
  --surface-elevated: rgba(26, 29, 39, 0.97);

  --outline: #6B7280;
  --outline-variant: #374151;

  --on-background: #F3F4F6;
  --on-surface: #E5E7EB;
  --on-surface-variant: #9CA3AF;
  --text-muted: #6B7280;

  --success: #4ADE80;
  --success-bg: rgba(74, 222, 128, 0.1);
  --error: #F87171;
  --error-bg: rgba(248, 113, 113, 0.1);
  --warning: #FBBF24;
  --warning-bg: rgba(251, 191, 36, 0.1);
  --info: #60A5FA;
  --info-bg: rgba(96, 165, 250, 0.1);

  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);

  --glass-bg: rgba(26, 29, 39, 0.92);
  --glass-border: rgba(255, 255, 255, 0.06);
  --border: rgba(255, 255, 255, 0.08);
}
```
