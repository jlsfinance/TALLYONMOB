# SYNCORA — Play Store assets

Generated with Stitch (`projects/3980834175622396615`), composed locally to exact Play Console sizes.

| File | Size | Where it goes in Play Console |
|---|---|---|
| `store-icon-512.png` | 512×512 | Store listing → App icon (final: ledger-book mark) |
| `store-icon-1024.png` | 1024×1024 | Master copy (reuse for web/PWA/adaptive icon) |
| `feature-graphic.png` | 1024×500 | Store listing → Feature graphic |
| `screenshot-1-dashboard.png` | 1080×1920 | Phone screenshots (slot 1) |
| `screenshot-2-ledgers.png` | 1080×1920 | Phone screenshots (slot 2) |
| `screenshot-3-vouchers.png` | 1080×1920 | Phone screenshots (slot 3) |
| `screenshot-4-sync.png` | 1080×1920 | Phone screenshots (slot 4) |

Raw Stitch renders (780×1920) are in `raw/` — do not upload those, they are 1:2.46 and Play rejects anything taller than 2:1.

## Listing text (paste as is)

**App name** (max 30): `SYNCORA - Tally on Mobile`

**Short description** (max 80):
`View your Tally vouchers, ledgers and balances on mobile. Syncs from your PC.`

**Full description** (max 4000):
```
SYNCORA brings your Tally company data to your phone and browser.

Install the free Windows connector on the computer that runs Tally, sign in, and your vouchers, party ledgers, balances and reports stay in sync. Nothing in Tally is modified — the connector reads data through Tally's own interface and never writes back.

WHAT YOU GET
• Business dashboard — sales, purchases, receivables and payables at a glance
• Party ledgers — balances, ageing and full transaction history
• Vouchers — search by party, number, date or amount, open full voucher detail, share PDF
• Outstanding bills — 30/60/90 day ageing for follow-ups
• Multi-company — switch between synced companies from one login
• Works alongside TallyPrime and Tally ERP 9, including multi-user setups

HOW IT WORKS
1. Create your SYNCORA account
2. Download the Windows connector from our website and install it on the Tally PC (no admin rights needed)
3. Sign in to the connector and let it sync — after that the data is available on mobile and web

PRIVACY AND SECURITY
• Tally data is read-only; your books are never altered
• Traffic is encrypted in transit (TLS 1.2+)
• Account-based access with per-user permissions
• Data deletion available from Settings at any time

SYNCORA is an independent product. Tally and TallyPrime are trademarks of Tally Solutions Pvt. Ltd. and are not affiliated with this app.

Support: lovneetrathi@gmail.com
```

## Notes

- Company/publisher name used on the assets: **Shaurya Ltd**. The Play Console developer name is set at account level (Play Console → Settings → Developer account → Developer name) — changing it there is a manual step and applies to every app on the account.
- Source changes made alongside these assets: `APP_INFO.company` in `tally-web-dashboard/src/config/appInfo.ts` and `AppPublisher` in `tally-windows-sync/installer/SyncoraConnector.iss`.
- The Android launcher icon inside the APK/AAB is still the old art. `store-icon-1024.png` can be turned into adaptive icons (`mipmap-anydpi-v26`) at the next build.
