# Phase 15 — Rollback and Incident Runbook

## Change record required before rollout

For each rollout, record the exact Git commit, migration version, feature flags/configuration, change owner, rollback owner, expected rollback duration, and the data written after rollout. Also record whether a rollback or a tested forward repair is safer, the validation queries, and the user communication owner.

## Containment rule

If a release gate or production monitor fails, pause rollout immediately. Disable the affected feature flag where possible, preserve logs and correlation IDs, stop further migration activity, and record the incident timeline. Do not delete legitimate payments, audit events, sync records, or user activity as an automatic rollback action.

## Incident categories and first actions

| Incident | Immediate containment | Verification |
|---|---|---|
| Unauthorized serial transfer | Disable transfer action; preserve audit records | Review actor, serial hash, device and company ownership |
| Leaked credential/device secret | Revoke affected device/token and rotate secret | Confirm old token cannot authenticate |
| Payment received but license missing | Keep payment evidence; stop automatic retries | Reconcile gateway event, local payment row and entitlement |
| Incorrect license activation | Freeze further activation for the affected plan | Compare plan, amount, user and activation event |
| Duplicate sync records | Pause affected sync worker or company | Compare idempotency keys and source cursor |
| Cross-account data access | Disable affected endpoint and preserve access logs | Run two-account negative queries |
| Migration mismatch | Stop rollout; do not run ad-hoc destructive SQL | Compare schema version, migration history and row counts |
| Sync backlog | Apply bounded retry/backpressure policy | Check queue age, error code and recovery rate |
| Webhook outage | Keep events pending; do not trust browser success callbacks | Reconcile gateway event delivery and signature status |
| Signed release issue | Halt distribution and revoke release link if needed | Verify installer signature/checksum and clean-machine install |

## Recovery principle

Application code may be reversible, but data mutations often are not. Prefer a tested forward-repair migration when reversing data would create additional damage. Every repair must include before/after counts, authorization checks, idempotency, and a verification query.

## Closure criteria

An incident closes only after containment is confirmed, evidence is preserved, the repair or rollback is verified, affected payments/licenses/sync rows are reconciled, monitoring is green for the agreed observation period, and the owner records the user/support communication and follow-up actions.
