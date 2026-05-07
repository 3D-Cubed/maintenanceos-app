MaintenanceOS V15 - No Login Entry Gateway

What changed:
- Removed the email/password login requirement from the frontend.
- Replaced it with a simple entry screen:
  Title: Maintenance Hub
  Subtitle: Intelligent maintenance platform
  Button: Enter
- The Enter button opens the existing MaintenanceOS dashboard without Supabase authentication.
- Sidebar Log out has been changed to Exit. Exit returns the user to the entry screen.
- Existing Supabase tables and data are not changed.
- Existing asset, repair, maintenance and QR workflows still read/write to the same Supabase backend.

Important:
- Do not run any SQL files for this update.
- Do not reset Supabase.
- This is a frontend-only patch.

Install:
1. Back up your current project folder.
2. Copy these files over your current working MaintenanceOS project folder.
3. Keep your existing .env file in place.
4. Run:
   npm install
   npm run dev

Deploy:
- Push/deploy to Vercel as normal.
- Keep the existing Vercel environment variables:
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY

If the dashboard opens but shows no data locally:
- Check that your local .env file exists and contains the same Supabase variables as Vercel.
