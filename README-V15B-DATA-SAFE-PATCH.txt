MaintenanceOS V15B - No-Login + Data-Safe Patch

This patch keeps the no-login Maintenance Hub entry screen and fixes local/prod loading where some V14 Supabase databases do not have the newer maintenance_tasks table or archived asset column.

What changed:
- No email/password login required.
- Entry screen title: Maintenance Hub.
- Entry screen subtitle: Intelligent maintenance platform.
- maintenance_tasks is now treated as optional.
- Assets now fall back to a safe query if the archived column is missing.
- No SQL/database changes included or required.
- Existing Supabase assets, repairs, QR links and history are preserved.

Install:
1. Back up your current project folder.
2. Copy these files into your existing working project folder.
3. Keep your existing .env file.
4. Run npm install if needed.
5. Run npm run dev.
6. Confirm assets show before pushing to Git/Vercel.
