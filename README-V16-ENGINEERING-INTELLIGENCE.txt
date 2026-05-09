MaintenanceOS V16 - Engineering Intelligence Upgrade

What is included:
- Asset Health scoring from repair frequency, downtime, overdue service, severity and repeat fault patterns.
- New AGV Fleet page.
- New 3D Printer Fleet page.
- Dashboard Maintenance Intelligence panels.
- Full service form replacing the old simple Mark Serviced workflow.
- Asset service timeline integration.

Database safety:
- This update does not delete or rebuild any existing Supabase data.
- The optional DB-V16-SERVICE-RECORDS.sql file only adds a new service_records table.
- If you do not run the SQL, service form submissions still update the asset next service date and write a summary to audit_log when available, but full service form history will not be retained as structured rows.

Recommended after copying files:
npm install
npm run dev

Vercel variables still required:
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_MAINTENANCE_GUEST_EMAIL
VITE_MAINTENANCE_GUEST_PASSWORD
