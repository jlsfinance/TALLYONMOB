# Phase 5 — Trial Eligibility and Abuse Controls Preflight

**Branch:** `phase/5-trial-abuse-preflight`  
**Base:** `phase/4-windows-write-hardening`  
**Date:** 2026-10-11  
**Priority:** P1 / required before broad public trial rollout

## Verified current flow

### Dashboard trial service

`tally-web-dashboard/src/lib/licensing.ts` exposes `trialService.checkEligibility()` and `trialService.activate()`.

- `checkEligibility()` calls the `check_trial_eligibility` RPC with email, mobile, device ID, Tally serial, and company GST.
- `activate()` performs a client-side check, reads the trial plan, generates a license key through `generate_license_key`, inserts `trial_history`, and then inserts `user_licenses`.
- The two inserts are separate client requests. A successful `trial_history` insert followed by a failed license insert leaves partial state; a failed history insert is logged but activation continues.
- The client submits raw email, mobile, device fingerprint, Tally serial, GST, PAN, company name, and IP address directly to Supabase.
- There is no transaction, uniqueness constraint covering the eligibility signals, idempotency key, advisory lock, or server-side “check-and-create” operation.
- The client trusts `params.user_id` rather than deriving the principal from `auth.uid()` in the activation boundary.

### Database eligibility RPC

`20250617080002_saas_licensing_system.sql` defines `check_trial_eligibility(email, mobile, device_id, tally_serial, company_gst)`.

- It checks the first matching signal in order: Tally serial, GST, email, device ID, then mobile.
- It returns raw identifiers in rejection reasons, including the Tally serial, GST, email, and mobile.
- It uses check-then-return semantics only; it does not reserve eligibility or create the trial.
- It does not check a normalized form of identifiers, IP, device fingerprint, existing active/expired licenses, or concurrent requests.
- `trial_history` RLS has an own-row read policy and a super-admin policy, but the reviewed migration does not provide a dedicated transactional activation policy/function.

### Windows client and Edge Function

- `tally-windows-sync/Services/LicenseService.cs` validates through the `validate-license` Edge Function and does not directly activate a trial.
- `validate-license` checks an existing license first and then falls back to the latest `trial_history` row for the authenticated user.
- The Edge Function returns `features: ["basic"]` for trial and does not itself create a trial.
- The current Edge Function allows a wildcard CORS origin and includes the public anon key in the Windows client. The anon key is not a secret, but the function still requires rate limiting and strict server-side authorization.

## Acceptance criteria status

| Criterion | Status | Evidence / gap |
|---|---|---|
| Parallel trial requests cannot create duplicates | **Fail** | Separate RPC check and client inserts; no transaction, lock, or unique eligibility key |
| Retry is idempotent | **Fail** | No activation request/idempotency key or deterministic server response |
| False-positive review path | **Not evidenced** | No support-review table/workflow found in the audited trial flow |
| Sensitive identifiers are access-controlled | **Partial** | Own-row read exists, but raw identifiers are stored and exposed in RPC rejection messages |
| Retention rules exist | **Not evidenced** | No retention/expiry job or deletion policy found for trial history identifiers |
| Rules consistent across PC, dashboard, server | **Fail** | Dashboard creates trial; Windows only validates; Edge Function fallback returns different feature semantics |

## Risk classification

1. **Critical:** concurrent activations can create multiple trials and/or orphaned history/license records.
2. **High:** arbitrary `user_id` and client-side activation make the browser the write authority.
3. **High:** rejection messages leak raw identifiers and reveal whether another account used a serial/GST/email/mobile.
4. **High:** trial eligibility is not normalized, so formatting/case variants can bypass matching.
5. **Medium:** raw IP, device fingerprint, GST and PAN retention/access policy is undocumented.
6. **Medium:** trial feature and quota semantics differ between dashboard and Edge Function.

## Required implementation gate

The next implementation branch must move activation into one server-authoritative RPC or Edge Function that:

1. derives the user from the authenticated session;
2. normalizes approved signals and stores only keyed hashes for abuse matching where product/legal approval permits;
3. uses a deterministic eligibility key and a unique index or transactional advisory lock;
4. creates `trial_history` and `user_licenses` atomically;
5. accepts an idempotency key and returns the same decision for safe retries;
6. returns generic safe reason codes, never raw identifiers;
7. adds a restricted review/audit record for false positives;
8. defines retention and access controls before collecting GST/PAN/IP/fingerprint signals;
9. makes the same server contract callable by dashboard and Windows onboarding;
10. defines the trial plan’s exact sync feature and record quota before enabling it.

No production trial migration or public trial activation should be enabled from this preflight branch.
