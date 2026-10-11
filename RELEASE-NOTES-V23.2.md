# MaintenanceOS V23.2 — Service Visibility Fix

## Purpose
Close the gap identified during real-world service testing: completed services were successfully saving and consuming stock, but were not visible on the main dashboard or the asset history timeline.

## Changes
- Added Recent Engineering Activity to the main dashboard.
- Completed services now appear in the affected asset's Asset History Timeline.
- Added an `asset_serviced` history event for future services.
- Backfilled existing service records into the asset timeline without deleting or changing service data.
- Service activity shows service category, completion time, asset and recorded cost where available.
- No changes to QR, fault reporting, repair workflow or parts inventory behaviour.

## Database
Run `DB-V23.2-SERVICE-VISIBILITY.sql` once before deploying the application.

## Version
1.23.2
