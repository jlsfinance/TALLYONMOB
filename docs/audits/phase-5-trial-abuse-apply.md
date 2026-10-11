# Phase 5 — Trial Activation Production Apply Evidence

**Branch:** `phase/5-trial-abuse-preflight`  
**Code commit:** `331264e`  
**Supabase project:** `tallysync` (`pfqmqpboomwtxgyfqnsn`)  
**Applied migration:** `atomic_trial_activation`  
**Applied version:** `20261011033146`

## Applied changes

- Added `public.trial_activation_requests` with a unique `(user_id, idempotency_key)` constraint.
- Added the authenticated-only `trial_activation_requests_own_read` policy.
- Added `public.activate_trial(...)` as a `SECURITY DEFINER` transactional RPC.
- The RPC derives the user from `auth.uid()` and does not trust the dashboard's `user_id` argument.
- Eligibility signals are normalized before comparison.
- Advisory transaction locks serialize requests sharing email, mobile, device, serial, or GST signals.
- Trial history and user license creation happen in the same transaction.
- Duplicate/retried requests return the stored idempotent response.
- Generic error codes avoid returning raw matching identifiers.
- Execution is granted to `authenticated`; public execution is revoked.

## Verification

- Migration appears in Supabase migration history as `atomic_trial_activation`.
- `activate_trial` exists with the expected eight text arguments.
- `authenticated` can execute the RPC.
- `public` cannot execute the RPC.
- The activation-request table has only the authenticated own-read policy.
- Dashboard production build passed before apply.
- Backend regression tests passed: 13 passed, 1 opt-in live integration test skipped because live test environment variables were not configured.

## Remaining operational follow-up

- Add a scheduled retention policy for activation request responses and sensitive trial identifiers.
- Add a support review workflow for legitimate false positives.
- Run an authenticated staging/pilot activation test using a non-production test account before broad rollout.
