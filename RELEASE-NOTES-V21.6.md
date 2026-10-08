# MaintenanceOS V21.6 — Test Findings & Operational Hardening

## Fixed

- **Stock adjustment restored:** creates `parts_stock_movements` when missing and restores the stock-adjustment RPC.
- **Fault reporting restored:** adds the correct guest-entry INSERT policy for new Open faults while preserving the fault-first database guard.
- **Asset history:** meaningful edits to an asset record are now automatically recorded in the Asset History Timeline, including location, status, type, serial, manufacturer, model and service-date changes.
- **QR deep links:** QR links now use a direct `?asset=<uuid>` route and the application recognises both the new query route and the legacy `#asset/<uuid>` route.
- **QR deep-link entry:** scanning/opening an asset link no longer gets trapped behind the development entry screen.
- **Deep-linked asset navigation:** QR-opened asset records now render inside the normal MaintenanceOS shell/navigation instead of a stripped-down shell.
- **Part intelligence layout:** constrained metric values so currency such as `£0.00` cannot overflow its tile; usage-history values are similarly constrained.

## Data safety

- No existing assets, faults, repairs, parts or stock quantities are deleted.
- The stock adjustment RPC still prevents negative stock and requires an adjustment reason.
- Existing fault-first guards remain in place.
- Asset history is additive and records only future edits.

## Database migration

Run:

`DB-V21.6-TEST-FIXES.sql`

once in the Supabase SQL Editor before deploying the frontend.
