-- MaintenanceOS v10 workflow upgrade: repair resolution + photo uploads.
-- Safe to run multiple times.

alter table public.repair_tickets add column if not exists photo_url text;
alter table public.repair_tickets add column if not exists resolved_at timestamptz;
alter table public.repair_tickets add column if not exists resolution_notes text;

-- Public storage bucket for repair photos. The app stores the public URL on repair_tickets.photo_url.
insert into storage.buckets (id, name, public)
values ('repair-photos', 'repair-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "authenticated upload repair photos" on storage.objects;
drop policy if exists "public read repair photos" on storage.objects;
drop policy if exists "authenticated update repair photos" on storage.objects;
drop policy if exists "authenticated delete repair photos" on storage.objects;

create policy "authenticated upload repair photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'repair-photos');

create policy "public read repair photos"
on storage.objects for select to public
using (bucket_id = 'repair-photos');

create policy "authenticated update repair photos"
on storage.objects for update to authenticated
using (bucket_id = 'repair-photos')
with check (bucket_id = 'repair-photos');

create policy "authenticated delete repair photos"
on storage.objects for delete to authenticated
using (bucket_id = 'repair-photos');
