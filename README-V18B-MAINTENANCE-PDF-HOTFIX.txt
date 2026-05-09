MaintenanceOS V18B - Maintenance Board & PDF Report Hotfix

What changed:
- Maintenance page now defaults to Upcoming, not All.
- Maintenance filters are now: Upcoming, Overdue, AGV, 3D Printer.
- Recent Service Findings and Service Tasks now appear above the asset tiles.
- Generic "Parts to prepare" has been removed from maintenance tiles to prevent incorrect cross-equipment part suggestions.
- PDF report generator has been rebuilt with a dedicated MaintenanceOS report template:
  - dark navy header/footer
  - teal/cyan accent lines
  - status badge styling
  - structured engineering data cards
  - QR asset verification block
  - print-safe app-style report layout

No database changes required.
Keep your existing .env file.
