# Tallyonmob Release Hardening Checklist

## Automated quality gate

Run from `tally-web-dashboard/` before every dashboard release:

```bash
npm ci --no-audit --no-fund
npx tsc --noEmit --ignoreDeprecations 5.0
npm run check:all
```

`check:all` runs the Phase 5 business-logic assertions, the accessibility source audit, the production/PWA build and the final artifact smoke check. GitHub Actions repeats the same gate in `.github/workflows/dashboard-quality.yml` for feature branches and pull requests.

## Manual core journeys

Use a non-production test company or a read-only account. These checks must not create, edit or delete production vouchers.

| Area | Check | Expected result |
|---|---|---|
| Authentication | Open app in a fresh private window, sign in, sign out, sign in again | No blank page; login and redirect complete |
| Theme | Toggle light/dark mode, reload, open a second route | Theme persists and text/focus remain readable |
| Company | Switch between two companies, return to dashboard and Business Insights | Company name, totals and selected FY do not leak across companies |
| Company deletion | Open the delete flow but stop before confirmation in test environment | Destructive action has an explicit confirmation and no accidental mutation |
| Tally | Open Tally connection, test an offline endpoint, retry after recovery | Offline/error state is visible and retry does not crash the app |
| Voucher export | Export a filtered voucher list and open the downloaded file | File downloads with the active company/date/type scope |
| Invoice PDF | Preview taxable, non-taxable, multi-item and missing-branding invoices | Preview and PDF show the same totals and remain usable on mobile |
| Business reports | Change FY, open trend bar, ageing, customer and supplier links | Date/type/as-on context is preserved and back navigation works |
| Stock | Open SKU Summary, History, Customers and Suppliers tabs | Empty/error states are explicit; no tab renders a blank screen |
| Offline | Load an already visited route, disable network, navigate, re-enable network | Cached shell opens; banner announces offline/online state; no infinite reload |
| Update recovery | Keep an old tab open, deploy a new build, navigate to a lazy route | A stale chunk triggers one automatic reload, not a reload loop |

## Accessibility pass

- Tab through the header, FY selector, filters, primary actions and report links.
- Every icon-only action has an accessible label or title.
- Focus is visible in both light and dark themes.
- Error, offline, sync-progress and success states are announced with `role="alert"`, `role="status"` or `aria-live` as appropriate.
- Charts have a nearby text/table summary; information is not colour-only.
- At 200% zoom and on a 360px viewport, actions remain reachable without horizontal clipping.

## Performance and PWA pass

- Check the production build output for missing assets and unexpected JavaScript growth with `npm run check:release`.
- Confirm `dist/sw.js`, `dist/manifest.json`, icons and the base path are present.
- Verify the GitHub Pages path `/TALLYONMOB/` and local root `/` both resolve the service worker.
- Confirm Supabase auth requests are never served from the API cache; only safe REST reads may use the short NetworkFirst cache.
- Check the browser console for unhandled rejected promises, chunk-load errors and CSP violations.

## Deployment and rollback

1. Merge only after the dashboard quality workflow is green.
2. Publish the immutable commit SHA or tagged release; do not overwrite a deployed artifact manually.
3. Record the deployed commit, build timestamp, environment and migration status.
4. If a release causes a blank screen, first use the chunk recovery reload once; then roll back the hosting artifact to the previous known-good commit.
5. If a database migration is involved, apply its documented rollback before restoring an older frontend that expects the old schema.
6. Keep the previous working artifact available until the first manual smoke pass is complete.
7. Report the visible incident ID from the recovery screen with the commit SHA; never paste access tokens or customer data into an issue.

## Known limitations

- Static source audits cannot replace a full browser screen-reader audit.
- The dashboard quality workflow validates the frontend build and pure business logic; it does not mutate or query production customer data.
- Supabase availability, RLS policy correctness and Tally PC connectivity still require a read-only environment smoke test.
