# MaintenanceOS V21.1 – Parts Inventory Restoration

Corrective release built on V21. Restores the original V17/V18 Parts Inventory data model and full inventory experience while retaining V21 fault reporter and repair-parts integration.

## Restored
- Existing parts use the original part_name/equipment_type/image_url/price/supplier_url/minimum_stock_level/stock_location/notes fields.
- Part images and image uploads.
- Equipment filters: AGV, 3D Printer, General.
- Search, category and stock-status filtering.
- Rich inventory cards with stock, minimum level, location, price and supplier link.

## V21 features retained
- Required Reported By field on faults.
- Select stocked inventory parts during an active-fault repair.
- Add a new full inventory part directly from the repair modal and select it immediately.
- Atomic stock deduction when the repair is saved.
- Usage snapshots retained for repair history.

## Database
Run DB-V21.1-PARTS-COMPATIBILITY.sql. It is additive and does not delete inventory rows. It also maps any V21 duplicate fields back to the established V17/V18 fields when present.
