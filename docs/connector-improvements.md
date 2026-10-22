# Connector Improvements — Green (Safe)
Branch: feature/livekeeping-parity-upgrade (untouched). No destructive edits.

## Findings (3)
- TallyConnector / XML parser lives in tally-mobile-app/lib and tally-sync-backend/src/services; sync logic in tally-sync-node/src.
- Original branch (thebaap a5b3905) preserved 63 uncommitted; audit was read-only.
- No XML parser security or sync error-handling docs present in docs/.

## Green Safe Improvements
- Add input validation wrapper around Tally XML parser (no branch change).
- Document sync retry/backoff policy in docs/ (new file only).
- Add connector health-check endpoint spec; do not deploy to original branch.

## Next Steps (ask before yellow/red)
- Confirm XML schema version to update parser securely.
- Review sync failure logs; propose retry policy doc.
- Before any code change to thebaap, ask user (yellow/red guard).
