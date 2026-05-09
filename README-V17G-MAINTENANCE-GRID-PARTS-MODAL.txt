MaintenanceOS V17G - Maintenance Grid & Parts Modal

Built from the latest working project ZIP supplied by Si.

Included updates:
- Maintenance page now uses fleet-style service tiles instead of long list rows.
- Maintenance filters: All, AGV, 3D Printer, Overdue.
- Maintenance tiles show health ring, open faults, next service, last condition, Open Record and Service buttons.
- Parts Inventory Add Part form is now a popup modal.
- Parts Inventory keeps the page cleaner with overview cards, filters, alerts, usage and parts list.
- Repairs page shows active repair queue only; resolved tickets are hidden from the main repair list.
- Parts filters included: search, equipment type, stock status and category.

Database:
- No new SQL required for this patch.
- Keep your existing Supabase tables and data.

Install:
1. Backup your current working project folder.
2. Copy these files over your existing project folder.
3. Keep your existing .env file.
4. Run: npm install
5. Run: npm run dev
6. Test Maintenance, Parts Inventory and Repairs before pushing to Git.
