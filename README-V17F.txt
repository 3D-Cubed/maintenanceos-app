MaintenanceOS V17F - Parts Filters & Active Repair Queue

Built from the latest working MaintenanceOS.zip baseline supplied by Si.

Included changes:
- Parts Inventory filter/control bar
  - Equipment Type: All / AGV / 3D Printer / General
  - Stock Status: All / In Stock / Low Stock / Out of Stock
  - Category filter generated from existing inventory categories
  - Live search across part name, category, location, supplier URL, notes and equipment type
  - Clear filters button
- Parts list now displays filtered result count
- Animated part-card filtering transitions
- Repairs page now shows only active tickets in the main queue
  - Resolved tickets are hidden from the main Repairs page
  - Dashboard Priority Radar already remains active-ticket focused
- No database changes required

Install:
1. Back up your current working project folder.
2. Copy this package over your current project files.
3. Do NOT delete or overwrite your local .env file.
4. Run:
   npm install
   npm run dev
5. Test:
   - Parts Inventory filters
   - Repairs page active-ticket queue
   - Dashboard
   - Asset pages
   - Service/repair modal forms

Database:
No new SQL migration is required for V17F.
