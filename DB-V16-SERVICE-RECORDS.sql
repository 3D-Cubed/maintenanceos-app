-- MaintenanceOS V16 optional service form history table
-- Safe additive migration: creates a new table only. It does not modify or delete existing data.

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete set null,
  asset_name text,
  service_type text,
  engineer_name text,
  service_date date default current_date,
  next_service_due date,
  downtime_hours numeric,
  condition_after text,
  issues_found text,
  corrective_action text,
  parts_replaced text,
  created_at timestamptz default now()
);

alter table public.service_records enable row level security;

create policy if not exists "Authenticated users can read service records"
  on public.service_records for select
  to authenticated
  using (true);

create policy if not exists "Authenticated users can create service records"
  on public.service_records for insert
  to authenticated
  with check (true);
