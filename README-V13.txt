MaintenanceOS Production v13

Includes:
- Priority + SLA visual logic for active repairs
- Smart dashboard Priority Radar
- Asset history timeline
- Click-to-preview repair images
- QR scan workflow polish: scan opens asset and jumps into quick fault logging
- Status and priority badge styling
- Mobile improvements for repair rows, image preview and timeline

No new SQL required if v10/v11/v12 database updates are already applied.

Update steps:
1. Copy these files over your clean project folder.
2. Do not copy node_modules.
3. Commit and push:
   git add .
   git commit -m "Add v13 professional workflow upgrade"
   git push
4. Wait for Vercel to redeploy.
