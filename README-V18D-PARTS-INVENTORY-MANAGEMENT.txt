MaintenanceOS V18D - Parts Inventory Management Fixes

Includes:
- Fixes page scroll lock after adding a part.
- Adds click-to-open Part Details popup.
- Adds Edit Part modal so stock quantity, location, supplier, price, category, image and notes can be updated.
- Adds Part History support for creation, stock adjustments, supplier/location updates and stock usage.
- Keeps existing assets, repairs, services and inventory data safe.

Optional database step for full history:
Run DB-V18D-PARTS-HISTORY.sql in Supabase SQL Editor.
If this is not run, editing parts still works, but detailed part history logging will be skipped.

Keep your existing .env file when copying this update into your project.
