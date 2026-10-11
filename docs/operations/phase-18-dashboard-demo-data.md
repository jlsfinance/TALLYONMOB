# Phase 18 — Temporary Dashboard Demo Data

The temporary dashboard server can now show clearly labelled sample metrics when `VITE_DEMO_DASHBOARD_DATA=true` in a non-production Vite mode. This is needed because a new temporary browser origin may not have the user's existing company session or synced voucher dataset.

The sample mode returns only in-memory query data for the dashboard component. It does not insert, update, delete, or migrate Supabase rows and does not change the PC app. The UI shows a visible “Demo data mode” warning so sample values cannot be mistaken for real business figures.

Production builds always disable this mode. The local-only mock payment remains separate and stores demo payment history in browser localStorage.

Validation: dashboard served locally, production build passed, and `git diff --check` passed.
