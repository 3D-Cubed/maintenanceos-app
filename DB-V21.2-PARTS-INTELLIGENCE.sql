-- MaintenanceOS V21.2 - Parts recovery, stock audit and repair intelligence
-- Additive/data-safe. Existing parts are preserved.
begin;

-- Ensure the established inventory schema is readable by the guest-entry application.
alter table public.parts_inventory enable row level security;
drop policy if exists "V212 inventory read" on public.parts_inventory;
create policy "V212 inventory read" on public.parts_inventory for select to anon,authenticated using (true);
drop policy if exists "V212 inventory insert" on public.parts_inventory;
create policy "V212 inventory insert" on public.parts_inventory for insert to anon,authenticated with check (true);
drop policy if exists "V212 inventory update" on public.parts_inventory;
create policy "V212 inventory update" on public.parts_inventory for update to anon,authenticated using (true) with check (true);
grant select,insert,update on public.parts_inventory to anon,authenticated;

-- Keep both the legacy V21 usage columns and the richer snapshot columns so no history is lost.
alter table public.parts_usage add column if not exists source_type text;
alter table public.parts_usage add column if not exists source_id uuid;
alter table public.parts_usage add column if not exists quantity_used integer default 1;
alter table public.parts_usage add column if not exists notes text;
alter table public.parts_usage add column if not exists created_at timestamptz default now();
alter table public.parts_usage add column if not exists part_name_snapshot text;
alter table public.parts_usage add column if not exists part_number_snapshot text;
alter table public.parts_usage add column if not exists unit_cost_snapshot numeric default 0;
alter table public.parts_usage enable row level security;
drop policy if exists "V212 usage read" on public.parts_usage;
create policy "V212 usage read" on public.parts_usage for select to anon,authenticated using (true);
drop policy if exists "V212 usage insert" on public.parts_usage;
create policy "V212 usage insert" on public.parts_usage for insert to anon,authenticated with check (true);
grant select,insert on public.parts_usage to anon,authenticated;

-- Auditable manual stock changes. Repair consumption remains in parts_usage.
create table if not exists public.parts_stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_inventory(id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);
alter table public.parts_stock_movements enable row level security;
drop policy if exists "V212 movements read" on public.parts_stock_movements;
create policy "V212 movements read" on public.parts_stock_movements for select to anon,authenticated using (true);
drop policy if exists "V212 movements insert" on public.parts_stock_movements;
create policy "V212 movements insert" on public.parts_stock_movements for insert to anon,authenticated with check (true);
grant select,insert on public.parts_stock_movements to anon,authenticated;

create or replace function public.adjust_part_stock_v212(p_part_id uuid,p_change integer,p_reason text)
returns integer language plpgsql security invoker set search_path=public as $$
declare new_qty integer;
begin
  if p_change is null or p_change=0 then raise exception 'Quantity change must be non-zero'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Adjustment reason is required'; end if;
  update public.parts_inventory
    set quantity_in_stock=coalesce(quantity_in_stock,0)+p_change, updated_at=now()
    where id=p_part_id and coalesce(quantity_in_stock,0)+p_change>=0
    returning quantity_in_stock into new_qty;
  if new_qty is null then raise exception 'Part not found or adjustment would make stock negative'; end if;
  insert into public.parts_stock_movements(part_id,quantity_change,reason) values(p_part_id,p_change,btrim(p_reason));
  return new_qty;
end $$;
revoke all on function public.adjust_part_stock_v212(uuid,integer,text) from public;
grant execute on function public.adjust_part_stock_v212(uuid,integer,text) to anon,authenticated;

-- Atomic repair completion with legacy + snapshot usage history populated together.
create or replace function public.complete_fault_repair_v21(
  p_fault_id uuid, p_asset_id uuid, p_notes text, p_parts jsonb default '[]'::jsonb,
  p_cost numeric default null, p_downtime numeric default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare repair_id uuid; item jsonb; inv public.parts_inventory; qty integer; parts_summary text := '';
begin
  if p_parts is null then p_parts := '[]'::jsonb; end if;
  if jsonb_typeof(p_parts) <> 'array' then raise exception 'Parts must be an array'; end if;
  perform 1 from public.assets where id=p_asset_id for update;
  if not exists (select 1 from public.repair_tickets where id=p_fault_id and asset_id=p_asset_id and coalesce(status,'Open') <> 'Resolved' for update) then raise exception 'Repair requires an active fault linked to this asset'; end if;
  if nullif(btrim(p_notes),'') is null then raise exception 'Repair notes are required'; end if;
  if p_cost < 0 or p_downtime < 0 then raise exception 'Cost and downtime must be zero or positive'; end if;

  for item in select * from jsonb_array_elements(p_parts) loop
    qty := coalesce((item->>'quantity')::integer,0);
    if qty <= 0 then raise exception 'Part quantity must be greater than zero'; end if;
    select * into inv from public.parts_inventory where id=(item->>'part_id')::uuid for update;
    if not found then raise exception 'Selected inventory part no longer exists'; end if;
    if coalesce(inv.quantity_in_stock,0) < qty then raise exception 'Insufficient stock for %',coalesce(inv.part_name,inv.part_number,'selected part'); end if;
    update public.parts_inventory set quantity_in_stock=quantity_in_stock-qty,updated_at=now() where id=inv.id;
    insert into public.parts_usage(
      part_id,fault_id,asset_id,quantity,part_name,part_number,unit_cost,used_at,
      source_type,source_id,quantity_used,notes,created_at,part_name_snapshot,part_number_snapshot,unit_cost_snapshot
    ) values(
      inv.id,p_fault_id,p_asset_id,qty,coalesce(inv.part_name,'Unnamed part'),inv.part_number,coalesce(inv.price,0),now(),
      'repair',p_fault_id,qty,'Used during fault repair',now(),coalesce(inv.part_name,'Unnamed part'),inv.part_number,coalesce(inv.price,0)
    );
    parts_summary := parts_summary || case when parts_summary='' then '' else ', ' end || qty || '× ' || coalesce(inv.part_name,inv.part_number,'Part');
  end loop;

  insert into public.fault_repairs(fault_id,asset_id,notes,parts_used,cost,downtime_hours)
    values(p_fault_id,p_asset_id,btrim(p_notes),nullif(parts_summary,''),p_cost,p_downtime) returning id into repair_id;
  return repair_id;
end $$;
revoke all on function public.complete_fault_repair_v21(uuid,uuid,text,jsonb,numeric,numeric) from public;
grant execute on function public.complete_fault_repair_v21(uuid,uuid,text,jsonb,numeric,numeric) to anon,authenticated;

commit;
