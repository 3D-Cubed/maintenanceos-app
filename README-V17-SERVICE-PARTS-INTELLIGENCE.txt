MaintenanceOS V17 - Service & Parts Intelligence

What changed:
- AGV-specific service workflow.
- 3D printer-specific service workflow.
- General fallback service workflow for other equipment.
- New Parts Inventory page.
- Part image, price, supplier link, stock quantity, minimum stock level and stock location.
- Parts can be selected on service and repair forms.
- Selected inventory parts deduct stock automatically when the service/repair is saved.
- Low stock alerts and recent parts usage panels.

Database safety:
- This update does not delete or reset existing Supabase data.
- It only adds new optional columns/tables using DB-V17-SERVICE-PARTS-INTELLIGENCE.sql.
- Keep your existing .env file and existing Vercel environment variables.

Recommended install:
1. Back up your current working project folder.
2. Copy/replace the frontend files from this V17 pack into your existing working project.
3. Keep your existing .env file.
4. In Supabase SQL Editor, run DB-V17-SERVICE-PARTS-INTELLIGENCE.sql once.
5. Run npm install.
6. Run npm run dev.
7. Test Maintenance Hub entry, asset data, parts page, service form and repair form before pushing.
