MaintenanceOS V15C - Maintenance Hub Guest Entry

What changed:
- Replaced visible email/password login screen with:
  Maintenance Hub
  Intelligent maintenance platform
  Enter button
- Supabase authentication is still used invisibly in the background.
- This preserves existing RLS/auth behaviour and allows your current assets/repairs/QR data to load.
- No Supabase tables or schemas are changed.

Required local .env values:
VITE_SUPABASE_URL=your Supabase project URL
VITE_SUPABASE_ANON_KEY=your Supabase anon public key
VITE_MAINTENANCE_GUEST_EMAIL=the Supabase Auth email to use in the background
VITE_MAINTENANCE_GUEST_PASSWORD=that user's password

Recommended setup:
1. In Supabase, create or use a normal Auth user for MaintenanceOS access.
2. Add that user's email/password to your local .env file using the variable names above.
3. Add the same two guest variables in Vercel Project Settings > Environment Variables.
4. Keep your existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY exactly as they are.

Install/update:
1. Back up your current working folder.
2. Copy these files over your existing project files.
3. Do NOT overwrite or delete your .env file.
4. Add the two guest variables to .env.
5. Run:
   npm install
   npm run dev
6. Press Enter on the Maintenance Hub screen.

Important:
- Do not run the SQL files unless you deliberately want to change the database.
- Do not delete or recreate Supabase tables.
- This pack is a frontend/auth-entry patch only.
