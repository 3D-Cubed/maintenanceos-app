MaintenanceOS v14 - Reporting & Asset Control Update

Includes:
- Fixed priority/status dropdown visibility on Windows/browser menus
- Archive Asset button, preserving repair history
- Reports page charts:
  - Monthly downtime trend
  - Monthly ticket trend
  - Open vs resolved
  - Top fault assets

Install:
1. Run DB-V14-REPORTING-ASSET-CONTROL.sql in Supabase SQL Editor.
2. Copy this update over your current project folder. Replace files when asked.
3. Do not copy node_modules if present.
4. Run:
   git add .
   git commit -m "V14 reporting and asset control update"
   git push
5. Wait for Vercel to redeploy.
