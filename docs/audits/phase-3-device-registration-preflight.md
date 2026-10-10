# Phase 3 — Windows device registration and lifecycle preflight

**Branch:** `phase/3-device-registration-preflight`  
**Parent:** `phase/2-serial-binding-preflight` (`d77671d`)  
**Status:** **AUDITED, IMPLEMENTATION BLOCKED PENDING GATE 0–2**

## Verified source evidence

### Existing schema/control-plane support

`Tally-sync-backend/migrations/20261009_sync_control_plane.sql` defines `sync_devices` with:

- `company_id`, `device_id`, `name`, `platform`, `metadata`
- `status` constrained to `active` or `revoked`
- `last_seen_at`, `revoked_at`, timestamps
- unique `(company_id, device_id)`
- indexes for company/status and last-seen
- RLS and an authenticated SELECT policy based on `company_users`

The same migration defines `sync_runs`, `sync_idempotency`, and `sync_conflicts`. Supabase MCP also reported these tables in the deployed public schema, but production authority and row contents still require the approved environment/backup proof.

### Existing backend behavior

`SyncControlService.registerDevice` currently performs an upsert using caller-provided `companyId` and `deviceId`, sets `status: active`, and clears `revoked_at`. `touchDevice` updates `last_seen_at` and unconditionally sets status back to `active`. `revokeDevice` updates status to revoked.

Routes currently include:

- `POST /device/register`
- `POST /device/:deviceId/revoke`
- `GET /devices/:companyId`

The route handlers accept `companyId` and device identity from request data. The inspected code does not, by itself, prove authenticated account/license/serial entitlement checks, a device quota check, a device secret proof, or protection against reactivating a revoked device. Those checks must be verified in the full middleware and deployment configuration before implementation claims are made.

### Existing client identity evidence

The inspected PC source references `device_id` and `device_fingerprint` in trial/license data, but no verified implementation was found in this audit for a cryptographically random installation ID stored with Windows DPAPI/Credential Manager or for a protected device secret. Existing legal text mentions MAC/hardware identifiers, but legal text is not implementation evidence.

## Gap list

1. Device registration is company/device-keyed but is not proven to be license- or account-entitlement keyed.
2. No verified server-side registered-device quota enforcement was found in the inspected control-plane service.
3. `touchDevice` appears able to reactivate a revoked device; this must be blocked by an explicit state transition rule.
4. Caller-supplied `companyId` and `deviceId` are accepted by route handlers; ownership and session derivation require verification.
5. No verified Windows-protected device secret lifecycle was found.
6. Reinstall, recovery, lost-device, replacement, offline-grace, and cooldown behavior are not evidenced by the inspected paths.
7. Device lists use `select('*')` in the control-plane service, which should be narrowed to non-sensitive metadata before administrative exposure.
8. The existing migration has RLS for device/run reads, but the deployed advisor findings from Phase 0 require a full policy/grant review for all sync control-plane tables.

## Required implementation contract

- Generate an installation ID with a cryptographically secure random source.
- Store only the installation ID as an identifier and protect any device secret with Windows DPAPI/Credential Manager.
- Derive account/company/license identity from the authenticated session and authorized server lookup.
- Register atomically with entitlement and device-limit checks.
- Never reactivate a revoked device through heartbeat alone.
- Record minimal metadata only; never persist raw hardware identifiers as the authorization boundary.
- Define recovery and offline grace rules before coding them.
- Return structured status and server time; do not return secrets.
- Add concurrency tests proving the device limit cannot be exceeded.

## Phase 3 gate

No Phase 3 production implementation or migration is authorized yet because the prior gates are incomplete: backup/restore proof, canonical license approval, and serial-binding server contract. The next implementation branch should be `phase/3-device-registration-implementation`, created only after those approvals and an isolated staging target exist.
