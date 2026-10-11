# MaintenanceOS V23.0 — Parts & Service Overhaul

## Purpose
A focused operational release following real-world use. This release makes the Parts Master Record fully maintainable and brings inventory parts, stock consumption and cost tracking into scheduled service completion.

## Included
- Edit Part ID Card without creating duplicates.
- Soft-archive and restore obsolete parts; historical usage is preserved.
- Part lifecycle filter: Active / Archived / All.
- Supplier, cost, stock, location, image and catalogue fields remain editable.
- Engineering drawing PDF attachment with drawing number and revision.
- Part record history records supplier, cost, drawing and archive changes.
- Service completion can select parts from inventory.
- Service parts quantity is validated against available stock.
- Service completion calculates parts cost from the part's current unit price.
- Service completion creates a service record, decrements stock and records parts usage atomically.
- Service part consumption is linked to the service record and asset.
- Existing repair/fault workflow and QR/PWA functionality retained.

## Database
Run `DB-V23-PARTS-SERVICE-OVERHAUL.sql` once in Supabase before deploying the application.
The migration is additive/data-safe and does not delete existing records.

## No reinstallation of dependencies is conceptually required by the feature itself; on the development machine run `npm install` if package metadata has changed, then `npm run build`.
