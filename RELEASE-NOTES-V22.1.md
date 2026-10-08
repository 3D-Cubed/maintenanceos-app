# MaintenanceOS V22.1 — Mobile / PWA Release

## Purpose
Turn MaintenanceOS into an installable mobile-first Progressive Web App while preserving the existing desktop application and live Supabase data model.

## Added
- Installable PWA manifest for Maintenance Hub.
- Branded 192px and 512px app icons.
- Service worker for application-shell/offline resilience without caching live Supabase data.
- Native browser install prompt support where available.
- Mobile standalone layout with bottom navigation and safe-area support.
- Mobile-friendly touch targets and form sizing.
- Camera capture hint for fault-photo uploads on supported phones.
- Apple/iOS home-screen metadata.

## Compatibility
- No Supabase/database migration required.
- Existing routes, QR deep links, faults, repairs, parts, assets and reports are unchanged.
- Desktop layout remains available.
