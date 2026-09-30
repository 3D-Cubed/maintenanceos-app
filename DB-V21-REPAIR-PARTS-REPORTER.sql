-- V21 additive migration: reporter traceability + repair parts inventory integration.
-- Safe to rerun. Existing fault/repair records are preserved.
begin;

alter table public.repair_tickets add column if not exists reported_by text;

create table if not exists public.parts_inventory (
  id uuid primary key default gen_random_uuid(),
  part_number text,
  name text,
  description text,
  category text,
  supplier text,
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  quantity_in_stock integer not null default 0 check (quantity_in_stock >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parts_inventory add column if not exists part_number text;
alter table public.parts_inventory add column if not exists name text;
alter table public.parts_inventory add column if not exists description text;
alter table public.parts_inventory add column if not exists category text;
alter table public.parts_inventory add column if not exists supplier text;
alter table public.parts_inventory add column if not exists unit_cost numeric default 0;
alter table public.parts_inventory add column if not exists quantity_in_stock integer default 0;
alter table public.parts_inventory add column if not exists minimum_stock integer default 0;
alter table public.parts_inventory add column if not exists location text;
alter table public.parts_inventory add column if not exists created_at timestamptz default now();
alter table public.parts_inventory add column if not exists updated_at timestamptz default now();

create table if not exists public.parts_usage (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_inventory(id) on delete restrict,
  fault_id uuid not null references public.repair_tickets(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  part_name text not null,
  part_number text,
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  used_at timestamptz not null default now()
);

alter table public.parts_inventory enable row level security;
alter table public.parts_usage enable row level security;
drop policy if exists "parts inventory read" on public.parts_inventory;
create policy "parts inventory read" on public.parts_inventory for select using (true);
drop policy if exists "parts inventory write" on public.parts_inventory;
create policy "parts inventory write" on public.parts_inventory for all using (true) with check (true);
drop policy if exists "parts usage read" on public.parts_usage;
create policy "parts usage read" on public.parts_usage for select using (true);
drop policy if exists "parts usage insert" on public.parts_usage;
create policy "parts usage insert" on public.parts_usage for insert with check (true);
grant select,insert,update on public.parts_inventory to anon,authenticated;
grant select,insert on public.parts_usage to anon,authenticated;

create or replace function public.complete_fault_repair_v21(
  p_fault_id uuid, p_asset_id uuid, p_notes text, p_parts jsonb default '[]'::jsonb,
  p_cost numeric default null, p_downtime numeric default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  repair_id uuid;
  item jsonb;
  inv public.parts_inventory;
  qty integer;
  parts_summary text := '';
begin
  if p_parts is null then p_parts := '[]'::jsonb; end if;
  if jsonb_typeof(p_parts) <> 'array' then raise exception 'Parts must be an array'; end if;

  -- Lock asset/fault first, matching V19's ordering and validation.
  perform 1 from public.assets where id = p_asset_id for update;
  if not exists (select 1 from public.repair_tickets where id=p_fault_id and asset_id=p_asset_id and coalesce(status,'Open') <> 'Resolved' for update) then
    raise exception 'Repair requires an active fault linked to this asset';
  end if;
  if nullif(btrim(p_notes),'') is null then raise exception 'Repair notes are required'; end if;
  if p_cost < 0 or p_downtime < 0 then raise exception 'Cost and downtime must be zero or positive'; end if;

  for item in select * from jsonb_array_elements(p_parts)
  loop
    qty := coalesce((item->>'quantity')::integer, 0);
    if qty <= 0 then raise exception 'Part quantity must be greater than zero'; end if;
    select * into inv from public.parts_inventory where id=(item->>'part_id')::uuid for update;
    if not found then raise exception 'Selected inventory part no longer exists'; end if;
    if coalesce(inv.quantity_in_stock,0) < qty then raise exception 'Insufficient stock for %', coalesce(inv.name, inv.part_number, 'selected part'); end if;
    update public.parts_inventory set quantity_in_stock=quantity_in_stock-qty, updated_at=now() where id=inv.id;
    insert into public.parts_usage(part_id,fault_id,asset_id,quantity,part_name,part_number,unit_cost)
      values(inv.id,p_fault_id,p_asset_id,qty,coalesce(inv.name,'Unnamed part'),inv.part_number,coalesce(inv.unit_cost,0));
    parts_summary := parts_summary || case when parts_summary='' then '' else ', ' end || qty || '× ' || coalesce(inv.name,inv.part_number,'Part');
  end loop;

  insert into public.fault_repairs(fault_id,asset_id,notes,parts_used,cost,downtime_hours)
    values(p_fault_id,p_asset_id,btrim(p_notes),nullif(parts_summary,''),p_cost,p_downtime)
    returning id into repair_id;
  return repair_id;
end $$;
revoke all on function public.complete_fault_repair_v21(uuid,uuid,text,jsonb,numeric,numeric) from public;
grant execute on function public.complete_fault_repair_v21(uuid,uuid,text,jsonb,numeric,numeric) to anon,authenticated;
commit;
