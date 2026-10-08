# MaintenanceOS V22.0 — Stability Hardening

## Purpose
V22 consolidates the recurring production failures found during live use into one controlled stability release.

## Fixed
- QR/deep links now use browser-safe `#asset/<uuid>` URLs.
- Existing `?asset=<uuid>` QR links remain supported.
- Deep-linked asset pages now load the full MaintenanceOS shell/navigation instead of bypassing it.
- Fault reporting now uses a server-side transaction (`report_fault_v22`) so guest-entry RLS cannot block valid fault creation.
- Repair completion now uses `complete_fault_repair_v22` with security-definer transaction handling.
- Stock adjustment now uses `adjust_part_stock_v22` and creates its audit record atomically.
- Missing `parts_stock_movements` infrastructure is created by the single V22 migration.
- Asset edits continue to be recorded in the asset history timeline.
- Part Intelligence Usage Spend is given enough layout width to display values such as £0.00 correctly.

## Data safety
No existing asset, fault, repair, part or usage records are deleted or replaced.

## Database migration
Run `DB-V22-STABILITY-HARDENING.sql` once in the Supabase SQL Editor before deployment.

## Version
1.22.0
