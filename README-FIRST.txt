MaintenanceOS V19 — Fault-first workflow
Release date: 30 September 2026
Built from the supplied Maintenance OS.zip (V18E functionality).

UPGRADE YOUR EXISTING APP
1. Run DB-V19-FAULT-FIRST.sql in your existing Supabase project's SQL Editor.
   This is an additive migration. Do not reset the database or run a fresh setup.
   It preserves existing assets, tickets, IDs, dates, photos and repair details.
2. Copy this project over your existing project, preserving your existing .env
   and Vercel environment variables. Do not copy/remove your data or Supabase project.
3. Run npm ci, then npm run build. Commit/push the updated source and migration
   to your existing GitHub repository for Vercel deployment.
4. Vercel settings remain Vite / npm run build / dist.
5. Hard refresh the browser (Ctrl+Shift+R) after deployment.

USING THE WORKFLOW
Report Fault -> active fault -> Record Repair -> Save Repair & Resolve Fault.
Fault reporting asks for asset, title, symptoms, priority and optional photo only.
Repairs require an existing active fault. Notes must explain the work and verification.
Parts, cost and downtime belong to the linked repair. Zero values are supported.
A recurring fault is a new report. Resolved faults cannot be repaired again.
Existing active tickets can be repaired through the same workflow. Existing resolved
records retain their historical details; no synthetic repair records are invented.

DATABASE AND ACCESS
The existing repair_tickets table remains the fault register so existing reporting,
photos, timelines and IDs keep working. The new fault_repairs table references both
fault and asset. Completed repair data is also mirrored to the existing ticket fields
for compatibility with reports. Repair insertion and fault closure are atomic.
The migration preserves your existing ticket/asset RLS policies and does not enable
anonymous access to either table. The existing Enter screen is retained. Your current
client role must already have access to select/insert/update tickets and select/update
assets. Photo upload still uses the existing repair-photos bucket and its policies.
Run the migration before deploying V19: old code's direct repair writes are intentionally
blocked by the new database guards. Earlier README-V*.txt files are historical notes.

TESTS
npm ci
npm run test:database
npx playwright install chromium
npm run test:browser
or npm test to run both suites (Chromium must be installed).
An existing browser binary can be used with CHROMIUM_EXECUTABLE_PATH.
See TEST-RESULTS.md for validation scope and limitations.

AFTER DEPLOYMENT
Report a test fault on a test asset, attach a photo, confirm scrolling/navigation,
record its repair, and confirm the resolved record and asset status after a refresh.
These local tests do not use your live Supabase database or deployment credentials.
