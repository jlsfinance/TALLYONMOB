# Tally Live Sync

The Tally Data Viewer reads live accounting data through `api/tally/sync.js`.

## Runtime Options

1. Same-machine backend
   - Run TallyPrime/Tally ERP with XML over HTTP enabled.
   - Set `TALLY_XML_URL=http://127.0.0.1:9000`.
   - Deploy/run the backend on the same Windows machine or inside the same LAN where Tally is reachable.

2. Desktop/LAN middleware
   - Run a Node/Windows bridge next to Tally.
   - Expose an endpoint compatible with `/api/tally/sync`.
   - Set `VITE_TALLY_MIDDLEWARE_URL=https://your-bridge-host/api/tally/sync` for browser direct calls, or set `TALLY_XML_URL` for server-side calls.

## Frontend Behavior

- Auto-refreshes every 30 seconds.
- Supports manual refresh from the sticky header.
- Uses cached data when Tally is offline.
- Shows ledgers, voucher drill-down, sales/purchase invoice item lines, GST breakdown, Trial Balance, Profit and Loss, and Balance Sheet.
- Exports report tables to PDF and Excel.

## Tally Requests

The backend sends standard Tally XML envelopes with `TALLYREQUEST=Export` and collection/data requests for ledgers, vouchers, Trial Balance, Profit and Loss, and Balance Sheet. Report totals are normalized from returned ledger and voucher data so the UI still works even when report XML shapes vary between Tally versions/custom TDLs.
