-- MaintenanceOS V17 Service & Parts Intelligence
-- Safe additive migration only. This does NOT delete, reset or replace existing data.

-- Extend service_records so AGV/printer specific checks can be stored without many new columns.
alter table public.service_records
  add column if not exists service_category text,
  add column if not exists service_data jsonb;

create table if not exists public.parts_inventory (
  id uuid primary key default gen_random_uuid(),
  part_name text not null,
  equipment_type text default 'General',
  category text,
  image_url text,
  price numeric default 0,
  supplier_url text,
  quantity_in_stock integer default 0,
  minimum_stock_level integer default 0,
  stock_location text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.parts_usage (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references public.parts_inventory(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  source_type text,
  source_id uuid,
  quantity_used integer not null default 1,
  notes text,
  created_at timestamptz default now()
);

alter table public.parts_inventory enable row level security;
alter table public.parts_usage enable row level security;

do $$ begin
  create policy "Authenticated users can read parts inventory"
    on public.parts_inventory for select
    to authenticated
    using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can create parts inventory"
    on public.parts_inventory for insert
    to authenticated
    with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can update parts inventory"
    on public.parts_inventory for update
    to authenticated
    using (true)
    with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can read parts usage"
    on public.parts_usage for select
    to authenticated
    using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can create parts usage"
    on public.parts_usage for insert
    to authenticated
    with check (true);
exception when duplicate_object then null; end $$;

-- Optional image bucket for uploaded part photos.
-- If this fails due to storage permissions, the app can still use pasted image URLs.
insert into storage.buckets (id, name, public)
values ('part-images', 'part-images', true)
on conflict (id) do nothing;

do $$ begin
  create policy "Authenticated users can upload part images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'part-images');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone can view part images"
    on storage.objects for select
    to public
    using (bucket_id = 'part-images');
exception when duplicate_object then null; end $$;
