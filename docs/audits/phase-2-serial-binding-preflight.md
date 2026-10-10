# Phase 2 — Serial binding and transfer preflight

**Branch:** `phase/2-serial-binding-preflight`  
**Parent:** `phase/1-canonical-model-preflight` (`0bd3434`)  
**Status:** **AUDITED, IMPLEMENTATION BLOCKED PENDING PHASE 1/GATE 0**

## Source findings

The current PC client has several paths that must be closed by a server-authoritative implementation:

- `tally-windows-sync/ViewModels/MainViewModel.cs` contains a mismatch dialog that offers to update the stored serial and continue.
- `tally-windows-sync/Services/SyncManager.cs` exposes `UpdateTallySerial`, which writes the local cache and logs the serial.
- `tally-windows-sync/Services/ApiClient.cs` contains `UpdateUserTallySerialAsync`, a direct client-side update path for the user license serial.
- `tally-windows-sync/Services/SyncManager.cs` also attempts to sync the serial to the user profile during sync.
- `tally-windows-sync/Services/LicenseService.cs` returns a `boundSerial` value and formats it into a user-visible error; this must be changed to a consistently masked value.
- `tally-web-dashboard/supabase/functions/validate-license/index.ts` accepts email/password fallback authentication, auto-binds a serial, has a super-admin override path, and contains mismatch responses that include the bound serial. These paths require security review before production use.

These findings are recorded only; this branch does not change client or production behavior.

## Required target contract

1. Normalize serial input before comparison.
2. Keep the local serial as a cache/display aid only.
3. Never log or return raw serial values.
4. Derive account identity from the verified session; do not trust a client-supplied user ID.
5. Perform first binding atomically after entitlement, company, and device checks.
6. Return only masked serial metadata and a correlation ID.
7. On mismatch, block protected sync and allow only a server-recorded transfer request.
8. Remove every direct client update/upsert path that can replace a binding.
9. Implement an explicit transfer state machine and audit events.
10. Decide transfer limits, verification, cooldown, device/session invalidation, and recovery policy before hard-coding them.

## Required tests

- First binding succeeds once and emits an audit event.
- Concurrent first binds allow at most one winner.
- Local settings edits cannot bypass server mismatch enforcement.
- Cross-account serial conflicts reveal no other account details.
- Pending transfer keeps the old binding authoritative.
- Unauthorized transfer approval is denied and audited.
- Ordinary roles never receive a full serial.
- Logs, exports, telemetry, crash reports, and errors contain no raw serial.
- Direct client license serial updates are rejected.

## Gate and next branch

Phase 2 implementation must not start until Phase 0 backup/restore proof and Phase 1 canonical-table approval are complete. The next implementation branch should be created as `phase/2-serial-binding-implementation` from this branch only after the server transaction/RPC contract and transfer policy are approved. It must be tested against an isolated Supabase restore before any deployment.
