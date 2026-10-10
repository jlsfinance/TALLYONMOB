# Tallyonmob Professionalization Roadmap

**Purpose:** Make Tallyonmob feel consistent, trustworthy, and polished across the everyday billing and Tally workflows.

**Tracking rule:** Update this file in the same commit as each phase's implementation and push that commit to GitHub. This roadmap is the source of truth for phase status and acceptance checks.

## Phase 1 — Core experience foundation

**Status:** Complete

- Standardize light/dark theme switching, including the saved system preference and initial page render.
- Polish the company selector and responsive dashboard overview, including loading/empty states and clear actions.
- Make company deletion owner-only, atomic, and truthful about success/failure; preserve user-level account records.
- Apply and verify the database function required for secure company cleanup.

**Acceptance checks:** TypeScript check and production build pass; the Supabase RPC exists with the `text` company-ID signature and is executable by authenticated users only.

## Phase 2 — Tally Sync Center

**Status:** In progress

- Show one clear connection state: checking, connected, offline, or unavailable, with a useful retry action.
- Make the port setting safe and persistent so a refresh does not lose the user's configuration.
- Surface voucher-load errors separately from a genuinely empty voucher list.
- Add searchable/selectable voucher handling and visible batch-sync progress.
- Improve sync success/failure summaries, empty states, responsive spacing, and dark-mode contrast.

**Acceptance checks:** A failed connection cannot start a sync; loading, empty, error, and partial-success states are distinguishable; production build and TypeScript check pass.

## Phase 3 — Guided setup and business-ready outputs

**Status:** Planned

- Add guided first-run setup for company selection, Tally connection, and first sync.
- Improve invoice preview/export polish with clear branding and print/share actions.
- Add further business insights and report navigation based on validated user workflows.

**Acceptance checks:** First-time users can reach a successful first sync without guessing; invoice preview and export remain consistent across mobile and desktop; core flows receive repeatable automated checks.

## Delivery log

| Phase | Status | GitHub delivery |
|---|---|---|
| Phase 1 | Complete | `feature/professional-roadmap-phases` — `46a7ee7` |
| Phase 2 | In progress | Sync Center usability and reliability |
| Phase 3 | Planned | Not started |
