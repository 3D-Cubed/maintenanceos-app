# MaintenanceOS V21.5 — Operational Fixes

## Purpose
Fix the first real-world issues identified during use of V21.4 while preserving the working Parts Intelligence and Atom3D Parts UI.

## Fixes
- Added **Edit Asset** workflow from each asset record.
  - Change asset name, type, serial, location, manufacturer, model, status, next service date and notes.
  - Supports updating an asset such as printer **Jeff** when it moves into R&D.
- Fixed **Report Fault** database validation so a new Open fault is not incorrectly rejected by legacy repair-field defaults.
- Hardened **Adjust Stock** with a SECURITY DEFINER database function while retaining non-negative stock and mandatory reason controls.
- Added explicit guest-entry asset update permissions.
- Fixed **Part Intelligence usage-history price layout** so prices stay inside the history tile and wrap correctly on narrow screens.

## Database
Run `DB-V21.5-MAINTENANCE-FIXES.sql` once before deployment.

The migration is additive and does not delete or recreate existing assets, faults or parts.

## No changes to
- Existing parts inventory records
- Repair parts workflow
- Fault-first workflow intent
- Atom3D Parts UI
- Existing part images or supplier links
