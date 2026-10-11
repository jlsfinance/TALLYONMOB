# Phase 11 — Release-Gate Automation

A new GitHub Actions workflow, `.github/workflows/backend-quality.yml`, now runs for backend/security changes on pull requests, phase branches, feature branches, and manual dispatch.

The gate installs the locked backend dependencies, runs the complete backend test suite, checks JavaScript syntax for all source and test files, and verifies that the staging security migration is explicitly marked staging-only. It rejects the migration if it contains table drops, truncation, row deletes, or direct public-table updates.

The gate does not connect to Supabase, apply migrations, publish releases, or mutate production. Its purpose is to prevent an untested or accidentally destructive migration from moving forward in GitHub review.

## Local evidence

The equivalent local checks passed with **28 tests passed and 1 opt-in live integration test skipped**. All backend JavaScript files passed `node --check`, and the migration safety assertions passed.

## Remaining release gates

This CI gate cannot replace an isolated Supabase staging environment. The following remain pending until a staging database is available: backup/restore rehearsal, anonymous and cross-company negative tests against Postgres, dashboard and sync smoke tests, and a Supabase advisor re-check.
