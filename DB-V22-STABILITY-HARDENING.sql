-- MaintenanceOS V22.0 - Stability hardening
-- Additive / data-safe. No existing asset, fault, part or usage records are deleted.
-- Run this single migration before deploying V22.
begin;

-- -----------------------------------------------------------------------------
-- 1. Stock audit infrastructure. The previous production error proved that some
-- environments never received the stock movement table, so V22 makes this fully
-- self-contained.
-- -----------------------------------------------------------------------------
create table if not exists public.parts_stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_inventory(id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

alter table public.parts_stock_movements enable row level security;
drop policy if exists "V22 movements read" on public.parts_stock_movements;
create policy "V22 movements read" on public.parts_stock_movements
for select to anon, authenticated using (true);
grant select on public.parts_stock_movements to anon, authenticated;

create or replace function public.adjust_part_stock_v22(
  p_part_id uuid, p_change integer, p_reason text
) returns integer
language plpgsql security definer set search_path = public as $$
declare new_qty integer;
begin
  if p_change is null or p_change = 0 then raise exception 'Quantity change must be non-zero'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Adjustment reason is required'; end if;

  update public.parts_inventory
     set quantity_in_stock = coalesce(quantity_in_stock,0) + p_change,
         updated_at = now()
   where id = p_part_id
     and coalesce(quantity_in_stock,0) + p_change >= 0
   returning quantity_in_stock into new_qty;

  if new_qty is null then raise exception 'Part not found or adjustment would make stock negative'; end if;

  insert into public.parts_stock_movements(part_id, quantity_change, reason)
  values(p_part_id, p_change, btrim(p_reason));
  return new_qty;
end $$;
revoke all on function public.adjust_part_stock_v22(uuid,integer,text) from public;
grant execute on function public.adjust_part_stock_v22(uuid,integer,text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Fault reporting. The UI is deliberately guest-entry/no-login, so fault
-- creation and repair completion must not depend on browser-role RLS policies.
-- The functions validate the workflow and perform the transaction server-side.
-- -----------------------------------------------------------------------------
alter table public.repair_tickets enable row level security;
drop policy if exists "V22 fault read" on public.repair_tickets;
create policy "V22 fault read" on public.repair_tickets
for select to anon, authenticated using (true);
grant select on public.repair_tickets to anon, authenticated;

create or replace function public.v22_guard_fault() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.asset_id is null or coalesce(new.status,'Open') <> 'Open' then
      raise exception 'Report an open fault first; record repair work against that fault';
    end if;
    if new.resolved_at is not null or nullif(btrim(coalesce(new.resolution_notes,'')),'') is not null
       or nullif(btrim(coalesce(new.parts_used,'')),'') is not null
       or coalesce(new.cost,0) <> 0 or coalesce(new.downtime_hours,0) <> 0 then
      raise exception 'Repair-only data must be recorded through the active fault repair workflow';
    end if;
  else
    if new.asset_id is distinct from old.asset_id then
      raise exception 'Fault asset cannot be changed';
    end if;
    if new.status is distinct from old.status and new.status = 'Resolved'
       or new.cost is distinct from old.cost
       or new.downtime_hours is distinct from old.downtime_hours
       or new.parts_used is distinct from old.parts_used
       or new.resolution_notes is distinct from old.resolution_notes
       or new.resolved_at is distinct from old.resolved_at then
      if not exists (select 1 from public.fault_repairs r where r.fault_id = new.id and r.asset_id = new.asset_id) then
        raise exception 'Resolve faults through their linked repair workflow';
      end if;
    end if;
    if old.status = 'Resolved' and new.status is distinct from old.status then
      raise exception 'Report a new fault for recurring symptoms';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists v19_guard_fault on public.repair_tickets;
drop trigger if exists v22_guard_fault on public.repair_tickets;
create trigger v22_guard_fault before insert or update on public.repair_tickets
for each row execute function public.v22_guard_fault();

create or replace function public.v22_refresh_asset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.assets set status = case
    when exists (select 1 from public.repair_tickets where asset_id = new.asset_id and status = 'In Repair') then 'Under Repair'
    when exists (select 1 from public.repair_tickets where asset_id = new.asset_id and coalesce(status,'Open') <> 'Resolved') then 'Needs Attention'
    else 'Operational'
  end
  where id = new.asset_id;
  if not found then raise exception 'Asset status could not be updated'; end if;
  return new;
end $$;

drop trigger if exists v19_refresh_asset on public.repair_tickets;
drop trigger if exists v22_refresh_asset on public.repair_tickets;
create trigger v22_refresh_asset
after insert or update of status on public.repair_tickets
for each row execute function public.v22_refresh_asset();

create or replace function public.report_fault_v22(
  p_asset_id uuid,
  p_title text,
  p_description text,
  p_reported_by text,
  p_priority text default 'Medium',
  p_photo_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare fault_id uuid;
  clean_priority text := coalesce(nullif(btrim(p_priority),''),'Medium');
begin
  if p_asset_id is null then raise exception 'An asset is required'; end if;
  if not exists (select 1 from public.assets where id = p_asset_id) then raise exception 'Asset not found'; end if;
  if nullif(btrim(p_reported_by),'') is null then raise exception 'Reporter name is required'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'Fault title is required'; end if;
  if clean_priority not in ('Low','Medium','High','Critical') then raise exception 'Invalid fault priority'; end if;

  insert into public.repair_tickets(asset_id,title,description,reported_by,priority,status,photo_url)
  values(p_asset_id,btrim(p_title),nullif(btrim(p_description),''),btrim(p_reported_by),clean_priority,'Open',p_photo_url)
  returning id into fault_id;
  return fault_id;
end $$;
revoke all on function public.report_fault_v22(uuid,text,text,text,text,text) from public;
grant execute on function public.report_fault_v22(uuid,text,text,text,text,text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Repair completion. Security-definer keeps the entire repair transaction
-- atomic even when the guest role has restrictive RLS. Existing parts and stock
-- are preserved; consumption is recorded and stock is decremented together.
-- -----------------------------------------------------------------------------
create or replace function public.v22_finish_repair() returns trigger
language plpgsql security definer set search_path = public as $$
declare updated_count integer;
begin
  update public.repair_tickets
     set status = 'Resolved', resolved_at = new.completed_at,
         resolution_notes = new.notes, parts_used = new.parts_used,
         cost = new.cost, downtime_hours = new.downtime_hours
   where id = new.fault_id and asset_id = new.asset_id
     and coalesce(status,'Open') <> 'Resolved';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Fault could not be resolved; repair was rolled back'; end if;
  return new;
end $$;

drop trigger if exists v19_finish_repair on public.fault_repairs;
drop trigger if exists v22_finish_repair on public.fault_repairs;
create trigger v22_finish_repair after insert on public.fault_repairs
for each row execute function public.v22_finish_repair();

create or replace function public.complete_fault_repair_v22(
  p_fault_id uuid,
  p_asset_id uuid,
  p_notes text,
  p_parts jsonb default '[]'::jsonb,
  p_cost numeric default null,
  p_downtime numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare repair_id uuid; item jsonb; inv public.parts_inventory; qty integer; parts_summary text := '';
begin
  if p_parts is null then p_parts := '[]'::jsonb; end if;
  if jsonb_typeof(p_parts) <> 'array' then raise exception 'Parts must be an array'; end if;
  if nullif(btrim(p_notes),'') is null then raise exception 'Repair notes are required'; end if;
  if p_cost is not null and (p_cost < 0 or p_cost::text in ('NaN','Infinity','-Infinity')) then raise exception 'Cost must be zero or positive'; end if;
  if p_downtime is not null and (p_downtime < 0 or p_downtime::text in ('NaN','Infinity','-Infinity')) then raise exception 'Downtime must be zero or positive'; end if;
  if not exists (select 1 from public.assets where id=p_asset_id) then raise exception 'Asset not found'; end if;
  if not exists (select 1 from public.repair_tickets where id=p_fault_id and asset_id=p_asset_id and coalesce(status,'Open') <> 'Resolved') then raise exception 'Repair requires an active fault linked to this asset'; end if;

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
  values(p_fault_id,p_asset_id,btrim(p_notes),nullif(parts_summary,''),p_cost,p_downtime)
  returning id into repair_id;
  return repair_id;
end $$;
revoke all on function public.complete_fault_repair_v22(uuid,uuid,text,jsonb,numeric,numeric) from public;
grant execute on function public.complete_fault_repair_v22(uuid,uuid,text,jsonb,numeric,numeric) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Asset editing/history. The trigger records only real field changes and is
-- security-definer so the guest entry mode cannot lose the audit event to RLS.
-- -----------------------------------------------------------------------------
alter table public.assets add column if not exists updated_at timestamptz default now();
alter table public.asset_history add column if not exists action text;
alter table public.asset_history add column if not exists title text;
alter table public.asset_history add column if not exists detail text;
alter table public.asset_history add column if not exists created_at timestamptz default now();
alter table public.asset_history enable row level security;
drop policy if exists "V22 asset history read" on public.asset_history;
create policy "V22 asset history read" on public.asset_history for select to anon,authenticated using (true);
grant select on public.asset_history to anon,authenticated;

create or replace function public.v22_record_asset_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare changes text[] := array[]::text[];
begin
  if old.name is distinct from new.name then changes := array_append(changes, 'name: ' || coalesce(old.name,'blank') || ' → ' || coalesce(new.name,'blank')); end if;
  if old.type is distinct from new.type then changes := array_append(changes, 'type: ' || coalesce(old.type,'blank') || ' → ' || coalesce(new.type,'blank')); end if;
  if old.serial_number is distinct from new.serial_number then changes := array_append(changes, 'serial number: ' || coalesce(old.serial_number,'blank') || ' → ' || coalesce(new.serial_number,'blank')); end if;
  if old.location is distinct from new.location then changes := array_append(changes, 'location: ' || coalesce(old.location,'blank') || ' → ' || coalesce(new.location,'blank')); end if;
  if old.manufacturer is distinct from new.manufacturer then changes := array_append(changes, 'manufacturer: ' || coalesce(old.manufacturer,'blank') || ' → ' || coalesce(new.manufacturer,'blank')); end if;
  if old.model is distinct from new.model then changes := array_append(changes, 'model: ' || coalesce(old.model,'blank') || ' → ' || coalesce(new.model,'blank')); end if;
  if old.status is distinct from new.status then changes := array_append(changes, 'status: ' || coalesce(old.status,'blank') || ' → ' || coalesce(new.status,'blank')); end if;
  if old.next_service_date is distinct from new.next_service_date then changes := array_append(changes, 'next service: ' || coalesce(old.next_service_date::text,'blank') || ' → ' || coalesce(new.next_service_date::text,'blank')); end if;
  if old.notes is distinct from new.notes then changes := array_append(changes, 'notes updated'); end if;
  if cardinality(changes) > 0 then
    insert into public.asset_history(asset_id,action,title,detail) values(new.id,'asset_updated','Asset record updated',array_to_string(changes,' • '));
  end if;
  return new;
end $$;

drop trigger if exists v216_asset_history on public.assets;
drop trigger if exists v22_asset_history on public.assets;
create trigger v22_asset_history
after update of name,type,serial_number,location,manufacturer,model,status,next_service_date,notes
on public.assets for each row execute function public.v22_record_asset_history();

drop policy if exists "V22 assets update" on public.assets;
create policy "V22 assets update" on public.assets for update to anon,authenticated using (true) with check (true);
grant select,update on public.assets to anon,authenticated;

-- Keep the normal Parts page operational in guest-entry mode. These are catalogue
-- writes only; repair stock consumption remains transactionally controlled by RPC.
alter table public.parts_inventory enable row level security;
drop policy if exists "V22 inventory read" on public.parts_inventory;
create policy "V22 inventory read" on public.parts_inventory for select to anon,authenticated using (true);
drop policy if exists "V22 inventory insert" on public.parts_inventory;
create policy "V22 inventory insert" on public.parts_inventory for insert to anon,authenticated with check (true);
drop policy if exists "V22 inventory update" on public.parts_inventory;
create policy "V22 inventory update" on public.parts_inventory for update to anon,authenticated using (true) with check (true);
grant select,insert,update on public.parts_inventory to anon,authenticated;

-- -----------------------------------------------------------------------------
-- 5. Make parts usage readable even when legacy migrations were incomplete.
-- -----------------------------------------------------------------------------
alter table public.parts_usage enable row level security;
drop policy if exists "V22 usage read" on public.parts_usage;
create policy "V22 usage read" on public.parts_usage for select to anon,authenticated using (true);
grant select on public.parts_usage to anon,authenticated;

commit;
