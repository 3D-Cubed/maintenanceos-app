# MaintenanceOS V21 — Repair Parts Integration

- Adds required **Reported by** name to fault reporting and fault records.
- Restores a dedicated Parts inventory view.
- Record Repair now selects stocked parts from inventory with quantities.
- **+ New Part** uses the same inventory fields, saves the new catalogue item, and selects it for the current repair.
- Completing a repair atomically snapshots part name/number/cost into `parts_usage`, deducts stock, and resolves the linked fault.
- Prevents negative stock and rejects repair quantities above available stock.

## Database
Run `DB-V21-REPAIR-PARTS-REPORTER.sql` once in Supabase SQL Editor before deploying V21. It is additive and safe to rerun. Existing records are preserved.
