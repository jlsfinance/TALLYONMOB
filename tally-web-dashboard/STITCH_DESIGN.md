# TallySync Redesign — Design Brief (Stitch)

## Project: TallySync Redesign (opencode config: stitch server configured)
Status: Stitch MCP configured via `opencode mcp add`. Auth pending (`/mcps` → stitch → sign in).

## What to redesign
TallyPrime Windows sync connector (`TallyLink.exe`) — the desktop tray/app that connects Tally port 9000 to Supabase.

## Verified data points (from this session)
- Company name: `baaba`
- Tally company GUID: `86bf2911-033c-419d-a9a5-b829dd13ae94`
- Real GSTIN (TaxUnit, TAXTYPE=GST): `28AAUPM7741E1Z9` (Gujarat)
- PAN: `AAUPM7741E`
- State (Tally STATENAME): `Rajasthan`
- Tally XML server: `localhost:9000`
- Sync app: `C:\Users\Admin\AppData\Local\TallySync\TallyLink\TallyLink.exe`

## Design direction
- Modern, clean desktop dashboard (not a web page — the user runs this on Windows)
- Dark/minimal color palette: slate background, teal/cyan accent (`#14b8a6`), white text
- Main screen: company card showing name (`baaba`), GSTIN badge (`28AAUPM7741E1Z9` — verified from TaxUnit), PAN (`AAUPM7741E`), and state (`Rajasthan` — note: different from GST state `Gujarat`)
- Status indicators: Tally port 9000 (green/red), sync timer, last sync timestamp
- Sections: Company Info | GST Verification | Sync Status | Recent Vouchers
- Typography: Inter / sans-serif, generous spacing, rounded cards (`rounded-2xl`)
- No manual company name entry — auto-discovered from Tally

## Next action after Stitch auth
Run in terminal:
```
/mcps  # select "stitch" → sign in (OAuth)
```
Then generate:
```
create_project(title="TallySync Redesign")
generate_screen_from_text(projectId="...", prompt="Modern desktop dashboard for TallyPrime sync connector. Company card with verified GSTIN 28AAUPM7741E1Z9 (Gujarat), PAN AAUPM7741E, company baaba. Sections: GST Verification badge (teal), Tally port 9000 status, sync timer, recent vouchers. Dark slate theme, rounded cards, clean sans-serif typography.")
```

## Risk / note
- Manual DB value was previously `08AAUPM7741E1Z9` (wrong state). Real value is `28AAUPM7741E1Z9`. DB PATCH blocked by network (`http=000`). Sync app will push correct value when online.
- Design should not fabricate GSTIN; it must show the TaxUnit-verified value.
