# MaintenanceOS V22.1 — Stability Cache & Part Intelligence Finalisation

## Purpose
V22.1 is a focused production-hardening release following live floor testing of V22.0.

## Fixed
- Fixed production RPC discovery for **Adjust Stock** (`adjust_part_stock_v22`).
- Fixed production RPC discovery for **Report Fault** (`report_fault_v22`).
- Added explicit PostgREST schema-cache reload notifications after migration.
- Made the Part Intelligence modal wider and prevented the horizontal scrollbar caused by the four metric cards.
- Kept Usage Spend (`£0.00`) contained within its metric tile.

## Database safety
- Re-runnable migration.
- No existing assets, faults, repairs, parts or usage records are deleted.
- Existing stock quantities are preserved.
- Stock adjustment remains transactional and writes an audit movement.
- Fault creation remains fault-first and is performed through the security-definer RPC.

## Migration
Run `DB-V22.1-STABILITY-CACHE-FIX.sql` once in the Supabase SQL Editor, then deploy the application.
