-- MaintenanceOS v14 reporting and asset control update
-- Adds soft-archive support for assets while keeping repair history intact.

alter table public.assets
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

update public.assets
set archived = false
where archived is null;
