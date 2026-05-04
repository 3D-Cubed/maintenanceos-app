-- MaintenanceOS clean production schema. Safe to run multiple times.

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  serial_number text,
  location text,
  manufacturer text,
  model text,
  status text default 'Operational',
  next_service_date date,
  notes text,
  created_at timestamptz default now()
);

alter table public.assets add column if not exists manufacturer text;
alter table public.assets add column if not exists model text;
alter table public.assets add column if not exists next_service_date date;
alter table public.assets add column if not exists notes text;

create table if not exists public.repair_tickets (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete cascade,
  title text not null,
  description text,
  priority text default 'Medium',
  status text default 'Open',
  cost numeric,
  downtime_hours numeric,
  parts_used text,
  created_at timestamptz default now()
);

alter table public.repair_tickets add column if not exists cost numeric;
alter table public.repair_tickets add column if not exists downtime_hours numeric;
alter table public.repair_tickets add column if not exists parts_used text;

create table if not exists public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete cascade,
  title text not null,
  due_date date,
  status text default 'Open',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text,
  table_name text,
  detail text,
  user_email text,
  created_at timestamptz default now()
);

alter table public.assets enable row level security;
alter table public.repair_tickets enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "authenticated full access assets" on public.assets;
drop policy if exists "authenticated full access repairs" on public.repair_tickets;
drop policy if exists "authenticated full access maintenance" on public.maintenance_tasks;
drop policy if exists "authenticated full access audit" on public.audit_log;

create policy "authenticated full access assets" on public.assets for all to authenticated using (true) with check (true);
create policy "authenticated full access repairs" on public.repair_tickets for all to authenticated using (true) with check (true);
create policy "authenticated full access maintenance" on public.maintenance_tasks for all to authenticated using (true) with check (true);
create policy "authenticated full access audit" on public.audit_log for all to authenticated using (true) with check (true);
