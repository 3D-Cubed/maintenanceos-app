MaintenanceOS v10 workflow upgrade

Adds:
- Resolve repair workflow
- Resolution notes and resolved date
- Asset status recalculates automatically from open repairs
- Repair photo upload via Supabase Storage
- Mobile-friendly QR-to-repair flow improvements
- Maintenance page "Mark Serviced" action

Setup:
1. Run DB-V10-WORKFLOW-UPGRADE.sql in Supabase SQL Editor.
2. Copy this update over your clean project. Do NOT copy node_modules.
3. Confirm .gitignore contains: node_modules, dist, .env
4. Push to GitHub:
   git add .
   git commit -m "Add v10 repair workflow improvements"
   git push
5. Wait for Vercel to redeploy.
