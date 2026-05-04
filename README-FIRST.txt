MaintenanceOS Nuclear Clean Build

1) Run DB-PRODUCTION-CLEAN.sql in Supabase SQL Editor.
2) Push this folder to GitHub.
3) Import repo to Vercel.
4) Add Environment Variables:
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your publishable/anon key
5) Vercel build settings:
   Framework: Vite
   Build command: npm run build
   Output: dist
6) Create users in Supabase Authentication, or use the app's Sign Up button.

Important: Do not upload node_modules. It is ignored by .gitignore.
