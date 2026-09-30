# MaintenanceOS V20 — UI Normalisation

## What changed
- Rebalanced the entry screen so the MaintenanceOS wordmark no longer clips at common desktop zoom levels or narrower viewports.
- Normalised card, form and control spacing across the application.
- Reworked the asset QR action area so Copy Asset Link and Report Fault have deliberate spacing and wrap cleanly.
- Added consistent vertical spacing to the asset-level Report Fault form.
- Improved responsive behaviour for page-header actions, cards, grids and mobile layouts.
- Added overflow safeguards so flex/grid children cannot force cards beyond the viewport.

## Functional scope
- No database schema changes.
- No migration required beyond the existing V19 fault-first migration if it has not already been applied.
- V19 fault-first workflow and overlay/scroll-lock fixes are preserved.

## Installation
1. Replace the deployed project files with this V20 package.
2. Keep your existing `.env` values.
3. Run `npm install` if installing into a clean folder.
4. Run `npm run test`.
5. Run `npm run build`.
6. Deploy the generated project as normal.
