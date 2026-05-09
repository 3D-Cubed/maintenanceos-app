MaintenanceOS V17B - Modal Service Forms Fix

What changed:
- Asset history page no longer shows the full service and repair forms inline.
- Added compact Asset Actions card.
- Log Service / Inspection now opens in a glassmorphism popup modal.
- Log Repair / Fault now opens in a popup modal.
- Modal forms scroll internally so the asset record stays clean.
- Escape key and backdrop click close the modal.
- No database changes required beyond the V17 SQL already provided.

Install:
1. Back up your current working MaintenanceOS folder.
2. Copy this update over your current project files.
3. Keep your existing .env file.
4. Run npm install if needed.
5. Run npm run dev.
6. Test one asset record, open Log Service and Log Repair.

No Supabase tables are deleted or rebuilt by this update.
