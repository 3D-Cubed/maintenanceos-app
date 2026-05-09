MaintenanceOS V17C - Asset Record Focus & Service Findings

Changes:
- Removed Low Stock stat tile from the main Dashboard. Stock intelligence stays on the Parts page.
- Removed fleet overview / fleet health / high-risk radar panels from individual asset records.
- Asset record pages now focus only on the selected asset.
- Added asset-specific tiles:
  - Open Repairs
  - Recent Parts Fitted
  - Recent Service Findings
- Service inspection dropdowns now reveal a reason/action text box when the selected result is not Pass/Good/OK/N/A.
- Failure notes are saved inside the service_data findings object where supported by the V17 database.

Database:
- No new SQL required if V17 parts/service SQL has already been applied.
- This is a frontend patch only.

Install:
1. Back up your current working folder.
2. Copy these files over your existing V17/V17B project.
3. Keep your existing .env file.
4. Run npm install.
5. Run npm run dev.
6. Test locally before pushing to Git/Vercel.
