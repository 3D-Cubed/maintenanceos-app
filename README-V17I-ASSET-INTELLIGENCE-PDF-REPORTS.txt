MaintenanceOS V17I - Asset Intelligence & PDF Reports

Built from the latest working MaintenanceOS.zip supplied by the user.

Changes included:
- Removed incorrect "Parts to Prepare" section from Maintenance tiles.
- Maintenance page now focuses on planned service status, last findings and planned upgrades/actions.
- Added Asset Intelligence Summary to individual asset records.
- Asset intelligence summarises:
  - latest service condition
  - open engineering actions
  - failed/worn checks with notes
  - recommendations/upgrades for next service
  - recurring repair patterns
  - next-service planning notes
- Added Generate Service PDF buttons to service records in the asset history timeline.
- Added Generate Repair PDF buttons to resolved repair records in the asset history timeline.
- PDF reports open in a print-ready browser window so they can be printed or saved as PDF.
- No Supabase schema reset.
- No database table deletion.
- No new SQL required.

Install:
1. Back up your current working project folder.
2. Copy these files over your existing working project.
3. Keep your existing .env file.
4. Run:
   npm install
   npm run dev

Important:
Do not delete your Supabase project or tables. Existing assets, repairs, service records and parts inventory are preserved.
