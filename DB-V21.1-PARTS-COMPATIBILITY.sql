-- MaintenanceOS V21.1 - restore the original Parts Inventory schema and integrate repairs.
-- Additive/data-safe: no tables are dropped and no existing inventory rows are deleted.
begin;

alter table public.repair_tickets add column if not exists reported_by text;

-- Original V17/V18 inventory fields. These are the canonical fields used by the restored UI.
alter table public.parts_inventory add column if not exists part_name text;
alter table public.parts_inventory add column if not exists part_number text;
alter table public.parts_inventory add column if not exists equipment_type text default 'General';
alter table public.parts_inventory add column if not exists category text;
alter table public.parts_inventory add column if not exists image_url text;
alter table public.parts_inventory add column if not exists price numeric default 0;
alter table public.parts_inventory add column if not exists supplier_name text;
alter table public.parts_inventory add column if not exists supplier_url text;
alter table public.parts_inventory add column if not exists quantity_in_stock integer default 0;
alter table public.parts_inventory add column if not exists minimum_stock_level integer default 0;
alter table public.parts_inventory add column if not exists stock_location text;
alter table public.parts_inventory add column if not exists notes text;
alter table public.parts_inventory add column if not exists created_at timestamptz default now();
alter table public.parts_inventory add column if not exists updated_at timestamptz default now();

-- If V21 was already run, copy any values from its temporary duplicate field names into
-- the original V17/V18 fields. Existing original values always win.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parts_inventory' and column_name='name') then
    execute 'update public.parts_inventory set part_name=coalesce(part_name,name)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parts_inventory' and column_name='unit_cost') then
    execute 'update public.parts_inventory set price=coalesce(price,unit_cost,0)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parts_inventory' and column_name='minimum_stock') then
    execute 'update public.parts_inventory set minimum_stock_level=coalesce(minimum_stock_level,minimum_stock,0)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parts_inventory' and column_name='location') then
    execute 'update public.parts_inventory set stock_location=coalesce(stock_location,location)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parts_inventory' and column_name='supplier') then
    execute 'update public.parts_inventory set supplier_name=coalesce(supplier_name,supplier)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='parts_inventory' and column_name='description') then
    execute 'update public.parts_inventory set notes=coalesce(notes,description)';
  end if;
end $$;

-- Keep the established V17 parts_usage structure and extend it with immutable snapshots.
alter table public.parts_usage add column if not exists source_type text;
alter table public.parts_usage add column if not exists source_id uuid;
alter table public.parts_usage add column if not exists quantity_used integer default 1;
alter table public.parts_usage add column if not exists notes text;
alter table public.parts_usage add column if not exists created_at timestamptz default now();
alter table public.parts_usage add column if not exists part_name_snapshot text;
alter table public.parts_usage add column if not exists part_number_snapshot text;
alter table public.parts_usage add column if not exists unit_cost_snapshot numeric default 0;

-- Guest-entry app needs anon access as well as authenticated access.
alter table public.parts_inventory enable row level security;
alter table public.parts_usage enable row level security;
drop policy if exists "V21 parts inventory read" on public.parts_inventory;
create policy "V21 parts inventory read" on public.parts_inventory for select to anon,authenticated using (true);
drop policy if exists "V21 parts inventory insert" on public.parts_inventory;
create policy "V21 parts inventory insert" on public.parts_inventory for insert to anon,authenticated with check (true);
drop policy if exists "V21 parts inventory update" on public.parts_inventory;
create policy "V21 parts inventory update" on public.parts_inventory for update to anon,authenticated using (true) with check (true);
drop policy if exists "V21 parts usage read" on public.parts_usage;
create policy "V21 parts usage read" on public.parts_usage for select to anon,authenticated using (true);
drop policy if exists "V21 parts usage insert" on public.parts_usage;
create policy "V21 parts usage insert" on public.parts_usage for insert to anon,authenticated with check (true);
grant select,insert,update on public.parts_inventory to anon,authenticated;
grant select,insert on public.parts_usage to anon,authenticated;

insert into storage.buckets (id,name,public) values ('part-images','part-images',true) on conflict (id) do nothing;
drop policy if exists "V21 part images upload" on storage.objects;
create policy "V21 part images upload" on storage.objects for insert to anon,authenticated with check (bucket_id='part-images');
drop policy if exists "V21 part images view" on storage.objects;
create policy "V21 part images view" on storage.objects for select to public using (bucket_id='part-images');

create or replace function public.complete_fault_repair_v21(
  p_fault_id uuid, p_asset_id uuid, p_notes text, p_parts jsonb default '[]'::jsonb,
  p_cost numeric default null, p_downtime numeric default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare
  repair_id uuid; item jsonb; inv public.parts_inventory; qty integer; parts_summary text := '';
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
    insert into public.parts_usage(part_id,asset_id,source_type,source_id,quantity_used,notes,part_name_snapshot,part_number_snapshot,unit_cost_snapshot)
      values(inv.id,p_asset_id,'repair',p_fault_id,qty,'Used during fault repair',coalesce(inv.part_name,'Unnamed part'),inv.part_number,coalesce(inv.price,0));
    parts_summary := parts_summary || case when parts_summary='' then '' else ', ' end || qty || '× ' || coalesce(inv.part_name,inv.part_number,'Part');
  end loop;

  insert into public.fault_repairs(fault_id,asset_id,notes,parts_used,cost,downtime_hours)
    values(p_fault_id,p_asset_id,btrim(p_notes),nullif(parts_summary,''),p_cost,p_downtime) returning id into repair_id;
  return repair_id;
end $$;
revoke all on function public.complete_fault_repair_v21(uuid,uuid,text,jsonb,numeric,numeric) from public;
grant execute on function public.complete_fault_repair_v21(uuid,uuid,text,jsonb,numeric,numeric) to anon,authenticated;
commit;
