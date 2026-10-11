# Phase 7 — Windows Installer, Release, and Onboarding Preflight

**Branch:** `phase/7-installer-onboarding-preflight`  
**Base:** `phase/6-payment-lifecycle-preflight`  
**Date:** 2026-10-11  
**Priority:** P1

## Verified release/build state

The Windows project is a WPF executable targeting `net9.0-windows`, self-contained `win-x64`, single-file and ReadyToRun. The project version is `3.1.0`. The repository also contains an Inno Setup installer script with version `2.10.7`, and a separate PowerShell release script whose default version is `2.0.2`.

The installer references `tallysyncapp/TallyLink.exe` and `tallysyncapp/appsettings.json`, while the main project is under `tally-windows-sync`. The release script references `TallySyncApp\TallySyncApp.csproj`, which does not match the audited project path. These mismatches can produce an installer from a stale or different build.

`CODE_SIGNING_POLICY.md` documents SignPath Foundation signing through CI, but no repository evidence was found in this preflight that the Windows installer workflow actually builds, signs, publishes checksums, or verifies signatures. The Inno Setup script also has no checksum generation, stable/beta channel metadata, rollback artifact, or release manifest.

The installer deletes `sync.db` and startup error files during uninstall. That is a data-loss risk unless the user explicitly chooses a full-data removal path. The installer also uses `CloseApplications=force`, which can terminate a running sync process during installation.

## Verified onboarding state

The application starts by loading settings, initializing authentication, and showing login or the main window. It has diagnostics and connection-test commands, but no single resumable onboarding state machine covering install, login, Tally diagnostics, company selection, masked serial consent, license validation, device registration, first-sync preflight, and dashboard/support linking.

The startup path in `MainViewModel` sets a logged-in non-super-admin session to `IsLicenseValid = true`, plan `Trial`, and seven days remaining after a two-second delay without calling the server. This is a server-authority bypass and must be removed. License validation exists separately through the Edge Function, but startup should not grant sync eligibility before that validation succeeds.

`CheckSerialAndConfirmAsync()` still allows the user to accept a serial mismatch and locally replace the stored serial. That conflicts with the server-controlled serial-binding policy. A legitimate transfer should use the protected transfer/recovery flow, not a local overwrite.

The UI shows raw exception messages in several failure paths and writes debug/crash logs to the hard-coded path `C:\Users\Admin\logs`, which is invalid for most Windows users and may expose unstable diagnostics. The code has useful Tally diagnostics and connection tests, but stable machine error codes, correlation IDs, retryable/action-required states, and resumable onboarding checkpoints are not consistently modeled.

## Acceptance criteria status

| Criterion | Status | Evidence / gap |
|---|---|---|
| Clean-machine installation | **Not evidenced** | Installer/build paths are inconsistent; no clean-machine run recorded |
| Installer signature and checksum validation | **Partial** | Signing policy exists; CI signing and checksum verification are not evidenced |
| Supported Tally failure scenarios documented | **Partial** | Diagnostics exist, but no complete release-tested scenario matrix |
| Onboarding resumes after network interruption | **Fail** | No unified resumable onboarding state machine found |
| First sync is idempotent after retry | **Partial** | Backend sync has idempotency work, but no clean-client onboarding acceptance test recorded |
| Release rollback/version compatibility | **Fail** | No verified stable/beta channel or rollback manifest |
| Server-authoritative license at startup | **Fail** | Startup grants trial validity from session state without validation |
| Controlled serial mismatch recovery | **Fail** | Local overwrite remains available |

## Required implementation gate

The implementation branch should first unify the source of truth for the project path and version. It should then make CI publish the exact known commit, build the Windows artifact, run tests and dependency/security checks, generate a SHA-256 manifest, submit only CI artifacts for signing, verify the signature, and publish release metadata with stable/beta channels and a previous-stable rollback link.

The installer should preserve application data by default and offer an explicit, clearly labelled data-removal option. It should stop gracefully rather than force-kill an active sync without warning.

Onboarding should become a state machine with `pending`, `success`, `retryable_failure`, `action_required`, and `blocked` states, stable error codes, correlation IDs for server operations, and safe retry behavior. Startup must always perform authoritative license validation before setting sync eligibility. Serial transfer must be server-controlled and the local overwrite prompt must be removed.

No installer or onboarding production release should be published from this preflight branch until the path/version mismatch and license/serial bypasses are fixed.
