MaintenanceOS V17H — Service Planning Board

This update refocuses the Maintenance page so it no longer duplicates the AGV Fleet or 3D Printer Fleet pages.

What changed:
- Maintenance is now a planned service board, not a fleet overview clone.
- Service cards focus on upcoming/overdue maintenance work.
- Each card shows:
  - next service status
  - last service condition
  - open faults
  - last service findings
  - planned upgrades/actions from service reports
  - parts likely to prepare
- Maintenance stats now show:
  - Upcoming Services
  - Overdue Services
  - Planned Upgrades
- Existing filters retained:
  - All
  - AGV
  - 3D Printer
  - Overdue

Database changes:
- None required.

Install:
1. Back up your current project folder.
2. Copy these files into your existing project folder.
3. Keep your existing .env file.
4. Run:
   npm install
   npm run dev

Only frontend files are changed. Supabase data is untouched.
