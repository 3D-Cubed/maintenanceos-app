# MaintenanceOS V23.3 — Service History & Part Intelligence Polish

## Purpose
Finalise the service visibility work and remove duplicate service timeline entries while giving the Part Intelligence window a stable, responsive layout with no horizontal scrolling.

## Changes
- Completed services remain visible on the main dashboard through `service_records`.
- Asset History now treats `service_records` as the canonical source for completed-service events.
- Legacy V23.2 synthetic `asset_serviced` history rows are removed by the V23.3 migration so one service cannot appear twice.
- The V23.2 service-history trigger is removed; future services are not duplicated.
- Part Intelligence modal widened and constrained to the viewport with `box-sizing` and overflow protection.
- Part metric cards use predictable responsive columns and the Usage Spend value is given sufficient room to remain on one line.
- Part image presentation uses a dedicated glass-style image stage with contain scaling and no distortion.
- Long titles, history values and action areas are constrained so they cannot force a horizontal scrollbar.

## Data Safety
- `service_records` are not deleted or altered.
- Parts usage and stock movements are not deleted or altered.
- Only synthetic V23.2 service-history rows are removed.

## Database
Run `DB-V23.3-SERVICE-HISTORY-CLEANUP.sql` once before or immediately after deploying the V23.3 frontend.

## Version
1.23.3
