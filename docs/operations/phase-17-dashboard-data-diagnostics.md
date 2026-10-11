# Phase 17 — Dashboard Data Diagnostics

The dashboard previously caught data-query failures, logged them to the console, and left all KPI state at zero. This made a failed data load look like a real empty company.

The dashboard now keeps a user-visible error state. When loading fails, it displays a retry banner explaining that the selected company, financial year, or sync connection may need attention. The existing zero defaults remain valid for a genuinely empty period, but a failed query is no longer silent.

Validation passed with the dashboard production build and diff checks. No Supabase data, PC app code, or production configuration was changed.
