-- MaintenanceOS V21.6 - test findings / operational hardening
-- Additive and safe to rerun. No existing records are deleted.
begin;

-- -----------------------------------------------------------------------------
-- 1. Stock movement audit table + RPC
-- V21.5 assumed this table already existed. Some production databases do not.
-- -----------------------------------------------------------------------------
create table if not exists public.parts_stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_inventory(id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

alter table public.parts_stock_movements enable row level security;
drop policy if exists "V216 movements read" on public.parts_stock_movements;
create policy "V216 movements read" on public.parts_stock_movements
for select to anon, authenticated using (true);
grant select on public.parts_stock_movements to anon, authenticated;

drop function if exists public.adjust_part_stock_v212(uuid,integer,text);
create or replace function public.adjust_part_stock_v212(
  p_part_id uuid, p_change integer, p_reason text
) returns integer
language plpgsql security definer set search_path = public as $$
declare new_qty integer;
begin
  if p_change is null or p_change = 0 then
    raise exception 'Quantity change must be non-zero';
  end if;
  if nullif(btrim(p_reason),'') is null then
    raise exception 'Adjustment reason is required';
  end if;

  update public.parts_inventory
     set quantity_in_stock = coalesce(quantity_in_stock,0) + p_change,
         updated_at = now()
   where id = p_part_id
     and coalesce(quantity_in_stock,0) + p_change >= 0
   returning quantity_in_stock into new_qty;

  if new_qty is null then
    raise exception 'Part not found or adjustment would make stock negative';
  end if;

  insert into public.parts_stock_movements(part_id, quantity_change, reason)
  values(p_part_id, p_change, btrim(p_reason));

  return new_qty;
end $$;
revoke all on function public.adjust_part_stock_v212(uuid,integer,text) from public;
grant execute on function public.adjust_part_stock_v212(uuid,integer,text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Fault reporting: allow the guest-entry app to create an Open fault.
-- The existing v19/v21 trigger remains the authoritative guard against putting
-- repair-only data into a new fault.
-- -----------------------------------------------------------------------------
alter table public.repair_tickets enable row level security;
drop policy if exists "V216 fault read" on public.repair_tickets;
create policy "V216 fault read" on public.repair_tickets
for select to anon, authenticated using (true);
drop policy if exists "V216 fault insert" on public.repair_tickets;
create policy "V216 fault insert" on public.repair_tickets
for insert to anon, authenticated
with check (asset_id is not null and coalesce(status,'Open') = 'Open');
grant select, insert on public.repair_tickets to anon, authenticated;

-- The fault/repair trigger updates the asset status. Make that trigger path
-- independent of client-side RLS while keeping the direct asset update policy.
create or replace function public.v19_refresh_asset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.assets set status = case
    when exists (select 1 from public.repair_tickets where asset_id = new.asset_id and status = 'In Repair') then 'Under Repair'
    when exists (select 1 from public.repair_tickets where asset_id = new.asset_id and coalesce(status, 'Open') <> 'Resolved') then 'Needs Attention'
    else 'Operational'
  end where id = new.asset_id;
  if not found then raise exception 'Asset status could not be updated; fault operation was rolled back'; end if;
  return new;
end $$;

drop trigger if exists v19_refresh_asset on public.repair_tickets;
create trigger v19_refresh_asset after insert or update of status on public.repair_tickets
for each row execute function public.v19_refresh_asset();

create or replace function public.v19_finish_repair() returns trigger
language plpgsql security definer set search_path = public as $$
declare updated_count integer;
begin
  update public.repair_tickets
     set status = 'Resolved', resolved_at = new.completed_at,
         resolution_notes = new.notes, parts_used = new.parts_used,
         cost = new.cost, downtime_hours = new.downtime_hours
   where id = new.fault_id and asset_id = new.asset_id
     and coalesce(status, 'Open') <> 'Resolved';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Fault could not be resolved; repair was rolled back';
  end if;
  return new;
end $$;

drop trigger if exists v19_finish_repair on public.fault_repairs;
create trigger v19_finish_repair after insert on public.fault_repairs
for each row execute function public.v19_finish_repair();

-- -----------------------------------------------------------------------------
-- 3. Asset history: record meaningful asset-card edits in the timeline.
-- -----------------------------------------------------------------------------
create table if not exists public.asset_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  action text not null,
  title text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.asset_history enable row level security;
drop policy if exists "V216 asset history read" on public.asset_history;
create policy "V216 asset history read" on public.asset_history
for select to anon, authenticated using (true);
grant select on public.asset_history to anon, authenticated;

create or replace function public.record_asset_history_update() returns trigger
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
    insert into public.asset_history(asset_id, action, title, detail)
    values(new.id, 'asset_updated', 'Asset record updated', array_to_string(changes, ' • '));
  end if;
  return new;
end $$;

drop trigger if exists v216_asset_history on public.assets;
create trigger v216_asset_history
after update of name, type, serial_number, location, manufacturer, model, status, next_service_date, notes
on public.assets
for each row execute function public.record_asset_history_update();

-- -----------------------------------------------------------------------------
-- 4. Make deep-linked/QR asset access compatible with the guest-entry app.
-- No database change is needed for the URL itself; the frontend now accepts
-- ?asset=<uuid> and #asset/<uuid> and bypasses the entry splash for that route.
-- -----------------------------------------------------------------------------

commit;
