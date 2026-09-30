# MaintenanceOS V21.2 — Parts Intelligence

- Restores existing `parts_inventory` records through the established schema/RLS path; no inventory rows are deleted.
- Repair part selection is filtered for AGV / 3D Printer compatibility, while General parts remain available.
- Repair selector shows stock, equipment class, cost and selected-part thumbnails.
- Parts cost is calculated automatically from snapshotted inventory prices and can still be manually overridden.
- Adds part intelligence view: stock, total usage, usage spend, assets consuming the part, repair usage history and stock-adjustment history.
- Adds audited quick stock adjustment with mandatory reason and negative-stock protection.
- Adds low-stock supplier shortcuts and an Engineering Attention dashboard section.
- Adds deterministic 90-day repeat-failure signals based on repeated fault titles per asset; these are prompts for engineering investigation, not automated diagnoses.
- Repairs continue to deduct stock atomically and preserve historical part name/number/cost snapshots.
- Keeps Reported By traceability and the V19 fault-first workflow.

Database migration: `DB-V21.2-PARTS-INTELLIGENCE.sql`.
