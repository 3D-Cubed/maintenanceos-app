-- MaintenanceOS V18D Parts Inventory History
-- Safe additive migration only. This does NOT delete, reset or replace existing data.

create table if not exists public.parts_history (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references public.parts_inventory(id) on delete cascade,
  event_type text not null,
  quantity_delta integer,
  previous_quantity integer,
  new_quantity integer,
  notes text,
  user_email text,
  created_at timestamptz default now()
);

alter table public.parts_history enable row level security;

do $$ begin
  create policy "Authenticated users can read parts history"
    on public.parts_history for select
    to authenticated
    using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can create parts history"
    on public.parts_history for insert
    to authenticated
    with check (true);
exception when duplicate_object then null; end $$;
